#!/usr/bin/env node
// Execution graph for the paired-agent-tdd skill.
//
// This file is the SINGLE SOURCE OF TRUTH for the pipeline's shape. The mermaid
// diagram and the tiers table in SKILL.md are generated from NODES below, and
// `--check` fails if either has drifted. Edit NODES, run `node graph.mjs --write`.
//
// Two executors read this file. A Claude Code AGENT TEAM: the lead creates one
// task per node instance on the shared task list and encodes `needs` as task
// dependencies; the lead does not implement anything itself. A Workflow SCRIPT:
// the script calls agent(prompt, { model, effort, ... }) per node.

import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

//
// `model` is per-teammate and settable in both executors. `effort` is honoured
// per node only by the Workflow-script executor: agent teams inherit the lead's
// effort ("Teammates inherit the lead's effort level"), and effort is not among
// the fields applied from a subagent definition to a teammate (tools, model,
// body, skills, mcpServers). `model`/`effort`/`tier` values are starting guesses
// to be moved one node at a time from measured runs (see runs.md).
//
// `tier` is the cost tier: T1 haiku (leads, not facts), T2 sonnet (analysis and
// implementation with real runs), T3 opus (judgement over cross-cutting context).
//
// `ponytail` is the intensity each teammate's brief states. Drivers write the
// minimum change, so they run ultra. Reviewers and the integration tester are
// paid to be thorough, so they do not.
//
// `fanout` marks nodes instantiated once per unit of work rather than once per
// run: 'group' = one per independent file group, 'finding' = one per review
// finding, 'dimension' = one per review dimension.
export const NODES = [
  {
    id: 'graph-planner',
    role: 'Derive the execution graph for THIS change',
    needs: [],
    model: 'opus',
    effort: 'high',
    ponytail: 'full',
    tier: 'T3',
    gated: true,
    deliverable: 'File groups + their dependency edges, as JSON',
  },
  {
    id: 'test-auditor',
    role: 'Find and fix tests the change will make stale',
    needs: [],
    model: 'sonnet',
    effort: 'medium',
    ponytail: 'full',
    tier: 'T2',
    deliverable: 'Stale tests fixed, with a real test run proving it',
  },
  {
    id: 'red-driver',
    role: 'Write failing tests against current code',
    needs: [],
    model: 'sonnet',
    effort: 'medium',
    ponytail: 'ultra',
    tier: 'T2',
    fanout: 'group',
    deliverable: 'Failing tests: happy path, fail path, edge/collision case',
  },
  {
    id: 'red-navigator',
    role: 'Verify each test fails for the right reason',
    needs: ['red-driver'],
    model: 'sonnet',
    effort: 'high',
    ponytail: 'full',
    tier: 'T2',
    fanout: 'group',
    deliverable: 'PASS/FAIL verdict on the RED tests, with evidence',
  },
  {
    id: 'green-driver',
    role: 'Minimum implementation that passes the RED tests',
    needs: ['red-navigator'],
    model: 'sonnet',
    effort: 'medium',
    ponytail: 'ultra',
    tier: 'T2',
    fanout: 'group',
    deliverable: 'Implementation diff + passing test run',
  },
  {
    id: 'green-navigator',
    role: 'Confirm minimal, in-scope, reusing existing patterns',
    needs: ['green-driver'],
    model: 'sonnet',
    effort: 'high',
    ponytail: 'full',
    tier: 'T2',
    fanout: 'group',
    deliverable: 'PASS/FAIL verdict on the implementation, with evidence',
  },
  {
    id: 'refactor-driver',
    role: 'Clean up once green, three-strikes DRY only',
    needs: ['green-navigator'],
    model: 'sonnet',
    effort: 'medium',
    ponytail: 'ultra',
    tier: 'T2',
    fanout: 'group',
    deliverable: 'Cleanup diff (or "no changes needed") + still-green run',
  },
  {
    id: 'refactor-navigator',
    role: 'Confirm no premature abstraction, behavior unchanged',
    needs: ['refactor-driver'],
    model: 'haiku',
    effort: 'medium',
    ponytail: 'full',
    tier: 'T1',
    fanout: 'group',
    deliverable: 'PASS/FAIL verdict on the cleanup, with evidence',
  },
  {
    id: 'integration-tester',
    role: 'One real-dependency, no-mock test of the full path',
    needs: ['green-navigator'],
    model: 'sonnet',
    effort: 'high',
    ponytail: 'lite',
    tier: 'T2',
    deliverable: 'Integration test + a real run against the real dependency',
  },
  {
    id: 'reviewer',
    role: 'Review the whole diff on one assigned dimension',
    needs: ['refactor-navigator', 'integration-tester'],
    model: 'opus',
    effort: 'high',
    ponytail: 'off',
    tier: 'T3',
    fanout: 'dimension',
    deliverable: 'Findings as JSON: file, line, severity, summary, fix',
  },
  {
    id: 'fixer',
    role: 'Fix exactly one review finding',
    needs: ['reviewer'],
    model: 'sonnet',
    effort: 'medium',
    ponytail: 'full',
    tier: 'T2',
    fanout: 'finding',
    deliverable: 'Fix diff + a real run of the relevant tests',
  },
];

// Deterministic facts the LEAD gathers with one command and injects verbatim
// into a teammate's brief. A teammate must never be asked to re-derive these,
// and must never be trusted to self-report them: "use plain code, not an agent,
// for anything deterministic."
export const LEAD_GATHERED = [
  { fact: 'scope fence check', command: 'git diff --stat' },
  { fact: 'full suite result', command: "the project's test command" },
  { fact: 'lint result', command: 'pre-commit run (staged files only)' },
];

const byId = new Map(NODES.map(n => [n.id, n]));

const FANOUT = { group: 'per group', finding: 'per finding', dimension: 'per dimension' };
const EFFORT_RANK = { low: 0, medium: 1, high: 2 };
const MODEL_RANK = { haiku: 0, sonnet: 1, opus: 2 };
const TIER_MODEL = { T1: 'haiku', T2: 'sonnet', T3: 'opus' };
const OPUS_NODES = ['graph-planner', 'reviewer'];
// The one declared R2 exception: the T3 reviewer re-reads the whole diff after it.
const R2_EXCEPTIONS = ['refactor-navigator'];

/** Nodes grouped into dependency layers. Everything in a layer runs at once. */
export function layers() {
  const remaining = new Set(NODES.map(n => n.id));
  const done = new Set();
  const out = [];
  while (remaining.size) {
    const ready = [...remaining].filter(id =>
      byId.get(id).needs.every(d => done.has(d)),
    );
    if (!ready.length) throw new Error(`cycle among: ${[...remaining]}`);
    out.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      done.add(id);
    }
  }
  return out;
}

/** Longest dependency chain — the run's wall-clock floor, in node hops. */
export function criticalPath() {
  const depth = new Map();
  const walk = id => {
    if (depth.has(id)) return depth.get(id);
    const needs = byId.get(id).needs;
    const d = needs.length ? 1 + Math.max(...needs.map(walk)) : 1;
    depth.set(id, d);
    return d;
  };
  const chain = [];
  let cur = NODES.map(n => n.id).reduce((a, b) => (walk(a) >= walk(b) ? a : b));
  while (cur) {
    chain.unshift(cur);
    const needs = byId.get(cur).needs;
    cur = needs.length
      ? needs.reduce((a, b) => (walk(a) >= walk(b) ? a : b))
      : null;
  }
  return chain;
}

export function mermaid() {
  const lines = ['graph TD'];
  for (const n of NODES) {
    const tags = [`${n.model}/${n.effort}`];
    if (n.fanout) tags.push(FANOUT[n.fanout]);
    if (n.gated) tags.push('gated');
    lines.push(`  ${n.id}["${n.id}<br/><i>${tags.join(' · ')}</i>"]`);
  }
  for (const n of NODES) {
    for (const d of n.needs) lines.push(`  ${d} --> ${n.id}`);
  }
  return lines.join('\n');
}

export function tiersTable() {
  const rows = NODES.map(n => {
    const gate = [n.fanout && FANOUT[n.fanout], n.gated && 'gated'].filter(Boolean);
    return `| ${n.id} | ${n.tier} | ${n.model} | ${n.effort} | ${n.ponytail} | ${gate.join(', ') || '-'} |`;
  });
  return [
    '| node | tier | model | effort | ponytail | gate/fanout |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, 'SKILL.md');

// Each generated block in SKILL.md: marker name + body renderer.
const TARGETS = [
  { name: 'graph', body: () => `\`\`\`mermaid\n${mermaid()}\n\`\`\`` },
  { name: 'tiers', body: tiersTable },
];

const markers = t => [`<!-- GENERATED:${t.name} -->`, `<!-- /GENERATED:${t.name} -->`];
const block = t => `${markers(t)[0]}\n\n${t.body()}\n\n${markers(t)[1]}`;

function embedded(md, t) {
  const [open, close] = markers(t);
  const start = md.indexOf(open);
  const end = md.indexOf(close);
  assert.ok(start !== -1 && end !== -1, `SKILL.md is missing the ${open} block`);
  return md.slice(start, end + close.length);
}

function check() {
  // Every edge points at a node that exists.
  for (const n of NODES) {
    for (const d of n.needs) {
      assert.ok(byId.has(d), `${n.id} needs unknown node "${d}"`);
    }
  }
  // Acyclic, and every node is reachable in some layer.
  const l = layers();
  assert.equal(l.flat().length, NODES.length, 'some node never became ready');

  // The parallelism this graph exists to buy, asserted so a future edit that
  // silently re-serializes the pipeline fails here instead of in production.
  assert.ok(
    !byId.get('integration-tester').needs.includes('refactor-navigator'),
    'integration-tester must not wait on the refactor chain',
  );
  assert.ok(
    l.some(layer => layer.length > 1),
    'no layer runs anything in parallel',
  );

  // Tiering guards: a silent edit to model/effort/tier fails here.
  for (const n of NODES) {
    assert.ok(Object.hasOwn(EFFORT_RANK, n.effort), `${n.id}: effort must be low|medium|high, got "${n.effort}"`);
    assert.ok(Object.hasOwn(MODEL_RANK, n.model), `${n.id}: unknown model "${n.model}"`);
    assert.ok(Object.hasOwn(TIER_MODEL, n.tier), `${n.id}: tier must be T1|T2|T3, got "${n.tier}"`);
    assert.equal(TIER_MODEL[n.tier], n.model, `${n.id}: tier ${n.tier} implies model ${TIER_MODEL[n.tier]}, got ${n.model}`);
    assert.ok(
      n.model !== 'opus' || OPUS_NODES.includes(n.id),
      `${n.id}: opus only on ${OPUS_NODES.join(', ')}`,
    );
  }
  // R2, checker >= maker in model and effort: every navigator against its maker
  // (needs[0]) except the declared exceptions, plus integration-tester against green-driver.
  const atLeast = (checker, maker) =>
    MODEL_RANK[checker.model] >= MODEL_RANK[maker.model] &&
    EFFORT_RANK[checker.effort] >= EFFORT_RANK[maker.effort];
  const pairs = NODES.filter(n => n.id.endsWith('-navigator') && !R2_EXCEPTIONS.includes(n.id)).map(n => [n, byId.get(n.needs[0])]);
  pairs.push([byId.get('integration-tester'), byId.get('green-driver')]);
  for (const [checker, maker] of pairs) {
    assert.ok(maker, `${checker.id}: maker node not found`);
    assert.ok(atLeast(checker, maker), `${checker.id} must be >= ${maker.id} in model and effort (checker >= maker)`);
  }

  // Generated blocks in SKILL.md match this file.
  const md = readFileSync(SKILL, 'utf8');
  for (const t of TARGETS) {
    assert.equal(embedded(md, t), block(t), `SKILL.md ${t.name} block is stale — run --write`);
  }

  const cp = criticalPath();
  console.log(`ok — ${NODES.length} nodes, ${l.length} layers`);
  console.log(`critical path (${cp.length} hops): ${cp.join(' -> ')}`);
  for (const [i, layer] of l.entries()) {
    console.log(`  layer ${i + 1}: ${layer.join(', ')}`);
  }
}

function write() {
  let md = readFileSync(SKILL, 'utf8');
  for (const t of TARGETS) md = md.replace(embedded(md, t), () => block(t));
  writeFileSync(SKILL, md);
  console.log('SKILL.md generated blocks updated');
}

const arg = process.argv[2];
if (arg === '--check') check();
else if (arg === '--write') write();
else if (arg === '--mermaid') console.log(mermaid());
else console.log('usage: node graph.mjs --check | --write | --mermaid');
