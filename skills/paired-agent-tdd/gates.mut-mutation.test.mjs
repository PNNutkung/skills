// Mutation-gate gap tests for gates.mjs mutationErrors(): the shape of plan.mutation (ADR 0011 A3, A4). Run: node --test gates.mut-mutation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mutationErrors } from './gates.mjs';

const SHAPE = ['mutation must be an object ({max, budget, off, accept})'];

test('should report the shape error when mutation is not a plain object', () => {
  for (const m of ['x', 5, true, null, [], ['a']]) assert.deepEqual(mutationErrors(m), SHAPE, JSON.stringify(m));
});

test('should report no error when mutation is undefined or an empty object', () => {
  assert.deepEqual(mutationErrors(undefined), []);
  assert.deepEqual(mutationErrors({}), []);
});

test('should accept off false and an answer id and reject the rest when mutation.off is checked', () => {
  assert.deepEqual(mutationErrors({ off: false }), []);
  assert.deepEqual(mutationErrors({ off: 'A9' }), []);
  for (const off of [true, 'yes', 'A', 'a9', 9, null]) assert.match(mutationErrors({ off }).join(), /mutation\.off needs a user answer id/, String(off));
});

test('should accept accept when it maps a relative code file to an answer id', () => {
  assert.deepEqual(mutationErrors({ accept: {} }), []);
  assert.deepEqual(mutationErrors({ accept: { 'src/run.sh': 'A4' } }), []);
});

test('should reject accept when it is not an object, is null or an array', () => {
  for (const accept of [null, [], 5, true, 'x']) assert.match(mutationErrors({ accept }).join(), /mutation\.accept must map each code file/, JSON.stringify(accept));
});

test('should reject accept when a file path is not relative or the value is not an answer id', () => {
  for (const accept of [{ '/abs/run.sh': 'A4' }, { '../up.sh': 'A4' }, { 'a,b.sh': 'A4' }, { 'src/run.sh': 'yes' }, { 'src/run.sh': 4 }, { 'src/ok.sh': 'A1', 'src/run.sh': 'x' }]) {
    assert.equal(mutationErrors({ accept }).length, 1, JSON.stringify(accept));
  }
});
