import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG, FlagError, readFlags } from './flags.mjs';

test('should keep the guard on when WORKFLOW_GUARD_ENABLED is unset or empty', () => {
  assert.equal(readFlags({}).guard, true);
  assert.equal(readFlags({ [FLAG.guard]: '  ' }).guard, true);
});

test('should read true and false in any case when the flag is set', () => {
  assert.equal(readFlags({ [FLAG.guard]: 'TRUE' }).guard, true);
  assert.equal(readFlags({ [FLAG.guard]: 'false' }).guard, false);
});

test('should throw a FlagError naming the fix when the value is not true or false', () => {
  for (const bad of ['1', '0', 'yes', 'on']) assert.throws(() => readFlags({ [FLAG.guard]: bad }), e => e instanceof FlagError && /use true or false/.test(e.message));
});

test('should keep the verify env check on when WORKFLOW_VERIFY_ENV_CHECK_ENABLED is unset, and read true or false (Flag)', () => {
  assert.equal(readFlags({}).verifyEnv, true);
  assert.equal(readFlags({ [FLAG.verifyEnv]: 'False' }).verifyEnv, false);
  assert.equal(readFlags({ [FLAG.verifyEnv]: 'true' }).verifyEnv, true);
  assert.equal(FLAG.verifyEnv, 'WORKFLOW_VERIFY_ENV_CHECK_ENABLED');
});

test('should throw a FlagError naming the fix when WORKFLOW_VERIFY_ENV_CHECK_ENABLED is not true or false (Flag)', () => {
  for (const bad of ['1', 'off', 'yes']) assert.throws(() => readFlags({ [FLAG.verifyEnv]: bad }), e => e instanceof FlagError && /WORKFLOW_VERIFY_ENV_CHECK_ENABLED=.* is not valid: use true or false/.test(e.message));
});

// ---------------------------------------------------------------- ADR 0011 phase 3: the mutation gate of next from tdd
test('should keep the mutation check on at min 100 when WORKFLOW_MUTATION_CHECK_ENABLED and WORKFLOW_MUTATION_SCORE_MIN are unset or empty (Flags happy)', () => {
  assert.equal(FLAG.mutationCheck, 'WORKFLOW_MUTATION_CHECK_ENABLED');
  assert.equal(FLAG.mutationScoreMin, 'WORKFLOW_MUTATION_SCORE_MIN');
  assert.equal(readFlags({}).mutationCheck, true);
  assert.equal(readFlags({}).mutationScoreMin, 100);
  assert.equal(readFlags({ WORKFLOW_MUTATION_CHECK_ENABLED: ' ', WORKFLOW_MUTATION_SCORE_MIN: '' }).mutationCheck, true);
  assert.equal(readFlags({ WORKFLOW_MUTATION_SCORE_MIN: '  ' }).mutationScoreMin, 100);
});

test('should read true or false in any case and a whole number from 0 to 100 when the mutation flags are set (Flags happy)', () => {
  assert.equal(readFlags({ WORKFLOW_MUTATION_CHECK_ENABLED: 'False' }).mutationCheck, false);
  assert.equal(readFlags({ WORKFLOW_MUTATION_CHECK_ENABLED: 'TRUE' }).mutationCheck, true);
  for (const [v, want] of [['0', 0], ['100', 100], ['55', 55], [' 7 ', 7]]) assert.equal(readFlags({ WORKFLOW_MUTATION_SCORE_MIN: v }).mutationScoreMin, want, v);
});

test('should throw a FlagError naming the fix when WORKFLOW_MUTATION_CHECK_ENABLED is not true or false (Flags fail)', () => {
  for (const bad of ['1', '0', 'yes', 'on', 'enabled']) {
    assert.throws(() => readFlags({ WORKFLOW_MUTATION_CHECK_ENABLED: bad }), e => e instanceof FlagError && e.message.includes(`WORKFLOW_MUTATION_CHECK_ENABLED=${bad} is not valid: use true or false`), bad);
  }
});

test('should throw a FlagError naming the fix when WORKFLOW_MUTATION_SCORE_MIN is not a whole number from 0 to 100 (Flags fail, Flags edge)', () => {
  for (const bad of ['101', '-1', '50.5', '1e2', 'abc', 'unlimited', 'true', '0x10', '100%']) {
    assert.throws(() => readFlags({ WORKFLOW_MUTATION_SCORE_MIN: bad }), e => e instanceof FlagError && e.message.includes(`WORKFLOW_MUTATION_SCORE_MIN=${bad} is not valid: use a whole number from 0 to 100`), bad);
  }
});
