// Tests for the verify flags: VERIFY_GUARD_ENABLED (Guard), VERIFY_RUN_TIMEOUT_MAX (Timeout) and the removed VERIFY_FLAG_RUNS_ENABLED (FlagRuns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG, FlagError, REMOVED, checkRemoved, guardEnabled, timeoutMax } from './flags.mjs';

const RUNS_FLAG = Object.keys(REMOVED)[0];
const isFlagError = (name) => (e) => e instanceof FlagError && e.message.includes(name);

test('should turn the guard on when VERIFY_GUARD_ENABLED is unset or empty (Guard)', () => {
  assert.equal(guardEnabled({}), true);
  assert.equal(guardEnabled({ [FLAG.guard]: '' }), true);
  assert.equal(guardEnabled({ [FLAG.guard]: '  ' }), true);
});

test('should read true and false in any case when VERIFY_GUARD_ENABLED is set (Guard)', () => {
  for (const v of ['true', 'TRUE', ' True ']) assert.equal(guardEnabled({ [FLAG.guard]: v }), true, v);
  for (const v of ['false', 'FALSE', ' False ']) assert.equal(guardEnabled({ [FLAG.guard]: v }), false, v);
});

test('should throw a FlagError naming the flag and the allowed values when VERIFY_GUARD_ENABLED is invalid (Guard)', () => {
  for (const v of ['maybe', '1', '0', 'yes', 'off', 'truee']) {
    assert.throws(() => guardEnabled({ [FLAG.guard]: v }), (e) => isFlagError(FLAG.guard)(e) && /true or false/.test(e.message), v);
  }
});

test('should return Infinity when VERIFY_RUN_TIMEOUT_MAX is unset, empty or unlimited (Timeout)', () => {
  assert.equal(timeoutMax({}), Infinity);
  assert.equal(timeoutMax({ [FLAG.timeout]: '' }), Infinity);
  for (const v of ['unlimited', 'UNLIMITED', ' Unlimited ']) assert.equal(timeoutMax({ [FLAG.timeout]: v }), Infinity, v);
});

test('should return the seconds when VERIFY_RUN_TIMEOUT_MAX is a whole number above 0 (Timeout)', () => {
  assert.equal(timeoutMax({ [FLAG.timeout]: '1' }), 1);
  assert.equal(timeoutMax({ [FLAG.timeout]: ' 300 ' }), 300);
});

test('should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)', () => {
  for (const v of ['0', '-1', '1.5', 'ten', '10s', 'maybe', 'Infinity', '1e3']) {
    assert.throws(() => timeoutMax({ [FLAG.timeout]: v }), (e) => isFlagError(FLAG.timeout)(e) && /unlimited/.test(e.message), v);
  }
});

test('should pass when the removed flag is unset or empty (FlagRuns)', () => {
  assert.doesNotThrow(() => checkRemoved({}));
  assert.doesNotThrow(() => checkRemoved({ [RUNS_FLAG]: '' }));
  assert.doesNotThrow(() => checkRemoved({ [FLAG.guard]: 'false' }));
});

test('should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)', () => {
  assert.equal(RUNS_FLAG, 'VERIFY_FLAG_RUNS_ENABLED');
  for (const v of ['true', 'false', 'maybe']) {
    assert.throws(() => checkRemoved({ [RUNS_FLAG]: v }), (e) => e instanceof FlagError && e.message.startsWith(`${RUNS_FLAG} was removed: `) && e.message.includes(REMOVED[RUNS_FLAG]), v);
  }
});

test('should read process.env when no env is passed (Guard)', () => {
  const saved = process.env[FLAG.guard];
  delete process.env[FLAG.guard];
  try { assert.equal(guardEnabled(), true); assert.equal(timeoutMax(), timeoutMax({ ...process.env })); } finally {
    if (saved !== undefined) process.env[FLAG.guard] = saved;
  }
});

// Fuzz: a random value is either read as a valid value or rejected with a FlagError; nothing else ever escapes.
test('should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)', () => {
  let seed = 8;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const chars = 'tTrRuUeEfFaAlLsS019 -.xunlimitedUNLIMITED\t';
  for (let i = 0; i < 2000; i++) {
    const v = Array.from({ length: Math.floor(rand() * 12) }, () => chars[Math.floor(rand() * chars.length)]).join('');
    for (const [fn, name] of [[guardEnabled, FLAG.guard], [timeoutMax, FLAG.timeout]]) {
      try {
        const out = fn({ [name]: v });
        assert.ok(typeof out === 'boolean' || out === Infinity || (Number.isInteger(out) && out > 0), `${name}=${JSON.stringify(v)} -> ${out}`);
      } catch (e) { assert.ok(e instanceof FlagError, `${name}=${JSON.stringify(v)}: ${e}`); }
    }
  }
});
