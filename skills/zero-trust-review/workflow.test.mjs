// Offline check for workflow.js: canned agents, no real agent, no git. Run after editing workflow.js or graph.mjs: node workflow.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const grp = (id, files, points, agentType = 'python-reviewer') => ({ id, label: id, files, lines: 100, points, agentType });
const BASE = {
  base: 'origin/main', head: 'a'.repeat(40), repo: '/repo', scratch: '/scratch', skillDir: HERE, facts: 'drift: none', mode: 'standard', points: { always: [1], fired: [13, 18], skipped: [9] },
  groups: [grp('src', ['superset/a.py'], [1, 4, 13]), grp('tests', ['tests/test_a.py'], [2, 3]), grp('frontend', ['web/x.tsx'], [2, 24], 'typescript-reviewer'), grp('docs', ['UPDATING.md'], [1, 27])],
};
const F = (title, severity, file, s, e) => ({ title, points: [13], severity, file, startLine: s, endLine: e, hazard: 'h ' + title, failureScenario: 's', evidence: 'e', verifiedBy: 'read', anchorable: true });
const REV = (...findings) => ({ findings, notApplicable: [], questions: [] });
const V = (real, severity = 'high') => ({ real, severity, inScope: true, reasoning: real });
const lows = n => Array.from({ length: n }, (_, i) => F(`minor thing ${i} variant${i}`, 'low', 'superset/a.py', 100 + i * 20, 101 + i * 20));
const batch = (l, p) => (l.startsWith('batch:') ? { verdicts: [...p.matchAll(/^(C\d+) /gm)].map(m => ({ id: m[1], ...V('yes', 'low') })) } : undefined);

async function play(args, respond) {
  const calls = [], logs = [], unexpected = [];
  const agent = async (prompt, o) => { calls.push({ prompt, o }); const r = respond(o.label, prompt); if (r === undefined) unexpected.push(o.label); return r; };
  const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
  const out = await wf(agent, parallel, null, () => {}, m => logs.push(m), { ...BASE, ...args }, {});
  assert.deepEqual(unexpected, [], 'agent called with no canned answer');
  return { out, calls, logs, n: out.stats && out.stats.agentsByNode };
}

// 1 plan mode spawns nothing and keeps every reviewer prompt under 4 KB
let r = await play({ mode: 'plan', as: 'standard' }, () => null);
assert.equal(r.calls.length, 0);
assert.ok(r.out.units.every(u => u.promptChars < 4096), 'reviewer prompt over 4 KB');
assert.deepEqual([r.out.plan.counts.reviewer, r.out.plan.total], [4, 15]);   // 4 groups + assumed mix 0/1/5/30

// 2 standard: dedupe, split -> adjudicator, medium escalation, 2 batches of lows, null group, nit never verified, no checklist in prompts
const canned = {
  src: REV(F('Estimator bypass on deep values', 'high', 'superset/a.py', 10, 12), F('Estimator bypass for deeply nested values', 'medium', 'superset/a.py', 11, 12), F('Cursor never closed', 'medium', 'superset/b.py', 5, 6), ...lows(9), F('style', 'nit', 'superset/a.py', 1, 1)),
  tests: REV(), docs: REV(), frontend: null, 'refute:C1': V('no', 'none'), 'reproduce:C1': V('yes'), 'adjudicator:C1': V('yes'), 'refute:C2': V('partial', 'medium'), 'reproduce:C2': V('yes', 'medium'),
}
r = await play({}, (l, p) => (l in canned ? canned[l] : batch(l, p)));
assert.deepEqual(r.n, { reviewer: 4, 'verifier-refute': 2, 'verifier-reproduce': 2, adjudicator: 1, 'batch-verifier': 2 });
assert.ok(/^frontend/.test(r.out.notReviewed[0]) && r.out.notReviewed.length === 1 && r.out.clusters.length === 12);
assert.equal(r.out.clusters.find(c => c.id === 'C1').status, 'confirmed');
assert.equal(r.out.clusters.find(c => c.severity === 'nit').status, 'unverified-nit');
assert.ok(r.calls.every(c => !/IDOR|Trigger:/.test(c.prompt)), 'checklist text leaked into a prompt');

// 3 quick: one merged reviewer, only critical/high verified
r = await play({ mode: 'quick' }, l => (l === 'all' ? REV(F('Critical leak', 'critical', 'a.py', 1, 2), F('Medium risk', 'medium', 'b.py', 1, 2)) : V('yes', 'critical')));
assert.deepEqual(r.n, { reviewer: 1, 'verifier-refute': 1, 'verifier-reproduce': 1 });
assert.equal(r.out.clusters[1].status, 'unverified');

// 4 early exit: only lows -> one batch, no refute/reproduce
r = await play({}, (l, p) => (l === 'src' ? REV(F('tiny', 'low', 'a.py', 1, 1)) : /^(tests|docs|frontend)$/.test(l) ? REV() : { verdicts: [{ id: 'C1', ...V('no', 'none') }] }));
assert.deepEqual(r.n, { reviewer: 4, 'batch-verifier': 1 });
assert.ok(r.logs.some(m => /EARLY EXIT/.test(m)));

// 5 deep: audits, opus critic, gap reviewers capped at 3, reviewer effort high
r = await play({ mode: 'deep' }, l => (l === 'critic' ? { gaps: [1, 2, 3, 4].map(i => ({ point: i, why: 'g', focus: 'f' })) } : REV()));
assert.deepEqual(r.n, { reviewer: 4, 'test-auditor': 1, 'integration-probe': 1, critic: 1, 'gap-reviewer': 3 });
assert.equal(r.calls.find(c => c.o.label === 'critic').o.model, 'opus');
assert.equal(r.calls[0].o.effort, 'high');

// 6 bad args are an error, not a silent empty review
assert.ok((await play({ repo: undefined }, () => null)).out.error);
console.log('ok - workflow.js: 6 scenarios');
