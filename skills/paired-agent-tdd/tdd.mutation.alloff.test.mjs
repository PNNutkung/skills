// ADR 0011 phase 2, "All flags off": PTDD_MUTATION_SCORE_MIN=0, PTDD_TEST_WRITER_ENABLED=false, WORKFLOW_MUTATION_CHECK_ENABLED=false, PTDD_MUTATION_MAX=12: the gates act
// as on main, except plain mutation.off, which errors (A3). Run: node --test tdd.mutation.alloff.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_OFF_ENV, put } from './test-fixture.mjs';
import { CALC, CALC_TEST, FG, FOURTEEN, MUTATION_OFF_ENV, fourteenChecks, jsTest, mfx, play } from './fixtures/mutation.mjs';

const OFF = { ...ALL_OFF_ENV, ...MUTATION_OFF_ENV };
async function greenOf(fx, { test, src, testFile = CALC_TEST, srcFile = CALC }) {
  await fx.planOk();
  put(fx.repo, { [testFile]: test });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [srcFile]: src });
  return fx.go('green', ['--group', 'a']);
}

test('should pass green as on main when every flag is off and the mutants are only inconclusive or the file has no mutator (AllOff happy)', async t => {
  const inconclusive = mfx(t, { plan: { killExits: [3] }, env: OFF });
  assert.match((await greenOf(inconclusive, { test: jsTest([['f', 2], ['g', 3]]), src: FG })).out, /^GREEN a ok=true/);
  const sh = mfx(t, { plan: { cmd: 'sh {file}', groups: [{ id: 'a', tests: ['tests/test_run.sh'], src: ['src/run.sh'], dod: ['AC1'], after: [] }] }, env: OFF });
  const r = await greenOf(sh, { test: '# test_ac1_happy\nsh src/run.sh | grep -q hello\n', src: 'echo hello\n', testFile: 'tests/test_run.sh', srcFile: 'src/run.sh' });
  assert.match(r.out, /^GREEN a ok=true/, r.out);
});

test('should pass final as on main when every flag is off and a line green did not sample is untested (AllOff happy)', async t => {
  const fx = mfx(t, { env: OFF });
  assert.match((await greenOf(fx, { test: jsTest(fourteenChecks(['f7'])), src: FOURTEEN })).out, /^GREEN a ok=true/);
  assert.match((await fx.go('final')).out, /^FINAL ok=true/m);
});

test('should still stop plan on a plain mutation.off when every flag is off (AllOff fail)', async t => {
  const fx = mfx(t, { plan: { mutation: { off: true } }, env: OFF });
  const r = await fx.planRaw();
  assert.equal(r.status, 2, r.err);
  assert.ok(r.err.includes('mutation.off needs a user answer id: {off: "A9"}'), r.err);
});

test('should plan a fast run with no Interface section, keep the one tdd-driver and allow green --retest when every flag is off (AllOff edge)', async t => {
  const fx = mfx(t, { adr: 'bare', plan: { mode: 'fast' }, env: OFF });
  await fx.planOk();
  const run = await play(fx.args);
  assert.deepEqual([run.of('tdd-driver').length, run.of('test-writer').length, run.of('code-driver').length], [1, 0, 0]);
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2], ['g', 3]]) });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: FG, [CALC_TEST]: `${jsTest([['f', 2], ['g', 3]])}// edited after RED\n` });
  const r = await fx.go('green', ['--group', 'a', '--retest']);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /^GREEN a ok=true/, r.out);
});
