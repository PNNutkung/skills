#!/usr/bin/env node
// PostToolUse hook for observability MCP tools (grafana, loki, prometheus, tempo, ...). While a zero-trust-review run is active and the
// call comes from a subagent, append one line per call to RUN/obs.jsonl so claims can later be re-checked against the real telemetry.
// Active = hook input has agent_id AND runctx.readMarker() names a trusted run dir (marker owned by us, not a symlink, not group/world-writable,
// < 12 h old). Writes go only through runctx.appendSafe (O_NOFOLLOW, 0600, inside RUN), so a planted symlink is never written through.
// Fail-open: never throws, never prints; an internal error is logged to RUN/hook-errors.log when RUN is known.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_INPUT_CHARS = 1000;
const MAX_OUT_CHARS = 8000;
// key + separator stay readable, the value goes; "bearer <tok>" is also caught when it is not behind a key
const SECRET = /(authorization|api[_-]?key|passw(?:or)?d|secret|token)(["']?\s*[:=]\s*["']?)(?:(?:bearer|basic)\s+)?[^\s"',;}]+/gi;
const BEARER = /\bbearer\s+[a-z0-9._~+/-]+=*/gi;

const redact = s => s.replace(SECRET, '$1$2[redacted]').replace(BEARER, 'Bearer [redacted]');

// tool_response is a string, an object, {content:[{type:'text',text}]} or a bare array of such blocks
function responseText(r) {
  const blocks = Array.isArray(r) ? r : r?.content;
  if (Array.isArray(blocks)) {
    const texts = blocks.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text);
    if (texts.length) return texts.join('\n');
  }
  return typeof r === 'string' ? r : (JSON.stringify(r) ?? '');
}

const makeRow = input => ({
  id: input.tool_use_id || `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  ts: new Date().toISOString(),
  tool: input.tool_name,
  input: redact(JSON.stringify(input.tool_input ?? null)).slice(0, MAX_INPUT_CHARS),
  out: redact(responseText(input.tool_response)).slice(0, MAX_OUT_CHARS),
  agent: input.agent_id,
});

let run = '';
let appendSafe;
try {
  const ctx = await import('../skills/zero-trust-review/runctx.mjs');
  appendSafe = ctx.appendSafe;
  const input = JSON.parse(readFileSync(0, 'utf8'));
  run = input?.agent_id ? ctx.readMarker() : '';
  if (run) appendSafe(run, join(run, 'obs.jsonl'), `${JSON.stringify(makeRow(input))}\n`);
} catch (err) {
  try {
    if (run) appendSafe(run, join(run, 'hook-errors.log'), `${new Date().toISOString()} zt-capture: ${String(err?.message ?? err).split('\n')[0]}\n`);
  } catch { /* RUN unwritable or runctx missing: nothing left to do, stay silent */ }
}
process.exit(0);
