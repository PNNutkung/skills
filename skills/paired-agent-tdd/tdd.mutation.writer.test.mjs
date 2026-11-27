// ADR 0011 phase 2, fast mode with the test writer on (A7-A9, A16): the roles test-writer, code-driver and judge in workflow.js (TestWriter, WriterSees, EquivJudge),
// the testWrong note that goes back to the test writer (TestsOwned), `red --rewrite`, and `green --retest` refused in this mode. The Workflow runs with canned agents
// over the args a real `tdd.mjs plan` printed, so the args carry whatever the plan puts there. Run: node --test tdd.mutation.writer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODES } from './graph.mjs';
import { dryRun, put } from './test-fixture.mjs';
import { ADR_FILE, CALC, CALC_TEST, DOD_TEXT, FG, INTERFACE_MARK, NODE_TABLE, TW_OFF, jsTest, mfx, play } from './fixtures/mutation.mjs';

const FAST = { mode: 'fast' }, TW_ON = { PTDD_TEST_WRITER_ENABLED: 'true' };
/** a fast plan of the fixture ADR (with its Interface section) and the test writer as env says: -> fx with fx.args */
async function fastPlan(t, env = TW_ON) {
  const fx = mfx(t, { adr: 'iface', plan: FAST, env });
  await fx.planOk();
  return fx;
}
const broken = /NaN|undefined|\[object Object\]/;
const noBrokenPrompt = r => assert.deepEqual(r.calls.filter(c => broken.test(c.prompt)).map(c => c.o.label), [], 'a prompt holds NaN, undefined or [object Object]');
const firstIdx = (events, re) => events.findIndex(e => re.test(e));
const sees = (prompt, args) => prompt.includes(INTERFACE_MARK) || (prompt.includes(args.dodFile ?? ADR_FILE) && /Interface/.test(prompt));

// ---------------------------------------------------------------- roles in the node table (graph.mjs is the source; workflow.js holds the generated copy)
test('should give the judge a type with no Edit or Write and the test writer and code driver a maker type when the nodes are generated (EquivJudge edge)', () => {
  for (const [id, type] of [['test-writer', 'tdd-guide'], ['code-driver', 'tdd-guide'], ['judge', 'code-reviewer']]) {
    assert.equal(NODES.find(n => n.id === id)?.agentType, type, `graph.mjs ${id}`);
    assert.equal(NODE_TABLE[id]?.agentType, type, `workflow.js NODE ${id}`);
  }
});

test('should size the test-writer, code-driver and judge prompts when the dry run plans a fast run with the test writer on (TestWriter happy)', async t => {
  const fx = await fastPlan(t);
  const out = await dryRun(fx.args);
  const nodes = (out.prompts ?? []).map(p => p.node);
  for (const id of ['test-writer', 'code-driver', 'judge']) assert.ok(nodes.includes(id), `${id} in ${nodes.join(', ')}`);
});

// ---------------------------------------------------------------- TestWriter: a test writer writes the tests before a code driver writes the code
test('should run the test writer before the code driver and no tdd-driver when fast mode has the test writer on (TestWriter happy)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args);
  noBrokenPrompt(r);
  assert.equal(r.of('tdd-driver').length, 0, 'one agent no longer writes both tests and code');
  assert.ok(r.of('test-writer').length >= 1 && r.of('code-driver').length >= 1, r.calls.map(c => c.o.label).join(', '));
  assert.ok(firstIdx(r.events, /^end test-writer:a/) < firstIdx(r.events, /^start code-driver:a/), 'the tests exist before the code driver starts');
  assert.equal(r.out.groups.a.state, 'done', JSON.stringify(r.out.groups.a));
});

test('should start no code driver when the test writer returns nothing (TestWriter fail)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args, { 'test-writer': () => null });
  assert.equal(r.of('code-driver').length, 0);
  assert.notEqual(r.out.groups.a.state, 'done');
});

test('should keep the one tdd-driver when PTDD_TEST_WRITER_ENABLED is false (TestWriter edge)', async t => {
  const fx = await fastPlan(t, TW_OFF);
  const r = await play(fx.args);
  assert.deepEqual([r.of('test-writer').length, r.of('code-driver').length, r.of('tdd-driver').length], [0, 0, 1]);
  assert.equal(r.out.groups.a.state, 'done');
});

// ---------------------------------------------------------------- TestsOwned: after RED only the test writer edits tests
const WRONG = { test: 'test_ac1_edge_case', reason: 'REASON-7K: the edge test wants g() to be 4 but the DoD says g gives 3' };
const SECRET = 'SRC-SECRET-9Z export const g = () => 3';
const wrongOnce = (label, n, dflt) => (n === 1 ? { ...dflt, gateOk: false, testWrong: [WRONG], notes: SECRET } : dflt);

test('should send the testWrong note of the code driver to the test writer, which runs red --rewrite, when a test is wrong (TestsOwned happy)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args, { 'code-driver': wrongOnce });
  noBrokenPrompt(r);
  const writers = r.of('test-writer');
  assert.ok(writers.length >= 2, `the test writer runs again for the note: ${r.calls.map(c => c.o.label).join(', ')}`);
  const again = writers[writers.length - 1];
  assert.ok(again.prompt.includes(WRONG.test) && again.prompt.includes(WRONG.reason), 'the note reaches the test writer with its reason');
  assert.match(again.prompt, /red --rewrite/);
  assert.ok(firstIdx(r.events, new RegExp(`^start ${again.o.label}$`)) > firstIdx(r.events, /^end code-driver:a/), 'the test writer answers the code driver');
  assert.ok(r.of('code-driver').length >= 2, 'the code driver goes on after RED runs again');
  assert.equal(r.out.groups.a.state, 'done');
});

test('should never tell the code driver to edit a test or run green --retest when the test writer is on (TestsOwned fail)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args, { 'code-driver': wrongOnce });
  assert.ok(r.of('code-driver').length >= 1, 'a code driver ran');
  for (const c of r.of('code-driver')) {
    assert.doesNotMatch(c.prompt, /--retest/, c.o.label);
    assert.match(c.prompt, /testWrong/, `${c.o.label}: the prompt names the note it returns instead`);
  }
});

test('should call the test writer once when the code driver returns no testWrong note (TestsOwned edge)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args);
  assert.equal(r.of('test-writer').length, 1);
});

// ---------------------------------------------------------------- TestsOwned at the gates: red --rewrite re-baselines RED; green --retest is refused
async function builtFast(t, env = TW_ON) {
  const fx = await fastPlan(t, env);
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2], ['g', 3]]) });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: FG });
  assert.match((await fx.go('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
  return fx;
}
const REWRITTEN = `${jsTest([['f', 2], ['g', 3]])}// the test writer fixed a wrong test after a testWrong note\n`;

test('should take the fixed test of the test writer as the new RED reference when red runs with --rewrite (TestsOwned happy)', async t => {
  const fx = await builtFast(t);
  put(fx.repo, { [CALC_TEST]: REWRITTEN });
  const red = await fx.go('red', ['--group', 'a', '--rewrite']);
  assert.equal(red.status, 0, red.err);
  assert.match(red.out, /^RED a ok=true/, red.out);
  const green = await fx.go('green', ['--group', 'a']);
  assert.match(green.out, /^GREEN a ok=true/, green.out);
});

test('should refuse green --retest when the test writer is on (TestsOwned fail)', async t => {
  const fx = await builtFast(t);
  put(fx.repo, { [CALC_TEST]: REWRITTEN });
  const r = await fx.go('green', ['--group', 'a', '--retest']);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.err, /--retest/);
  assert.match(r.err, /red --rewrite|test writer/);
});

test('should fail red --rewrite when the rewritten test already passes, and allow green --retest when the test writer is off (TestsOwned edge)', async t => {
  const fx = await builtFast(t);
  put(fx.repo, { [CALC_TEST]: '// test_ac1_happy\nprocess.exit(0);\n' });
  const red = await fx.go('red', ['--group', 'a', '--rewrite']);
  assert.equal(red.status, 0, red.err);
  assert.match(red.out, /^RED a ok=false/, red.out);
  const off = await builtFast(t, TW_OFF);
  put(off.repo, { [CALC_TEST]: REWRITTEN });
  assert.match((await off.go('green', ['--group', 'a', '--retest'])).out, /^GREEN a ok=true/, 'without the test writer --retest works as on main');
});

// ---------------------------------------------------------------- WriterSees: DoD, plan file list, base code, ADR Interface; never the code driver's new source
test('should give the test writer the DoD, the group files, the base and the ADR Interface when it starts (WriterSees happy)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args);
  const [first] = r.of('test-writer');
  assert.ok(first, 'a test writer ran');
  assert.ok(first.prompt.includes(DOD_TEXT), 'the DoD');
  assert.ok(first.prompt.includes(CALC_TEST) && first.prompt.includes(CALC), 'the plan\'s file list');
  assert.ok(first.prompt.includes(fx.args.base.slice(0, 8)), 'the base the code exists at');
  assert.ok(sees(first.prompt, fx.args), 'the ADR Interface section');
});

test('should keep the notes and source of the code driver out of every test writer prompt when a testWrong note comes back (WriterSees fail)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args, { 'code-driver': wrongOnce });
  assert.ok(r.of('test-writer').length >= 2, 'the test writer ran again for the note');
  for (const c of r.of('test-writer')) assert.ok(!c.prompt.includes('SRC-SECRET-9Z'), `${c.o.label} saw the code driver's notes`);
});

test('should still give the test writer the DoD and the ADR Interface when it fixes a wrong test (WriterSees edge)', async t => {
  const fx = await fastPlan(t);
  const r = await play(fx.args, { 'code-driver': wrongOnce });
  const writers = r.of('test-writer'), again = writers[writers.length - 1];
  assert.ok(writers.length >= 2);
  assert.ok(again.prompt.includes(DOD_TEXT) && sees(again.prompt, fx.args), again.prompt.slice(0, 400));
});
