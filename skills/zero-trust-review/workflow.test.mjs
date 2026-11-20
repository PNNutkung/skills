// Offline check for workflow.js: canned agents, no real agent, no git. Run after editing workflow.js or graph.mjs: node workflow.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'workflow.js'), 'utf8');
const POOL = JSON.parse(/const LIM = (\{.*\})/.exec(SRC)[1]).pool;  // generated from graph.mjs
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', SRC.replace('export ', ''));
const grp = (id, files, points, agentType = 'python-reviewer') => ({ id, label: id, files, lines: 100, points, agentType });
const BASE = {
  base: 'origin/main', head: 'a'.repeat(40), repo: '/repo', scratch: '/scratch', runDir: '/tmp/zt-test', skillDir: HERE, facts: 'drift: none', mode: 'standard', points: { always: [1], fired: [13, 18], skipped: [9] },
  groups: [grp('src', ['superset/a.py'], [1, 4, 13]), grp('tests', ['tests/test_a.py'], [2, 3]), grp('frontend', ['web/x.tsx'], [2, 24], 'typescript-reviewer'), grp('docs', ['UPDATING.md'], [1, 27])],
};
const F = (title, severity, file, s, e) => ({ title, points: [13], severity, file, startLine: s, endLine: e, hazard: 'h ' + title, failureScenario: 's', evidence: 'e', quote: 'code of ' + title, verifiedBy: 'read', anchorable: true });
const REV = (...findings) => ({ findings, notApplicable: [], questions: [] });
const V = (real, severity = 'high', mode = 'executed') => ({ real, severity, inScope: true, reasoning: real, proof: { mode, ref: 'r1', quote: 'seen output', command: 'probe', exit: 1 } });
const lows = n => Array.from({ length: n }, (_, i) => F(`minor thing ${i} variant${i}`, 'low', 'superset/a.py', 100 + i * 20, 101 + i * 20));
// verdicts are keyed by finding title: cluster ids are content hashes, not a counter
const titleOf = p => (/FINDING \S+ \[\w+\] (.*)/.exec(p) || [])[1];
const byTitle = table => (l, p) => table[l.split(':')[0] + ':' + titleOf(p)];

// the real pipeline() semantics: each item runs its stages independently, a throwing stage drops that item to null
const pipeline = (items, ...stages) => Promise.all(items.map(async (it, i) => { try { let v = it; for (const s of stages) v = await s(v, it, i); return v; } catch { return null; } }));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const tick = ms => new Promise(r => setTimeout(r, ms));

function launch(args, respond, hold = 0) {
  const calls = [], logs = [], unexpected = [], live = { now: 0, max: 0 };
  const agent = async (prompt, o) => {
    calls.push({ prompt, o }); live.now++; live.max = Math.max(live.max, live.now);
    try { if (hold) await tick(hold); const r = await respond(o.label, prompt); if (r === undefined) unexpected.push(o.label); return r; } finally { live.now--; }
  };
  const done = wf(agent, parallel, pipeline, () => {}, m => logs.push(m), { ...BASE, ...args }, {});
  return { done, calls, logs, unexpected, live };
}
async function play(args, respond, hold) {
  const h = launch(args, respond, hold), out = await h.done;
  assert.deepEqual(h.unexpected, [], 'agent called with no canned answer');
  return { out, calls: h.calls, logs: h.logs, live: h.live, n: out.stats && out.stats.agentsByNode };
}

// 1 plan mode spawns nothing and keeps every reviewer prompt under 4.5 KB (was 4 KB; the proof/quote contract replaced a per-low verifier agent. Prompt words are ~1% of an agent's cost: fixed context is ~45k units, see runs.md)
let r = await play({ mode: 'plan', as: 'standard' }, () => null);
assert.equal(r.calls.length, 0);
assert.ok(r.out.units.every(u => u.promptChars < 4608), 'reviewer prompt over 4.5 KB');
assert.deepEqual([r.out.plan.counts.reviewer, r.out.plan.total], [4, 11]);   // 4 groups + 6 refute + 1 reproduce; lows are checked in code, no agent

// 2 standard: dedupe, split -> adjudicator, medium escalation, 2 batches of lows, null group, nit never verified, no checklist in prompts
const canned = {
  src: REV(F('Estimator bypass on deep values', 'high', 'superset/a.py', 10, 12), F('Estimator bypass for deeply nested values', 'medium', 'superset/a.py', 11, 12), F('Cursor never closed', 'medium', 'superset/b.py', 5, 6), ...lows(9), F('style', 'nit', 'superset/a.py', 1, 1)),
  tests: REV(), docs: REV(), frontend: null,
};
const verdicts = byTitle({
  'refute:Estimator bypass on deep values': V('no', 'none'), 'reproduce:Estimator bypass on deep values': V('yes'), 'adjudicator:Estimator bypass on deep values': V('yes'),
  'refute:Cursor never closed': V('partial', 'medium', 'read'), 'reproduce:Cursor never closed': V('yes', 'medium'),
});
r = await play({}, (l, p) => (l in canned ? canned[l] : verdicts(l, p)));
assert.deepEqual(r.n, { reviewer: 5, 'verifier-refute': 2, 'verifier-reproduce': 2, adjudicator: 1 });  // 4 groups + 1 retry of the null frontend unit; 9 lows get no agent
assert.ok(r.out.clusters.filter(c => c.severity === 'low').every(c => c.status === 'pending-code-check' && c.quote), 'lows wait for proofcheck with their quote');
assert.ok(/^frontend/.test(r.out.notReviewed[0]) && r.out.notReviewed.length === 1 && r.out.clusters.length === 12);
const top = r.out.clusters.find(c => c.title === 'Estimator bypass on deep values');
assert.equal(top.status, 'confirmed');
assert.equal(top.evidence, 'executed');
assert.ok(/^C-[0-9a-z]+$/.test(top.id), 'cluster ids are content hashes');
assert.equal(r.out.clusters.find(c => c.severity === 'nit').status, 'unverified-nit');
assert.ok(r.calls.every(c => !/IDOR|Trigger:/.test(c.prompt)), 'checklist text leaked into a prompt');

// 3 quick: one merged reviewer, only critical/high verified
r = await play({ mode: 'quick' }, (l, p) => (l === 'all' ? REV(F('Critical leak', 'critical', 'a.py', 1, 2), F('Medium risk', 'medium', 'b.py', 1, 2)) : V('yes', 'critical')));
assert.deepEqual(r.n, { reviewer: 1, 'verifier-refute': 1, 'verifier-reproduce': 1 });
assert.equal(r.out.clusters.find(c => c.title === 'Medium risk').status, 'unverified');

// 4 early exit: only lows -> no verifier agent at all, the lows go to proofcheck
r = await play({}, l => (l === 'src' ? REV(F('tiny', 'low', 'a.py', 1, 1)) : REV()));
assert.deepEqual(r.n, { reviewer: 4 });
assert.ok(r.logs.some(m => /EARLY EXIT/.test(m)));
assert.equal(r.out.clusters[0].status, 'pending-code-check');

// 5 deep: audits, opus critic, gap reviewers capped at 3, reviewer effort high
r = await play({ mode: 'deep' }, l => (l === 'critic' ? { gaps: [1, 2, 3, 4].map(i => ({ point: i, why: 'g', focus: 'f' })) } : REV()));
assert.deepEqual(r.n, { reviewer: 4, 'test-auditor': 1, 'integration-probe': 1, critic: 1, 'gap-reviewer': 3 });
assert.equal(r.calls.find(c => c.o.label === 'critic').o.model, 'opus');
assert.equal(r.calls[0].o.effort, 'high');

// 6 bad args are an error, not a silent empty review
assert.ok((await play({ repo: undefined }, () => null)).out.error);

// 7 rolling pool: never more than POOL agents in flight, and the pool really fills (no 3-wide waves)
const MANY = Array.from({ length: 12 }, (_, i) => grp('g' + i, ['f' + i + '.py'], [1]));
r = await play({ groups: MANY }, () => REV(), 5);
assert.ok(r.live.max <= POOL, 'in flight ' + r.live.max + ' > pool ' + POOL);
assert.equal(r.live.max, POOL, 'pool never filled');

// 8 no barrier: a finding from a fast group is verified while a slow reviewer is still running
let release;
const slow = new Promise(res => { release = res; });
const h8 = launch({ groups: [grp('slow', ['s.py'], [1]), grp('fast', ['f.py'], [1])] }, async (l, p) => {
  if (l === 'slow') { await slow; return REV(); }
  if (l === 'fast') return REV(F('Leak in fast path', 'high', 'f.py', 3, 4));
  return V('yes');
});
await tick(40);
assert.ok(h8.calls.some(c => /^(refute|reproduce):/.test(c.o.label)), 'verification waited for the slow reviewer');
release();
const o8 = await h8.done;
assert.equal(o8.clusters[0].status, 'confirmed');

// 9 evidence class: a critical/high needs a proof that can be checked (ran, read, or real telemetry); a guess is `unproven`
const probe = mode => byTitle({ 'refute:Race in cache fill': V('yes', 'critical', mode), 'reproduce:Race in cache fill': V('yes', 'critical', mode) });
const one = REV(F('Race in cache fill', 'critical', 'superset/a.py', 5, 9));
const status = async mode => (await play({ groups: [BASE.groups[0]] }, (l, p) => (l === 'src' ? one : probe(mode)(l, p)))).out.clusters[0];
assert.deepEqual([await status('executed'), await status('read'), await status('log'), await status('metric'), await status('trace'), await status('inferred')].map(c => [c.status, c.evidence]),
  [['confirmed', 'executed'], ['confirmed', 'read'], ['confirmed', 'log'], ['confirmed', 'metric'], ['confirmed', 'trace'], ['unproven', 'inferred']]);
const none = await play({ groups: [BASE.groups[0]] }, (l, p) => (l === 'src' ? one : { real: 'yes', severity: 'critical', inScope: true, reasoning: 'x' }));
assert.equal(none.out.clusters[0].status, 'unproven', 'a verdict with no proof is a guess');
const proofed = (await status('read')).proof;
assert.deepEqual([proofed.mode, proofed.ref, proofed.quote], ['read', 'r1', 'seen output'], 'ref and quote travel to proofcheck');

// 10 repo code only runs through the sandbox runner; GNU timeout is not assumed
r = await play({}, (l, p) => (l in canned ? canned[l] : verdicts(l, p)));
const sandboxed = r.calls.filter(c => /sandbox-run\.mjs/.test(c.prompt));
assert.equal(sandboxed.length, r.calls.length, 'every agent prompt carries the sandbox rule');
assert.ok(r.calls.every(c => !/timeout 120/.test(c.prompt) || /sandbox-run\.mjs[^\n]*--timeout 120/.test(c.prompt)), 'bare `timeout 120` prefix is back');
assert.ok(r.calls.every(c => /exit 86/.test(c.prompt)), 'agents must be told what exit 86 means');

// 11 cluster ids and the cluster set do not depend on completion order (resume caching keys on prompts)
const idsOf = async hold => (await play({}, (l, p) => (l in canned ? canned[l] : verdicts(l, p)), hold)).out.clusters.map(c => c.id).sort();
assert.deepEqual(await idsOf(0), await idsOf(3));

// 12 an agent that throws is a logged NOT REVIEWED unit, never a silent gap
r = await play({}, (l, p) => { if (l === 'docs') throw new Error('gateway stall'); return l in canned ? canned[l] : verdicts(l, p); });
assert.ok(r.out.notReviewed.some(x => /^docs/.test(x)) && r.logs.some(m => /docs/.test(m) && /gateway stall|error/i.test(m)));
// 13 shared run folder through note.mjs (no interpreter needed): drivers get env + notes, navigators env only (independence), all labelled untrusted
r = await play({}, (l, p) => (l in canned ? canned[l] : verdicts(l, p)));
const rev = r.calls.filter(c => ['src', 'tests', 'docs', 'frontend'].includes(c.o.label)), nav = r.calls.filter(c => /^(refute|reproduce|adjudicator):/.test(c.o.label));
assert.ok(rev.length && nav.length);
assert.ok(rev.every(c => /note\.mjs begin --unit \S+ --ck \/tmp\/zt-test\/ck\/\S+ --driver/.test(c.prompt) && /note\.mjs dying/.test(c.prompt) && /note\.mjs done/.test(c.prompt) && /note\.mjs notes/.test(c.prompt) && /untrusted/i.test(c.prompt)), 'driver prompt misses a run-folder rule');
assert.ok(r.calls.every(c => !/python3? .*<<|heredoc/.test(c.prompt)), 'no interpreter heredoc: the guard hook denies bare interpreters');
assert.ok(nav.every(c => /note\.mjs env/.test(c.prompt) && !/note\.mjs notes|--driver|notes\.jsonl/.test(c.prompt)), 'navigators must not read driver notes');

// 14 a dead agent is retried once with a pointer to its checkpoint and dying note; a second failure is a postmortem, not a silent gap
let docsCalls = 0;
r = await play({}, (l, p) => { if (l === 'docs' && ++docsCalls === 1) return null; return l in canned ? canned[l] : verdicts(l, p); });
const docs = r.calls.filter(c => c.o.label === 'docs');
assert.equal(docs.length, 2);
assert.ok(/RETRY 2\/2/.test(docs[1].prompt) && /dying\/docs\.md/.test(docs[1].prompt) && !/RETRY/.test(docs[0].prompt));
assert.equal(r.n.reviewer, 6);  // src + tests + docs twice + the always-null frontend twice
assert.deepEqual(r.out.notReviewed.filter(x => /^docs/.test(x)), []);
assert.ok(r.logs.some(m => /RETRY/.test(m) && /docs/.test(m)));
r = await play({}, (l, p) => (l === 'docs' ? null : l in canned ? canned[l] : verdicts(l, p)));
assert.ok(r.out.notReviewed.some(x => /^docs/.test(x)));
assert.deepEqual(r.out.run.failed.filter(f => f.id === 'docs').map(f => f.attempts), [2]);
assert.ok(/docs/.test(r.out.postmortemMd) && /DO\b/.test(r.out.postmortemMd) && /DON'T/.test(r.out.postmortemMd), 'postmortem needs do/dont advice for the next agent');

// 15 board: status table the lead writes to the run folder
assert.ok(/\| docs \|[^\n]*failed/.test(r.out.boardMd) && /\| src \|[^\n]*done/.test(r.out.boardMd) && /status\.jsonl/.test(r.out.boardMd));
assert.equal(r.out.run.dir, '/tmp/zt-test');
// 16 one diff file per group instead of many git calls; findings must quote the real code so proofcheck can verify them
r = await play({ groups: [{ ...BASE.groups[0], diff: '/tmp/zt-test/diff/src.patch' }, BASE.groups[1]] }, (l, p) => (l in canned ? canned[l] : verdicts(l, p)));
const withDiff = r.calls.find(c => c.o.label === 'src'), without = r.calls.find(c => c.o.label === 'tests');
assert.ok(/Read \/tmp\/zt-test\/diff\/src\.patch first/.test(withDiff.prompt) && !/diff\/src\.patch/.test(without.prompt));
assert.ok(r.calls.filter(c => c.o.label === 'src' || c.o.label === 'tests').every(c => /quote/.test(c.prompt) && /verbatim/.test(c.prompt)), 'reviewers must quote real code');

// 17 navigators know the proof modes and are pointed at real telemetry (logs, metrics, traces) for runtime claims, never at guessing
const navP = r.calls.find(c => /^reproduce:/.test(c.o.label)).prompt;
assert.ok(/executed\|read\|log\|metric\|trace/.test(navP) && /logs?, metrics?/i.test(navP) && /inferred/.test(navP) && /UNVERIFIABLE|unverifiable/.test(navP));
// 18 policy: the REVIEWER writes a suggestion (`replacement` = the exact new text of startLine..endLine) and the lead only wraps it; kept only for an anchorable finding
// whose fix no navigator changed, and only when short
const sug = (title, s, extra = {}, sev = 'low') => ({ ...F(title, sev, 'superset/a.py', s, s + 1), replacement: 'x = 1\ny = 2', ...extra });
const betterFix = byTitle({ 'refute:fix changed by navigator': { ...V('yes', 'medium', 'read'), betterFix: 'a different fix' }, 'reproduce:fix changed by navigator': V('yes', 'medium', 'read') });
r = await play({ groups: [grp('src', ['superset/a.py'], [1, 4, 13])] }, (l, p) => (l === 'src'
  ? REV(sug('mechanical tidy', 10), sug('replacement far too long', 200, { replacement: 'z = 1\n'.repeat(500) }), sug('no anchor for this one', 400, { anchorable: false }), sug('fix changed by navigator', 600, {}, 'medium'))
  : betterFix(l, p)));
const sugOf = t => r.out.clusters.find(c => c.title === t);
assert.equal(sugOf('mechanical tidy').replacement, 'x = 1\ny = 2');
for (const t of ['replacement far too long', 'no anchor for this one', 'fix changed by navigator']) assert.equal(sugOf(t).replacement, undefined, t + ': no block without an applyable, unchanged fix');
assert.ok(/replacement/.test(r.calls.find(c => c.o.label === 'src').prompt) && /exact new text/.test(r.calls.find(c => c.o.label === 'src').prompt), 'reviewers are told when and how to write it');
assert.ok(r.calls.every(c => c.prompt.length < 4608), 'prompt budget');

// 19 fast plan: one refuter per group that can hold a medium+ (never more than one per cluster), reproducers unchanged, no critic, gap reviewers or audits; standard unchanged
const planOf = async (as, expect) => (await play({ mode: 'plan', as, expect }, () => null)).out.plan;
let pl = await planOf('fast');  // default mix: 0 critical, 1 high, 5 medium, 30 low over 4 groups
assert.deepEqual([pl.counts.reviewer, pl.counts['verifier-refute'], pl.counts['verifier-reproduce'], pl.total], [4, 4, 1, 9]);
assert.deepEqual(['test-auditor', 'integration-probe', 'critic', 'gap-reviewer', 'adjudicator'].map(k => pl.counts[k]), [0, 0, 0, 0, 0]);
pl = await planOf('fast', { critical: 2, high: 3, medium: 20, low: 5 });
assert.deepEqual([pl.counts['verifier-refute'], pl.counts['verifier-reproduce']], [4, 5], 'refuters capped by the 4 groups, reproducers still one per critical/high');
assert.equal((await planOf('fast', { critical: 0, high: 0, medium: 2, low: 9 })).counts['verifier-refute'], 2, 'never more refuters than medium+ clusters');
assert.equal((await planOf('fast', { critical: 0, high: 0, medium: 0, low: 9 })).total, 4, 'only lows: the 4 reviewers and nothing else');
assert.equal((await planOf('standard', { critical: 2, high: 3, medium: 20, low: 5 })).counts['verifier-refute'], 25, 'standard keeps one refuter per cluster');

// 20 fast run: ONE refuter per reviewer unit that has a medium+ cluster (its prompt carries every cluster id of that unit and none of another unit's);
// reproducers per critical/high, and per medium the refuter calls partial/unverifiable or skipped; the adjudicator on a split; no audits, critic or gap reviewers
const FG = [grp('src', ['superset/a.py'], [1, 4, 13]), grp('tests-1', ['tests/test_a.py'], [2, 3]), grp('docs', ['UPDATING.md'], [1, 27])];
const fastCanned = {
  src: REV(F('Race in cache fill', 'high', 'superset/a.py', 10, 12), F('Cursor never closed', 'medium', 'superset/b.py', 5, 6), F('Pool never drained', 'medium', 'superset/c.py', 7, 8), ...lows(3)),
  'tests-1': REV(F('Weak assert on retry', 'medium', 'tests/test_a.py', 20, 21), F('Flaky sleep in test', 'medium', 'tests/test_b.py', 30, 31)),
  docs: REV(),
};
const batchTable = { 'Race in cache fill': V('no', 'none'), 'Cursor never closed': V('yes', 'medium', 'read'), 'Pool never drained': V('partial', 'medium', 'read'), 'Weak assert on retry': V('yes', 'medium', 'read') };  // no entry for 'Flaky sleep in test': the agent skipped it
const batchAnswer = p => ({ verdicts: [...p.matchAll(/FINDING (\S+) \[\w+\] (.*)/g)].filter(m => batchTable[m[2]]).map(m => ({ id: m[1], ...batchTable[m[2]] })) });
const navVerdicts = byTitle({
  'reproduce:Race in cache fill': V('yes'), 'adjudicator:Race in cache fill': V('yes'), 'reproduce:Pool never drained': V('yes', 'medium'), 'reproduce:Flaky sleep in test': V('no', 'none', 'read'), 'reproduce:Cursor never closed': V('yes', 'medium', 'read'),
  'refute:Race in cache fill': V('no', 'none'), 'refute:Cursor never closed': V('yes', 'medium', 'read'), 'refute:Pool never drained': V('partial', 'medium', 'read'), 'refute:Weak assert on retry': V('yes', 'medium', 'read'), 'refute:Flaky sleep in test': V('yes', 'medium', 'read'),
});
const respondFast = (l, p) => (l in fastCanned ? fastCanned[l] : /^refute:batch-/.test(l) ? batchAnswer(p) : navVerdicts(l, p));
r = await play({ mode: 'fast', groups: FG }, respondFast);
assert.deepEqual(r.n, { reviewer: 3, 'verifier-refute': 2, 'verifier-reproduce': 3, adjudicator: 1 });  // 2 batch refuters (src, tests-1), not 5; reproducers: the high, the partial, the skipped one
const batches = r.calls.filter(c => /^refute:batch-/.test(c.o.label)), idOfTitle = t => r.out.clusters.find(c => c.title === t).id;
assert.deepEqual(batches.map(c => c.o.label).sort(), ['refute:batch-src', 'refute:batch-tests-1']);
assert.ok(!r.calls.some(c => /^refute:(?!batch-)/.test(c.o.label)), 'no refuter of its own per cluster in fast mode');
const mine = (b, ts) => ts.every(t => b.prompt.includes('FINDING ' + idOfTitle(t) + ' [')) && (b.prompt.match(/FINDING \S+ \[/g) || []).length === ts.length;
assert.ok(mine(batches.find(c => c.o.label === 'refute:batch-src'), ['Race in cache fill', 'Cursor never closed', 'Pool never drained']), 'src batch: every src cluster and no other');
assert.ok(mine(batches.find(c => c.o.label === 'refute:batch-tests-1'), ['Weak assert on retry', 'Flaky sleep in test']), 'tests batch: every tests cluster and no other');
assert.ok(batches.every(c => /independently verify EACH/i.test(c.prompt) && /LENS refute/.test(c.prompt) && /note\.mjs env/.test(c.prompt) && !/note\.mjs notes|--driver|notes\.jsonl|note\.mjs begin/.test(c.prompt) && /sandbox-run\.mjs/.test(c.prompt) && /exit 86/.test(c.prompt)), 'batch refuter: same lens, run-folder rules and sandbox rule as a single refuter; no driver notes');
assert.ok(!r.calls.some(c => ['test-auditor', 'integration-probe', 'critic'].includes(c.o.label) || /^GAP/.test(c.o.label)), 'fast skips audits, critic and gap reviewers');
const stat = t => r.out.clusters.find(c => c.title === t);
assert.deepEqual(['Race in cache fill', 'Cursor never closed', 'Pool never drained', 'Weak assert on retry', 'Flaky sleep in test'].map(t => stat(t).status), ['confirmed', 'confirmed', 'confirmed', 'confirmed', 'refuted']);
assert.deepEqual(stat('Race in cache fill').verdicts.map(v => v.by), ['refute', 'reproduce', 'adjudicator'], 'a refute/reproduce split still reaches the adjudicator');
assert.deepEqual(stat('Flaky sleep in test').verdicts.map(v => v.by), ['refute', 'reproduce'], 'a cluster the batch skipped counts as a null refute and gets a reproducer');
assert.equal(stat('Flaky sleep in test').verdicts[0].real, 'unverifiable');
assert.equal(r.out.stats.pool, 8);
const std =await play({ groups: FG }, respondFast);
assert.equal(std.n['verifier-refute'], 5, 'same findings in standard: one refuter per cluster');
// batched prompts are deterministic whatever the completion order (the resume cache keys on prompt bytes)
const batchPrompts = async hold => (await play({ mode: 'fast', groups: FG }, respondFast, hold)).calls.filter(c => /^refute:batch-/.test(c.o.label)).map(c => c.prompt).sort();
assert.deepEqual(await batchPrompts(0), await batchPrompts(3));

// 21 a dead batch agent is retried once; if it stays dead its clusters are unverified by refute, never "no issues": reproducers still run and the failure is a postmortem entry
r = await play({ mode: 'fast', groups: [FG[0]] }, (l, p) => (/^refute:batch-/.test(l) ? null : respondFast(l, p)));
assert.deepEqual(r.n, { reviewer: 1, 'verifier-refute': 2, 'verifier-reproduce': 3 });  // refuter: attempt + retry; the high plus both mediums fall back to a reproducer
assert.deepEqual(r.out.run.failed.map(f => [f.id, f.attempts]), [['refute:batch-src', 2]]);
assert.ok(r.out.clusters.filter(c => /^(Race|Cursor|Pool)/.test(c.title)).every(c => c.status !== 'refuted' && c.verdicts[0].real === 'unverifiable'));

// 22 a unit with more than 8 medium+ clusters splits into chunks of 8, each with its own tool cap
const NINE = Array.from({ length: 9 }, (_, i) => F('Unbounded read number ' + i, 'medium', 'superset/m' + i + '.py', 5, 6));
r = await play({ mode: 'fast', groups: [FG[0]] }, (l, p) => (l === 'src' ? REV(...NINE) : /^refute:batch-/.test(l) ? { verdicts: [...p.matchAll(/FINDING (\S+) \[/g)].map(m => ({ id: m[1], ...V('yes', 'medium', 'read') })) } : null));
const chunks = r.calls.filter(c => /^refute:batch-/.test(c.o.label)).sort((a, b) => a.o.label.localeCompare(b.o.label));
assert.deepEqual(chunks.map(c => [c.o.label, (c.prompt.match(/FINDING \S+ \[/g) || []).length]), [['refute:batch-src', 8], ['refute:batch-src-2', 1]]);
assert.ok(/At most 45 tool calls/.test(chunks[0].prompt) && /At most 16 tool calls/.test(chunks[1].prompt), 'cap = min(45, 10 + 6 per cluster)');
assert.ok(r.out.clusters.every(c => c.status === 'confirmed') && r.n['verifier-reproduce'] === undefined, 'every chunk verdict reaches its cluster');

// 23 fast pool is 8, the others stay at 6: the pool fills to its own size and never beyond it
const MANY8 = Array.from({ length: 14 }, (_, i) => grp('g' + i, ['f' + i + '.py'], [1]));
r = await play({ mode: 'fast', groups: MANY8 }, () => REV(), 5);
assert.equal(r.live.max, 8, 'fast pool never filled to 8 (or went past it)');
assert.equal(r.out.stats.pool, 8);
console.log('ok - workflow.js: 23 scenarios');
