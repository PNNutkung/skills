// Mutation-gate gap tests for tdd.mjs at the GREEN gate: how many test files run at once, the score text, the 0-mutant check at a low min, a plan.json that accepts a file
// with something that is not an answer id, a JavaScript source with a .js extension, and the test set of A21. tdd.mjs runs in-process. Run: node --test tdd.mut-green.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, peakRunner, put } from './test-fixture.mjs';
import { CALC, CALC_TEST, FG, TW_OFF, jsTest, mfx } from './fixtures/mutation.mjs';

/** plan, RED with the test, then the source, then GREEN: -> the green output and gate */
async function greenOf(fx, { test: text, src, testFile = CALC_TEST, srcFile = CALC }) {
  await fx.planOk();
  put(fx.repo, { [testFile]: text });
  const red = await fx.go('red', ['--group', 'a']);
  assert.match(red.out, /^RED a ok=true/, `${red.out}${red.err}`);
  put(fx.repo, { [srcFile]: src });
  const r = await fx.go('green', ['--group', 'a']);
  assert.equal(r.status, 0, r.err);
  return { r, gate: fx.gate('a.green.json') };
}

// ---------------------------------------------------------------- how many test files run at once
test('should run at most 4 test files at once when the plan sets no jobs and a group has 6 test files', async t => {
  const tests = Array.from({ length: 6 }, (_, i) => `tests/test_t${i + 1}.sh`);
  const fx = fixture(t, { plan: { dod: [{ id: 'AC1', text: 'alpha says new', source: 'assumed', kinds: ['happy'] }], groups: [{ id: 'a', tests, src: ['src/alpha.txt'], dod: ['AC1'], after: [] }] } });
  const stub = peakRunner(fx);
  assert.equal((await fx.plan(['--skip-preflight'])).status, 0);
  put(fx.repo, Object.fromEntries(tests.map((f, i) => [f, `# test_ac1_happy_${i}\nsleep 0.5\nexit 1\n`])));
  stub.reset();
  const r = await fx.tdd('red', ['--group', 'a']);
  assert.equal(r.status, 0, r.err);
  assert.equal(stub.peak(), 4, 'the pool of one gate holds 4 test commands');
});

// ---------------------------------------------------------------- the score text
// f wrong exits 1 (killed with killExits [1]), g wrong exits 2 (inconclusive): the score is 50 with no survivor
const SPLIT_TEST = "// test_ac1_happy\nimport { f, g } from '../src/calc.mjs';\nif (f() !== 2) process.exit(1);\nif (g() !== 3) process.exit(2);\n";

test('should show the score as a rounded percent when the score is below the min and nothing survived', async t => {
  const fx = mfx(t, { plan: { killExits: [1] }, env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '100' } });
  const { r, gate } = await greenOf(fx, { test: SPLIT_TEST, src: FG });
  assert.match(r.out, /^GREEN a ok=false/);
  assert.ok(gate.reasons.some(x => x.startsWith('mutation score 50% < 100%: 1 mutant(s) not killed')), JSON.stringify(gate.reasons));
  assert.match(r.out, /\(score 50%, min 100%; tests 1\)/);
});

// ---------------------------------------------------------------- the 0-mutant check applies while the min is above 0
const SH = { cmd: 'sh {file}', groups: [{ id: 'a', tests: ['tests/test_run.sh'], src: ['src/run.sh'], dod: ['AC1'], after: [] }] };
const SH_RUN = { test: '# test_ac1_happy\nsh src/run.sh | grep -q hello\n', src: 'echo hello\n', testFile: 'tests/test_run.sh', srcFile: 'src/run.sh' };

test('should fail green and name the file when a shell file has no mutant and the min is 1', async t => {
  const fx = mfx(t, { plan: SH, env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '1' } });
  const { r, gate } = await greenOf(fx, SH_RUN);
  assert.match(r.out, /^GREEN a ok=false/, r.out);
  assert.ok(gate.reasons.some(x => x.includes('changed code file(s) with no mutant: src/run.sh')), JSON.stringify(gate.reasons));
});

test('should pass green when the min is 0 and a shell file has no mutant', async t => {
  const fx = mfx(t, { plan: SH, env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '0' } });
  assert.match((await greenOf(fx, SH_RUN)).r.out, /^GREEN a ok=true/);
});

test('should not accept a file with no mutant when plan.json maps it to something that is not an answer id', async t => {
  const fx = mfx(t, { plan: { ...SH, mutation: { accept: { 'src/run.sh': 'A4' } } }, env: TW_OFF });
  await fx.planOk();
  const file = join(fx.run, 'plan.json'), plan = JSON.parse(readFileSync(file, 'utf8'));
  plan.mutation.accept['src/run.sh'] = 'the user said so'; // plan validation refuses this value; a hand-edited plan.json must not slip it through
  writeFileSync(file, `${JSON.stringify(plan)}\n`);
  put(fx.repo, { [SH_RUN.testFile]: SH_RUN.test });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [SH_RUN.srcFile]: SH_RUN.src });
  const r = await fx.go('green', ['--group', 'a']);
  assert.match(r.out, /^GREEN a ok=false/, r.out);
  assert.ok(fx.gate('a.green.json').reasons.some(x => x.includes('src/run.sh')));
});

// ---------------------------------------------------------------- a source whose extension is one letter too long for a slice to hide
const JS_GROUP = { groups: [{ id: 'a', tests: ['tests/calc.test.js'], src: ['src/calc.js'], dod: ['AC1'], after: [] }] };

test('should mutate a .js source and pass green when its mutants are killed', async t => {
  const fx = mfx(t, { plan: JS_GROUP, env: TW_OFF });
  const test = "// test_ac1_happy\nconst m = require('../src/calc.js');\nif (m.f() !== 2 || m.g() !== 3) process.exit(1);\n";
  const { r, gate } = await greenOf(fx, { test, src: 'exports.f = () => 2;\nexports.g = () => 3;\n', testFile: 'tests/calc.test.js', srcFile: 'src/calc.js' });
  assert.match(r.out, /^GREEN a ok=true/, r.out);
  assert.ok(gate.mutation.score.counted >= 2 || /2 mutant/.test(gate.mutation.summary ?? ''), JSON.stringify(gate.mutation));
});

// ---------------------------------------------------------------- A21: which existing test files join the mutation run
const IMPORTS = "import { g } from '../src/calc.mjs';\nif (g() !== 3) process.exit(1);\n";
const SET = {
  [CALC]: 'export const g = () => 3;\n',
  'tests/existing_g.test.mjs': IMPORTS,                              // reaches calc.mjs: joins
  'tests/helpers.mjs': IMPORTS,                                      // a helper under tests/: never a test
  'src/other.mjs': "import { g } from './calc.mjs';\nexport const h = () => g();\n", // not a test path: never a test
  'tests/mentions.test.mjs': '// talks about calc but imports nothing\nprocess.exit(0);\n', // a JavaScript test is picked by the import graph only
};
const NEW_CALC = 'export const f = () => 2;\nexport const g = () => 1 + 2;\n';

test('should add only the existing test that reaches the changed JavaScript source when green builds the mutation test set', async t => {
  const fx = mfx(t, { files: SET, env: TW_OFF });
  const { r } = await greenOf(fx, { test: jsTest([['f', 2]]), src: NEW_CALC });
  assert.match(r.out, /^GREEN a ok=true/, r.out);
  assert.match(r.out, /; tests 2\)/, `the group test and tests/existing_g.test.mjs, no helper, no non-test source, no test that only names the module: ${r.out}`);
});

test('should keep the group tests as the mutation test set when green reuses a stored full run', async t => {
  const fx = mfx(t, { files: SET, env: TW_OFF });
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2]]) });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: NEW_CALC });
  const first = await fx.go('green', ['--group', 'a', '--reuse']);
  assert.match(first.out, /^GREEN a ok=true/, first.out);
  assert.match(first.out, /; tests 2\)/, first.out);
  const again = await fx.go('green', ['--group', 'a', '--reuse']);
  assert.match(again.out, /^GREEN a ok=true/, again.out);
  assert.match(again.out, /reused: test probe, mutants and coverage/, again.out);
  assert.match(again.out, /; tests 1\)/, `a reused run builds no test set of its own: ${again.out}`);
});
