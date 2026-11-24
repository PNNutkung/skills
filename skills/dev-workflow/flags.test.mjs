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
