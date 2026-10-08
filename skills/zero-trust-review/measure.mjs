#!/usr/bin/env node
// Per-node cost and time of one Workflow run, read from its transcript dir (the path the Workflow tool result prints).
//   node measure.mjs <transcriptDir> [sha8 mode]     prints a table and one runs.md line
// Cost units = input-token equivalents with the usual price ratios: input 1, output 5, cache write 1.25, cache read 0.1. Compare runs by units, not raw tokens.
// Also importable: `measureDir(dir)` returns the numbers (paired-agent-tdd's record.mjs uses it).
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE = l => (/^refute:/.test(l) ? 'verifier-refute' : /^reproduce:/.test(l) ? 'verifier-reproduce' : /^adjudicator:/.test(l) ? 'adjudicator' : /^batch:/.test(l) ? 'batch-verifier'
  : l === 'critic' ? 'critic' : /^GAP/.test(l) ? 'gap-reviewer' : /^(test-auditor|integration-probe)$/.test(l) ? l
  : /^((red|green)-(driver|navigator)|fixer|reviewer|integration-tester)(:|$)/.exec(l)?.[1] ?? 'reviewer'); // the last arm: paired-agent-tdd labels are <node>:<group>[:rework|:recheck|:strengthen]
const jsonl = f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

/** -> { agents[{label,node,calls,out,cw,cr,units,start,end}], by{node:count}, calls, units, wallSec, last } for one Workflow transcript dir */
export function measureDir(dir) {
  const agents = readdirSync(dir).filter(f => /^agent-.*\.jsonl$/.test(f)).map(f => {
    const rows = jsonl(join(dir, f)), meta = JSON.parse(readFileSync(join(dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
    const byMsg = new Map(), tools = new Set();
    for (const r of rows) {
      const m = r.message;
      if (!m || m.role !== 'assistant') continue;
      if (m.usage) byMsg.set(m.id || r.uuid, m.usage);  // one usage per message id: streamed chunks repeat it
      for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === 'tool_use') tools.add(c.id);
    }
    const u = { in: 0, out: 0, cw: 0, cr: 0 };
    for (const x of byMsg.values()) { u.in += x.input_tokens || 0; u.out += x.output_tokens || 0; u.cw += x.cache_creation_input_tokens || 0; u.cr += x.cache_read_input_tokens || 0; }
    const ts = rows.map(r => Date.parse(r.timestamp)).filter(Number.isFinite);
    const label = meta.description || f;
    return { label, node: NODE(label), calls: tools.size, ...u, units: u.in + 5 * u.out + 1.25 * u.cw + 0.1 * u.cr, start: Math.min(...ts), end: Math.max(...ts) };
  }).sort((a, b) => a.start - b.start);
  const by = {};
  for (const a of agents) by[a.node] = (by[a.node] || 0) + 1;
  const sum = f => agents.reduce((s, a) => s + a[f], 0);
  const t0 = Math.min(...agents.map(a => a.start)), t1 = Math.max(...agents.map(a => a.end)), last = agents.reduce((m, a) => (a.end > m.end ? a : m), agents[0]);
  return { agents, by, calls: sum('calls'), units: sum('units'), wallSec: Math.round((t1 - t0) / 1000), t0, last: last?.label };
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const [dir, sha8 = '-', mode = '-'] = process.argv.slice(2);
  if (!dir) { console.error('usage: node measure.mjs <transcriptDir> [sha8 mode]'); process.exit(2); }
  const m = measureDir(dir), k = n => (n / 1000).toFixed(0) + 'k';
  console.log('label'.padEnd(26) + 'node'.padEnd(20) + 'start  sec  calls  out   cache-w  cache-r  units');
  for (const a of m.agents) console.log(a.label.slice(0, 25).padEnd(26) + a.node.padEnd(20) + String(Math.round((a.start - m.t0) / 1000)).padStart(5) + String(Math.round((a.end - a.start) / 1000)).padStart(5) + String(a.calls).padStart(6) + k(a.out).padStart(6) + k(a.cw).padStart(9) + k(a.cr).padStart(9) + k(a.units).padStart(7));
  console.log(`\ntotal: ${m.agents.length} agents, ${m.calls} tool calls, ${k(m.units)} cost units, wall ${m.wallSec} s, last to finish: ${m.last}`);
  console.log(`runs.md line:\n${new Date().toISOString().slice(0, 10)} | ${sha8} | ${mode} | ${Object.entries(m.by).map(([n, c]) => `${n} ${c}`).join(', ')} (=${m.agents.length}) | ${k(m.units)} units, ${m.calls} calls | ${m.wallSec} s | last: ${m.last}`);
}
