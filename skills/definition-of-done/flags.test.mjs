// Tests for flags.mjs: a flag means what it says or the run stops. Unset or empty keeps the default; any other value, or an old name, is an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlagError, enabled, oneOf, positiveInt } from './flags.mjs';

test('should read true and false in any case, and use the default when the flag is unset or empty', () => {
  for (const [v, d, want] of [['true', false, true], ['TRUE', false, true], [' False ', true, false], ['false', true, false], [undefined, true, true], ['', false, false]]) {
    assert.equal(enabled({ X_ENABLED: v }, 'X_ENABLED', d), want, `${v} / ${d}`);
  }
});

test('should stop with an error naming the flag when an on/off value is neither true nor false', () => {
  for (const v of ['1', '0', 'yes', 'ture', 'off']) {
    assert.throws(() => enabled({ X_ENABLED: v }, 'X_ENABLED', true), e => e instanceof FlagError && e.message === `X_ENABLED=${v} is not valid: use true or false`, v);
  }
});

test('should stop with an error naming the new flag when an old name is still set', () => {
  assert.throws(() => enabled({ X_GUARD: '1' }, 'X_GUARD_ENABLED', false, { renamedFrom: 'X_GUARD' }), { message: 'X_GUARD was renamed: use X_GUARD_ENABLED=true or X_GUARD_ENABLED=false, and unset X_GUARD' });
  assert.equal(enabled({ X_GUARD: '' }, 'X_GUARD_ENABLED', false, { renamedFrom: 'X_GUARD' }), false, 'an empty old name is unset');
});

test('should read a positive whole number, null when unset, and stop on anything else', () => {
  assert.equal(positiveInt({ N_MAX: '12' }, 'N_MAX'), 12);
  assert.equal(positiveInt({}, 'N_MAX'), null);
  for (const v of ['0', '-1', '1.5', 'ten', '3x']) assert.throws(() => positiveInt({ N_MAX: v }, 'N_MAX'), { message: `N_MAX=${v} is not valid: use a whole number above 0` }, v);
  assert.throws(() => positiveInt({ N_CAP: '3' }, 'N_MAX', { renamedFrom: 'N_CAP' }), /N_CAP was renamed: use N_MAX=<number>/);
});

test('should read one of the listed modes, the default when unset, and stop on anything else', () => {
  assert.equal(oneOf({ M_MODE: 'Docker' }, 'M_MODE', ['auto', 'docker'], 'auto'), 'docker');
  assert.equal(oneOf({}, 'M_MODE', ['auto', 'docker'], 'auto'), 'auto');
  assert.throws(() => oneOf({ M_MODE: 'podman' }, 'M_MODE', ['auto', 'docker'], 'auto'), { message: 'M_MODE=podman is not valid: use one of auto, docker' });
  assert.throws(() => oneOf({ M_FORCE: 'docker' }, 'M_MODE', ['auto', 'docker'], 'auto', { renamedFrom: 'M_FORCE' }), /M_FORCE was renamed: use M_MODE=auto\|docker/);
});
