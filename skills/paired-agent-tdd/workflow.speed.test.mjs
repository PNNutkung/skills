// workflow.js with the speed flags (args.speed, written by `tdd.mjs plan`): canned agents, no git, no gate. Each flag on and off, one at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEED_OFF } from './speed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const tick = ms => new Promise(r => setTimeout(r, ms));

const KINDS = ['happy', 'fail', 'edge'];
const grp = (id, o = {}) => ({ id, goal: `goal of ${id}`, tests: [`tests/test_${id}.py`], src: [`src/${id}.py`], dod: [`${id.toUpperCase()}1`], after: [], ...o });
const BASE = {
  repo: '/repo', base: 'b'.repeat(40), cmd: 'pytest -q {file}', skillDir: '/skill', runDir: '/tmp/pat-test', scratch: '/tmp/pat-scratch', maxRepairs: 40,
  dod: ['a', 'b'].map(id => ({ id: `${id.toUpperCase()}1`, text: `behavior of ${id}`, source: 'assumed' })), groups: [grp('a'), grp('b', { after: ['a'] })],
};
const INTEG = { file: 'tests/integration/test_flow.py', goal: 'the flow through the real db' };
const rows = g => g.dod.flatMap(id => KINDS.map(kind => ({ dod: id, kind, test: `test_${id.toLowerCase()}_${kind}_case`, file: g.tests[0] })));
const PASS = { verdict: 'PASS', defects: [], gateOk: true };
const FINDING = file => ({ title: `issue in ${file}`, severity: 'high', file, startLine: 2, endLine: 3, hazard: 'h', quote: 'q', anchorable: true, proof: { mode: 'read', ref: `${file}:2-3`, quote: 'q' } });
const sp = over => ({ speed: { ...SPEED_OFF, ...over } });

function answer(label, over) {
  if (label in over) return over[label];
  const [node, gid] = label.split(':'), g = BASE.groups.find(x => x.id === gid);
  if (node === 'red-driver') return { matrix: rows(g), files: g.tests, reuse: 'codebase' };
  if (node === 'tdd-driver') return { matrix: rows(g), files: g.tests, srcFiles: g.src, reuse: 'none', cleanup: 'none' };
  if (node === 'red-navigator' || node === 'green-navigator') return PASS;
  if (node === 'green-driver') return { files: g.src, reuse: 'docs', cleanup: 'none' };
  if (node === 'reviewer') return { findings: [] };
  if (node === 'integration-tester') return { file: INTEG.file, exit: 0, findings: [] };
  if (node === 'fixer') return { fixed: [], notFixed: [], gateOk: true, gateRuns: 1 };
  if (node === 'final-verifier') return { ok: true, problems: [] };
  throw new Error(`no canned answer for ${label}`);
}
async function play(args, over = {}, delay = 0) {
  const calls = [], events = [], logs = [];
  const agent = async (prompt, o) => { calls.push({ prompt, o }); events.push(`start ${o.label}`); if (delay) await tick(delay); events.push(`end ${o.label}`); return structuredClone(answer(o.label, over)); };
  const out = await wf(agent, parallel, async () => [], () => {}, m => logs.push(m), { ...BASE, ...args }, {});
  return { out, calls, events, logs, by: l => calls.filter(c => c.o.label === l).map(c => c.prompt), labels: calls.map(c => c.o.label) };
}
const FAST = { mode: 'fast', fast: true };

test('pmode: a fast run gives a group with no after one tdd-driver and one navigator; the group that waits keeps the paired pipeline', async () => {
  const r = await play({ ...FAST, ...sp({ pipeline: 'fast' }) });
  assert.deepEqual(r.labels.filter(l => /:a$/.test(l)), ['tdd-driver:a', 'green-navigator:a']);
  assert.deepEqual(r.labels.filter(l => /:b$/.test(l)), ['red-driver:b', 'red-navigator:b', 'green-driver:b', 'green-navigator:b']);
  const paired = await play(sp({ pipeline: 'paired' }));
  assert.deepEqual(paired.labels.filter(l => /:a$/.test(l)), ['red-driver:a', 'red-navigator:a', 'green-driver:a', 'green-navigator:a'], 'the mode comes from args.mode, which tdd.mjs plan sets from the flag');
});

test('pquick: on, a driver\'s GREEN loop names a quick middle run between two full ones; off, no --quick anywhere', async () => {
  const on = await play(sp({ quickDriverGate: true })), quick = /tdd\.mjs green --run \/tmp\/pat-test --group a --quick/;
  assert.match(on.by('green-driver:a')[0], quick);
  assert.match(on.by('green-driver:a')[0], /run 1 and run 3[^.]*without --quick/);
  for (const l of ['green-navigator:a', 'red-driver:a', 'red-navigator:a', 'reviewer']) assert.doesNotMatch(on.by(l)[0], /--quick/, `${l}: the navigator's run always mutates`);
  const fast = await play({ ...FAST, ...sp({ quickDriverGate: true }) });
  assert.match(fast.by('tdd-driver:a')[0], quick);
  for (const r of [await play(sp({})), await play({ ...FAST, ...sp({}) })]) assert.ok(r.calls.every(c => !/--quick/.test(c.prompt)));
});

test('preuse: on, the navigator\'s GREEN gate asks for the cached result (--reuse); off, it never does', async () => {
  const on = await play(sp({ gateReuse: true }));
  assert.match(on.by('green-navigator:a')[0], /`[^`]*tdd\.mjs green --run \/tmp\/pat-test --group a --reuse` then/);
  assert.match(on.by('green-navigator:a')[0], /re-runs only the flake check/);
  assert.doesNotMatch(on.by('green-driver:a')[0], /--reuse/, 'a driver runs the gate in full');
  const recheck = await play(sp({ gateReuse: true }), { 'green-navigator:a': { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'gap', what: 'mutant survived' }] } });
  assert.match(recheck.by('green-navigator:a:recheck')[0], /--group a --retest --reuse`/);
  const merged = await play({ ...FAST, ...sp({ gateReuse: true }) });
  assert.match(merged.by('green-navigator:a')[0], /--group a --reuse`/);
  assert.ok((await play(sp({}))).calls.every(c => !/--reuse/.test(c.prompt)));
});

test('pcourier: on, no courier when every fixer reports its gate ok; a fixer not ok still gets one; off, always one', async () => {
  const findings = { reviewer: { findings: [FINDING('src/a.py'), FINDING('src/b.py')] } };
  const on = await play(sp({ courierSkip: true }), findings);
  assert.deepEqual([on.labels.filter(l => /^final-verifier/.test(l)), on.out.verified, on.out.courierSkipped], [[], null, true]);
  assert.ok(on.logs.some(m => /courier skipped[^\n]*tdd\.mjs verify/.test(m)), on.logs.join('\n'));
  const notOk = await play(sp({ courierSkip: true }), { ...findings, 'fixer:b': { fixed: [], notFixed: [], gateOk: false } });
  assert.deepEqual([notOk.labels.filter(l => /^final-verifier/.test(l)), notOk.out.verified.ok, 'courierSkipped' in notOk.out], [['final-verifier'], true, false]);
  const off = await play(sp({}), findings);
  assert.deepEqual([off.labels.filter(l => /^final-verifier/.test(l)), 'courierSkipped' in off.out], [['final-verifier'], false]);
});

test('pparrev: on, the integration tester and the reviewer run at the same time and the reviewer leaves the integration file out; off, one after the other', async () => {
  const on = await play({ integration: INTEG, ...sp({ parallelReview: true }) }, {}, 5), at = (r, e) => r.events.indexOf(e);
  assert.ok(at(on, 'start reviewer') < at(on, 'end integration-tester') && at(on, 'start integration-tester') < at(on, 'end reviewer'), on.events.join(', '));
  assert.match(on.by('reviewer')[0], /tests\/integration\/test_flow\.py is being written now[^\n]*leave it out/);
  assert.deepEqual(on.out.integration, { file: INTEG.file, exit: 0, findings: [] });
  const off = await play({ integration: INTEG, ...sp({}) }, {}, 5);
  assert.ok(at(off, 'end integration-tester') < at(off, 'start reviewer'));
  assert.doesNotMatch(off.by('reviewer')[0], /being written now/);
  const notAll = await play({ integration: INTEG, ...sp({ parallelReview: true }) }, { 'red-navigator:b': { verdict: 'FAIL', defects: [{ cls: 'env', what: 'no sandbox' }], gateOk: false } });
  assert.deepEqual([notAll.labels.includes('integration-tester'), /being written now/.test(notAll.by('reviewer')[0] ?? '')], [false, false], 'no integration tester, so the review is the v2.0.0 one');
});

test('the dry run sizes the prompts the flags change', async () => {
  const off = await play({ mode: 'plan', ...sp({}) }), on = await play({ mode: 'plan', ...sp({ quickDriverGate: true, gateReuse: true }) });
  const size = (r, n) => r.out.prompts.find(p => p.node === n).promptChars;
  assert.ok(size(on, 'green-driver') > size(off, 'green-driver') && size(on, 'green-navigator') > size(off, 'green-navigator'));
});
