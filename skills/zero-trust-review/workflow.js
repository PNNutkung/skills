export const meta = {
  name: 'zero-trust-review',
  description: 'Tiered zero-trust review of a committed diff: reviewer per file group, plain-code dedupe, severity-tiered verification',
  whenToUse: 'Review a branch diff against the 30-point zero-trust checklist. args = triage.py JSON + {repo, sha, scratch, skillDir, ticket?, decisions?, prior?, mode?}; mode "plan" (+ "as") returns the plan without spawning agents',
  phases: [
    { title: 'Review', detail: 'reviewer per group in waves of 3 (deep adds test-auditor, integration-probe)' },
    { title: 'Verify', detail: 'refute, reproduce, batch of lows, adjudicate on a split' },
    { title: 'Critic', detail: 'deep only: completeness critic and at most 3 gap reviewers' },
  ],
}

// GENERATED:nodes (node graph.mjs --write)

const NODE = {
  'reviewer': {"model":"sonnet","effort":"medium","ponytail":"full"},
  'test-auditor': {"model":"sonnet","effort":"medium","ponytail":"lite"},
  'integration-probe': {"model":"sonnet","effort":"medium","ponytail":"lite"},
  'verifier-refute': {"model":"sonnet","effort":"medium","ponytail":"full"},
  'verifier-reproduce': {"model":"sonnet","effort":"medium","ponytail":"ultra"},
  'batch-verifier': {"model":"sonnet","effort":"low","ponytail":"ultra"},
  'adjudicator': {"model":"opus","effort":"high","ponytail":"off"},
  'critic': {"model":"opus","effort":"high","ponytail":"off"},
  'gap-reviewer': {"model":"sonnet","effort":"high","ponytail":"full"},
}
const MODES = {
  quick: {"use":"< 150 source lines and <= 5 files","merge":true,"cap":35,"verify":["critical","high"],"effort":{},"skip":["test-auditor","integration-probe","batch-verifier","critic","gap-reviewer"]},
  standard: {"use":"default","merge":false,"cap":30,"verify":["critical","high","medium","low"],"effort":{},"skip":["test-auditor","integration-probe","critic","gap-reviewer"]},
  deep: {"use":"> 1500 source lines or > 40 files, security-critical, or asked","merge":false,"cap":45,"verify":["critical","high","medium","low"],"effort":{"reviewer":"high"},"skip":[]},
}
const LIM = {"wave":3,"verifyWave":4,"batch":8,"gaps":3}
function plan(mode, g, c, h, m, l) {
  const M = MODES[mode], on = id => (M.skip.includes(id) ? 0 : 1), v = s => (M.verify.includes(s) ? 1 : 0);
  const counts = {
    reviewer: M.merge ? Math.min(g, 1) : g, 'test-auditor': on('test-auditor'), 'integration-probe': on('integration-probe'),
    'verifier-refute': v('critical') * c + v('high') * h + v('medium') * m, 'verifier-reproduce': v('critical') * c + v('high') * h,
    'batch-verifier': v('low') * Math.ceil(l / LIM.batch), adjudicator: 0, critic: on('critic'), 'gap-reviewer': on('gap-reviewer') * LIM.gaps,
  };
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// /GENERATED:nodes

// ---------------------------------------------------------------- args and helpers
const A = args || {}
const SHA = A.sha || A.head
const dry = A.mode === 'plan'
const modeName = [dry ? A.as : A.mode, 'standard'].find(m => MODES[m])
const MODE = MODES[modeName]
const G = Array.isArray(A.groups) ? A.groups : []
if (!A.repo || !SHA || !A.base || !A.scratch || !A.skillDir) return { error: 'args must be the triage.py JSON plus repo, sha, scratch, skillDir' }
if (!G.length) return { mode: modeName, counts: { units: 0 }, clusters: [], notReviewed: [], unverified: [], notes: 'empty diff: nothing to review' }

const SEVN = ['nit', 'low', 'medium', 'high', 'critical']
const SEV = Object.fromEntries(SEVN.map((s, i) => [s, i]))
const clip = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 3) + '...' : s || '')
const uniq = a => [...new Set(a)]
const h32 = s => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return h.toString(36) }
const tok = s => new Set(String(s || '').toLowerCase().match(/[a-z0-9_]{3,}/g) || [])
const jac = (a, b) => { let i = 0; a.forEach(x => { if (b.has(x)) i++ }); return a.size + b.size - i ? i / (a.size + b.size - i) : 0 }
const used = {}
const run = (node, prompt, o) => {
  used[node] = (used[node] || 0) + 1
  return agent(prompt, { model: NODE[node].model, effort: MODE.effort[node] || NODE[node].effort, ...o })
}
const CKDIR = A.scratch + '/ck/' + String(SHA).slice(0, 8) + '-' + modeName  // per sha AND mode: a deep re-run must not inherit a standard run's checkpoints
const ck = id => CKDIR + '/' + id + '.jsonl'
const FILES = G.flatMap(g => g.files)

// ---------------------------------------------------------------- schemas
const STR = { type: 'string' }
const INT = { type: 'integer' }
const FINDING = {
  type: 'object',
  properties: {
    title: STR, points: { type: 'array', items: INT }, severity: { enum: ['critical', 'high', 'medium', 'low', 'nit'] },
    file: STR, startLine: INT, endLine: INT, hazard: STR, failureScenario: STR, evidence: STR,
    verifiedBy: { enum: ['executed', 'read', 'inferred'] }, suggestedFix: STR, anchorable: { type: 'boolean' },
  },
  required: ['title', 'points', 'severity', 'file', 'startLine', 'endLine', 'hazard', 'failureScenario', 'evidence', 'verifiedBy', 'anchorable'],
}
const REVIEW = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING },
    notApplicable: { type: 'array', items: { type: 'object', properties: { point: INT, reason: STR }, required: ['point', 'reason'] } },
    questions: { type: 'array', items: { type: 'object', properties: { point: INT, file: STR, line: INT, question: STR }, required: ['question'] } },
    unverified: { type: 'array', items: STR },
    notes: STR,
  },
  required: ['findings', 'notApplicable', 'questions'],
}
const V = { real: { enum: ['yes', 'no', 'partial', 'unverifiable'] }, severity: { enum: ['critical', 'high', 'medium', 'low', 'nit', 'none'] }, inScope: { type: 'boolean' }, reasoning: STR, betterFix: STR }
const VERDICT = { type: 'object', properties: V, required: ['real', 'severity', 'inScope', 'reasoning'] }
const BATCH = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { id: STR, ...V }, required: ['id', 'real', 'severity', 'inScope', 'reasoning'] } } }, required: ['verdicts'] }
const CRITIC = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { point: INT, why: STR, focus: STR }, required: ['why', 'focus'] } }, weakClaims: { type: 'array', items: STR } }, required: ['gaps'] }

// ---------------------------------------------------------------- prompts (never embed the checklist: agents Read their points)
const H = String(SHA).slice(0, 12)
const WHERE = 'REPO ' + A.repo + '  BASE ' + A.base + '  HEAD ' + H + '  SCRATCH ' + A.scratch
const pony = lvl => (lvl === 'off' ? '' : ' PONYTAIL ' + lvl + ': shortest probes and fixes, evidence never shortened.')
const rules = (cap, tag) => 'RULES: read-only (an edit, create or delete in REPO fails the unit; no git add/commit/stash/checkout/reset/push); probes only in SCRATCH/probe-' + tag + ' from a copy (git -C REPO archive HEAD | tar -x -C there); prefix EVERY shell command with `timeout 120`; at most ' + cap + ' tool calls; Read/Grep for files, Bash only for git, tests, probes; no whole-repo lint, pre-commit --all-files, claude -p or shared docker stack; if a gate hook blocks your first Bash call, state in one sentence what it does and retry.'
const SEVERITY = 'SEVERITY: critical = OOM, data loss, security flaw or prod availability regression; high = likely bug or regression; medium = plausible risk or risky untested branch; low = minor or doc inaccuracy; nit = style. Verify before asserting (a missing test = you grepped the tests, a missing index = you read the schema); verifiedBy = executed|read|inferred; unproven items go under unverified as UNVERIFIED. A hazard in untouched code is not a finding unless this diff newly routes traffic through it. Write like a sharp principal engineer: defect first, concrete failing input, no hedges, never mention AI or automation. Strings <= 600 chars; hazard names its proof (file:line or output).'
const checkpoint = (item, kinds) => 'CHECKPOINT (a silent task is killed and re-run from the top): FIRST command: mkdir -p "$(dirname CK)" && cat CK 2>/dev/null; content = your own earlier work, continue from it. After EACH finished ' + item + ' append ONE JSON line to CK with one short python3 heredoc (open(CK,"a").write(json.dumps(obj)+"\\n")): ' + kinds + '. Final result = every line of CK converted to the schema + anything new.'
const scope = u => {
  let s = '', n = 0
  for (const f of u.files) { if ((s + f).length > 420) break; s += (s ? ', ' : '') + f; n++ }
  return s + (n < u.files.length ? ' ... +' + (u.files.length - n) + ' more (git diff --name-only BASE...HEAD)' : '')
}
const head = (u, role) => 'ROLE: ' + role + ' (unit ' + u.id + ').' + pony(NODE[u.node].ponytail) + '\n' + WHERE + '  CK ' + ck(u.id) + '\nChanges of a file: git diff -U15 BASE...HEAD -- <file> (report HEAD-tree line numbers).\nFACTS (lead-gathered; judge them, never re-derive):\n' + clip(A.facts, 800)

function reviewPrompt(u) {
  return [
    head(u, 'driver: zero-trust review of one file group; an independent navigator will try to refute every finding, so file only what you can substantiate'),
    'SCOPE (findings only in these files; read others only to trace): ' + scope(u),
    u.points.length
      ? 'POINTS: Read ONLY these from ' + A.skillDir + "/checklist.md with Grep -A 1 on '^(" + u.points.join('|') + ")\\. ' (point + Trigger line). Each point: a real finding, or ONE notApplicable line (max 2 tool calls) when there is no real hazard. One finding per root cause; questions only for ambiguities reading cannot resolve." + (u.points.includes(30) ? " Point 30 also has sample questions: Grep -A 28 '^30\\. '." : '')
      : 'POINTS: none assigned; follow FOCUS and Grep -A 1 ' + A.skillDir + '/checklist.md for only the points you need. One finding per root cause.',
    u.points.includes(1) && A.ticket ? 'ACCEPTANCE CRITERIA: Read ' + A.ticket : '',
    A.decisions ? 'AUTHOR DECISIONS TO CHALLENGE (not facts):\n' + clip(A.decisions, 1500) : '',
    A.prior ? 'EARLIER REVIEW, CLAIMED FIXED (verify each fix is real and complete; re-report only if still broken):\n' + clip(A.prior, 1000) : '',
    u.focus ? 'FOCUS: ' + u.focus : '',
    /^(tests|all)/.test(u.id) ? 'Mutation probing: at most 8 single-line mutants, scratch copy, changed test files only.' : 'No mutation probing.',
    rules(MODE.cap, u.id), SEVERITY,
    checkpoint('checked point', '{"kind":"finding",...fields} | {"kind":"na","point":N,"reason":".."} | {"kind":"q","point":N,"question":".."}'),
  ].filter(Boolean).join('\n\n')
}
const AUDIT = {
  'test-auditor': 'Find tests the diff makes stale or contradicts, with SCOPED runs only. The lead already ran the changed tests (FACTS): do not re-run them. (1) grep the tests for files that import or mention the changed modules or symbols but are NOT in the diff; run ONLY those files, one call per file, at most 4 runs, never the whole suite. (2) Only if one fails, reproduce that same file on a pristine `git archive ' + A.base + '` copy to decide whether the failure is new. (3) Statically hunt tests asserting call counts, wrapping or error types the diff changes, and weakened, skipped or contradicted assertions. Findings = new failures and contradicted tests; commands and counts go in notes. Do not spawn subagents.',
  'integration-probe': 'Prove the changed path end to end against ONE real dependency (DB, socket or file) in your own throwaway container: unique name zt-' + String(SHA).slice(0, 7) + ', random free port, docker run --rm; never the shared compose stack or ports 5433/6381; docker rm -f it at the end even on failure. If no local image exists and a pull fails, say UNVERIFIED and run a no-container probe. One probe script in a git-archive copy of HEAD; compare guarded vs control; every defect is a finding with the probe output; measurements go in notes. Do not spawn subagents.',
}
const auditPrompt = u => [head(u, 'audit node ' + u.node), AUDIT[u.node], 'CHANGED FILES: ' + scope(u), rules(MODE.cap, u.id), SEVERITY,
  checkpoint('step', '{"kind":"finding",...fields} | {"kind":"note","text":".."}')].join('\n\n')
const promptFor = u => (u.node === 'reviewer' || u.node === 'gap-reviewer' ? reviewPrompt(u) : auditPrompt(u))

const LENS = {
  'verifier-refute': 'LENS refute: try to REFUTE it. Find the guard, caller, test, doc or ADR that makes it a non-issue; show it is pre-existing and not newly routed by this diff (git show BASE:path); show the severity is inflated or the proposed fix is wrong. real=no only with evidence; real=unverifiable if neither side can be proven.',
  'verifier-reproduce': 'LENS reproduce: PROVE the failure with the shortest executed probe in a scratch copy, or an airtight code trace with file:line. real=yes only if demonstrated, real=unverifiable if you cannot tell. Then give the true severity and the smallest correct fix (betterFix).',
  adjudicator: 'LENS adjudicate: the refuter and the reproducer disagree. Read the code yourself, decide who is right, give the final real, severity and inScope.',
}
const VERDICT_TAIL = 'Return the verdict only: real yes|no|partial|unverifiable, severity (none if not real), inScope=false when the hazard exists on the base and this diff does not newly route traffic through it, reasoning <= 500 chars, betterFix only if the reviewer fix is wrong.'
const verifierPrompt = (node, c, cap, vs) => [
  'ROLE: navigator (' + node + '). Independently verify exactly ONE finding of a code review; do not trust the reviewer, do not hunt for other findings.' + pony(NODE[node].ponytail) + '\n' + WHERE + '\nReviewed diff: git diff BASE...HEAD',
  'FINDING ' + c.id + ' [' + c.severity + '] ' + c.title + '\nlocation: ' + c.file + ':' + c.startLine + '-' + c.endLine + '  points: ' + c.points.join(',') + '\nhazard: ' + c.hazard + '\nfailure scenario: ' + c.failureScenario + '\nreviewer evidence: ' + c.evidence + '\nreviewer fix: ' + (c.suggestedFix || '(none)'),
  vs ? 'VERDICTS TO ADJUDICATE:\n' + vs.map(v => v.by + ': real=' + v.real + ' severity=' + v.severity + ' inScope=' + v.inScope + ' | ' + clip(v.reasoning, 400)).join('\n') : '',
  LENS[node], rules(cap, 'v-' + c.id), VERDICT_TAIL,
].filter(Boolean).join('\n\n')
const batchPrompt = (b, id) => [
  'ROLE: navigator (batch-verifier, unit ' + id + '). Independently verify these ' + b.length + ' LOW-severity findings of a code review one by one; do not trust the reviewer, do not hunt for new findings; at most 3 tool calls per item.' + pony(NODE['batch-verifier'].ponytail) + '\n' + WHERE + '  CK ' + ck(id) + '\nReviewed diff: git diff BASE...HEAD',
  b.map(c => c.id + ' ' + c.file + ':' + c.startLine + '-' + c.endLine + ' "' + c.title + '" | hazard: ' + clip(c.hazard, 180) + ' | proof: ' + clip(c.evidence, 120)).join('\n'),
  'Per id: real yes|no|partial|unverifiable, severity (none if not real), inScope=false when the hazard exists on the base and this diff does not newly route traffic through it, reasoning <= 300 chars. Return one verdict per id.',
  rules(25, 'v-' + id), checkpoint('item', '{"kind":"verdict","id":"C7","real":"..","severity":"..","inScope":true,"reasoning":".."}'),
].join('\n\n')

// ---------------------------------------------------------------- units and dry run
function units() {
  const gs = MODE.merge && G.length > 1
    ? [{ id: 'all', files: FILES, points: uniq(G.flatMap(g => g.points)).sort((a, b) => a - b), agentType: G.slice().sort((a, b) => b.lines - a.lines)[0].agentType }]
    : G
  const us = gs.map(g => ({ id: g.id, node: 'reviewer', files: g.files, points: g.points, agentType: g.agentType }))
  const fired = (A.points && A.points.fired) || []
  if (!MODE.skip.includes('test-auditor')) us.push({ id: 'test-auditor', node: 'test-auditor', files: FILES, points: [], agentType: 'general-purpose' })
  if (!MODE.skip.includes('integration-probe') && [13, 18, 21].some(p => fired.includes(p))) us.push({ id: 'integration-probe', node: 'integration-probe', files: FILES, points: [], agentType: 'general-purpose' })
  return us
}
const US = units()
if (dry) {
  const ex = A.expect || { critical: 0, high: 1, medium: 5, low: 30 }  // assumed finding mix; verification scales with it
  return {
    mode: modeName, dryRun: true, assumed: ex, plan: plan(modeName, G.length, ex.critical, ex.high, ex.medium, ex.low),
    units: US.map(u => ({ id: u.id, node: u.node, points: u.points, files: u.files.length, promptChars: promptFor(u).length })),
  }
}

// ---------------------------------------------------------------- dedupe (plain code) and verdict logic
const norm = f => ({
  ...f, file: f.file || '', startLine: f.startLine | 0, endLine: f.endLine || f.startLine | 0, points: f.points || [], severity: SEV[f.severity] >= 0 ? f.severity : 'low',
  title: clip(f.title, 160), hazard: clip(f.hazard, 600), failureScenario: clip(f.failureScenario, 600), evidence: clip(f.evidence, 600), suggestedFix: clip(f.suggestedFix, 600),
})
// 3-line window and Jaccard 0.34 (about a third of the title tokens shared) are empirical; adjust only from runs.md data
const same = (c, f) => c.file === f.file && f.startLine <= c.endLine + 3 && c.startLine <= f.endLine + 3 && jac(c.tk, tok(f.title)) >= 0.34
function cluster(fs, existing, prefix) {
  const out = []
  for (const f of fs.map(norm).sort((a, b) => SEV[b.severity] - SEV[a.severity])) {
    const m = existing.concat(out).find(c => same(c, f) && SEV[f.severity] <= SEV[c.severity])
    if (m) { m.origins = uniq([...m.origins, f.origin]); m.points = uniq([...m.points, ...f.points]); continue }
    out.push({ ...f, origins: [f.origin], tk: tok(f.title), id: prefix + (out.length + 1) })
  }
  return out
}
const verdict = (by, v) => (v ? { by, ...v } : { by, real: 'unverifiable', severity: 'none', inScope: true, reasoning: 'no result', nullResult: true })
const side = v => (v.nullResult ? 0 : v.real === 'yes' || v.real === 'partial' ? 1 : v.real === 'no' ? -1 : 0)
function decide(c, vs) {
  const live = vs.filter(v => !v.nullResult)
  if (!live.length) return { status: 'unverified', severity: c.severity }
  const j = live.filter(v => v.by === 'adjudicator')
  const jury = j.length ? j : live
  const yes = jury.filter(v => side(v) > 0), no = jury.filter(v => side(v) < 0)
  let status = yes.length > no.length ? 'confirmed' : no.length > yes.length ? 'refuted' : yes.length ? 'disputed' : 'unverifiable'
  if (status === 'confirmed' && jury.filter(v => v.inScope === false).length > jury.length / 2) status = 'out-of-scope'
  const sv = live.filter(v => side(v) > 0 && SEV[v.severity] >= 0).map(v => SEV[v.severity]).concat(SEV[c.severity]).sort((a, b) => a - b)
  return { status, severity: SEVN[sv[(sv.length - 1) >> 1]] }
}

// ---------------------------------------------------------------- verification
// The numeric arguments of ask() are per-agent tool-call caps: 25 for critical/high refute and reproduce probes (a probe needs room to run),
// 20 for the adjudicator (reads two verdicts), 15 for the single refute on a medium. Empirical; adjust only from runs.md data.
const agentFor = c => (/\.[mc]?[jt]sx?$/.test(c.file) ? 'typescript-reviewer' : 'python-reviewer')
const ask = async (node, c, cap, vs) => verdict(node.replace('verifier-', ''), await run(node, verifierPrompt(node, c, cap, vs), { schema: VERDICT, label: node.replace('verifier-', '') + ':' + c.id, phase: 'Verify', agentType: agentFor(c) }))
async function verifyCluster(c) {
  if (SEV[c.severity] >= SEV.high) {
    const vs = (await parallel([() => ask('verifier-refute', c, 25), () => ask('verifier-reproduce', c, 25)])).map((v, i) => v || verdict(['refute', 'reproduce'][i], null))
    if (side(vs[0]) * side(vs[1]) < 0) vs.push(await ask('adjudicator', c, 20, vs))
    return vs
  }
  const r = await ask('verifier-refute', c, 15)
  return r.nullResult || r.real === 'partial' || r.real === 'unverifiable' ? [r, await ask('verifier-reproduce', c, 25)] : [r]
}
async function verifyBatch(b, id) {
  const r = await run('batch-verifier', batchPrompt(b, id), { schema: BATCH, label: 'batch:' + id, phase: 'Verify', agentType: 'python-reviewer' })
  if (!r) log('BATCH ' + id + ' returned null: ' + b.map(c => c.id).join(',') + ' stay unverified')
  const byId = new Map(((r && r.verdicts) || []).map(v => [v.id, v]))
  return b.filter(c => byId.has(c.id)).map(c => ({ c, vs: [verdict('batch', byId.get(c.id))] }))
}
const verified = new Map()
async function verifyAll(cs, tag) {
  const need = cs.filter(c => MODE.verify.includes(c.severity))
  const lows = need.filter(c => c.severity === 'low').sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine)
  if (!cs.some(c => SEV[c.severity] >= SEV.medium)) log(tag + 'EARLY EXIT: no finding of severity >= medium; skipping refute/reproduce/adjudicate' + (lows.length ? ', batching lows only' : ''))
  const jobs = need.filter(c => SEV[c.severity] >= SEV.medium).map(c => async () => [{ c, vs: await verifyCluster(c) }])
  for (let i = 0; i < lows.length; i += LIM.batch) {
    const b = lows.slice(i, i + LIM.batch)  // id carries a content hash so a fresh run never inherits another batch's checkpoint
    jobs.push(() => verifyBatch(b, 'BV' + (tag ? 'G' : '') + (i / LIM.batch + 1) + '-' + h32(b.map(c => c.id + c.file + c.startLine + c.title).join('|'))))
  }
  for (let i = 0; i < jobs.length; i += LIM.verifyWave) {
    for (const r of await parallel(jobs.slice(i, i + LIM.verifyWave))) for (const e of r || []) verified.set(e.c.id, e.vs)
  }
}

// ---------------------------------------------------------------- run: review wave(s)
phase('Review')
log('mode ' + modeName + ': ' + US.length + ' unit(s) [' + US.map(u => u.id).join(', ') + '], waves of ' + LIM.wave + ', tool cap ' + MODE.cap)
const findings = [], na = {}, questions = [], unverified = [], notReviewed = [], audit = []
function intake(u, r) {
  if (!r) { notReviewed.push(u.id + ': points ' + (u.points.join(',') || '-') + '; ' + u.files.length + ' file(s)'); log('NOT REVIEWED (null result): ' + u.id + '; resume the run, its checkpoint file keeps progress'); return }
  for (const f of r.findings || []) findings.push({ ...f, origin: u.id })
  for (const n of r.notApplicable || []) if (!na[n.point]) na[n.point] = clip(n.reason, 160)
  for (const q of r.questions || []) questions.push({ point: q.point, file: q.file, line: q.line, question: clip(q.question, 300) })
  for (const x of r.unverified || []) unverified.push(u.id + ': ' + clip(x, 200))
  if (AUDIT[u.node] && r.notes) audit.push({ id: u.id, notes: clip(r.notes, 400) })
}
for (let i = 0; i < US.length; i += LIM.wave) {
  const wave = US.slice(i, i + LIM.wave)
  const res = await parallel(wave.map(u => () => run(u.node, promptFor(u), { schema: REVIEW, label: u.id, phase: 'Review', agentType: u.agentType })))
  wave.forEach((u, j) => intake(u, res[j]))
}
log('raw findings: ' + findings.length + (notReviewed.length ? '; NOT REVIEWED: ' + notReviewed.length + ' unit(s)' : ''))

// ---------------------------------------------------------------- dedupe, verify
phase('Verify')
const clusters = cluster(findings, [], 'C')
log('clusters: ' + clusters.length + ' (' + SEVN.slice().reverse().map(s => s + ' ' + clusters.filter(c => c.severity === s).length).join(', ') + ')')
await verifyAll(clusters, '')

// ---------------------------------------------------------------- deep: critic and gap reviewers
let gapClusters = []
if (!MODE.skip.includes('critic')) {
  phase('Critic')
  const cov = []
  for (let p = 1; p <= 30; p++) {
    const k = findings.filter(f => (f.points || []).includes(p)).length
    cov.push('p' + p + ': ' + (k ? k + ' finding(s)' : na[p] ? 'N/A "' + clip(na[p], 70) + '"' : (A.points && A.points.skipped || []).includes(p) ? 'skipped by triage' : 'nothing filed'))
  }
  const cr = await run('critic', [
    'ROLE: completeness critic of a zero-trust review of a committed diff. Ask: which checklist points were never really examined or waved off with weak evidence; which factual claims are still unverified; which risky angles no unit covered. Output at most ' + LIM.gaps + ' gaps, each with a precise reviewer focus (what to read or run), only gaps worth another pass; gaps=[] when coverage is sufficient. Read ' + A.skillDir + '/checklist.md only for points you doubt.',
    'FACTS:\n' + clip(A.facts, 800), 'COVERAGE (point: findings or N/A):\n' + cov.join('\n'),
    'NOT REVIEWED: ' + (notReviewed.join('; ') || 'none'),
    'CLUSTERS (id status severity location title, most severe first):\n' + clusters.slice(0, 25).map(c => { const d = verified.has(c.id) ? decide(c, verified.get(c.id)) : { status: 'unverified' }; return c.id + ' ' + d.status + ' ' + c.severity + ' ' + c.file + ':' + c.startLine + ' ' + clip(c.title, 80) }).join('\n') + (clusters.length > 25 ? '\n(+' + (clusters.length - 25) + ' less severe not shown)' : ''),
  ].join('\n\n'), { schema: CRITIC, label: 'critic', phase: 'Critic', agentType: 'python-reviewer' })
  if (!cr) { log('CRITIC returned null: coverage gaps unknown'); unverified.push('critic returned no result: coverage gaps unknown') }
  else {
    for (const w of cr.weakClaims || []) unverified.push('critic: ' + clip(w, 200))
    if ((cr.gaps || []).length > LIM.gaps) log('CRITIC raised ' + cr.gaps.length + ' gaps; only the first ' + LIM.gaps + ' are pursued (cap)')
    const gus = (cr.gaps || []).slice(0, LIM.gaps).map((g, i) => ({ id: 'GAP' + (i + 1), node: 'gap-reviewer', files: FILES, points: g.point ? [g.point] : [], agentType: 'python-reviewer', focus: clip(g.why + ' | ' + g.focus, 600) }))
    const res = await parallel(gus.map(u => () => run(u.node, promptFor(u), { schema: REVIEW, label: u.id, phase: 'Critic', agentType: u.agentType })))
    const before = findings.length
    gus.forEach((u, j) => intake(u, res[j]))
    gapClusters = cluster(findings.slice(before), clusters, 'G')
    if (gapClusters.length) { phase('Verify'); await verifyAll(gapClusters, 'gap: ') }
  }
}

// ---------------------------------------------------------------- compact return
const out = clusters.concat(gapClusters).map(c => {
  const vs = verified.get(c.id)
  const d = vs ? decide(c, vs) : { status: c.severity === 'nit' ? 'unverified-nit' : 'unverified', severity: c.severity }
  const lim = SEV[d.severity] >= SEV.medium ? 600 : 240, gone = d.status === 'refuted'
  if (SEV[d.severity] >= SEV.medium && /unverif|disputed/.test(d.status)) unverified.push(c.id + ' ' + d.severity + ' ' + d.status + ': ' + clip(c.title, 100))
  return {
    id: c.id, status: d.status, severity: d.severity, file: c.file, startLine: c.startLine, endLine: c.endLine, points: c.points, anchorable: !!c.anchorable, title: c.title,
    hazard: gone ? '' : clip(c.hazard, lim), failureScenario: gone ? '' : clip(c.failureScenario, lim),
    suggestedFix: gone ? '' : clip((vs || []).map(v => v.betterFix).find(Boolean) || c.suggestedFix, lim),
    verdicts: (vs || []).map(v => ({ by: v.by, real: v.real, sev: v.severity, inScope: v.inScope, why: clip(v.reasoning, d.severity === 'low' ? 120 : 220) })),
  }
}).sort((a, b) => SEV[b.severity] - SEV[a.severity])
if (questions.length > 30 || unverified.length > 30) log('output capped: ' + questions.length + ' questions, ' + unverified.length + ' unverified entries, 30 kept of each')
const skipped = {}
for (const p of (A.points && A.points.skipped) || []) skipped[p] = 'no trigger in added lines (skipped by triage)'
const tally = k => out.reduce((m, c) => ({ ...m, [c[k]]: (m[c[k]] || 0) + 1 }), {})
return {
  mode: modeName,
  counts: { units: US.length, rawFindings: findings.length, clusters: out.length, bySeverity: tally('severity'), byStatus: tally('status') },
  stats: { agentsByNode: used, total: Object.values(used).reduce((a, b) => a + b, 0) },
  notReviewed, clusters: out, notApplicable: { ...skipped, ...na }, audit,
  questions: questions.filter((q, i) => questions.findIndex(x => x.question === q.question) === i).slice(0, 30),
  unverified: unverified.slice(0, 30),
}
