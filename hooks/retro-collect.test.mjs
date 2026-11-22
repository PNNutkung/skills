import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'retro-collect.mjs');
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RETRO_')));
const transcript = () => {
  const p = join(mkdtempSync(join(tmpdir(), 'retro-hook-')), 's.jsonl');
  writeFileSync(p, `${JSON.stringify({ type: 'assistant', sessionId: 's9', cwd: '/r', timestamp: '2026-11-22T01:00:00Z', message: { id: 'm', content: [], usage: { input_tokens: 3, output_tokens: 4 } } })}\n`);
  return p;
};
const fire = (input, env = {}) => { const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env: { ...BASE_ENV, ...env }, encoding: 'utf8' }); return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr }; };
const runOf = text => /saved in (\S+)\/collect\.json/.exec(text)?.[1];

test('should save the numbers and remind the agent when a PR is merged (HAuto)', () => {
  const r = fire({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'gh pr merge 17 --squash' }, transcript_path: transcript(), session_id: 's9', cwd: '/r' });
  assert.equal(r.code, 0);
  const ctx = r.out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /\/retro/);
  const saved = JSON.parse(readFileSync(join(runOf(ctx), 'collect.json'), 'utf8'));
  assert.deepEqual(saved.tokens, { input: 3, output: 4, cacheRead: 0, cacheCreate: 0 });
});

test('should save the numbers on stderr when the session ends and stay quiet for other commands (HAuto)', () => {
  const end = fire({ hook_event_name: 'SessionEnd', transcript_path: transcript(), session_id: 's9', cwd: '/r' });
  assert.equal(end.code, 0); assert.equal(end.out, null);
  assert.ok(existsSync(join(runOf(end.err), 'collect.json')));
  for (const command of ['git merge main', 'echo gh pr merge-ish', 'ghx pr merge']) {
    const r = fire({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command } });
    assert.equal(r.out, null, command); assert.equal(r.err, '', command);
  }
  assert.ok(fire({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'cd x && glab mr merge 3' }, transcript_path: transcript() }).out);
});

test('should do nothing when RETRO_AUTO_COLLECT_ENABLED is false (HAuto, FFlags)', () => {
  const r = fire({ hook_event_name: 'SessionEnd', transcript_path: transcript() }, { RETRO_AUTO_COLLECT_ENABLED: 'false' });
  assert.equal(r.code, 0); assert.equal(r.out, null); assert.equal(r.err, '');
});

test('should block with the fix when a retro flag is not valid (FStrict)', () => {
  const r = fire({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'gh pr merge 1' } }, { RETRO_AUTO_COLLECT_ENABLED: '1' });
  assert.equal(r.out.decision, 'block'); assert.match(r.out.reason, /RETRO_AUTO_COLLECT_ENABLED=1 is not valid/);
  assert.match(fire({ hook_event_name: 'SessionEnd' }, { RETRO_STEERING_BYTES_MAX: 'big' }).err, /RETRO_STEERING_BYTES_MAX/);
});

test('should fail open when the input is not JSON or the transcript is missing (HAuto)', () => {
  const bad = spawnSync(process.execPath, [HOOK], { input: '{nope', env: BASE_ENV, encoding: 'utf8' });
  assert.equal(bad.status, 0); assert.equal(bad.stdout, '');
  const r = fire({ hook_event_name: 'SessionEnd', transcript_path: '/no/such.jsonl' });
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(runOf(r.err), 'collect.json'), 'utf8')).notes, ['transcript not read']);
});
