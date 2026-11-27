import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlagError, readFlags } from './flags.mjs';

test('should default every retro flag on with 8000 bytes when nothing is set (FFlags, CSteer)', () => {
  assert.deepEqual(readFlags({}), { ratchetHook: true, transcripts: true, autoCollect: true, unenforcedRule: true, steeringMax: 8000 });
});

test('should read true, false and unlimited in any case when they are set (FFlags)', () => {
  const f = readFlags({ RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED: 'FALSE', RETRO_TRANSCRIPTS_ENABLED: 'false', RETRO_AUTO_COLLECT_ENABLED: ' True ', RETRO_UNENFORCED_RULE_CHECK_ENABLED: 'False', RETRO_STEERING_BYTES_MAX: 'Unlimited' });
  assert.deepEqual(f, { ratchetHook: false, transcripts: false, autoCollect: true, unenforcedRule: false, steeringMax: null });
  assert.equal(readFlags({ RETRO_STEERING_BYTES_MAX: '12000' }).steeringMax, 12000);
});

test('should throw a FlagError naming the fix when a value is outside the allowed list (FStrict)', () => {
  for (const [k, v] of [['RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED', '0'], ['RETRO_TRANSCRIPTS_ENABLED', 'yes'], ['RETRO_AUTO_COLLECT_ENABLED', '1'], ['RETRO_UNENFORCED_RULE_CHECK_ENABLED', 'maybe'], ['RETRO_STEERING_BYTES_MAX', '0'], ['RETRO_STEERING_BYTES_MAX', '-5'], ['RETRO_STEERING_BYTES_MAX', '8k']]) {
    assert.throws(() => readFlags({ [k]: v }), e => e instanceof FlagError && e.message.includes(k), `${k}=${v}`);
  }
});

test('should never throw anything but a FlagError when values are random (FStrict fuzz)', () => {
  const chars = 'aZ09 -_.tRuEfAlSeUNLIMITEDก\0';
  for (let i = 0; i < 500; i++) {
    const v = Array.from({ length: i % 9 }, (_, j) => chars[(i * 7 + j * 13) % chars.length]).join('');
    try { readFlags({ RETRO_TRANSCRIPTS_ENABLED: v, RETRO_STEERING_BYTES_MAX: v }); } catch (e) { assert.ok(e instanceof FlagError, String(e)); }
  }
});
