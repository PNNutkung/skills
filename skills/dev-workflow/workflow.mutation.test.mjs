// ADR 0011 phase 3: `workflow.mjs next` from the tdd step runs the mutation engine itself (WorkflowGate, WorkflowRuns, TestSelect, Flags).
// main() in-process on small fixture repos (fixtures/mutation.mjs): main holds the base, feat/x the change; next --test-cmd gives the test command once.
// Run: node --test skills/dev-workflow/workflow.mutation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './workflow.mjs';
import {
  AGE, AGE_SRC, AGE_SRC_EDITED, AGE_STRONG, AGE_WEAK, APP_SRC, APP_TEST, BROKEN, CALC, CALC_SRC, CALC_TEST, OTHER_SRC, OTHER_TEST, PR, STRONG, TEST_CMD, THREE_SRC, THREE_TEST, WEAK,
  equivalentDoc, mrepo, mutationJson, names, survivorsOf, toTdd,
} from './fixtures/mutation.mjs';

const noGh = () => { throw new Error('no gh'); };

/** a fixture repo with a run at the tdd step: -> fx plus fx.run, fx.call(argv, env), fx.next(extra, env) (next --pr with the body file) */
async function atTdd(opts) {
  const fx = mrepo(opts);
  fx.call = async (argv, env = {}) => main(argv, { env: { ...fx.env, ...env }, cwd: fx.repo, gh: noGh, dodMjs: '/none' });
  const opened = await fx.call(['open', '--slug', 'demo']);
  assert.equal(opened.code, 0, JSON.stringify(opened.out));
  fx.run = opened.out.run;
  toTdd(fx.run);
  fx.next = (extra = [], env = {}) => fx.call(['next', '--pr', PR, '--pr-body', fx.body, ...extra], env);
  fx.step = async () => (await fx.call(['status'])).out.step;
  return fx;
}
const errs = r => (r.out.errors ?? []).join('\n');

// ---------------------------------------------------------------- WorkflowGate / WorkflowRuns
test('should move tdd to verify and write RUN/mutation.json when every mutant is killed (WorkflowGate happy, WorkflowRuns happy)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
    const m = mutationJson(fx.run);
    assert.ok(m, 'RUN/mutation.json written by next');
    assert.equal(m.pass, true);
    assert.ok(m.mutants.length >= 2, JSON.stringify(m.mutants));
    assert.ok(m.mutants.every(x => x.file === CALC && x.result === 'killed'), JSON.stringify(m.mutants));
  } finally { fx.done(); }
});

test('should refuse tdd to verify and list each survivor when a mutant survives (WorkflowGate fail, WorkflowRuns fail)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.equal(await fx.step(), 'tdd');
    const m = mutationJson(fx.run);
    assert.equal(m.pass, false);
    const surv = survivorsOf(m);
    assert.ok(surv.length >= 2, JSON.stringify(m.mutants));
    for (const s of surv) assert.ok(names(r.out.errors, s), `survivor ${s.id} ${s.file}:${s.line} not named in: ${errs(r)}`);
  } finally { fx.done(); }
});

test('should keep the test command in the run and reuse it when a later next has no --test-cmd (WorkflowRuns happy)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    assert.equal((await fx.next(['--test-cmd', TEST_CMD])).code, 1);
    fx.commit({ [CALC_TEST]: STRONG });
    const r = await fx.next();
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
    assert.equal(mutationJson(fx.run).pass, true, 'the second run used the kept command on the new commit');
  } finally { fx.done(); }
});

test('should refuse and name --test-cmd when the first next from tdd gives no test command (WorkflowRuns fail)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    const r = await fx.next();
    assert.notEqual(r.code, 0, JSON.stringify(r.out));
    assert.match(errs(r), /--test-cmd/);
    assert.equal(await fx.step(), 'tdd');
    assert.equal(mutationJson(fx.run), null, 'nothing ran, nothing written');
  } finally { fx.done(); }
});

test('should exit 2 naming {file} when the test command has no {file} placeholder (WorkflowRuns edge)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    const r = await fx.next(['--test-cmd', 'npm test']);
    assert.equal(r.code, 2, JSON.stringify(r.out));
    assert.match(errs(r), /\{file\}/);
    assert.equal(await fx.step(), 'tdd');
  } finally { fx.done(); }
});

test('should ignore a mutation.json the agent wrote and refuse a score option when an agent tries to supply the score (WorkflowRuns edge)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    mkdirSync(fx.run, { recursive: true });
    writeFileSync(join(fx.run, 'mutation.json'), JSON.stringify({ available: 2, mutants: [], score: { value: 100, pass: true, counted: 2, equivalent: 0 }, pass: true }));
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.equal(mutationJson(fx.run).pass, false, 'next overwrote the planted file with its own run');
    assert.equal(await fx.step(), 'tdd');
    for (const opt of ['--score', '--mutation-score', '--mutation']) assert.equal((await fx.next([opt, '100'])).code, 2, `${opt} is not an option`);
  } finally { fx.done(); }
});

test('should refuse a surviving mutant whatever WORKFLOW_MUTATION_SCORE_MIN says when it is 0 or 50 (WorkflowGate edge, Flags)', async () => {
  for (const min of ['0', '50']) {
    const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
    try {
      const r = await fx.next(['--test-cmd', TEST_CMD], { WORKFLOW_MUTATION_SCORE_MIN: min });
      assert.equal(r.code, 1, `min ${min}: ${JSON.stringify(r.out)}`);
      assert.ok(survivorsOf(mutationJson(fx.run)).every(s => names(r.out.errors, s)), errs(r));
    } finally { fx.done(); }
  }
});

test('should let WORKFLOW_MUTATION_SCORE_MIN decide when no mutant survives but none is killed (WorkflowGate edge, Flags)', async () => {
  // the changed test fails on the unmutated code: every mutant is unverifiable, so the score is 0 with no survivor
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: BROKEN } });
  try {
    const shut = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(shut.code, 1, 'default min 100: score 0 fails');
    assert.equal(survivorsOf(mutationJson(fx.run)).length, 0);
    assert.match(errs(shut), /score/i);
    assert.equal((await fx.next([], { WORKFLOW_MUTATION_SCORE_MIN: '1' })).code, 1, 'score 0 < 1');
    const open = await fx.next([], { WORKFLOW_MUTATION_SCORE_MIN: '0' });
    assert.equal(open.code, 0, errs(open));
    assert.equal(open.out.step, 'verify', 'score 0 >= min 0 and no survivor');
  } finally { fx.done(); }
});

test('should move tdd to verify with no mutation run and no --test-cmd when WORKFLOW_MUTATION_CHECK_ENABLED is false (WorkflowGate edge, Flags)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    const r = await fx.next([], { WORKFLOW_MUTATION_CHECK_ENABLED: 'false' });
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
    assert.equal(existsSync(join(fx.run, 'mutation.json')), false, 'as on main: no mutation run');
  } finally { fx.done(); }
});

test('should still need the pull request when every mutant is killed (WorkflowGate edge)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    const r = await fx.call(['next', '--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1);
    assert.match(errs(r), /pull request/);
    assert.equal(await fx.step(), 'tdd');
  } finally { fx.done(); }
});

test('should move tdd to verify when the branch changes no source file (WorkflowGate edge)', async () => {
  const fx = await atTdd({ branch: { 'docs/notes.md': '# notes\n' } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
  } finally { fx.done(); }
});

test('should mutate only the changed lines since the merge base when main moved on after the branch (WorkflowRuns edge)', async () => {
  const fx = await atTdd({ base: { [AGE]: AGE_SRC, 'test/age.test.mjs': AGE_WEAK }, branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    // main gets a commit the branch does not have: the weakly tested age.mjs changes there, not on the branch
    fx.git('checkout', '-q', 'main');
    fx.commit({ [AGE]: AGE_SRC_EDITED });
    fx.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    fx.git('checkout', '-q', 'feat/x');
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    assert.ok(mutationJson(fx.run).mutants.every(m => m.file === CALC), JSON.stringify(mutationJson(fx.run).mutants));
  } finally { fx.done(); }
});

// ---------------------------------------------------------------- equivalent marks: ptdd's file when present, else RUN/mutation-equivalent.json
test('should pass when the run folder marks every survivor equivalent in RUN/mutation-equivalent.json (WorkflowGate happy)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    assert.equal((await fx.next(['--test-cmd', TEST_CMD])).code, 1);
    const surv = survivorsOf(mutationJson(fx.run));
    writeFileSync(join(fx.run, 'mutation-equivalent.json'), equivalentDoc(surv));
    const r = await fx.next();
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
    const ids = new Set(surv.map(s => s.id));
    assert.ok(mutationJson(fx.run).mutants.filter(m => ids.has(m.id)).every(m => m.result === 'equivalent'));
  } finally { fx.done(); }
});

test('should read the paired-agent-tdd run equivalent file when next names that run with --ptdd-run (WorkflowGate happy)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    assert.equal((await fx.next(['--test-cmd', TEST_CMD])).code, 1);
    const surv = survivorsOf(mutationJson(fx.run));
    const ptdd = join(fx.dir, 'ptdd-run');
    mkdirSync(ptdd);
    writeFileSync(join(ptdd, 'mutation-equivalent.json'), equivalentDoc(surv));
    writeFileSync(join(fx.run, 'mutation-equivalent.json'), equivalentDoc([]));
    const r = await fx.next(['--ptdd-run', ptdd]);
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify', 'the ptdd file is read when present, not the run folder one');
  } finally { fx.done(); }
});

test('should fall back to RUN/mutation-equivalent.json when the named paired-agent-tdd run has no equivalent file (WorkflowGate edge)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    assert.equal((await fx.next(['--test-cmd', TEST_CMD])).code, 1);
    const surv = survivorsOf(mutationJson(fx.run));
    const ptdd = join(fx.dir, 'ptdd-run');
    mkdirSync(ptdd);
    writeFileSync(join(fx.run, 'mutation-equivalent.json'), equivalentDoc(surv));
    const r = await fx.next(['--ptdd-run', ptdd]);
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
  } finally { fx.done(); }
});

test('should still refuse when the equivalent marks name other mutants than the survivors (WorkflowGate fail)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: WEAK } });
  try {
    assert.equal((await fx.next(['--test-cmd', TEST_CMD])).code, 1);
    const [first, ...rest] = survivorsOf(mutationJson(fx.run));
    writeFileSync(join(fx.run, 'mutation-equivalent.json'), equivalentDoc([{ ...first, id: 'X-00000000' }, ...rest]));
    const r = await fx.next();
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.ok(names(r.out.errors, first), errs(r));
  } finally { fx.done(); }
});

// ---------------------------------------------------------------- TestSelect (A21): changed tests plus existing tests whose import graph reaches a changed source
test('should run an existing test that imports the changed source when that test did not change (TestSelect happy)', async () => {
  const fx = await atTdd({
    base: { [AGE]: AGE_SRC, 'test/age.test.mjs': AGE_STRONG },
    branch: { [AGE]: AGE_SRC_EDITED, 'src/three.mjs': THREE_SRC, 'test/three.test.mjs': THREE_TEST },
  });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    const m = mutationJson(fx.run);
    assert.ok(m.tests.run.includes('test/age.test.mjs'), JSON.stringify(m.tests));
    const age = m.mutants.filter(x => x.file === AGE);
    assert.ok(age.length >= 2 && age.every(x => x.result === 'killed' && x.by === 'test/age.test.mjs'), JSON.stringify(age));
  } finally { fx.done(); }
});

test('should run an existing test that reaches the changed source when it imports it through another module (TestSelect edge)', async () => {
  const fx = await atTdd({
    base: { [AGE]: AGE_SRC, 'src/app.mjs': APP_SRC, 'test/app.test.mjs': APP_TEST },
    branch: { [AGE]: AGE_SRC_EDITED },
  });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    assert.ok(mutationJson(fx.run).tests.run.includes('test/app.test.mjs'), JSON.stringify(mutationJson(fx.run).tests));
  } finally { fx.done(); }
});

test('should leave out existing tests that do not reach a changed source and refuse when the reaching one misses a mutant (TestSelect fail)', async () => {
  const fx = await atTdd({
    base: { [AGE]: AGE_SRC, 'test/age.test.mjs': AGE_WEAK, 'src/other.mjs': OTHER_SRC, 'test/other.test.mjs': OTHER_TEST },
    branch: { [AGE]: AGE_SRC_EDITED },
  });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    const m = mutationJson(fx.run);
    assert.ok(m.tests.run.includes('test/age.test.mjs'), JSON.stringify(m.tests));
    assert.ok(!m.tests.run.includes('test/other.test.mjs') && !(m.tests.notUsable ?? []).includes('test/other.test.mjs'), `an unrelated test is not in the set: ${JSON.stringify(m.tests)}`);
    assert.ok(survivorsOf(m).some(s => s.file === AGE), JSON.stringify(m.mutants));
  } finally { fx.done(); }
});

// ---------------------------------------------------------------- Flags through main()
test('should exit 2 naming the fix when a mutation flag value is not valid on any command (Flags fail)', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    for (const [name, value, fix] of [['WORKFLOW_MUTATION_CHECK_ENABLED', 'yes', /use true or false/], ['WORKFLOW_MUTATION_SCORE_MIN', '101', /use a whole number from 0 to 100/], ['WORKFLOW_MUTATION_SCORE_MIN', 'high', /use a whole number from 0 to 100/]]) {
      for (const argv of [['status'], ['next', '--pr', PR, '--pr-body', fx.body, '--test-cmd', TEST_CMD]]) {
        const r = await fx.call(argv, { [name]: value });
        assert.equal(r.code, 2, `${name}=${value} ${argv[0]}: ${JSON.stringify(r.out)}`);
        assert.match(errs(r), new RegExp(`${name}=${value} is not valid`));
        assert.match(errs(r), fix);
      }
    }
    assert.equal(await fx.step(), 'tdd');
  } finally { fx.done(); }
});
