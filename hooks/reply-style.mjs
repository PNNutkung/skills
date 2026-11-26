#!/usr/bin/env node
// Claude Code SessionStart hook: puts rules/reply-style.md into the session context (startup, resume, clear, compact).
// On by default; REPLY_STYLE_ENABLED=false turns it off. Any other value exits 2 with the fix. A missing rule file warns on stderr
// and exits 0, so the session still starts (docs/adr/0010-reply-style.md).
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLAG = 'REPLY_STYLE_ENABLED';
const RULE = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules', 'reply-style.md');

/** true unless the flag is false (any case); unset or empty is true. Throws on any other value. */
export function readEnabled(env) {
  const raw = env[FLAG] ?? '';
  const v = raw.toLowerCase();
  if (v === '' || v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`${FLAG}="${raw}" is not valid: set it to true or false, or unset it (default true)`);
}

/** -> { code, stdout?: object, stderr?: string } for one hook event. */
export function handle(input, env = process.env) {
  if (input?.hook_event_name !== 'SessionStart') return { code: 0 };
  let on;
  try { on = readEnabled(env); } catch (e) { return { code: 2, stderr: `reply-style: ${e.message}` }; }
  if (!on) return { code: 0 };
  let text;
  try { text = readFileSync(RULE, 'utf8'); } catch (e) { return { code: 0, stderr: `reply-style: cannot read ${RULE} (${e.code ?? e.message}); the session starts without the reply-style rule` }; }
  return { code: 0, stdout: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } } };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  let out;
  try {
    let input = {};
    try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no or bad input: treat as no event */ }
    out = handle(input);
  } catch (e) { out = { code: 0, stderr: `reply-style: ${e.message}` }; }
  if (out.stdout) process.stdout.write(`${JSON.stringify(out.stdout)}\n`);
  if (out.stderr) process.stderr.write(`${out.stderr}\n`);
  process.exitCode = out.code;
}
