// Mutation-gate behaviour of `workflow.mjs next` out of tdd (ADR 0011 phase 3), pinned to the exact outcome: the source files that count, the test set,
// the written RUN/mutation.json, the error texts and the exit codes. main() in-process on the small fixture repos of fixtures/mutation.mjs.
// Run: node --test skills/dev-workflow/workflow.mut-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './workflow.mjs';
import { BROKEN, CALC, CALC_SRC, CALC_TEST, PR, STRONG, TEST_CMD, calcTest, mrepo, mutationJson, survivorsOf, toTdd } from './fixtures/mutation.mjs';

const noGh = () => { throw new Error('no gh'); };
const errs = r => (r.out.errors ?? []).join('\n');
const TRIVIAL_TEST = "import { test } from 'node:test';\ntest('trivial', () => {});\n";

/** a fixture repo with a run at the tdd step: fx.call(argv, env), fx.next(extra, env) (next --pr with the body file) */
async function atTdd(opts) {
  const fx = mrepo(opts);
  fx.call = async (argv, env = {}) => main(argv, { env: { ...fx.env, ...env }, cwd: fx.repo, gh: noGh, dodMjs: '/none' });
  const opened = await fx.call(['open', '--slug', 'demo']);
  assert.equal(opened.code, 0, JSON.stringify(opened.out));
  fx.run = opened.out.run;
  toTdd(fx.run);
  fx.next = (extra = [], env = {}) => fx.call(['next', '--pr', PR, '--pr-body', fx.body, ...extra], env);
  return fx;
}

// ---------------------------------------------------------------- which files count as source, which tests run
test('should write the no-source result and open the gate when the branch changes only a test file', async () => {
  const fx = await atTdd({ base: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG }, branch: { [CALC_TEST]: `${STRONG}// one more line\n` } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
    assert.deepEqual(mutationJson(fx.run), { available: 0, mutants: [], score: null, pass: true, reason: 'no changed source files', base: 'origin/HEAD', tests: { run: [], notUsable: [] } });
  } finally { fx.done(); }
});

test('should run a changed test that imports nothing and leave out a deleted test when the branch changes a source', async () => {
  const fx = await atTdd({ base: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG, 'test/old.test.mjs': TRIVIAL_TEST }, branch: { [CALC]: 'export const isBig = (n) => n >= 10;\n', 'test/unrelated.test.mjs': TRIVIAL_TEST } });
  try {
    fx.git('rm', '-q', 'test/old.test.mjs');
    fx.git('commit', '-qm', 'drop the old test');
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    const m = mutationJson(fx.run);
    assert.deepEqual([...m.tests.run, ...m.tests.notUsable].sort(), [CALC_TEST, 'test/unrelated.test.mjs']);
  } finally { fx.done(); }
});

test('should find no test and name the mutants when an existing JavaScript test sits beside a changed python source', async () => {
  const fx = await atTdd({ base: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG }, branch: { 'src/big.py': 'def big(n):\n    return n >= 10\n' } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.match(errs(r), /mutation check: 3 mutant\(s\) on src\/big\.py and no test file reaches them: add tests/);
    assert.equal(mutationJson(fx.run).reason, 'no test file reaches the changed sources');
  } finally { fx.done(); }
});

test('should find no test and name the mutants when an existing python test sits beside a changed JavaScript source', async () => {
  const fx = await atTdd({ base: { 'test/test_big.py': 'def test_big():\n    assert True\n' }, branch: { [CALC]: CALC_SRC } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.match(errs(r), /mutation check: 2 mutant\(s\) on src\/calc\.mjs and no test file reaches them: add tests/);
    assert.deepEqual(mutationJson(fx.run).tests, { run: [], notUsable: [] });
  } finally { fx.done(); }
});

test('should run an existing .mjs test on a changed .js source when both are JavaScript', async () => {
  const fx = await atTdd({
    base: { 'package.json': '{"type":"module"}\n', 'src/calc.js': CALC_SRC, [CALC_TEST]: STRONG.replace('calc.mjs', 'calc.js') },
    branch: { 'src/calc.js': 'export const isBig = (n) => n >= 10;\n' },
  });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    const m = mutationJson(fx.run);
    assert.deepEqual(m.tests.run, [CALC_TEST]);
    assert.ok(m.mutants.length >= 2 && m.mutants.every(x => x.file === 'src/calc.js' && x.result === 'killed'), JSON.stringify(m.mutants));
  } finally { fx.done(); }
});

// ---------------------------------------------------------------- no test reaches the change
test('should count every mutant of every changed source in the error and in RUN/mutation.json when no test reaches them', async () => {
  const fx = await atTdd({ branch: { 'src/a.mjs': 'export const a = n => n >= 10;\n', 'src/b.mjs': 'export const b = n => n >= 20;\n' } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.equal(r.out.ok, false);
    assert.deepEqual(r.out.errors, ['mutation check: 4 mutant(s) on src/a.mjs, src/b.mjs and no test file reaches them: add tests']);
    assert.deepEqual(mutationJson(fx.run), { available: 4, mutants: [], score: null, pass: false, reason: 'no test file reaches the changed sources', tests: { run: [], notUsable: [] }, base: 'origin/HEAD' });
  } finally { fx.done(); }
});

test('should open the gate and write a passing result when no test reaches a source with no mutable line', async () => {
  const fx = await atTdd({ branch: { 'src/z.mjs': 'export default function z() {}\n' } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 0, errs(r));
    assert.equal(r.out.step, 'verify');
    assert.deepEqual(mutationJson(fx.run), { available: 0, mutants: [], score: null, pass: true, reason: 'no mutable changed lines', tests: { run: [], notUsable: [] }, base: 'origin/HEAD' });
  } finally { fx.done(); }
});

// ---------------------------------------------------------------- the verdict: pass, score and the error texts
test('should write pass false and refuse when a mutant survives although the score is not under the minimum', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: calcTest([[50, true], [1, false]]) } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD], { WORKFLOW_MUTATION_SCORE_MIN: '0' });
    assert.equal(r.code, 1, JSON.stringify(r.out));
    const m = mutationJson(fx.run);
    assert.ok(survivorsOf(m).length >= 2);
    assert.equal(m.pass, false);
    assert.equal(m.scoreMin, 0);
    assert.equal(r.out.errors.length, survivorsOf(m).length, 'only the survivors, no score line');
  } finally { fx.done(); }
});

test('should write pass false and name the unverifiable count when no mutant survives but the score is under the minimum', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: BROKEN } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    const m = mutationJson(fx.run);
    assert.equal(m.pass, false);
    assert.equal(survivorsOf(m).length, 0);
    assert.equal(m.mutants.length, 2);
    assert.deepEqual(r.out.errors, [`mutation score 0% is under WORKFLOW_MUTATION_SCORE_MIN=100 (2 unverifiable): ${m.reason}`]);
  } finally { fx.done(); }
});

test('should print the score rounded to one decimal when one of two mutants survives', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: calcTest([['10.5', true]]) } });
  try {
    const r = await fx.next(['--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    const m = mutationJson(fx.run);
    assert.deepEqual(m.mutants.map(x => x.result).sort(), ['killed', 'survived']);
    assert.ok(r.out.errors.includes('mutation score 50% is under WORKFLOW_MUTATION_SCORE_MIN=100'), errs(r));
    assert.equal(r.out.errors.length, 2);
  } finally { fx.done(); }
});

test('should list the step errors first and the mutation errors after when both close the gate', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: calcTest([[50, true], [1, false]]) } });
  try {
    const r = await fx.call(['next', '--test-cmd', TEST_CMD]);
    assert.equal(r.code, 1, JSON.stringify(r.out));
    assert.equal(r.out.ok, false);
    assert.equal(r.out.step, 'tdd');
    assert.match(r.out.errors[0], /pull request/);
    assert.ok(r.out.errors.findIndex(e => /^surviving mutant X-/.test(e)) > 0, errs(r));
  } finally { fx.done(); }
});

test('should exit 2 with the mutation error first and the step errors after when the kept test command is not usable', async () => {
  const fx = await atTdd({ branch: { [CALC]: CALC_SRC, [CALC_TEST]: STRONG } });
  try {
    const f = join(fx.run, 'state.json');
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), testCmd: 'node' }));
    const r = await fx.call(['next']);
    assert.equal(r.code, 2, JSON.stringify(r.out));
    assert.equal(r.out.ok, false);
    assert.equal(r.out.step, 'tdd');
    assert.match(r.out.errors[0], /^mutation check: cmd must be a command that contains \{file\}/);
    assert.match(r.out.errors.slice(1).join('\n'), /pull request/);
  } finally { fx.done(); }
});
