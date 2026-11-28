// Mutation-gate tests for the test-writer and code-driver parts of workflow.js (fast mode with the test writer): the prompts of both roles, how a failing check is split between
// them, the matrix rework before any code, and the testWrong round trip. Canned agents, no git, no gate. Run: node --test workflow.mut-writer.test.mjs
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

const IFACE_TEXT = 'I'.repeat(2500);
const DOC = 'docs/adr/0011.md';
const NAME130 = 'test_a1_' + 'n'.repeat(122), REASON500 = 'r'.repeat(500);
const clipTo = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
const WRONG_NOTE = { test: 'test_a1_edge_x', reason: 'the edge test wants 4 but the DoD says 3' };
const IMPL_DEFECT = { cls: 'impl', what: 'IMPLWHAT the code breaks', file: 'src/a.py', line: 9 };
const GAP_DEFECT = { cls: 'gap', what: 'GAPWHAT a mutant survived', file: 'src/a.py', line: 3 };
const TEST_DEFECT = { cls: 'test', what: 'TESTWHAT a frozen test changed' };
const SCOPE_DEFECT = { cls: 'scope', what: 'SCOPEWHAT a file outside the fence' };
const NEWROW = { dod: 'A1', kind: 'happy', test: 'test_a1_happy_more', file: 'tests/test_a.py' };

test('should give the test writer the plan files, the base, the interface cut at 2400 characters and its tool cap when a group starts', async () => {
  const r = await play(ARGS([grp('a')], { interface: IFACE_TEXT, dodFile: DOC }));
  const p = r.first('test-writer:a');
  sub(p, 'ROLE: test writer: write the FAILING tests (RED) for this group; a separate code driver writes the code after you, against your tests (group a).',
    'GOAL: goal of a',
    'DEFINITION OF DONE (one test per item and kind; every test name MUST contain its item id set apart by non-alphanumerics, e.g. test_ac1_happy_...; one test serves one item and kind only):\nA1 [happy,fail,edge] behavior of a',
    'PLAN FILES: tests tests/test_a.py; code src/a.py. Read existing code only as it is at BASE 01234567 (`git show 01234567:<file>`); never read the group\'s source files in the working tree: your tests come from the DoD and the Interface, not from the code.',
    'INTERFACE (the API: names, inputs, outputs, errors), from the `## Interface` section of docs/adr/0011.md (the user approved it; `git show 01234567:docs/adr/0011.md`):\n' + 'I'.repeat(2397) + '...',
    'Each new test must fail for the RIGHT reason: an assertion about behavior that does not exist yet, not a typo. Write no source file. ',
    'node /skill/tdd.mjs red --run /tmp/pat-test --group a', 'RETURN: done; rejected = [{test, reason}] for each note you did not accept');
  assert.ok(!p.includes('I'.repeat(2398)), 'the interface is cut at 2400 characters, the dots included');
  assert.ok(p.endsWith('At most 40 tool calls.'));
  assert.doesNotMatch(p, /you own the tests|TEST-IS-WRONG|SURVIVED|FIX EXACTLY/);
  assert.doesNotMatch(p, /NaN|undefined|\[object Object\]/);
});

test('should name the ADR and no file when the plan carries no dodFile and no interface', async () => {
  const r = await play(ARGS());
  sub(r.first('test-writer:a'), 'from the `## Interface` section of the ADR (the user approved it; `git show 01234567:<adr>`):\n');
  sub(r.first('code-driver:a'), 'from the `## Interface` section of the ADR (the user approved it; `git show 01234567:<adr>`):\n');
});

test('should give the code driver the DoD, the interface, the frozen tests, one cleanup pass and its tool cap when the tests are written', async () => {
  const r = await play(ARGS([grp('a')], { interface: 'THE-API-TEXT', dodFile: DOC }));
  const p = r.first('code-driver:a');
  sub(p, 'ROLE: code driver: GREEN, the minimum code that makes the test writer\'s RED tests pass (group a).',
    'DEFINITION OF DONE:\nA1 [happy,fail,edge] behavior of a',
    'INTERFACE (the API: names, inputs, outputs, errors), from the `## Interface` section of docs/adr/0011.md (the user approved it; `git show 01234567:docs/adr/0011.md`):\nTHE-API-TEXT',
    'THE TESTS BELONG TO THE TEST WRITER: tests/test_a.py.',
    'After GREEN, at most ONE cleanup pass, only for a duplicated block (3+ copies) or dead code you added; otherwise cleanup = "none". Run the gate again after it.',
    'node /skill/tdd.mjs green --run /tmp/pat-test --group a', 'RETURN: done; testWrong = [{test, reason}]');
  assert.ok(p.endsWith('At most 45 tool calls.'));
  assert.doesNotMatch(p, /FIX EXACTLY|REJECTED|Another maker/);
});

test('should split a failing check between the two makers and tell each the other works at the same time when both kinds of defect come back', async () => {
  const newMatrix = [...rows(grp('a')), NEWROW];
  const r = await play(ARGS(), {
    'green-navigator:a': FAIL(GAP_DEFECT, TEST_DEFECT, IMPL_DEFECT, SCOPE_DEFECT),
    'test-writer:a:strengthen': { done: true, rejected: [], matrix: newMatrix, files: ['tests/test_a.py'], gateOk: true },
  });
  const cd = r.first('code-driver:a:rework'), tw = r.first('test-writer:a:strengthen');
  sub(cd, 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n- [impl] src/a.py:9 IMPLWHAT the code breaks\n- [scope] SCOPEWHAT a file outside the fence', ALONE_TXT);
  assert.doesNotMatch(cd, /GAPWHAT|TESTWHAT|After GREEN, at most ONE cleanup/);
  sub(tw, 'FIX EXACTLY THESE TEST DEFECTS FROM THE CHECK (a gap: add or sharpen a test; a changed frozen test: put it back; a wrong test: correct it in place):\n- [gap] src/a.py:3 GAPWHAT a mutant survived\n- [test] TESTWHAT a frozen test changed', ALONE_TXT);
  assert.doesNotMatch(tw, /IMPLWHAT|SCOPEWHAT|red --rewrite/);
  assert.deepEqual(r.out.groups.a.matrix, newMatrix, 'the matrix the test writer returned replaces the old one');
  assert.equal(r.out.groups.a.state, 'done');
});

test('should hand only the test writer a gap or a changed test and run it with red --rewrite when no code defect comes back', async () => {
  const newMatrix = [...rows(grp('a')), NEWROW];
  for (const defect of [GAP_DEFECT, TEST_DEFECT]) {
    const r = await play(ARGS(), {
      'green-navigator:a': FAIL(defect),
      'test-writer:a:strengthen': { done: true, rejected: [], matrix: newMatrix, files: ['tests/test_a.py'], gateOk: true },
    });
    assert.deepEqual(r.labels.filter(l => /rework|strengthen/.test(l)), ['test-writer:a:strengthen']);
    const tw = r.first('test-writer:a:strengthen');
    sub(tw, 'ROLE: test writer: you own the tests of this group; the code exists now', 'FIX EXACTLY THESE TEST DEFECTS', 'red --rewrite', 'node /skill/tdd.mjs red --run /tmp/pat-test --group a --rewrite', 'node /skill/tdd.mjs green --run /tmp/pat-test --group a`', 'never --retest');
    assert.doesNotMatch(tw, /Another maker/);
    assert.doesNotMatch(tw, /you may have to write|Write no source file/);
    assert.deepEqual(r.out.groups.a.matrix, newMatrix, `${defect.cls}: the matrix of the test writer is kept`);
    assert.equal(r.out.groups.a.state, 'done');
  }
});

test('should hand only the code driver an impl or scope defect and let it run the gate itself when no test defect comes back', async () => {
  for (const defect of [IMPL_DEFECT, SCOPE_DEFECT]) {
    const r = await play(ARGS(), { 'green-navigator:a': FAIL(defect) });
    assert.deepEqual(r.labels.filter(l => /rework|strengthen/.test(l)), ['code-driver:a:rework']);
    const cd = r.first('code-driver:a:rework');
    sub(cd, 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):', 'node /skill/tdd.mjs green --run /tmp/pat-test --group a');
    assert.doesNotMatch(cd, /Another maker/);
    assert.equal(r.out.groups.a.state, 'done');
  }
});

test('should start the next repair from what a maker could not fix and skip the check in between when it stops with gateOk false and a remaining list', async () => {
  const r = await play(ARGS([grp('a')], { rounds: 3 }), {
    'green-navigator:a': FAIL({ cls: 'impl', what: 'first problem' }),
    'code-driver:a:rework': { done: false, testWrong: [], files: ['src/a.py'], gateOk: false, remaining: [{ cls: 'impl', what: 'a different leftover problem' }] },
  });
  assert.deepEqual(r.labels.filter(l => /^(code-driver|green-navigator)/.test(l)), ['code-driver:a', 'green-navigator:a', 'code-driver:a:rework', 'code-driver:a:rework2', 'green-navigator:a:recheck2']);
  sub(r.first('code-driver:a:rework2'), '- [impl] a different leftover problem');
  assert.equal(r.out.groups.a.state, 'done');
});

test('should keep what the code driver claims about its gate and its test gaps when the repair ends and the check passes', async () => {
  const gaps = [{ file: 'src/a.py', why: 'no test pins the branch' }];
  let r = await play(ARGS(), {
    'green-navigator:a': FAIL(IMPL_DEFECT),
    'code-driver:a:rework': { done: true, testWrong: [], files: ['src/a.py'], gateOk: true, gateRuns: 2, testGaps: gaps },
  });
  assert.deepEqual(r.out.groups.a.green.driver, { gateOk: true, gateRuns: 2, testGaps: gaps });
  for (const testGaps of [undefined, []]) {
    r = await play(ARGS(), { 'green-navigator:a': FAIL(IMPL_DEFECT), 'code-driver:a:rework': { done: true, testWrong: [], files: ['src/a.py'], gateOk: true, gateRuns: 1, testGaps } });
    assert.equal(r.out.groups.a.state, 'done');
    assert.equal(r.out.groups.a.green.driver.testGaps, undefined);
    assert.equal(r.out.groups.a.green.driver.gateRuns, 1);
  }
});

test('should leave the matrix alone when the code driver answers a code-only repair with a matrix of its own', async () => {
  const r = await play(ARGS(), {
    'green-navigator:a': FAIL(IMPL_DEFECT),
    'code-driver:a:rework': { done: true, testWrong: [], files: ['src/a.py'], gateOk: true, matrix: [NEWROW] },
  });
  assert.deepEqual(r.out.groups.a.matrix, rows(grp('a')));
});

test('should go on to the next check when the test writer returns nothing for a test-only repair', async () => {
  const r = await play(ARGS(), { 'green-navigator:a': FAIL(GAP_DEFECT), 'test-writer:a:strengthen': null });
  assert.equal(r.out.groups.a.state, 'done', JSON.stringify(r.out.groups.a));
  assert.deepEqual(r.out.groups.a.matrix, rows(grp('a')));
  assert.ok(r.labels.includes('green-navigator:a:recheck'));
});

test('should keep a test writer answer with an empty matrix from replacing the matrix when it repairs a gap', async () => {
  const r = await play(ARGS(), { 'green-navigator:a': FAIL(GAP_DEFECT), 'test-writer:a:strengthen': { done: true, rejected: [], matrix: [], files: ['tests/test_a.py'], gateOk: true } });
  assert.deepEqual(r.out.groups.a.matrix, rows(grp('a')));
});

test('should turn a testWrong note of the code driver into a test defect cut at 300 characters when the repair returns it instead of a fix', async () => {
  const r = await play(ARGS([grp('a')], { rounds: 1 }), {
    'green-navigator:a': FAIL(IMPL_DEFECT),
    'code-driver:a:rework': { done: false, testWrong: [{ test: 'test_a1_edge_x', reason: 'z'.repeat(301) }], files: ['src/a.py'], gateOk: false },
  });
  const g = r.out.groups.a;
  assert.equal(g.state, 'blocked');
  assert.deepEqual(g.green.defects, [{ cls: 'test', what: 'WRONG TEST test_a1_edge_x: ' + 'z'.repeat(297) + '... (a testWrong note of the code driver)' }]);
});

test('should send the testWrong note back to the test writer as a test defect when the code driver ends a repair on it', async () => {
  const r = await play(ARGS(), {
    'green-navigator:a': FAIL(IMPL_DEFECT),
    'code-driver:a:rework': { done: false, testWrong: [WRONG_NOTE], files: ['src/a.py'], gateOk: false },
  });
  const tw = r.first('test-writer:a:strengthen2');
  sub(tw, 'FIX EXACTLY THESE TEST DEFECTS', '- [test] WRONG TEST test_a1_edge_x: the edge test wants 4 but the DoD says 3 (a testWrong note of the code driver)');
  assert.equal(r.out.groups.a.state, 'done');
});

test('should rework the matrix once with a solo test writer when one DoD kind has no test', async () => {
  const r = await play(ARGS(), { 'test-writer:a': { done: true, rejected: [], matrix: rows(grp('a')).filter(x => x.kind !== 'edge'), files: ['tests/test_a.py'], gateOk: true } });
  assert.deepEqual(r.labels.filter(l => l.startsWith('test-writer')), ['test-writer:a', 'test-writer:a:matrix']);
  const p = r.first('test-writer:a:matrix');
  sub(p, 'ROLE: test writer: you own the tests of this group', 'FIX EXACTLY THESE TEST DEFECTS', '- [gap] DoD A1 has no edge test (a test whose name contains A1)', 'red --rewrite');
  assert.doesNotMatch(p, /Another maker/);
  assert.equal(r.out.groups.a.state, 'done');
  assert.equal(r.labels.filter(l => l.startsWith('code-driver')).length, 1);
});

test('should rework the matrix when every kind is covered but one row cannot count', async () => {
  const bad = { dod: 'ZZ9', kind: 'happy', test: 'test_zz9_happy', file: 'tests/test_a.py' };
  const r = await play(ARGS(), { 'test-writer:a': { done: true, rejected: [], matrix: [...rows(grp('a')), bad], files: ['tests/test_a.py'], gateOk: true } });
  assert.deepEqual(r.labels.filter(l => l.startsWith('test-writer')), ['test-writer:a', 'test-writer:a:matrix']);
  sub(r.first('test-writer:a:matrix'), '- [test] matrix row ZZ9/happy test_zz9_happy cannot count: unknown DoD id');
});

test('should not start the code driver and block the group with the gaps named when the matrix stays incomplete and no repair is left', async () => {
  const bad = { dod: 'ZZ9', kind: 'happy', test: 'test_zz9_happy', file: 'tests/test_a.py' };
  const r = await play(ARGS([grp('a')], { maxRepairs: 0 }), { 'test-writer:a': { done: true, rejected: [], matrix: [...rows(grp('a')).filter(x => x.kind !== 'edge'), bad], files: ['tests/test_a.py'], gateOk: true } });
  assert.deepEqual(r.labels.filter(l => /^(test-writer|code-driver)/.test(l)), ['test-writer:a']);
  assert.equal(r.out.groups.a.state, 'blocked');
  assert.equal(r.out.groups.a.reason, 'the test writer left DoD pairs uncovered: A1/edge has no test; ZZ9: unknown DoD id');
});

test('should record the files, the matrix and a merged writer RED stage of the group when the test writer finishes', async () => {
  const r = await play(ARGS(), { 'test-writer:a': { done: true, rejected: [], matrix: rows(grp('a')), files: ['tests/test_a.py', 'tests/helper.py'], gateOk: true } });
  const g = r.out.groups.a;
  assert.deepEqual(g.files, ['tests/test_a.py', 'tests/helper.py']);
  assert.deepEqual(g.matrix, rows(grp('a')));
  assert.deepEqual(g.red, { reworks: 0, verdict: 'merged', merged: true, writer: true });
  assert.equal(g.state, 'done');
});

test('should send a testWrong note to the test writer cut to 120 and 400 characters and the rejection back to the code driver when a test is wrong', async () => {
  const r = await play(ARGS(), {
    'code-driver:a': { done: false, testWrong: [{ test: NAME130, reason: REASON500 }], files: ['src/a.py'], gateOk: false },
    'test-writer:a:wrong': { done: true, rejected: [null, { test: '', reason: 'DROPPED-EMPTY' }, { reason: 'DROPPED-NONAME' }, { test: NAME130, reason: REASON500 }], matrix: [...rows(grp('a')), NEWROW], files: ['tests/test_a.py'], gateOk: true },
  });
  assert.deepEqual(r.labels.filter(l => /^(test-writer|code-driver)/.test(l)), ['test-writer:a', 'code-driver:a', 'test-writer:a:wrong', 'code-driver:a:again']);
  const line = '- ' + clipTo(NAME130, 120) + ': ' + clipTo(REASON500, 400);
  const tw = r.first('test-writer:a:wrong');
  sub(tw, 'ROLE: test writer: you own the tests of this group; the code exists now', 'TEST-IS-WRONG NOTES from the code driver (it may not edit a test).', line, 'red --rewrite');
  assert.doesNotMatch(tw, /FIX EXACTLY|SURVIVED|Another maker/);
  const cd = r.first('code-driver:a:again');
  sub(cd, 'THE TEST WRITER REJECTED your testWrong notes; those tests stand, make the code pass them:\n' + line);
  assert.ok(!cd.includes('DROPPED'), 'a rejection with no test name is dropped');
  assert.doesNotMatch(cd, /- : /);
  assert.deepEqual(r.out.groups.a.matrix, [...rows(grp('a')), NEWROW], 'the matrix the test writer returned with its answer is taken');
  assert.equal(r.out.groups.a.state, 'done');
});

test('should keep the old matrix when the test writer answers a testWrong note with no matrix', async () => {
  const r = await play(ARGS(), {
    'code-driver:a': { done: false, testWrong: [WRONG_NOTE], files: ['src/a.py'], gateOk: false },
    'test-writer:a:wrong': { done: true, rejected: [], matrix: [], files: ['tests/test_a.py'], gateOk: true },
  });
  assert.deepEqual(r.out.groups.a.matrix, rows(grp('a')));
});

test('should block the group after the rounds with the open note cut at 200 characters when the code driver keeps returning one', async () => {
  const note = { test: 'test_a1_edge_x', reason: 'q'.repeat(300) };
  const r = await play(ARGS([grp('a')], { rounds: 2 }), { 'code-driver': { done: false, testWrong: [note], files: ['src/a.py'], gateOk: false } });
  assert.deepEqual(r.labels.filter(l => l.startsWith('test-writer')), ['test-writer:a', 'test-writer:a:wrong', 'test-writer:a:wrong2']);
  assert.equal(r.out.groups.a.state, 'blocked');
  assert.equal(r.out.groups.a.reason, 'testWrong notes still open after 2 round(s): ' + clipTo(note.test + ': ' + note.reason, 200));
});

test('should pause the group when the repair budget is spent and the code driver returns a testWrong note', async () => {
  const note = { test: 'test_a1_' + 'k'.repeat(120), reason: 'x' };
  const r = await play(ARGS([grp('a')], { maxRepairs: 0 }), { 'code-driver': { done: false, testWrong: [note], files: ['src/a.py'], gateOk: false } });
  assert.equal(r.out.groups.a.state, 'paused');
  assert.equal(r.out.groups.a.reason, 'the run-wide repair budget (0) is spent with testWrong notes open: ' + clipTo(note.test, 100) + ' | continue with tdd.mjs resume');
  assert.deepEqual(r.labels.filter(l => l.startsWith('test-writer')), ['test-writer:a']);
});

test('should fail the group with the reason when the test writer returns nothing for a testWrong note', async () => {
  const r = await play(ARGS(), { 'code-driver:a': { done: false, testWrong: [WRONG_NOTE], files: ['src/a.py'], gateOk: false }, 'test-writer:a:wrong': null });
  assert.equal(r.out.groups.a.state, 'failed');
  assert.equal(r.out.groups.a.reason, 'test-writer returned nothing for a testWrong note');
});

test('should fail the group with the reason when the code driver returns nothing after the test writer answered its note', async () => {
  const r = await play(ARGS(), { 'code-driver:a': { done: false, testWrong: [WRONG_NOTE], files: ['src/a.py'], gateOk: false }, 'code-driver:a:again': null });
  assert.equal(r.out.groups.a.state, 'failed');
  assert.equal(r.out.groups.a.reason, 'code-driver returned nothing after the test writer answered its notes');
});

test('should fail the group with the reason when the first code driver returns nothing', async () => {
  const r = await play(ARGS(), { 'code-driver:a': null });
  assert.equal(r.out.groups.a.state, 'failed');
  assert.equal(r.out.groups.a.reason, 'code-driver returned nothing');
});

test('should block the group when only one kind of DoD pair is missing or only unusable rows exist and no repair is left', async () => {
  const bad = { dod: 'ZZ9', kind: 'happy', test: 'test_zz9_happy', file: 'tests/test_a.py' };
  const missingOnly = rows(grp('a')).filter(x => x.kind !== 'edge'), badOnly = [...rows(grp('a')), bad];
  for (const [matrix, reason] of [[missingOnly, 'A1/edge has no test'], [badOnly, 'ZZ9: unknown DoD id']]) {
    const r = await play(ARGS([grp('a')], { maxRepairs: 0 }), { 'test-writer:a': { done: true, rejected: [], matrix, files: ['tests/test_a.py'], gateOk: true } });
    assert.equal(r.out.groups.a.state, 'blocked');
    assert.equal(r.out.groups.a.reason, 'the test writer left DoD pairs uncovered: ' + reason);
    assert.deepEqual(r.labels.filter(l => l.startsWith('code-driver')), []);
  }
});

test('should cut the uncovered-pairs reason at 200 characters when the test writer leaves many unusable rows and no repair is left', async () => {
  const bad = Array.from({ length: 14 }, (_, i) => ({ dod: 'ZZ' + i, kind: 'happy', test: 'test_zz' + i + '_happy', file: 'tests/test_a.py' }));
  const full = bad.map(b => b.dod + ': unknown DoD id').join('; ');
  assert.ok(full.length > 201);
  const r = await play(ARGS([grp('a')], { maxRepairs: 0 }), { 'test-writer:a': { done: true, rejected: [], matrix: [...rows(grp('a')), ...bad], files: ['tests/test_a.py'], gateOk: true } });
  assert.equal(r.out.groups.a.reason, 'the test writer left DoD pairs uncovered: ' + clipTo(full, 200));
});
