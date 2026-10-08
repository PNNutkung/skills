#!/usr/bin/env node
// Execution graph of paired-agent-tdd: the SINGLE SOURCE OF TRUTH for the pipeline's shape.
// --write regenerates the diagram and the tiers table in SKILL.md and the NODE/LIM/plan table plus checkMatrix in workflow.js (a Workflow script cannot import);
// --check fails when any of them has drifted or a guard below is broken. Edit NODES, run --write.
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMatrix } from './gates.mjs';

// tier: T0 code, T2 sonnet, T3 opus (policy in tiering.md). model 'code' = plain code (tdd.mjs or the lead), no agent.
// agentType picks the agent definition: its tool list is a structural fence (navigators and the reviewer have no Edit or Write) and a smaller fixed context than
// a general-purpose agent (measured in runs.md). outside = run by the lead before the Workflow, not by workflow.js.
// fanout: group = one per file group (groups stream through RED and GREEN with no barrier between them).
// LIM: pool = agents in flight at once (one rolling pool for the whole run), retry = extra attempts for a dead or null agent, rework = bounded rework passes per stage (R4).
export const LIM = { pool: 6, retry: 1, rework: 1 };
export const NODES = [
  { id: 'graph-planner', tier: 'T3', role: 'Partition the planned files into owned groups and their order', needs: [], model: 'opus', effort: 'high', ponytail: 'full', agentType: 'planner', gated: 'only when the import structure is unknown', outside: true, deliverable: 'groups + after edges for plan.json' },
  { id: 'plan', tier: 'T0', role: 'tdd.mjs plan: validate groups, DoD and quotes, snapshot the base tree', needs: ['graph-planner'], model: 'code', deliverable: 'RUN/plan.json + Workflow args' },
  { id: 'red-driver', tier: 'T2', role: 'Driver: failing tests, one per DoD item and kind, in the group test files', needs: ['plan'], model: 'sonnet', effort: 'medium', ponytail: 'ultra', agentType: 'tdd-guide', cap: 40, fanout: 'group', deliverable: 'Test files + matrix rows (dod, kind, test, file)' },
  { id: 'red-gate', tier: 'T0', role: 'tdd.mjs red: every new test file fails now, and how (assertion, load error, passes already)', needs: ['red-driver'], model: 'code', fanout: 'group', deliverable: 'RUN/gates/G.red.json' },
  { id: 'red-navigator', tier: 'T2', role: 'Navigator: right reason, right invariant, DoD kinds really tested, precedent', needs: ['red-gate'], model: 'sonnet', effort: 'high', ponytail: 'full', agentType: 'code-reviewer', cap: 25, fanout: 'group', deliverable: 'PASS/FAIL + defects' },
  { id: 'green-driver', tier: 'T2', role: 'Driver: minimum code for the RED tests, then one cleanup only for a named duplication', needs: ['red-navigator'], model: 'sonnet', effort: 'medium', ponytail: 'ultra', agentType: 'tdd-guide', cap: 45, fanout: 'group', deliverable: 'Implementation in the group src files' },
  { id: 'green-gate', tier: 'T0', role: 'tdd.mjs green: tests pass and exercise the change, frozen since RED, in scope, mutants, coverage', needs: ['green-driver'], model: 'code', fanout: 'group', deliverable: 'RUN/gates/G.green.json' },
  { id: 'green-navigator', tier: 'T2', role: 'Navigator: minimal, reuses patterns, survivors are test gaps, no weakened tests', needs: ['green-gate'], model: 'sonnet', effort: 'high', ponytail: 'full', agentType: 'code-reviewer', cap: 25, fanout: 'group', deliverable: 'PASS/FAIL + defects' },
  { id: 'integration-tester', tier: 'T2', role: 'One real-dependency test of the full path', needs: ['green-navigator'], model: 'sonnet', effort: 'high', ponytail: 'lite', agentType: 'tdd-guide', cap: 35, gated: 'only when the change crosses a process, DB or network boundary', deliverable: 'Integration test + a real run' },
  { id: 'final-gate', tier: 'T0', role: 'tdd.mjs final: all group tests together, existing tests that mention the changed modules, scope, whole-diff patch', needs: ['green-navigator', 'integration-tester'], model: 'code', deliverable: 'RUN/gates/final.json + diff/final.patch' },
  { id: 'reviewer', tier: 'T3', role: 'Review the whole diff once: DoD, test integrity, security, reuse, stale text', needs: ['final-gate'], model: 'opus', effort: 'high', ponytail: 'off', agentType: 'code-reviewer', cap: 40, deliverable: 'Findings with a quote and a proof' },
  { id: 'fixer', tier: 'T2', role: 'Fix every finding of one group, nothing else', needs: ['reviewer'], model: 'sonnet', effort: 'medium', ponytail: 'full', agentType: 'tdd-guide', cap: 35, fanout: 'group', gated: 'only for groups with findings', deliverable: 'Fixes + a real run of the group tests' },
  { id: 'verify', tier: 'T0', role: 'tdd.mjs verify: DoD closure from the gates, fixes still present, reviewer proofs (proofcheck)', needs: ['fixer'], model: 'code', deliverable: 'dod-matrix.md + verify.json' },
];
const byId = new Map(NODES.map(n => [n.id, n]));
const SKILL_CAP = 14000;

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

/** Longest dependency chain: the wall-clock floor of one group, in node hops. */
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

/** Agents of one run: g groups, integration 0|1, findingGroups = groups that end up with review findings. Reworks (<= 2 per group and stage) are not counted. */
export function plan(g, integration, findingGroups) {
  const counts = { 'red-driver': g, 'red-navigator': g, 'green-driver': g, 'green-navigator': g, 'integration-tester': integration ? 1 : 0, reviewer: 1, fixer: findingGroups };
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
// The design this one replaced, as an ESTIMATE (not measured): auditor + 6 agents per group + integration tester + 3 dimension reviewers + one fixer per finding.
const oldTotal = (g, findings) => 1 + 6 * g + 1 + 3 + findings;

export function mermaid() {
  const tags = n => [n.model === 'code' ? 'code' : `${n.model}/${n.effort}`, n.fanout && 'per group', n.gated && 'gated'].filter(Boolean).join(' · ');
  return ['graph TD', ...NODES.map(n => `  ${n.id}["${n.id}<br/>${tags(n)}"]`), ...NODES.flatMap(n => n.needs.map(d => `  ${d} --> ${n.id}`))].join('\n');
}
export function tiersTable() {
  return ['| node | tier | model | effort | agent type | ponytail | calls | gate/fanout |', '|---|---|---|---|---|---|---|---|',
    ...NODES.filter(n => n.model !== 'code').map(n => `| ${n.id} | ${n.tier} | ${n.model} | ${n.effort} | ${n.agentType} | ${n.ponytail} | ${n.cap ?? '-'} | ${[n.fanout && 'per group', n.gated].filter(Boolean).join(', ') || '-'} |`)].join('\n');
}

const nodesJs = () => [
  'const NODE = {', ...NODES.filter(n => n.model !== 'code' && !n.outside).map(n => `  '${n.id}': ${JSON.stringify({ model: n.model, effort: n.effort, ponytail: n.ponytail, agentType: n.agentType, cap: n.cap })},`), '}',
  `const LIM = ${JSON.stringify(LIM)}`, plan.toString(),
].join('\n');
const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS = [
  { file: 'SKILL.md', open: '<!-- GENERATED:graph -->', close: '<!-- /GENERATED:graph -->', body: () => `\`\`\`mermaid\n${mermaid()}\n\`\`\`` },
  { file: 'SKILL.md', open: '<!-- GENERATED:tiers -->', close: '<!-- /GENERATED:tiers -->', body: tiersTable },
  { file: 'workflow.js', open: '// GENERATED:nodes (node graph.mjs --write)', close: '// /GENERATED:nodes', body: nodesJs },
  { file: 'workflow.js', open: '// GENERATED:matrix (node graph.mjs --write)', close: '// /GENERATED:matrix', body: () => checkMatrix.toString() },
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
  const l = layers();
  assert.equal(l.flat().length, NODES.length, 'some node never became ready');
  // Shape guards: a future edit that re-inflates or re-serializes the pipeline fails here, not in production.
  assert.ok(['plan', 'red-gate', 'green-gate', 'final-gate', 'verify'].every(id => byId.get(id).model === 'code'), 'deterministic nodes must be plain code, not agents');
  assert.ok(!NODES.some(n => /^(test-auditor|refactor-)/.test(n.id)), 'the auditor is the final gate (existing tests, run for real) and cleanup is one step of green-driver: neither is an agent again without a measured reason (runs.md)');
  assert.ok(NODES.filter(n => n.id === 'reviewer').length === 1 && !byId.get('reviewer').fanout, 'one reviewer reads the whole diff once; per-dimension reviewers each re-read it');
  assert.deepEqual(byId.get('integration-tester').needs, ['green-navigator'], 'integration-tester needs green only, never a cleanup chain');
  assert.deepEqual(byId.get('red-driver').needs, ['plan'], 'every group starts RED at once: nothing but the plan gates it');
  for (const s of ['red', 'green']) {
    assert.deepEqual(byId.get(`${s}-navigator`).needs, [`${s}-gate`], `${s}-navigator starts from the ${s} gate facts`);
    assert.deepEqual(byId.get(`${s}-gate`).needs, [`${s}-driver`], `the ${s} gate runs right after its driver`);
  }
  assert.ok(NODES.filter(n => n.fanout).every(n => n.fanout === 'group'), 'work fans out per file group only');
  assert.ok(LIM.pool >= 1 && LIM.pool <= 8, 'pool above 8 risks the gateway stall that once killed 9 reviewers; raise it only from runs.md data');
  assert.equal(LIM.rework, 1, 'R4: one rework pass and one re-check, then escalate');
  // Tiering guards (tiering.md): valid efforts, no node above high, tier agrees with model, opus only on the planner and the reviewer, checker >= maker.
  const EFFORT = { low: 0, medium: 1, high: 2 }, MODEL = { haiku: 0, sonnet: 1, opus: 2 }, TIER = { T0: 'code', T1: 'haiku', T2: 'sonnet', T3: 'opus' };
  NODES.forEach(n => {
    assert.equal(TIER[n.tier], n.model, `${n.id}: tier ${n.tier} requires model ${TIER[n.tier]}, got ${n.model}`);
    if (n.model === 'code') return;
    assert.ok(n.effort in EFFORT, `${n.id}: effort must be low|medium|high`);
    assert.ok(n.model !== 'opus' || ['graph-planner', 'reviewer'].includes(n.id), `${n.id}: opus only on graph-planner and reviewer`);
    assert.ok(n.agentType && (n.cap !== undefined || n.outside), `${n.id}: agentType and cap are required`);
  });
  const atLeast = (c, m) => MODEL[byId.get(c).model] >= MODEL[byId.get(m).model] && EFFORT[byId.get(c).effort] >= EFFORT[byId.get(m).effort];
  [['red-navigator', 'red-driver'], ['green-navigator', 'green-driver'], ['integration-tester', 'green-driver']].forEach(([c, m]) => assert.ok(atLeast(c, m), `${c} must be >= ${m} in model and effort (checker >= maker)`));
  // Structural fences: whoever judges cannot edit.
  assert.ok(['red-navigator', 'green-navigator', 'reviewer'].every(id => byId.get(id).agentType === 'code-reviewer'), 'navigators and the reviewer use the read-only agent type');
  assert.ok(['red-driver', 'green-driver', 'fixer', 'integration-tester'].every(id => byId.get(id).agentType === 'tdd-guide'), 'makers use the TDD agent type');
  assert.equal(plan(3, 0, 1).total, 14, '3 groups: 12 build agents + 1 reviewer + 1 fixer');
  TARGETS.forEach(t => assert.equal(current(t), block(t), `${t.file} block ${t.open} is stale - run: node graph.mjs --write`));
  assert.ok(Buffer.byteLength(readFileSync(join(HERE, 'SKILL.md'))) <= SKILL_CAP, `SKILL.md is over ${SKILL_CAP} bytes: move long text into briefs.md or probes.md`);
  const cp = criticalPath();
  console.log(`ok - ${NODES.length} nodes, ${l.length} layers, embedded blocks current`);
  console.log(`critical path (${cp.length} hops, ${cp.filter(id => byId.get(id).model !== 'code').length} of them agents): ${cp.join(' -> ')}`);
  l.forEach((layer, i) => console.log(`  layer ${i + 1}: ${layer.join(', ')}`));
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === '--check') check();
else if (cmd === '--write') { TARGETS.forEach(t => writeFileSync(join(HERE, t.file), read(t).replace(current(t), () => block(t)))); console.log('SKILL.md diagram and tiers, workflow.js node table and checkMatrix updated'); }
else if (cmd === '--mermaid') console.log(mermaid());
else if (cmd === '--plan' && a.length === 3) {
  const [g, integ, fg] = a.map(Number), { counts, total } = plan(g, integ, fg);
  console.log(`plan: ${g} group(s), integration ${integ}, ${fg} group(s) with findings`);
  Object.entries(counts).filter(([, n]) => n).forEach(([id, n]) => console.log(`  ${id.padEnd(19)} ${n}`));
  console.log(`  total ${total} agents (+ the graph-planner if used, + reworks); the old design is estimated at ${oldTotal(g, 4)} for the same change (NOT measured)`);
} else console.log('usage: node graph.mjs --check | --write | --mermaid | --plan <groups> <integration 0|1> <groupsWithFindings>');
