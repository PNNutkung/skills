// FCompat: with every speed flag off (no args.speed, or PTDD_PIPELINE_MODE=paired and the other four false) workflow.js sends the same prompts (the resume cache key), with the
// same options, in the same order, and returns the same object as v2.0.0. fixtures/compat-v2.json holds sha256 digests recorded from the v2.0.0 workflow.js, before any speed code.
//   node --test compat.test.mjs        compare
//   node compat.test.mjs --record      re-record (only on purpose: the fixture is the v2.0.0 reference)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'compat-v2.json');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');

const KINDS = ['happy', 'fail', 'edge'];
const grp = (id, o = {}) => ({ id, goal: `goal of ${id}`, tests: [`tests/test_${id}.py`], src: [`src/${id}.py`], dod: [`${id.toUpperCase()}1`], after: [], ...o });
const BASE = {
  repo: '/repo', base: 'b'.repeat(40), cmd: 'pytest -q {file}', skillDir: '/skill', runDir: '/tmp/pat-test', scratch: '/tmp/pat-scratch', maxRepairs: 40,
  dod: ['a', 'b', 'c'].map(id => ({ id: `${id.toUpperCase()}1`, text: `behavior of ${id}`, source: 'assumed' })),
  groups: [grp('a'), grp('b', { after: ['a'] }), grp('c')],
};
const rows = g => g.dod.flatMap(id => KINDS.map(kind => ({ dod: id, kind, test: `test_${id.toLowerCase()}_${kind}_case`, file: g.tests[0] })));
const PASS = { verdict: 'PASS', defects: [], gateOk: true };
const FAIL = (cls, what) => ({ verdict: 'FAIL', defects: [{ cls, what, file: 'x.py', line: 3 }], gateOk: false });
const FINDING = (file, severity = 'high') => ({ title: `issue in ${file}`, severity, file, startLine: 2, endLine: 3, hazard: 'h', failureScenario: 'f', quote: 'q', suggestedFix: 's', anchorable: true, proof: { mode: 'read', ref: `${file}:2-3`, quote: 'q' } });
const INTEG = { file: 'tests/integration/test_flow.py', goal: 'the whole flow through the real db' };
const ent = (g, next, o = {}) => ({ next, why: 'test', matrix: rows(g), files: g.tests, defects: [], retest: false, ...o });
const RESUME = { version: 1, base: 'b'.repeat(40), run: '/tmp/pat-test', maxRepairs: 4, warnings: [], groups: { a: ent(BASE.groups[0], 'done'), b: ent(BASE.groups[1], 'green-fix', { defects: [{ cls: 'impl', what: 'tests/test_b.py is fails-on-head' }] }), c: ent(BASE.groups[2], 'red-check') } };

function answer(label, over) {
  if (label in over) return over[label];
  const [node, gid] = label.split(':'), g = BASE.groups.find(x => x.id === gid);
  if (node === 'red-driver') return { matrix: rows(g), files: g.tests, reuse: 'codebase' };
  if (node === 'tdd-driver') return { matrix: rows(g), files: g.tests, srcFiles: g.src, reuse: 'codebase', cleanup: 'none', gateOk: true, gateRuns: 2 };
  if (node === 'red-navigator' || node === 'green-navigator') return PASS;
  if (node === 'green-driver') return { files: g.src, reuse: 'docs', cleanup: 'none' };
  if (node === 'reviewer') return { findings: [] };
  if (node === 'integration-tester') return { file: INTEG.file, exit: 0, findings: [] };
  if (node === 'fixer') return { fixed: [], notFixed: [], gateOk: true, gateRuns: 1 };
  if (node === 'final-verifier') return { ok: true, problems: [] };
  throw new Error(`no canned answer for ${label}`);
}

export const SCENARIOS = {
  'dry run': [{ mode: 'plan' }, {}],
  'dry run fast': [{ mode: 'plan', fast: true }, {}],
  'happy path': [{}, {}],
  'fast plan': [{ mode: 'fast', fast: true }, {}],
  'repairs': [{}, { 'red-navigator:a': FAIL('test', 'weak'), 'green-navigator:c': { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'gap', what: 'mutant survived' }, { cls: 'impl', what: 'off by one', file: 'src/c.py', line: 2 }] } }],
  'findings and converge': [{}, { reviewer: { findings: [FINDING('src/a.py'), FINDING('src/c.py', 'medium')] }, 'final-verifier': { ok: false, problems: [{ file: 'tests/test_a.py', group: 'a', what: 'group tests fail together: tests/test_a.py' }] } }],
  'fixer not ok': [{}, { reviewer: { findings: [FINDING('src/a.py')] }, 'fixer:a': { fixed: [], notFixed: [], gateOk: false, gateRuns: 3 } }],
  'integration': [{ integration: INTEG }, { reviewer: { findings: [FINDING('src/b.py')] } }],
  'fast with findings and integration': [{ mode: 'fast', fast: true, integration: INTEG }, { reviewer: { findings: [FINDING('src/a.py')] } }],
  'v2.0.0 continue.json': [{ resume: RESUME }, {}],
  'agent cap': [{ agentCap: 4 }, {}],
};

export async function playScenario(args, over) {
  const calls = [], logs = [];
  const agent = async (prompt, o) => { calls.push({ prompt, o }); return structuredClone(answer(o.label, over)); };
  const ret = await wf(agent, parallel, async () => [], () => {}, m => logs.push(m), { ...BASE, ...args }, {});
  return { labels: calls.map(c => c.o.label), calls: calls.map(c => sha(c)), logs: sha(logs), ret: sha(ret) };
}

const ALL_OFF = { pipeline: 'paired', quickDriverGate: false, gateReuse: false, courierSkip: false, parallelReview: false };
if (process.argv.includes('--record')) {
  const out = {};
  for (const [name, [args, over]] of Object.entries(SCENARIOS)) out[name] = await playScenario(args, over);
  writeFileSync(FIXTURE, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`recorded ${Object.keys(out).length} scenarios in ${FIXTURE}`);
} else {
  const want = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  test('should keep every v2.0.0 scenario on record', () => assert.deepEqual(Object.keys(want).sort(), Object.keys(SCENARIOS).sort()));
  for (const [name, [args, over]] of Object.entries(SCENARIOS)) {
    test(`fcompat: ${name}: no args.speed gives the v2.0.0 prompts, options, order, logs and return`, async () => assert.deepEqual(await playScenario(args, over), want[name]));
    test(`fcompat: ${name}: args.speed with every flag off gives the same as v2.0.0`, async () => assert.deepEqual(await playScenario({ ...args, speed: ALL_OFF }, over), want[name]));
  }
}
