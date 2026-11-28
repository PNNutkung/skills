// Mutation-gate gap tests for flags.mjs percent(): the 0..100 bounds and the whole-number pattern. Run: node --test flags.mut-percent.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlagError, percent } from './flags.mjs';

const read = v => percent({ P: v }, 'P', 7);

test('should accept 100 and 0 when the value is a whole number at the edge of the range', () => {
  assert.equal(read('100'), 100);
  assert.equal(read('0'), 0);
});

test('should throw a FlagError when the value is 101', () => {
  assert.throws(() => read('101'), e => e instanceof FlagError && /P=101 is not valid: use a whole number from 0 to 100/.test(e.message));
});

test('should throw a FlagError when the value is a negative or fractional number that is below 100', () => {
  for (const v of ['-5', '1.5', '50%', 'abc']) assert.throws(() => read(v), FlagError, v);
});

test('should return the default when the value is unset or empty', () => {
  assert.equal(percent({}, 'P', 7), 7);
  assert.equal(read(''), 7);
});
