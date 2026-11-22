// Tests for flags.mjs: on/off flags read as true/false; anything else warns and keeps the default. The copies in other skills stay identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enabled } from './flags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

test('should read true and false in any case, and use the default when the flag is unset or empty', () => {
  const warn = () => assert.fail('no warning expected');
  for (const [v, d, want] of [['true', false, true], ['TRUE', false, true], [' False ', true, false], ['false', true, false], [undefined, true, true], ['', false, false]]) {
    assert.equal(enabled({ X_ENABLED: v }, 'X_ENABLED', d, warn), want, `${v} / ${d}`);
  }
});

test('should warn and keep the default when the value is neither true nor false', () => {
  for (const v of ['1', '0', 'yes', 'ture', 'off']) {
    const said = [];
    assert.equal(enabled({ X_ENABLED: v }, 'X_ENABLED', true, m => said.push(m)), true, v);
    assert.deepEqual(said, [`X_ENABLED=${v} is not true or false; using the default, true`]);
  }
});

test('should keep the copies in paired-agent-tdd and qa-sweep identical when flags.mjs changes', () => {
  const mine = readFileSync(join(HERE, 'flags.mjs'), 'utf8');
  for (const s of ['paired-agent-tdd', 'qa-sweep']) assert.equal(readFileSync(join(HERE, '..', s, 'flags.mjs'), 'utf8'), mine, s);
});
