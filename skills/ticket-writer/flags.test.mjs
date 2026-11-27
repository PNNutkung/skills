import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG, FlagError, readFlags } from './flags.mjs';

test('should keep the guard on when TICKET_WHY_GUARD_ENABLED is unset or empty (GuardFlag)', () => {
  assert.equal(FLAG.guard, 'TICKET_WHY_GUARD_ENABLED');
  assert.equal(readFlags({}).guard, true);
  assert.equal(readFlags({ [FLAG.guard]: ' ' }).guard, true);
});

test('should read true and false in any case when the flag is set (GuardFlag)', () => {
  assert.equal(readFlags({ [FLAG.guard]: 'FALSE' }).guard, false);
  assert.equal(readFlags({ [FLAG.guard]: 'True' }).guard, true);
});

test('should throw a FlagError naming the fix when the value is not true or false (GuardFlag)', () => {
  for (const bad of ['1', '0', 'yes', 'off']) assert.throws(() => readFlags({ [FLAG.guard]: bad }), e => e instanceof FlagError && /TICKET_WHY_GUARD_ENABLED=.* is not valid: use true or false/.test(e.message));
});
