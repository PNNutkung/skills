import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG, FlagError, readFlags } from './flags.mjs';

test('should keep the guard off when WORKFLOW_GUARD_ENABLED is unset or empty', () => {
  assert.deepEqual(readFlags({}), { guard: false });
  assert.deepEqual(readFlags({ [FLAG.guard]: '  ' }), { guard: false });
});

test('should read true and false in any case when the flag is set', () => {
  assert.equal(readFlags({ [FLAG.guard]: 'TRUE' }).guard, true);
  assert.equal(readFlags({ [FLAG.guard]: 'false' }).guard, false);
});

test('should throw a FlagError naming the fix when the value is not true or false', () => {
  for (const bad of ['1', '0', 'yes', 'on']) assert.throws(() => readFlags({ [FLAG.guard]: bad }), e => e instanceof FlagError && /use true or false/.test(e.message));
});
