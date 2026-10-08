// Offline checks for record.mjs: a fake transcript dir and a fake run folder, no model. Run: node --test record.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecord } from './record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORD = join(HERE, 'record.mjs');
const score = (o = {}) => ({ total: 5, killed: 4, survived: 1, timeout: 0, inconclusive: 0, skipped: 0, unverifiable: 0, ...o });
const measured = { agents: [{}, {}, {}], by: { 'red-driver': 1, 'green-navigator': 1, reviewer: 1 }, units: 4800, calls: 21, wallSec: 187 };
const ret = {
  groups: { a: { state: 'done', red: { reworks: 0 }, green: { reworks: 1 } }, b: { state: 'blocked', red: { reworks: 1 }, green: {} } },
  clusters: [{ severity: 'medium', status: 'confirmed' }, { severity: 'low', status: 'pending-code-check' }, { severity: 'low', status: 'pending-code-check' }],
};
const verify = { dod: { covered: 7, total: 8, gaps: ['AC2/edge: unproven'], phantom: [] }, final: true, overridden: [], unfixed: [], notDone: ['b: blocked'], integration: undefined, proofcheck: { confirmed: 1 } };
const greens = { a: { mutation: { score: score() }, coverage: { pct: 91.5 } }, b: { mutation: { score: score({ total: 3, killed: 3, survived: 0 }) } } };

test('buildRecord: one line with the numbers of the run and nothing compared', () => {
  const { line, data } = buildRecord({ date: '2026-10-09', base: 'a1b2c3d4e5f6', ret, verify, greens, measured, note: 'billing service' });
  assert.match(line, /^2026-10-09 \| a1b2c3d4 \| on-job \| 2 group\(s\): 1 done, 1 blocked \| red-driver 1, green-navigator 1, reviewer 1 \(=3\) \| 5k units, 21 calls \| 187 s \|/);
  assert.match(line, /DoD 7\/8 gaps AC2\/edge: unproven \| 2 rework\(s\) \| mutants 7 killed \/ 1 survived \/ 0 not decided over 2 group\(s\) \| coverage a 91.5% \| findings 1 medium confirmed, 2 low pending-code-check/);
  assert.match(line, /final true, overridden 0, unfixed 0, notDone 1 \| billing service \| \(one run, no baseline\)$/);
  assert.doesNotMatch(line, / vs |faster|cheaper|% less/i, 'no comparison language');
  assert.deepEqual([data.agentTotal, data.units, data.reworks, data.mutants.groupsMutated], [3, 4800, 2, 2]);
});

test('buildRecord: a run with no verify, no mutation and no coverage says so instead of inventing numbers', () => {
  const { line } = buildRecord({ date: '2026-10-09', base: 'abc', ret: { groups: { a: { state: 'failed' } }, clusters: [] }, verify: null, greens: { a: null }, measured });
  assert.match(line, /DoD: verify not run \| 0 rework\(s\) \| mutants 0 killed \/ 0 survived \/ 0 not decided over 0 group\(s\) \| coverage not configured \| findings none/);
  assert.doesNotMatch(line, /final /);
});

function agent(dir, name, label, secs) {
  const row = (t, extra) => JSON.stringify({ timestamp: new Date(Date.UTC(2026, 9, 9, 10, 0, t)).toISOString(), message: { role: 'assistant', id: `${name}-${t}`, usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000 }, content: extra } });
  writeFileSync(join(dir, `agent-${name}.jsonl`), `${row(0, [{ type: 'tool_use', id: `${name}-t1` }])}\n${row(secs, [{ type: 'tool_use', id: `${name}-t2` }, { type: 'text', text: 'x' }])}\n`);
  writeFileSync(join(dir, `agent-${name}.meta.json`), JSON.stringify({ description: label }));
}

test('CLI: reads the transcript and the run folder, prints the line, writes record.json, appends under one heading', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-rec-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = join(dir, 'run'), tr = join(dir, 'tr');
  for (const d of [run, join(run, 'gates'), tr]) mkdirSync(d, { recursive: true });
  agent(tr, 'one', 'red-driver:a', 40); agent(tr, 'two', 'green-navigator:a:recheck', 60);
  writeFileSync(join(run, 'plan.json'), JSON.stringify({ base: '0123456789abcdef' }));
  writeFileSync(join(run, 'gates', 'a.green.json'), JSON.stringify(greens.a));
  writeFileSync(join(run, 'gates', 'b.green.json'), JSON.stringify(greens.b));
  writeFileSync(join(run, 'gates', 'verify.json'), JSON.stringify(verify));
  writeFileSync(join(dir, 'return.json'), JSON.stringify(ret));
  const runs = join(dir, 'runs.md');
  writeFileSync(runs, '# runs\n');
  const go = () => spawnSync(process.execPath, [RECORD, '--run', run, '--ret', join(dir, 'return.json'), '--transcript', tr, '--append', runs, '--note', 'job x'], { encoding: 'utf8' });
  const r = go();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| 01234567 \| on-job \| 2 group\(s\): 1 done, 1 blocked \| red-driver 1, green-navigator 1 \(=2\) \| 6k units, 4 calls \| 60 s \|/);
  assert.equal(JSON.parse(readFileSync(join(run, 'record.json'), 'utf8')).agentTotal, 2);
  go();
  const md = readFileSync(runs, 'utf8');
  assert.equal(md.match(/## On-job runs/g).length, 1, 'one heading, one line per run');
  assert.equal(md.split('\n').filter(l => l.includes('| on-job |')).length, 2);
  const bad = spawnSync(process.execPath, [RECORD, '--run', run, '--ret', join(dir, 'return.json'), '--transcript', join(dir, 'empty')], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
