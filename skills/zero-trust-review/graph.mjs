#!/usr/bin/env node
// Execution graph for zero-trust-review: the SINGLE SOURCE OF TRUTH for the pipeline's shape.
// --write regenerates the mermaid diagram in SKILL.md and the NODE/MODES/LIM table in workflow.js (a Workflow
// script cannot import this file); --check fails when either has drifted. Edit NODES, run --write, keep both.
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// tier: T0 code, T2 sonnet, T3 opus (policy in tiering.md; T1 haiku is for pure gather nodes, no node uses it). It is a label for readers
// and for check(); nodesJs() does not emit it.
// model 'code' = plain code (the lead or the workflow script), no agent. effort/ponytail apply to agents only;
// ponytail limits the probes and fix text a node writes, never its evidence or its search.
// fanout: group = per file group, finding = per cluster, gap = per critic gap.
// LIM: pool = agents in flight at once, one rolling pool for review AND verification (no wave barriers; capped so one gateway stall cannot take out the fleet),
// gaps = max critic gaps turned into gap-reviewers, retry = extra attempts for a dead or null agent. Empirical; adjust only from runs.md data.
// Lows get no verifier agent: an agent costs ~45k tokens of fixed context, so `proofcheck` re-checks every low against the real code in plain code.
export const LIM = { pool: 6, gaps: 3, retry: 1 };
export const NODES = [
  { id: 'triage', tier: 'T0', role: 'Classify the diff: groups, fired/skipped points, mode (triage.py)', needs: [], model: 'code', deliverable: 'triage JSON' },
  { id: 'probes', tier: 'T0', role: 'Lead runs the changed tests for real inside the sandbox: pass-after, fail-before, flake (testprobe.mjs)', needs: ['triage'], model: 'code', deliverable: 'Probe facts: one verdict per test file' },
  { id: 'reviewer', tier: 'T2', role: 'Driver: review one disjoint file group on its assigned points', needs: ['triage', 'probes'], model: 'sonnet', effort: 'medium', ponytail: 'full', fanout: 'group', deliverable: 'Findings, one-line N/As, questions' },
  { id: 'test-auditor', tier: 'T2', role: 'Stale or contradicted tests, SCOPED runs only', needs: ['triage', 'probes'], model: 'sonnet', effort: 'medium', ponytail: 'lite', gated: 'deep only', deliverable: 'New failures + commands run' },
  { id: 'integration-probe', tier: 'T2', role: 'One real-dependency probe in a throwaway container', needs: ['triage', 'probes'], model: 'sonnet', effort: 'medium', ponytail: 'lite', gated: 'deep only, and only when 13, 18 or 21 fired', deliverable: 'Probe result + measurements' },
  { id: 'dedupe', tier: 'T0', role: 'Merge near-duplicate findings (same file, lines within 3, title Jaccard >= 0.34)', needs: ['reviewer', 'test-auditor', 'integration-probe'], model: 'code', deliverable: 'Clusters C1..Cn' },
  { id: 'verifier-refute', tier: 'T2', role: 'Navigator: try to refute one cluster of severity >= medium', needs: ['dedupe'], model: 'sonnet', effort: 'medium', ponytail: 'full', fanout: 'finding', deliverable: 'Verdict: real, severity, inScope' },
  { id: 'verifier-reproduce', tier: 'T2', role: 'Navigator: reproduce one cluster with a sandboxed probe or real telemetry, never a guess', needs: ['dedupe'], model: 'sonnet', effort: 'medium', ponytail: 'ultra', fanout: 'finding', gated: 'critical/high, or when refute answers partial/unverifiable', deliverable: 'Verdict: real, severity, inScope' },
  { id: 'adjudicator', tier: 'T3', role: 'Break a refute/reproduce split', needs: ['verifier-refute', 'verifier-reproduce'], model: 'opus', effort: 'high', ponytail: 'off', fanout: 'finding', gated: 'only when the verifiers split on a critical/high', deliverable: 'Final verdict' },
  { id: 'critic', tier: 'T3', role: 'What is missing: weak N/As, unexamined angles, unverified claims', needs: ['adjudicator'], model: 'opus', effort: 'high', ponytail: 'off', gated: 'deep only', deliverable: 'At most 3 gaps with a precise focus' },
  { id: 'gap-reviewer', tier: 'T2', role: 'Driver: review one critic gap; its findings are verified by the same policy', needs: ['critic'], model: 'sonnet', effort: 'high', ponytail: 'full', fanout: 'gap', gated: 'deep only, at most 3', deliverable: 'Findings for the gap' },
  { id: 'proofcheck', tier: 'T0', role: 'Re-check every proof and every low against the real code, the run ledger and telemetry; a guess becomes unproven (proofcheck.mjs)', needs: ['gap-reviewer'], model: 'code', deliverable: 'verified.json + evidence.md (noted for review)' },
  { id: 'report', tier: 'T0', role: 'Lead writes the report from the proofchecked return (Step 4)', needs: ['proofcheck'], model: 'code', deliverable: 'Report file + verdict' },
];
// cap = tool-call cap per agent in that mode. skip = nodes that do not run; verify = severities that get verified; merge = one reviewer for the whole diff.
const ALL = ['critical', 'high', 'medium'];  // agents verify these; lows are checked in code (proofcheck)
export const MODES = {
  quick: { use: '< 150 source lines and <= 5 files', merge: true, cap: 35, verify: ['critical', 'high'], effort: {}, skip: ['test-auditor', 'integration-probe', 'critic', 'gap-reviewer'] },
  standard: { use: 'default', merge: false, cap: 30, verify: ALL, effort: {}, skip: ['test-auditor', 'integration-probe', 'critic', 'gap-reviewer'] },
  deep: { use: '> 1500 source lines or > 40 files, security-critical, or asked', merge: false, cap: 45, verify: ALL, effort: { reviewer: 'high' }, skip: [] },
};

const byId = new Map(NODES.map(n => [n.id, n]));

/** Nodes grouped into dependency layers. Everything in a layer can run at once. */
export function layers() {
  const left = new Set(byId.keys()), done = new Set(), out = [];
  while (left.size) {
    const ready = [...left].filter(id => byId.get(id).needs.every(d => done.has(d)));
    if (!ready.length) throw new Error(`cycle among: ${[...left]}`);
    out.push(ready);
    ready.forEach(id => { left.delete(id); done.add(id); });
  }
  return out;
}

/** Longest dependency chain: the run's wall-clock floor, in node hops. */
export function criticalPath() {
  const depth = new Map(), walk = id => depth.get(id) ?? (depth.set(id, 1 + Math.max(0, ...byId.get(id).needs.map(walk))), depth.get(id));
  let cur = [...byId.keys()].reduce((a, b) => (walk(a) >= walk(b) ? a : b)), chain = [];
  while (cur) {
    chain.unshift(cur);
    const needs = byId.get(cur).needs;
    cur = needs.length ? needs.reduce((a, b) => (walk(a) >= walk(b) ? a : b)) : null;
  }
  return chain;
}

/** Expected agents per node for a mode and a finding mix (adjudicator and integration-probe are upper-bound gated). */
export function plan(mode, g, c, h, m, l) {
  const M = MODES[mode], on = id => (M.skip.includes(id) ? 0 : 1), v = s => (M.verify.includes(s) ? 1 : 0);
  const counts = {
    reviewer: M.merge ? Math.min(g, 1) : g, 'test-auditor': on('test-auditor'), 'integration-probe': on('integration-probe'),
    'verifier-refute': v('critical') * c + v('high') * h + v('medium') * m, 'verifier-reproduce': v('critical') * c + v('high') * h,
    adjudicator: 0, critic: on('critic'), 'gap-reviewer': on('gap-reviewer') * LIM.gaps,
  };
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export function mermaid() {
  const fan = { group: 'per group', finding: 'per finding', gap: 'per gap' };
  const tags = n => [n.model === 'code' ? 'code' : `${n.model}/${n.effort}`, fan[n.fanout], n.gated && 'gated'].filter(Boolean).join(' · ');
  return ['graph TD', ...NODES.map(n => `  ${n.id}["${n.id}<br/>${tags(n)}"]`), ...NODES.flatMap(n => n.needs.map(d => `  ${d} --> ${n.id}`))].join('\n');
}

const nodesJs = () => [
  'const NODE = {', ...NODES.filter(n => n.model !== 'code').map(n => `  '${n.id}': ${JSON.stringify({ model: n.model, effort: n.effort, ponytail: n.ponytail })},`), '}',
  'const MODES = {', ...Object.entries(MODES).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`), '}', `const LIM = ${JSON.stringify(LIM)}`, plan.toString(),
].join('\n');
const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  { file: 'SKILL.md', open: '<!-- GENERATED:graph -->', close: '<!-- /GENERATED:graph -->', body: () => '```mermaid\n' + mermaid() + '\n```' },
  { file: 'workflow.js', open: '// GENERATED:nodes (node graph.mjs --write)', close: '// /GENERATED:nodes', body: nodesJs },
];
const read = t => readFileSync(join(HERE, t.file), 'utf8');
const block = t => `${t.open}\n\n${t.body()}\n\n${t.close}`;
function current(t) {
  const txt = read(t), s = txt.indexOf(t.open), e = txt.indexOf(t.close);
  assert.ok(s !== -1 && e !== -1, `${t.file} is missing the ${t.open} block`);
  return txt.slice(s, e + t.close.length);
}

function check() {
  NODES.forEach(n => n.needs.forEach(d => assert.ok(byId.has(d), `${n.id} needs unknown node "${d}"`)));
  Object.values(MODES).forEach(M => M.skip.forEach(id => assert.ok(byId.has(id), `mode skips unknown node "${id}"`)));
  const l = layers();
  assert.equal(l.flat().length, NODES.length, 'some node never became ready');
  // Cost and shape guards: a future edit that re-serializes or re-inflates the pipeline fails here, not in production.
  assert.ok(['triage', 'probes', 'dedupe', 'proofcheck', 'report'].every(id => byId.get(id).model === 'code'), 'deterministic nodes must be plain code, not agents');
  assert.ok(!byId.has('batch-verifier') && !Object.values(MODES).some(M => M.verify.includes('low')), 'lows are checked by proofcheck against real code, never by a ~45k-token agent');
  assert.ok(LIM.pool >= 1 && LIM.pool <= 8, 'pool above 8 risks the gateway stall that once killed 9 reviewers; raise it only from runs.md data');
  assert.ok(['reviewer', 'test-auditor', 'integration-probe'].every(id => byId.get(id).needs.includes('probes')), 'agents start from the probe facts, never before them');
  assert.deepEqual(NODES.filter(n => n.model === 'opus').map(n => n.id), ['adjudicator', 'critic'], 'opus only on the two gated judges');
  assert.deepEqual(byId.get('verifier-reproduce').needs, ['dedupe'], 'reproduce runs beside refute, not after it');
  assert.ok(NODES.filter(n => /^(verifier|batch|adjudicator)/.test(n.id)).every(n => !n.needs.includes('reviewer')), 'a verifier never hangs off a reviewer: dedupe sits between');
  // Tiering guards (tiering.md): valid efforts, no node above 'high', tier agrees with model.
  const EFFORTS = ['low', 'medium', 'high'];
  const TIER_MODEL = { T0: 'code', T1: 'haiku', T2: 'sonnet', T3: 'opus' };
  NODES.filter(n => n.model !== 'code').forEach(n => assert.ok(EFFORTS.includes(n.effort), `${n.id} effort "${n.effort}" must be one of ${EFFORTS}`));
  Object.entries(MODES).forEach(([k, M]) => Object.entries(M.effort).forEach(([id, e]) => {
    assert.ok(byId.has(id), `mode ${k} overrides effort of unknown node "${id}"`);
    assert.ok(EFFORTS.includes(e), `mode ${k} effort for ${id} "${e}" must be one of ${EFFORTS}`);
  }));
  NODES.forEach(n => {
    assert.ok(n.tier in TIER_MODEL, `${n.id} tier "${n.tier}" must be one of ${Object.keys(TIER_MODEL)}`);
    assert.equal(TIER_MODEL[n.tier], n.model, `${n.id}: tier ${n.tier} requires model ${TIER_MODEL[n.tier]}, got ${n.model}`);
  });
  assert.equal(plan('standard', 4, 0, 0, 5, 33).total, 9, 'measured 14-file diff: 4 reviewers + 5 refuters; its 33 lows no longer cost 5 batch agents');
  TARGETS.forEach(t => assert.equal(current(t), block(t), `${t.file} block is stale - run: node graph.mjs --write`));
  assert.ok(Buffer.byteLength(read(TARGETS[0])) <= 16000, 'SKILL.md is over 16 KB: move long text into checklist.md');
  const cp = criticalPath();
  console.log(`ok - ${NODES.length} nodes, ${l.length} layers, embedded blocks current`);
  console.log(`critical path (${cp.length} hops): ${cp.join(' -> ')}`);
  l.forEach((layer, i) => console.log(`  layer ${i + 1}: ${layer.join(', ')}`));
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === '--check') check();
else if (cmd === '--write') { TARGETS.forEach(t => writeFileSync(join(HERE, t.file), read(t).replace(current(t), () => block(t)))); console.log('SKILL.md diagram and workflow.js node table updated'); }
else if (cmd === '--mermaid') console.log(mermaid());
else if (cmd === '--plan' && MODES[a[0]] && a.length === 6) {
  const { counts, total } = plan(a[0], ...a.slice(1).map(Number));
  console.log(`plan ${a[0]}: ${a[1]} group(s), ${a[2]} critical, ${a[3]} high, ${a[4]} medium, ${a[5]} low`);
  Object.entries(counts).filter(([, n]) => n).forEach(([id, n]) => console.log(`  ${id.padEnd(19)} ${n}`));
  console.log(`  total ${total} agents (before: 95); adjudicator +1 per verifier split, integration-probe only if 13/18/21 fired`);
} else console.log('usage: node graph.mjs --check | --write | --mermaid | --plan <quick|standard|deep> <groups> <critical> <high> <medium> <low>');
