#!/usr/bin/env node
// On-job record of ONE paired-agent-tdd run: one line for runs.md, built from the Workflow transcript (cost units, tool calls, wall-clock, agents per node)
// and from the run folder (DoD closure, reworks, mutants, coverage, findings, the verify result). It records what happened; it compares nothing.
//   node record.mjs --run RUN --ret return.json --transcript DIR [--note TEXT] [--append runs.md]
// RUN = the folder `tdd.mjs plan` made; return.json = the saved Workflow return; DIR = the transcript dir the Workflow tool result prints.
// Run `tdd.mjs verify` first: its verify.json is part of the record. Prints the line; --append adds it under "## On-job runs" in that file.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZT = resolve(process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review'));
const k = n => `${(n / 1000).toFixed(0)}k`;
const tally = (items, f) => items.reduce((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});
const show = o => Object.entries(o).map(([key, n]) => `${n} ${key}`).join(', ') || 'none';

/** Pure: everything is passed in. greens = { group: green gate json | null }, measured = measureDir() result. -> { line, data } */
export function buildRecord({ date, base, ret, verify, greens, measured, note }) {
  const groups = Object.entries(ret.groups ?? {}), states = tally(groups, ([, g]) => g.state);
  const reworks = groups.reduce((n, [, g]) => n + (g.red?.reworks ?? 0) + (g.green?.reworks ?? 0), 0);
  const mut = { total: 0, killed: 0, survived: 0, timeout: 0, inconclusive: 0, skipped: 0, unverifiable: 0 };
  let mutated = 0;
  for (const g of Object.values(greens)) if (g?.mutation?.score) { mutated++; for (const key of Object.keys(mut)) mut[key] += g.mutation.score[key] ?? 0; }
  const pcts = Object.entries(greens).flatMap(([id, g]) => (g?.coverage?.pct != null ? [`${id} ${g.coverage.pct}%`] : []));
  const findings = tally(ret.clusters ?? [], c => `${c.severity} ${c.status}`);
  const d = verify?.dod;
  const data = {
    date, base, groups: Object.fromEntries(groups.map(([id, g]) => [id, g.state])), agents: measured.by, agentTotal: measured.agents.length, units: Math.round(measured.units), calls: measured.calls, wallSec: measured.wallSec,
    dod: d ? { covered: d.covered, total: d.total, gaps: d.gaps, phantom: d.phantom ?? [] } : null, reworks, mutants: { ...mut, groupsMutated: mutated }, coverage: pcts, findings,
    verify: verify ? { final: verify.final, overridden: verify.overridden, unfixed: verify.unfixed, notDone: verify.notDone, integration: verify.integration, proofcheck: verify.proofcheck } : null, note: note || undefined,
  };
  const line = [date, `${String(base).slice(0, 8)}`, 'on-job', `${groups.length} group(s): ${show(states)}`, `${Object.entries(measured.by).map(([n, c]) => `${n} ${c}`).join(', ')} (=${measured.agents.length})`,
    `${k(measured.units)} units, ${measured.calls} calls`, `${measured.wallSec} s`,
    d ? `DoD ${d.covered}/${d.total}${d.gaps.length ? ` gaps ${d.gaps.join('; ')}` : ''}${(d.phantom ?? []).length ? `, ${d.phantom.length} phantom row(s)` : ''}` : 'DoD: verify not run',
    `${reworks} rework(s)`, `mutants ${mut.killed} killed / ${mut.survived} survived / ${mut.skipped + mut.timeout + mut.inconclusive + mut.unverifiable} not decided over ${mutated} group(s)`,
    `coverage ${pcts.join(', ') || 'not configured'}`, `findings ${show(findings)}`,
    verify ? `final ${verify.final}, overridden ${(verify.overridden ?? []).length}, unfixed ${(verify.unfixed ?? []).length}, notDone ${(verify.notDone ?? []).length}` : '', note ?? '', '(one run, no baseline)'].filter(Boolean).join(' | ');
  return { line, data };
}

const readJson = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

async function main() {
  const { values: v } = parseArgs({ options: { run: { type: 'string' }, ret: { type: 'string' }, transcript: { type: 'string' }, note: { type: 'string' }, append: { type: 'string' } }, strict: true });
  for (const key of ['run', 'ret', 'transcript']) if (!v[key]) throw new Error(`--${key} is required`);
  const run = resolve(v.run), ret = readJson(resolve(v.ret)), plan = readJson(join(run, 'plan.json'));
  if (!ret || !plan) throw new Error('cannot read --ret or RUN/plan.json');
  const { measureDir } = await import(pathToFileURL(join(ZT, 'measure.mjs')).href);
  const measured = measureDir(resolve(v.transcript));
  if (!measured.agents.length) throw new Error(`no agent-*.jsonl in ${v.transcript}`);
  const greens = Object.fromEntries(Object.keys(ret.groups ?? {}).map(id => [id, readJson(join(run, 'gates', `${id}.green.json`))]));
  const { line, data } = buildRecord({ date: new Date().toISOString().slice(0, 10), base: plan.base, ret, verify: readJson(join(run, 'gates', 'verify.json')), greens, measured, note: v.note });
  process.stdout.write(`${line}\n`);
  writeFileSync(join(run, 'record.json'), `${JSON.stringify(data)}\n`, { mode: 0o600 });
  if (v.append) {
    const f = resolve(v.append), text = existsSync(f) ? readFileSync(f, 'utf8') : '';
    appendFileSync(f, `${text.includes('## On-job runs') ? '' : `${text && !text.endsWith('\n') ? '\n' : ''}\n## On-job runs\n\nOne line per real run, from record.mjs: what happened, no baseline.\n\n`}${line}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { process.stderr.write(`record: ${e.message}\n`); process.exit(2); });
