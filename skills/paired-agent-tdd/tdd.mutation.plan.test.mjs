// ADR 0011 phase 2, `tdd.mjs plan`: the three new flags (Flags), mutation.off only with a user answer id (OffByAnswer), and the ADR Interface section the test writer
// needs (Interface). tdd.mjs runs in-process through the shared fixture. Run: node --test tdd.mutation.plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put } from './test-fixture.mjs';
import { CALC, CALC_TEST, FG, TW_OFF, jsTest, mfx } from './fixtures/mutation.mjs';

const FAST = { mode: 'fast' };

// ---------------------------------------------------------------- Flags
test('should accept every valid value of the three mutation flags when plan reads them (Flags happy)', async t => {
  for (const env of [
    { PTDD_MUTATION_SCORE_MIN: '0' }, { PTDD_MUTATION_SCORE_MIN: '100' }, { PTDD_MUTATION_SCORE_MIN: '75' },
    { PTDD_MUTATION_MAX: '12' }, { PTDD_MUTATION_MAX: 'unlimited' }, { PTDD_MUTATION_MAX: '1' },
    { PTDD_TEST_WRITER_ENABLED: 'true' }, { PTDD_TEST_WRITER_ENABLED: 'false' },
  ]) {
    const fx = mfx(t, { env });
    const r = await fx.planRaw();
    assert.equal(r.status, 0, `${JSON.stringify(env)}: ${r.err}`);
  }
});

test('should stop plan with exit 2 and name the fix when a mutation flag value is not valid (Flags fail)', async t => {
  for (const [env, re] of [
    [{ PTDD_MUTATION_SCORE_MIN: '101' }, /PTDD_MUTATION_SCORE_MIN=101 is not valid: use .*\b0\b.*\b100\b/],
    [{ PTDD_MUTATION_SCORE_MIN: '-1' }, /PTDD_MUTATION_SCORE_MIN=-1 is not valid: use .*\b0\b.*\b100\b/],
    [{ PTDD_MUTATION_SCORE_MIN: 'high' }, /PTDD_MUTATION_SCORE_MIN=high is not valid: use .*\b0\b.*\b100\b/],
    [{ PTDD_MUTATION_MAX: '0' }, /PTDD_MUTATION_MAX=0 is not valid: use a whole number above 0, or unlimited/],
    [{ PTDD_MUTATION_MAX: 'ten' }, /PTDD_MUTATION_MAX=ten is not valid: use a whole number above 0, or unlimited/],
    [{ PTDD_MUTATION_MAX: '1.5' }, /PTDD_MUTATION_MAX=1\.5 is not valid: use a whole number above 0, or unlimited/],
    [{ PTDD_TEST_WRITER_ENABLED: 'yes' }, /PTDD_TEST_WRITER_ENABLED=yes is not valid: use true or false/],
    [{ PTDD_TEST_WRITER_ENABLED: '1' }, /PTDD_TEST_WRITER_ENABLED=1 is not valid: use true or false/],
  ]) {
    const fx = mfx(t, { env });
    const r = await fx.planRaw();
    assert.equal(r.status, 2, `${JSON.stringify(env)} must stop the plan: ${r.err}`);
    assert.match(r.err, re);
  }
});

test('should read an empty value as the default and ignore case and spaces when a mutation flag is set (Flags edge)', async t => {
  for (const env of [
    { PTDD_MUTATION_SCORE_MIN: '' }, { PTDD_MUTATION_SCORE_MIN: ' 50 ' },
    { PTDD_MUTATION_MAX: '' }, { PTDD_MUTATION_MAX: 'Unlimited' }, { PTDD_MUTATION_MAX: ' 12 ' },
    { PTDD_TEST_WRITER_ENABLED: '' }, { PTDD_TEST_WRITER_ENABLED: 'FALSE' }, { PTDD_TEST_WRITER_ENABLED: ' True ' },
  ]) {
    const fx = mfx(t, { env });
    const r = await fx.planRaw();
    assert.equal(r.status, 0, `${JSON.stringify(env)}: ${r.err}`);
  }
});

test('should turn the test writer on by default when PTDD_TEST_WRITER_ENABLED is unset, so a fast plan needs the ADR Interface (Flags edge)', async t => {
  const unset = mfx(t, { adr: 'bare', plan: FAST, env: { PTDD_TEST_WRITER_ENABLED: undefined } });
  assert.equal((await unset.planRaw()).status, 2, 'default true: the bare ADR stops the fast plan');
  const off = mfx(t, { adr: 'bare', plan: FAST, env: TW_OFF });
  assert.equal((await off.planRaw()).status, 0, 'false: no test writer, no Interface needed');
});

// ---------------------------------------------------------------- OffByAnswer
test('should accept mutation.off and skip the mutants when it holds a user answer id string (OffByAnswer happy)', async t => {
  const fx = mfx(t, { plan: { mutation: { off: 'A9' } }, env: TW_OFF });
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2]]) });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: FG }); // g = 3 is never tested: a survivor, if mutants ran
  const r = await fx.go('green', ['--group', 'a']);
  assert.match(r.out, /^GREEN a ok=true/, `${r.out}${r.err}`);
  assert.deepEqual(fx.gate('a.green.json').mutation.survivors ?? [], []);
});

test('should stop plan with exit 2 and the answer-id form when mutation.off is true (OffByAnswer fail)', async t => {
  const fx = mfx(t, { plan: { mutation: { off: true } }, env: TW_OFF });
  const r = await fx.planRaw();
  assert.equal(r.status, 2, r.err);
  assert.ok(r.err.includes('mutation.off needs a user answer id: {off: "A9"}'), r.err);
});

test('should stop plan when mutation.off is a value that is not an answer id string (OffByAnswer edge)', async t => {
  for (const off of [1, 'yes', '']) {
    const fx = mfx(t, { plan: { mutation: { off } }, env: TW_OFF });
    const r = await fx.planRaw();
    assert.equal(r.status, 2, `${JSON.stringify(off)}: ${r.err}`);
    assert.match(r.err, /mutation\.off needs a user answer id/);
  }
  const none = mfx(t, { plan: { mutation: { max: 12 } }, env: TW_OFF });
  assert.equal((await none.planRaw()).status, 0, 'no off key: nothing to answer');
});

// ---------------------------------------------------------------- Interface
test('should plan a fast run with the test writer on when the ADR has an Interface section (Interface happy)', async t => {
  const fx = mfx(t, { adr: 'iface', plan: FAST, env: { PTDD_TEST_WRITER_ENABLED: 'true' } });
  const r = await fx.planRaw();
  assert.equal(r.status, 0, r.err);
});

test('should stop plan naming the Interface section when the test writer is on and the ADR has none (Interface fail)', async t => {
  const fx = mfx(t, { adr: 'bare', plan: FAST, env: { PTDD_TEST_WRITER_ENABLED: 'true' } });
  const r = await fx.planRaw();
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /## Interface|Interface section/);
  assert.match(r.err, /docs\/adr\/0001-calc\.md/, 'the message names the ADR to edit');
});

test('should plan without an Interface section when the test writer is off (Interface edge)', async t => {
  const fx = mfx(t, { adr: 'bare', plan: FAST, env: TW_OFF });
  const r = await fx.planRaw();
  assert.equal(r.status, 0, r.err);
});
