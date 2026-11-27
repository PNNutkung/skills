// ADR 0011 phase 2, the GREEN gate: the score at PTDD_MUTATION_SCORE_MIN (Score), changed code files with no mutant (NoMutants) and the A21 test set (TestSelect).
// Small JavaScript sources whose mutants are known (fixtures/mutation.mjs); tdd.mjs runs in-process. Run: node --test tdd.mutation.gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put } from './test-fixture.mjs';
import { CALC, CALC_TEST, FG, TW_OFF, jsTest, mfx } from './fixtures/mutation.mjs';

/** plan, RED with the test, then the source, then GREEN: -> { r: the green output, gate } */
async function greenOf(fx, { test, src, testFile = CALC_TEST, srcFile = CALC }) {
  await fx.planOk();
  put(fx.repo, { [testFile]: test });
  const red = await fx.go('red', ['--group', 'a']);
  assert.match(red.out, /^RED a ok=true/, `${red.out}${red.err}`);
  put(fx.repo, { [srcFile]: src });
  const r = await fx.go('green', ['--group', 'a']);
  assert.equal(r.status, 0, r.err);
  return { r, gate: fx.gate('a.green.json') };
}
const mutationReason = gate => (gate.reasons ?? []).some(x => /mutant|mutation|score/i.test(x));

// ---------------------------------------------------------------- Score: (killed + timeout) / all sampled; skipped and inconclusive are not killed
test('should pass green when the score reaches PTDD_MUTATION_SCORE_MIN although a mutant survived (Score happy)', async t => {
  const fx = mfx(t, { env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '50' } });
  const { r, gate } = await greenOf(fx, { test: jsTest([['f', 2]]), src: FG }); // f's mutant is killed, g's survives: 1 of 2 = 50
  assert.match(r.out, /^GREEN a ok=true/, r.out);
  assert.equal(gate.ok, true);
});

test('should fail green when a mutant survives and PTDD_MUTATION_SCORE_MIN is unset, the default 100 (Score fail)', async t => {
  const fx = mfx(t, { env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: undefined } });
  const { r, gate } = await greenOf(fx, { test: jsTest([['f', 2]]), src: FG });
  assert.match(r.out, /^GREEN a ok=false/, r.out);
  assert.ok(mutationReason(gate), JSON.stringify(gate.reasons));
});

test('should fail green when every mutant is inconclusive, since inconclusive counts as not killed (Score fail)', async t => {
  // killExits [3]: the test exits 1 on each mutant, which is then inconclusive, never killed
  const fx = mfx(t, { plan: { killExits: [3] }, env: TW_OFF });
  const { r, gate } = await greenOf(fx, { test: jsTest([['f', 2], ['g', 3]]), src: FG });
  assert.match(r.out, /^GREEN a ok=false/, r.out);
  assert.ok(mutationReason(gate), JSON.stringify(gate.reasons));
});

test('should fail green when the mutation budget skips every mutant, since skipped counts as not killed (Score fail)', async t => {
  const fx = mfx(t, { plan: { mutation: { budget: 0 } }, env: TW_OFF });
  const { r, gate } = await greenOf(fx, { test: jsTest([['f', 2], ['g', 3]]), src: FG });
  assert.match(r.out, /^GREEN a ok=false/, r.out);
  assert.ok(mutationReason(gate), JSON.stringify(gate.reasons));
});

test('should pass green at score 0 when PTDD_MUTATION_SCORE_MIN is 0 and fail it at 51 when the score is 50 (Score edge)', async t => {
  const zero = mfx(t, { plan: { killExits: [3] }, env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '0' } });
  assert.match((await greenOf(zero, { test: jsTest([['f', 2], ['g', 3]]), src: FG })).r.out, /^GREEN a ok=true/, 'every mutant inconclusive: 0 >= 0');
  const above = mfx(t, { env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '51' } });
  assert.match((await greenOf(above, { test: jsTest([['f', 2]]), src: FG })).r.out, /^GREEN a ok=false/, '50 < 51');
  const all = mfx(t, { env: { ...TW_OFF, PTDD_MUTATION_SCORE_MIN: '100' } });
  assert.match((await greenOf(all, { test: jsTest([['f', 2], ['g', 3]]), src: FG })).r.out, /^GREEN a ok=true/, 'every mutant killed: 100 >= 100');
});

// ---------------------------------------------------------------- NoMutants: a changed code file with 0 mutants needs a user answer id
const SH = { cmd: 'sh {file}', groups: [{ id: 'a', tests: ['tests/test_run.sh'], src: ['src/run.sh'], dod: ['AC1'], after: [] }] };
const SH_TEST = '# test_ac1_happy\nsh src/run.sh | grep -q hello\n';

test('should pass green when the plan accepts a code file with no mutant by a user answer id (NoMutants happy)', async t => {
  const fx = mfx(t, { plan: { ...SH, mutation: { accept: { 'src/run.sh': 'A4' } } }, env: TW_OFF });
  const { r } = await greenOf(fx, { test: SH_TEST, src: 'echo hello\n', testFile: 'tests/test_run.sh', srcFile: 'src/run.sh' });
  assert.match(r.out, /^GREEN a ok=true/, r.out);
});

test('should fail green and name the file when a changed shell file gets 0 mutants and the plan accepts nothing (NoMutants fail)', async t => {
  const fx = mfx(t, { plan: SH, env: TW_OFF });
  const { r, gate } = await greenOf(fx, { test: SH_TEST, src: 'echo hello\n', testFile: 'tests/test_run.sh', srcFile: 'src/run.sh' });
  assert.match(r.out, /^GREEN a ok=false/, r.out);
  assert.ok((gate.reasons ?? []).some(x => x.includes('src/run.sh')), JSON.stringify(gate.reasons));
});

test('should keep a config file exempt when it gets 0 mutants, and still fail when the accept names another file (NoMutants edge)', async t => {
  const yaml = mfx(t, { plan: { cmd: 'sh {file}', groups: [{ id: 'a', tests: ['tests/test_conf.sh'], src: ['src/app.yaml'], dod: ['AC1'], after: [] }] }, env: TW_OFF });
  const conf = await greenOf(yaml, { test: '# test_ac1_happy\ngrep -q "port: 8080" src/app.yaml\n', src: 'port: 8080\n', testFile: 'tests/test_conf.sh', srcFile: 'src/app.yaml' });
  assert.match(conf.r.out, /^GREEN a ok=true/, `a config file has no mutator and needs no answer: ${conf.r.out}`);
  const other = mfx(t, { plan: { ...SH, mutation: { accept: { 'src/other.sh': 'A4' } } }, env: TW_OFF });
  const r = (await greenOf(other, { test: SH_TEST, src: 'echo hello\n', testFile: 'tests/test_run.sh', srcFile: 'src/run.sh' })).r;
  assert.match(r.out, /^GREEN a ok=false/, `the answer names src/other.sh, not src/run.sh: ${r.out}`);
});

// ---------------------------------------------------------------- TestSelect (A21): changed tests + existing tests whose import graph reaches a changed source
// base: g = 3 and an existing test that pins it; the change adds f and rewrites g as 1 + 2 (same value): g's mutants are killed only by a test that reaches calc.mjs
const BASE_CALC = { [CALC]: 'export const g = () => 3;\n' };
const NEW_CALC = 'export const f = () => 2;\nexport const g = () => 1 + 2;\n';
const PIN_G = from => `import { ${from === 'calc' ? 'g' : 'twice'} } from '../src/${from}.mjs';\nif (${from === 'calc' ? 'g()' : 'twice() / 2'} !== 3) process.exit(1);\n`;

test('should kill a mutant with an existing test that imports the changed source when green runs the A21 test set (TestSelect happy)', async t => {
  const fx = mfx(t, { files: { ...BASE_CALC, 'tests/existing_g.test.mjs': PIN_G('calc') }, env: TW_OFF });
  const { r } = await greenOf(fx, { test: jsTest([['f', 2]]), src: NEW_CALC });
  assert.match(r.out, /^GREEN a ok=true/, `g's mutants are killed by tests/existing_g.test.mjs: ${r.out}`);
});

test('should leave a mutant alive when no existing test reaches the changed source (TestSelect fail)', async t => {
  const fx = mfx(t, { files: { ...BASE_CALC, 'src/other.mjs': 'export const twice = () => 6;\n', 'tests/existing_other.test.mjs': PIN_G('other') }, env: TW_OFF });
  const { r } = await greenOf(fx, { test: jsTest([['f', 2]]), src: NEW_CALC });
  assert.match(r.out, /^GREEN a ok=false/, `tests/existing_other.test.mjs never reaches calc.mjs: ${r.out}`);
});

test('should use an existing test when it reaches the changed source only through another module (TestSelect edge)', async t => {
  const wrap = { 'src/other.mjs': "import { g } from './calc.mjs';\nexport const twice = () => g() * 2;\n" };
  const fx = mfx(t, { files: { ...BASE_CALC, ...wrap, 'tests/existing_other.test.mjs': PIN_G('other') }, env: TW_OFF });
  const { r } = await greenOf(fx, { test: jsTest([['f', 2]]), src: NEW_CALC });
  assert.match(r.out, /^GREEN a ok=true/, `existing_other -> other.mjs -> calc.mjs: ${r.out}`);
});
