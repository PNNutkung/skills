// Mutation-gate tests for the judge part of workflow.js (fast mode with the test writer): which survivors reach the judge, the judge prompt, who owns a survivor, what the
// test writers of the owning groups are told and how their outcome is reported. Canned agents, no git, no gate. Run: node --test workflow.mut-judge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));

const KINDS = ['happy', 'fail', 'edge'];
const grp = (id, o = {}) => ({ id, goal: `goal of ${id}`, tests: [`tests/test_${id}.py`], src: [`src/${id}.py`], dod: [`${id.toUpperCase()}1`], after: [], ...o });
const BASE40 = '0123456789abcdef0123456789abcdef01234567';
const ARGS = (groups = [grp('a')], o = {}) => ({
  repo: '/repo', base: BASE40, cmd: 'pytest -q {file}', skillDir: '/skill', runDir: '/tmp/pat-test', scratch: '/tmp/pat-scratch', maxRepairs: 40,
  mode: 'fast', testWriter: true, dod: groups.map(g => ({ id: g.dod[0], text: `behavior of ${g.id}`, source: 'assumed' })), groups, ...o,
});
const rows = g => g.dod.flatMap(id => KINDS.map(kind => ({ dod: id, kind, test: `test_${id.toLowerCase()}_${kind}_case`, file: g.tests[0] })));
const PASS = { verdict: 'PASS', defects: [], gateOk: true };
const FAIL = (...defects) => ({ verdict: 'FAIL', defects, gateOk: false });
const CLEAN = { findings: [], final: { ok: true, survivors: [] } };

/** canned agents; `over` maps an exact label or a node name to a value, or to a function of the 1-based call count of that label */
function answer(args, label, n, over) {
  const pick = k => (k in over ? (typeof over[k] === 'function' ? over[k](n) : over[k]) : undefined);
  for (const k of [label, label.split(':')[0]]) if (k in over) return pick(k);
  const node = label.split(':')[0], g = args.groups.find(x => x.id === label.split(':')[1]);
  if (node === 'test-writer') return { done: true, rejected: [], matrix: rows(g), files: g.tests, reuse: 'none', gateOk: true };
  if (node === 'code-driver') return { done: true, testWrong: [], files: g.src, srcFiles: g.src, gateOk: true };
  if (node === 'tdd-driver') return { matrix: rows(g), files: g.tests, srcFiles: g.src, reuse: 'none' };
  if (node === 'green-navigator' || node === 'red-navigator') return PASS;
  if (node === 'reviewer') return CLEAN;
  if (node === 'judge') return { done: true, marked: [], unmarked: [], finalOk: false };
  if (node === 'fixer') return { fixed: [], notFixed: [], gateOk: true };
  if (node === 'final-verifier') return { ok: true, problems: [] };
  throw new Error(`no canned answer for ${label}`);
}
async function play(args, over = {}) {
  const calls = [], count = {};
  const agent = async (prompt, o) => { count[o.label] = (count[o.label] || 0) + 1; calls.push({ prompt, label: o.label }); return structuredClone(answer(args, o.label, count[o.label], over)); };
  const logs = [];
  const out = await wf(agent, parallel, async () => [], () => {}, m => logs.push(m), args, {});
  return { out, calls, logs, labels: calls.map(c => c.label), by: l => calls.filter(c => c.label === l).map(c => c.prompt), first: l => calls.find(c => c.label === l)?.prompt };
}
const sub = (text, ...parts) => { for (const p of parts) assert.ok(text.includes(p), `missing: ${p}\n--- in ---\n${text.slice(0, 1500)}`); };
const ALONE_TXT = 'Another maker edits the other file set of this group right now';

const reviewOf = (survivors, ok = false) => ({ findings: [], final: { ok, survivors } });
const S = (id, file = 'src/a.py') => ({ id, file, line: 1, op: 'const-inc', before: 'a', after: 'b' });
const judged = r => r.out.judge;

const MIXED = [
  { id: 'X-1', file: 'src/a.py', line: 12, op: 'const-inc', before: '  x = 1 ', after: 'x = 2' },
  { id: 'X-2', file: 'src/a.py' },
  { id: 'X-3' },
  { id: 'X-4', file: 'src/a.py', line: 5, op: 'eq-ne', before: 'only before' },
  { id: 'X-5', op: 'gt-ge' },
  { id: 'X-6', file: 'src/a.py', before: '', after: '' },
  { id: 'X-7', file: 'src/a.py', line: 7, before: 'b'.repeat(100), after: 'a'.repeat(100) },
  { id: 'X-8', after: 'only after' },
];
const MIXED_LINES = ['- X-1 src/a.py:12 const-inc: x = 1 -> x = 2', '- X-2 src/a.py', '- X-3', '- X-4 src/a.py:5 eq-ne', '- X-5 gt-ge', '- X-6 src/a.py:  -> ',
  '- X-7 src/a.py:7: ' + 'b'.repeat(77) + '... -> ' + 'a'.repeat(77) + '...', '- X-8'].join('\n');

test('should describe every survivor on its own line and give the judge its role, commands and tool cap when the final gate left survivors', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf(MIXED) });
  const p = r.first('judge');
  sub(p, 'ROLE: judge of surviving mutants. You wrote neither the tests nor the code, and you edit no file. PONYTAIL full: the smallest change that works; evidence and checks are never shortened.\nREPO /repo  BASE 01234567  RUN /tmp/pat-test',
    'The final gate mutated every changed line; with each mutant below every test still passed:\n' + MIXED_LINES + '\n\n',
    'For each, read the file at that line and decide. EQUIVALENT only when no input can tell the mutant apart from the original (the same observable behavior for every input). Mark it: `node /skill/tdd.mjs equivalent --run /tmp/pat-test --add <id> --reason \'<why no input can tell them apart, at least 20 characters>\'` (refused unless the id survived the last final run).',
    'Anything a test COULD catch is a test gap: leave it unmarked, the test writer gets it. When in doubt, unmarked: the list goes to the user in the PR.',
    'Then run once: `node /skill/tdd.mjs final --run /tmp/pat-test --again` and read its mutation lines.',
    'RETURN: done; marked = the ids you marked; unmarked = the other survivor ids; finalOk = the ok= value of that final run; notes (<= 400 chars). ');
  assert.ok(p.endsWith('At most 20 tool calls.'));
  assert.doesNotMatch(p, /NaN|undefined|\[object Object\]/);
});

test('should tell the owning test writer the survivors, the final run to repeat and its tool cap when the judge leaves them unmarked', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf(MIXED) });
  assert.deepEqual(r.labels.filter(l => /^(judge|test-writer)/.test(l)), ['test-writer:a', 'judge', 'test-writer:a:survivors']);
  const p = r.first('test-writer:a:survivors');
  sub(p, 'ROLE: test writer: you own the tests of this group; the code exists now',
    'These mutants SURVIVED the final gate (every changed line) and the judge did not mark them equivalent: no test fails with them. Add or sharpen tests so each would fail; every new test must PASS on the current code; never weaken, skip or delete a test. Then also run `node /skill/tdd.mjs final --run /tmp/pat-test --again`.\n' + MIXED_LINES,
    'red --rewrite');
  assert.doesNotMatch(p, /FIX EXACTLY|TEST-IS-WRONG|Another maker|NaN|undefined/);
  assert.ok(p.endsWith('At most 40 tool calls.'));
});

test('should not send a survivor to a test writer when the judge marks it equivalent and ignore ids that were never survivors', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf([S('X-1'), S('X-2')]), judge: { done: true, marked: ['X-1', 'X-ghost'], unmarked: [], finalOk: true } });
  assert.deepEqual(judged(r).marked, ['X-1']);
  assert.deepEqual(judged(r).unmarked, ['X-2']);
  assert.equal(judged(r).finalOk, true);
  const p = r.first('test-writer:a:survivors');
  assert.ok(p.includes('- X-2 ') && !p.includes('X-1') && !p.includes('X-ghost'));
});

test('should send no survivor to a test writer when the judge marks every one equivalent', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf([S('X-1')]), judge: { done: true, marked: ['X-1'], unmarked: [], finalOk: true } });
  assert.deepEqual(r.labels.filter(l => l.endsWith(':survivors')), []);
  assert.deepEqual(judged(r).unmarked, []);
});

test('should take the survivors of the final run and ignore the top-level list when both are given', async () => {
  const r = await play(ARGS(), { reviewer: { findings: [], final: { ok: false, survivors: [{ id: 'X-final' }] }, survivors: [{ id: 'X-top' }] } });
  const p = r.first('judge');
  assert.ok(p.includes('- X-final') && !p.includes('X-top'));
});

test('should take the top-level survivor list when the final run lists none', async () => {
  const r = await play(ARGS(), { reviewer: { findings: [], final: { ok: false, survivors: [] }, survivors: [{ id: 'X-top' }] } });
  sub(r.first('judge'), 'still passed:\n- X-top\n\n');
});

test('should take the top-level survivor list when the review has no final section', async () => {
  const r = await play(ARGS(), { reviewer: { findings: [], survivors: [{ id: 'X-top' }] } });
  sub(r.first('judge'), 'still passed:\n- X-top\n\n');
});

test('should take the top-level survivor list when the survivors of the final run are not an array', async () => {
  const r = await play(ARGS(), { reviewer: { findings: [], final: { ok: false, survivors: 'oops' }, survivors: [{ id: 'X-top' }] } });
  sub(r.first('judge'), 'still passed:\n- X-top\n\n');
});

test('should call no judge when the review lists no survivor anywhere', async () => {
  for (const reviewer of [{ findings: [], final: { ok: false, survivors: [] } }, { findings: [], final: { ok: false, survivors: [] }, survivors: 'x' }, { findings: [] }]) {
    const r = await play(ARGS(), { reviewer });
    assert.ok(!r.labels.includes('judge'));
    assert.equal(judged(r), undefined);
    assert.equal(r.out.groups.a.state, 'done');
  }
});

test('should call no judge when the final run was ok even though survivors are listed', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf([S('X-1')], true) });
  assert.ok(!r.labels.includes('judge'));
});

test('should pass each survivor once and skip entries with no usable id when the review lists duplicates and junk', async () => {
  const list = [null, { id: 5 }, { id: '' }, { id: 'X-1' }, { id: 'X-1' }, { id: 'X-2' }, 'X-3', {}];
  const r = await play(ARGS(), { reviewer: { findings: [], final: { ok: false, survivors: list } } });
  sub(r.first('judge'), 'still passed:\n- X-1\n- X-2\n\n');
  assert.deepEqual(judged(r).unmarked, ['X-1', 'X-2']);
});

test('should pass at most 20 survivors to the judge when the review lists more', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf(Array.from({ length: 25 }, (_, i) => ({ id: 'X-' + String(i).padStart(2, '0') }))) });
  assert.equal(judged(r).unmarked.length, 20);
});

test('should call no judge when fast mode runs without the test writer', async () => {
  const r = await play(ARGS([grp('a')], { testWriter: false }), { reviewer: reviewOf([S('X-1')]) });
  assert.ok(!r.labels.includes('judge'));
  assert.equal(judged(r), undefined);
  assert.deepEqual(r.labels.filter(l => l.startsWith('test-writer')), []);
});

test('should call no judge when the test writer flag is set but the run is not in fast mode', async () => {
  const r = await play(ARGS([grp('a')], { mode: undefined }), {
    reviewer: reviewOf([S('X-1')]), 'red-driver': { matrix: rows(grp('a')), files: ['tests/test_a.py'], reuse: 'none' }, 'green-driver': { files: ['src/a.py'], reuse: 'none' },
  });
  assert.ok(!r.labels.includes('judge'));
});

test('should send a survivor only to the group that owns its file when the groups differ', async () => {
  for (const [file, owner] of [['src/b.py', 'b'], ['tests/test_b.py', 'b'], ['src/a.py', 'a'], ['tests/test_a.py', 'a']]) {
    const r = await play(ARGS([grp('a'), grp('b')]), { reviewer: reviewOf([S('X-1', file)]) });
    assert.deepEqual(r.labels.filter(l => l.endsWith(':survivors')), [`test-writer:${owner}:survivors`], file);
    assert.deepEqual(Object.keys(judged(r).writers), [owner]);
    assert.deepEqual(judged(r).writers[owner].survivors, ['X-1']);
  }
});

test('should send a survivor to every finished group when no group owns its file or it names none', async () => {
  for (const survivor of [S('X-1', 'lib/other.py'), { id: 'X-1' }, S('X-1', '')]) {
    const r = await play(ARGS([grp('a'), grp('b')]), { reviewer: reviewOf([survivor]) });
    assert.deepEqual(r.labels.filter(l => l.endsWith(':survivors')).sort(), ['test-writer:a:survivors', 'test-writer:b:survivors']);
  }
});

test('should report each writer outcome and list the groups whose survivors stay alive when the writers finish differently', async () => {
  const groups = ['a', 'b', 'c', 'd', 'e'].map(id => grp(id));
  const surv = [S('X-a1', 'src/a.py'), S('X-a2', 'src/a.py'), S('X-b', 'src/b.py'), S('X-c', 'src/c.py'), S('X-d', 'src/d.py'), S('X-e', 'src/e.py')];
  const r = await play(ARGS(groups), {
    reviewer: reviewOf(surv),
    'test-writer:a:survivors': { done: true, rejected: [], matrix: [], files: [], gateOk: true },
    'test-writer:b:survivors': { done: false, rejected: [], matrix: [], files: [], gateOk: true },
    'test-writer:c:survivors': { done: true, rejected: [], matrix: [], files: [], gateOk: false },
    'test-writer:d:survivors': { done: true, rejected: [], matrix: [], files: [] },
    'test-writer:e:survivors': null,
  });
  const w = judged(r).writers;
  assert.deepEqual(w.a, { done: true, gateOk: true, survivors: ['X-a1', 'X-a2'] });
  assert.deepEqual(w.b, { done: false, gateOk: true, survivors: ['X-b'] });
  assert.deepEqual(w.c, { done: true, gateOk: false, survivors: ['X-c'] });
  assert.deepEqual(w.d, { done: true, gateOk: undefined, survivors: ['X-d'] });
  assert.deepEqual(w.e, { done: false, survivors: ['X-e'] });
  assert.deepEqual(r.out.notDone.filter(n => n.includes('surviving mutants')).sort(), [
    'b: surviving mutants not killed after the judge: X-b',
    'c: surviving mutants not killed after the judge: X-c',
    'e: surviving mutants not killed after the judge: X-e',
  ]);
});

test('should list a group with two survivors joined by commas in the not-done list when its writer did not finish', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf([S('X-1'), S('X-2')]), 'test-writer:a:survivors': { done: false, rejected: [], matrix: [], files: [] } });
  assert.deepEqual(r.out.notDone, ['a: surviving mutants not killed after the judge: X-1, X-2']);
  assert.match(r.out.postmortemMd, /Not done: a: surviving mutants not killed after the judge: X-1, X-2/);
});

test('should leave the not-done list empty when every writer finishes with its gate ok', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf([S('X-1')]), 'test-writer:a:survivors': { done: true, rejected: [], matrix: [], files: [], gateOk: true } });
  assert.deepEqual(r.out.notDone, []);
  assert.deepEqual(judged(r).writers.a, { done: true, gateOk: true, survivors: ['X-1'] });
});

test('should log how many survivors the judge marked and how many go back to the test writer when the judge answers', async () => {
  const r = await play(ARGS(), { reviewer: reviewOf([S('X-1'), S('X-2'), S('X-3')]), judge: { done: true, marked: ['X-1'], unmarked: [], finalOk: false } });
  assert.ok(r.logs.includes('judge: 1 survivor(s) marked equivalent, 2 go back to the test writer'), r.logs.join('\n'));
});
