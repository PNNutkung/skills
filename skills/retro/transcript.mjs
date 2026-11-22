// One Claude Code session transcript (JSONL) -> the numbers a retro needs (pure). Line numbers are 1-based JSONL lines, so evidence can cite
// `transcript:<path>:<line>`. Usage repeats on every line of one assistant message, so tokens are counted once per message id.
// Everything quoted is redacted first.
import { redact } from './redact.mjs';

const BIG_RESULTS = 5;
const QUOTE_MAX = 300;
const num = v => (Number.isFinite(v) ? v : 0);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => (isObj(x) && typeof x.text === 'string' ? x.text : '')).join('\n') : '';

export function parseTranscript(text) {
  const out = { sessionId: null, cwds: [], start: null, end: null, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }, models: [],
    toolCalls: 0, reads: [], failedCommands: [], bigResults: [], userMessages: [], redacted: 0, badLines: 0 };
  const usage = new Map(), calls = new Map(), reads = new Map(), failed = new Map(), results = [], cwds = new Set(), models = new Set();
  String(text ?? '').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const line = i + 1;
    let d;
    try { d = JSON.parse(raw); } catch { out.badLines++; return; }
    if (!isObj(d)) { out.badLines++; return; }
    if (typeof d.timestamp === 'string') { out.start ??= d.timestamp; out.end = d.timestamp; }
    if (typeof d.sessionId === 'string') out.sessionId ??= d.sessionId;
    if (typeof d.cwd === 'string') cwds.add(d.cwd);
    const m = isObj(d.message) ? d.message : null;
    if (!m) return;
    if (d.type === 'assistant') {
      if (typeof m.model === 'string') models.add(m.model);
      if (isObj(m.usage)) usage.set(typeof m.id === 'string' ? m.id : `line${line}`, m.usage);
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (!isObj(c) || c.type !== 'tool_use') continue;
        out.toolCalls++;
        const input = isObj(c.input) ? c.input : {};
        calls.set(c.id, { name: c.name, input, line });
        if (c.name === 'Read' && typeof input.file_path === 'string') { const r = reads.get(input.file_path) ?? []; r.push(line); reads.set(input.file_path, r); }
      }
    } else if (d.type === 'user') {
      if (typeof m.content === 'string') {
        if (d.isMeta) return;
        const r = redact(m.content.slice(0, QUOTE_MAX));
        out.redacted += r.count;
        out.userMessages.push({ line, text: r.text });
        return;
      }
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (!isObj(c) || c.type !== 'tool_result') continue;
        const body = textOf(c.content);
        const call = calls.get(c.tool_use_id);
        results.push({ line, bytes: Buffer.byteLength(body), tool: call?.name ?? null });
        if (c.is_error && call?.name === 'Bash' && typeof call.input.command === 'string') {
          const cmd = redact(call.input.command.trim().slice(0, QUOTE_MAX)).text;
          const f = failed.get(cmd) ?? []; f.push(line); failed.set(cmd, f);
        }
      }
    }
  });
  for (const u of usage.values()) {
    out.tokens.input += num(u.input_tokens); out.tokens.output += num(u.output_tokens);
    out.tokens.cacheRead += num(u.cache_read_input_tokens); out.tokens.cacheCreate += num(u.cache_creation_input_tokens);
  }
  out.cwds = [...cwds]; out.models = [...models];
  out.reads = [...reads].filter(([, l]) => l.length > 1).map(([file, lines]) => ({ file, times: lines.length, lines })).sort((a, b) => b.times - a.times);
  out.failedCommands = [...failed].filter(([, l]) => l.length > 1).map(([cmd, lines]) => ({ cmd, times: lines.length, lines })).sort((a, b) => b.times - a.times);
  out.bigResults = results.sort((a, b) => b.bytes - a.bytes).slice(0, BIG_RESULTS);
  return out;
}
