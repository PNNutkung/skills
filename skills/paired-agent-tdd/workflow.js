export const meta = {
  name: 'paired-agent-tdd',
  description: 'Paired TDD as per-group repair loops: RED then GREEN, each a driver pass (it edits, runs the real gate, edits again) checked by an independent navigator on fresh gate facts, repeated until the check passes, stalls or the rounds run out; one whole-diff review; one fixer per group; a final re-check. One rolling agent pool, no barrier between groups',
  whenToUse: 'Run after `node tdd.mjs plan`; args = the JSON it prints. mode "plan" returns the agent count, the worst case and prompt sizes without spawning an agent',
  phases: [
    { title: 'Build', detail: 'per group: red-driver -> red-navigator -> green-driver -> green-navigator, each stage repeated while its check finds defects; a group that waits for another starts GREEN when that one is done' },
    { title: 'Review', detail: 'optional integration-tester, then ONE opus reviewer over the whole diff' },
    { title: 'Fix', detail: 'one fixer per group that has findings; it re-runs its group gate until ok' },
    { title: 'Converge', detail: 'after the fixers: a courier re-runs the final gate; what it names goes back to its owning group, at most two rounds' },
  ],
}

// GENERATED:nodes (node graph.mjs --write)

const NODE = {
  'red-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":40},
  'test-writer': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":40},
  'red-navigator': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":25},
  'green-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":45},
  'tdd-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":75},
  'code-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":45},
  'green-navigator': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":25},
  'integration-tester': {"model":"sonnet","effort":"high","ponytail":"lite","agentType":"tdd-guide","cap":35},
  'reviewer': {"model":"opus","effort":"high","ponytail":"off","agentType":"code-reviewer","cap":40},
  'judge': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":20},
  'fixer': {"model":"sonnet","effort":"medium","ponytail":"full","agentType":"tdd-guide","cap":35},
  'final-verifier': {"model":"haiku","effort":"low","ponytail":"off","agentType":"code-reviewer","cap":6},
}
const LIM = {"pool":6,"retry":1,"rounds":3,"repairs":2}
function plan(g, integration, findingGroups, solo = 0, writer = false) {
  const rest = g - solo, counts = { 'red-driver': rest, 'red-navigator': rest, 'green-driver': rest, 'green-navigator': g, 'integration-tester': integration ? 1 : 0, reviewer: 1, fixer: findingGroups, 'final-verifier': findingGroups ? 1 : 0, ...(solo ? (writer ? { 'test-writer': solo, 'code-driver': solo } : { 'tdd-driver': solo }) : {}) };
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// /GENERATED:nodes

// GENERATED:matrix (node graph.mjs --write)

function checkMatrix(items, rows, files) {
  const good = [], bad = [], used = {};
  for (const r of rows || []) {
    const it = items.find(i => i.id === (r && r.dod)), name = String((r && r.test) || ''), key = r && r.file + '::' + name;
    const carries = !!it && new RegExp('(^|[^A-Za-z0-9])' + it.id + '($|[^A-Za-z0-9])', 'i').test(name);
    const why = !it ? 'unknown DoD id' : !['happy', 'fail', 'edge'].includes(r.kind) ? 'kind must be happy, fail or edge'
      : !files.includes(r.file) ? 'file is not one of the group test files' : !carries ? 'test name must carry its DoD id set apart by non-alphanumerics (test_' + it.id.toLowerCase() + '_happy)'
      : used[key] && used[key] !== r.dod + '/' + r.kind ? 'test ' + name + ' already stands for ' + used[key] : '';
    if (why) bad.push({ row: r, why }); else { used[key] = used[key] || r.dod + '/' + r.kind; good.push(r); }
  }
  const missing = [];
  for (const it of items) for (const k of it.kinds) if (!good.some(r => r.dod === it.id && r.kind === k)) missing.push({ dod: it.id, kind: k });
  return { missing, bad, good };
}

// /GENERATED:matrix

// GENERATED:speed (node graph.mjs --write)

const FULL = "full"
const QUICK = "quick"
function speedOf(s) {
  const o = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  return { pipeline: o.pipeline === 'fast' ? 'fast' : 'paired', quickDriverGate: o.quickDriverGate === true, gateReuse: o.gateReuse === true, courierSkip: o.courierSkip === true, parallelReview: o.parallelReview === true };
}
function groupMode(fast, g, from) {
  return fast && from === 'red' && !((g && g.after) || []).length ? 'fast' : 'paired';
}
function driverGateRuns(sp, runs) {
  const n = Math.max(1, runs | 0);
  return Array.from({ length: n }, (_, i) => (sp.quickDriverGate && i > 0 && i < n - 1 ? QUICK : FULL));
}
function navigatorReuses(sp) {
  return sp.gateReuse === true;
}
function skipCourier(sp, fixes) {
  if (!sp.courierSkip || !fixes || typeof fixes !== 'object') return false;
  const ran = Object.keys(fixes).filter(k => k !== '_byHand');
  return ran.length > 0 && ran.every(k => !!fixes[k] && fixes[k].gateOk === true);
}
function reviewInParallel(sp, integration) {
  return sp.parallelReview === true && integration === true;
}

// /GENERATED:speed

// ---------------------------------------------------------------- args and helpers
const A = args || {}
const dry = A.mode === 'plan'
// fast mode (PTDD_PIPELINE_MODE=fast, or plan.mode "fast"): tdd.mjs plan sets args.mode "fast" and args.fast true (the dry run replaces mode with "plan" and keeps fast). Everything below that differs from the default
// is behind FAST, so a plan without it produces the same prompts, schemas and stage order as before: the resume cache keys on those bytes.
const FAST = A.mode === 'fast' || (A.mode === 'plan' && A.fast === true) // a `fast` key alone means nothing: only the dry run of a fast plan (mode "plan" replaces mode "fast") carries it
// args.speed (tdd.mjs plan, from the PTDD_* speed flags; ADR 0001): missing is every flag off, and then every prompt and step below is the one v2.0.0 had: the resume cache keys on those bytes
const SP = speedOf(A.speed)
// ADR 0011: fast mode with the test writer (PTDD_TEST_WRITER_ENABLED, set by tdd.mjs plan as args.testWriter): a test writer writes a group's tests, a code driver its code, a judge
// marks final-gate survivors equivalent. Everything for it is behind TW, so a plan without it produces the prompts and schemas it always did.
const TW = FAST && A.testWriter === true
for (const k of ['repo', 'base', 'cmd', 'skillDir', 'runDir']) if (!A[k]) return { error: 'args must be the JSON that `tdd.mjs plan` prints; missing ' + k }
const G = Array.isArray(A.groups) ? A.groups : [], DOD = Array.isArray(A.dod) ? A.dod : []
if (A.sandbox === 'none') return { error: 'no usable runner for the test commands: every gate would say unverifiable and no agent could judge anything. Fix it (or drop plan.sandbox), then run `tdd.mjs plan` again' }
if (!G.length || !DOD.length) return { error: 'args need at least one group and one DoD item' }
const byId = Object.fromEntries(G.map(g => [g.id, g]))
const loops = (id, seen) => (seen.includes(id) ? true : (byId[id] ? (byId[id].after || []).some(d => loops(d, seen.concat(id))) : false))
if (G.some(g => loops(g.id, []) || (g.after || []).some(d => !byId[d]))) return { error: 'groups wait for an unknown group or for each other' }

const SEVN = ['nit', 'low', 'medium', 'high', 'critical']
const SEV = Object.fromEntries(SEVN.map((s, i) => [s, i]))
const PROVEN = ['executed', 'read', 'log', 'metric', 'trace']
const clip = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 3) + '...' : s || '')
const h32 = s => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return h.toString(36) }
const RUN = String(A.runDir).replace(/\/$/, '')
const TDD = 'node ' + A.skillDir + '/tdd.mjs'
const ROUNDS = Number.isInteger(A.rounds) && A.rounds >= 1 && A.rounds <= 4 ? A.rounds : LIM.rounds // repair rounds per stage; plan.rounds overrides the default
const RESUME = A.resume && A.resume.groups ? A.resume : null // RUN/continue.json, written by `tdd.mjs resume` from the gate files
if (RESUME && (RESUME.base !== A.base || (RESUME.run && RESUME.run.replace(/\/$/, '') !== String(A.runDir).replace(/\/$/, '')))) return { error: 'args.resume is from another run (its base or run folder differs): run `tdd.mjs resume` again' }
const ACTIVE = G.filter(g => !(RESUME && RESUME.groups[g.id] && ['done', 'env', 'hold'].includes(RESUME.groups[g.id].next))).length // a group carried over, held or stopped on the environment spends nothing and gets no budget
const okBudget = n => Number.isInteger(n) && n >= 0 && n <= 40
// repair passes for the WHOLE run; spent, a failing group is paused. A continued run takes its budget from continue.json (`tdd.mjs resume --max-repairs N`, a visible decision), so the
// plan's own value, fixed before the first run, can no longer pause it again at once.
const BUDGET = RESUME && okBudget(RESUME.maxRepairs) ? RESUME.maxRepairs : okBudget(A.maxRepairs) ? A.maxRepairs : LIM.repairs * ACTIVE
if (RESUME && okBudget(RESUME.maxRepairs) && okBudget(A.maxRepairs) && A.maxRepairs !== RESUME.maxRepairs) log('args.maxRepairs (' + A.maxRepairs + ') is ignored: the continue file sets this run\'s repair budget (' + RESUME.maxRepairs + '); change it with tdd.mjs resume --max-repairs N')
const SHARE = ACTIVE ? Math.floor(BUDGET / ACTIVE) : 0 // every group is guaranteed this many; beyond it a group draws only on what the groups still running have not got coming
let repairsLeft = BUDGET
const used = {}
// One rolling pool for every agent of the run: never more than LIM.pool in flight, no wave barrier, a stalled agent holds one slot.
const slot = { n: 0, q: [], take() { return this.n < LIM.pool ? (this.n++, null) : new Promise(r => this.q.push(r)) }, free() { const w = this.q.shift(); if (w) w(); else this.n-- } }
// agentCap (a positive integer, written into args by code from an opt-in env var) is a hard ceiling on agents spawned: past it, run() returns null
// without spawning, and the caller's null path (retry, then not reviewed / failed) reports the work as not done. Raising it means changing args: ask the user.
const CAP = Number.isInteger(A.agentCap) && A.agentCap > 0 ? A.agentCap : null
let capped = 0
const run = async (node, prompt, o) => {
  if (CAP !== null && Object.values(used).reduce((a, b) => a + b, 0) >= CAP) { capped++; return null }
  used[node] = (used[node] || 0) + 1
  await slot.take()
  try { return await agent(prompt, { model: NODE[node].model, effort: NODE[node].effort, agentType: NODE[node].agentType, ...o }) } finally { slot.free() }
}
const attempts = {}, failed = []
// The working tree is the checkpoint: a dead driver's edits are already on disk, so its successor reads them instead of starting over.
const retryNote = (n, id) => { const gid = String(id).split(':')[1]; return 'RETRY ' + n + '/' + (1 + LIM.retry) + ' of ' + id + ': your predecessor died or returned nothing. Its edits are already in the working tree' + (byId[gid] ? '. Run `' + TDD + ' resume --run ' + RUN + ' --group ' + gid + '` first: one command that says where the group stands, read off its gate files, instead of exploring the tree' : ': read the files and `git diff` first') + '; do not redo finished work.\n\n' }
async function runR(node, prompt, o, id) {
  let err = ''
  for (let a = 1; a <= 1 + LIM.retry; a++) {
    attempts[id] = a
    let r = null
    try { r = await run(node, a === 1 ? prompt : retryNote(a, id) + prompt, o) } catch (e) { err = String((e && e.message) || e); log('AGENT ERROR ' + id + ' (attempt ' + a + '): ' + err) }
    if (r) return r
    if (a <= LIM.retry) log('RETRY ' + id + ': attempt ' + a + ' ' + (err ? 'threw' : 'returned nothing'))
  }
  failed.push({ id, node, attempts: attempts[id], reason: err || 'null result' })
  return null
}

// ---------------------------------------------------------------- schemas
const STR = { type: 'string' }
const INT = { type: 'integer' }
const ROW = { type: 'object', properties: { dod: STR, kind: { enum: ['happy', 'fail', 'edge'] }, test: STR, file: STR }, required: ['dod', 'kind', 'test', 'file'] }
const OOS = { type: 'array', items: { type: 'object', properties: { file: STR, line: INT, why: STR }, required: ['file', 'why'] } }
const REUSE = { enum: ['codebase', 'docs', 'oss', 'none'] }
const DEFECT = { type: 'object', properties: { cls: { enum: ['test', 'impl', 'gap', 'scope', 'env'] }, file: STR, line: INT, what: STR, fix: STR }, required: ['cls', 'what'] }
const GATE = { gateOk: { type: 'boolean' }, gateRuns: INT, remaining: { type: 'array', items: DEFECT } } // what the maker's own loop ended on (remaining = what it could not fix): a claim, kept for the record and used only to skip a check of a failure it admits
const RED_DRIVER = { type: 'object', properties: { matrix: { type: 'array', items: ROW }, files: { type: 'array', items: STR }, outOfScope: OOS, reuse: REUSE, notes: STR, ...GATE }, required: ['matrix', 'files', 'reuse'] }
const GREEN_DRIVER = { type: 'object', properties: { files: { type: 'array', items: STR }, cleanup: STR, reuse: REUSE, testDefects: OOS, testGaps: OOS, outOfScope: OOS, notes: STR, ...GATE }, required: ['files', 'reuse'] }
// fast mode: a group that waits for no other has ONE driver (tests, RED gate, code, GREEN gate); every other group, and every repair, uses the default drivers and schemas
const TDD_DRIVER = { type: 'object', properties: { matrix: { type: 'array', items: ROW }, files: { type: 'array', items: STR }, srcFiles: { type: 'array', items: STR }, cleanup: STR, reuse: REUSE, testDefects: OOS, testGaps: OOS, outOfScope: OOS, notes: STR, ...GATE }, required: ['matrix', 'files', 'srcFiles', 'reuse'] }
const NAV = { type: 'object', properties: { verdict: { enum: ['PASS', 'FAIL'] }, defects: { type: 'array', items: DEFECT }, gateOk: { type: 'boolean' }, notes: STR }, required: ['verdict', 'defects', 'gateOk'] }
const INTEG = { type: 'object', properties: { file: STR, exit: INT, findings: { type: 'array', items: STR }, notes: STR }, required: ['file', 'exit'] }
const PROOF = { type: 'object', properties: { mode: { enum: ['executed', 'read', 'log', 'metric', 'trace', 'inferred', 'none'] }, ref: STR, quote: STR, command: STR, exit: INT }, required: ['mode'] }
const FINDING = {
  type: 'object',
  properties: { title: STR, severity: { enum: ['critical', 'high', 'medium', 'low', 'nit'] }, file: STR, startLine: INT, endLine: INT, hazard: STR, failureScenario: STR, quote: STR, suggestedFix: STR, replacement: STR, anchorable: { type: 'boolean' }, proof: PROOF },
  required: ['title', 'severity', 'file', 'startLine', 'endLine', 'hazard', 'quote', 'proof'],
}
const REVIEW = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, notes: STR }, required: ['findings'] }
const FIX = { type: 'object', properties: { fixed: { type: 'array', items: STR }, notFixed: { type: 'array', items: { type: 'object', properties: { id: STR, why: STR }, required: ['id', 'why'] } }, outOfScope: OOS, ...GATE }, required: ['fixed', 'notFixed'] }
// ADR 0011 returns: the test writer {done, rejected}, the code driver {done, testWrong}, the judge {done, marked, unmarked}
const NOTE = { type: 'array', items: { type: 'object', properties: { test: STR, reason: STR }, required: ['test', 'reason'] } }
const BOOL = { type: 'boolean' }
const TEST_WRITER = { type: 'object', properties: { done: BOOL, rejected: NOTE, matrix: { type: 'array', items: ROW }, files: { type: 'array', items: STR }, outOfScope: OOS, reuse: REUSE, notes: STR, ...GATE }, required: ['done', 'rejected', 'matrix', 'files'] }
const CODE_DRIVER = { type: 'object', properties: { done: BOOL, testWrong: NOTE, files: { type: 'array', items: STR }, srcFiles: { type: 'array', items: STR }, cleanup: STR, reuse: REUSE, testGaps: OOS, outOfScope: OOS, notes: STR, ...GATE }, required: ['done', 'testWrong', 'files'] }
const JUDGE = { type: 'object', properties: { done: BOOL, marked: { type: 'array', items: STR }, unmarked: { type: 'array', items: STR }, finalOk: BOOL, notes: STR }, required: ['done', 'marked', 'unmarked'] }
const SURVIVOR = { type: 'object', properties: { id: STR, file: STR, line: INT, op: STR, before: STR, after: STR, run: STR }, required: ['id'] }
const REVIEW_TW = { type: 'object', properties: { ...REVIEW.properties, final: { type: 'object', properties: { ok: BOOL, survivors: { type: 'array', items: SURVIVOR } }, required: ['ok', 'survivors'] }, survivors: { type: 'array', items: SURVIVOR } }, required: ['findings', 'final'] }
const VERIFIED = { type: 'object', properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { file: STR, group: STR, what: STR }, required: ['what'] } }, notes: STR }, required: ['ok', 'problems'] }

// ---------------------------------------------------------------- prompts (rules are stated once, tersely; the long form is briefs.md)
const WHERE = 'REPO ' + A.repo + '  BASE ' + String(A.base).slice(0, 8) + '  RUN ' + RUN
const pony = lvl => (lvl === 'off' ? '' : ' PONYTAIL ' + lvl + ': the smallest change that works; evidence and checks are never shortened.')
const cap = node => 'At most ' + NODE[node].cap + ' tool calls.'
const FENCE = files => 'HARD SCOPE FENCE: edit or create ONLY ' + files.join(', ') + '. A file outside that list that needs a change: do NOT edit it, list it under outOfScope (file, line, why). Touching one fails the task: the gate lists it and the run is not done until it is reverted.'
const TOOLS = 'TOOLS: Read/Edit/Write/Grep/Glob for files; Bash only for the test command, the gate commands named below, read-only git (status, diff, log, show) and linters (other groups share this working tree: never stash, checkout, restore, reset or clean); never sed or a heredoc to edit a file. Run only your own test files, one at a time: `' + A.cmd + '`; never the whole suite.'
const RESEARCH = 'RESEARCH FIRST: (1) grep this repo for a sibling pattern, helper or test setup to reuse, (2) the installed library docs for a built-in, (3) only then anything broader. Report which applied as reuse = codebase|docs|oss|none; "nothing to reuse" is a valid answer.'
const PRECEDENT = 'PRECEDENT: before asserting a fail or edge behavior, grep the existing tests for the same flag or mode on a sibling path. A new assertion that contradicts an existing passing test is probably wrong: settle that before you finish.'
const itemsOf = g => g.dod.map(id => { const d = DOD.find(x => x.id === id) || {}; return { id, kinds: d.kinds || ['happy', 'fail', 'edge'], text: d.text || '' } })
const dodLines = g => itemsOf(g).map(i => i.id + ' [' + i.kinds.join(',') + '] ' + clip(i.text, 220)).join('\n')
const head = (g, role, node) => 'ROLE: ' + role + ' (group ' + g.id + ').' + pony(NODE[node].ponytail) + '\n' + WHERE + '\nGOAL: ' + clip(g.goal, 400) + (g.mirror ? '\nMIRROR the existing pattern in ' + g.mirror : '')
const defectLines = ds => ds.map(d => '- [' + (d.cls || 'defect') + '] ' + (d.file ? d.file + (d.line ? ':' + d.line : '') + ' ' : '') + clip(d.what, 300) + (d.fix ? ' | fix: ' + clip(d.fix, 200) : '')).join('\n')
// What the lead added when it continued a stalled group (`tdd.mjs resume --retry G | --hint G=text`): the last repair of these defects changed nothing the check could see.
const leadNote = g => { const L = RESUME && RESUME.groups[g.id]; return L && (L.hint || L.stalled) ? 'LEAD NOTE: ' + (L.stalled ? 'the last repair of these defects changed nothing the check could see: do not repeat it, look for a different cause. ' : '') + (L.hint ? 'The lead says: ' + clip(L.hint, 600) : '') : '' }
const gateCmd = (stage, g, extra) => TDD + ' ' + stage + ' --run ' + RUN + ' --group ' + g.id + (extra || '')
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'"
const dodCmd = (g, stage, rows) => TDD + ' dod --run ' + RUN + ' --group ' + g.id + ' --stage ' + stage + (rows ? rows.filter(r => !r.late).map(r => ' --row ' + shq([r.dod, r.kind, r.test, r.file].join(':'))).join('') : " --row 'ID:kind:test:file'")
// Two defect lists are the same when they name the same classes, files, lines and words: a repair that changed nothing the check can see. A false "same" blocks a group
// that is making progress (and everything after it), a false "different" only costs a round, so the line and most of the text are part of the key.
const sig = ds => (ds || []).map(d => [d.cls || '', d.file || '', d.line || '', String(d.what || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)].join('|')).sort().join('\n')
// The loop every maker runs on itself with the SAME commands its navigator will run, so "done" is something it saw in a real run, not a feeling.
const KEEP = 'KEEP EDITING until the gate says ok; never stop at a first draft. Every gate command is a real run. At most 3 gate runs; return gateOk (true only when every command printed ok=true) and gateRuns. A verdict `unverifiable` (the runner or the test command cannot run; `unverifiable (timeout)` is not that: a test or code that hangs is yours to fix) is the environment, never the code: edit nothing for it, return gateOk=false and remaining = one {cls env, what}.'
const ADMIT = ' If you stop with gateOk=false, list under `remaining` every reason you could not fix ({cls impl|test|gap, file, line, what}; a surviving mutant is cls gap): the next pass starts from that list, so no check is spent on a failure you already know.'
const ALONE = 'Another maker edits the other file set of this group right now: run only your own test files, never the gate; the check runs it after you both finish.'
const redLoop = g => KEEP +' Write the tests, run each file once and read why it fails, then run `' + gateCmd('red', g) + '` and `' + dodCmd(g, 'red') + '` (one --row per test you wrote). Anything but ok=true (a class other than fails or fails-to-load, a DoD gap, a row naming a test that is not in its file): fix the tests, run both again.' + ADMIT
// --retest only once the tests were strengthened on purpose: it silences "tests changed since RED", which must stay audible for an edit nobody sanctioned.
const retestFlag = on => (on ? ' --retest' : '')
const KEEP_RUNS = 3 // KEEP: at most 3 gate runs
const runNames = (runs, kind) => runs.map((k, i) => (k === kind ? 'run ' + (i + 1) : '')).filter(Boolean).join(' and ')
// PTDD_QUICK_DRIVER_GATE_ENABLED: a middle run of a driver's own GREEN loop skips the mutants; its first and last runs, and every navigator run, keep them
const quickRuns = (g, retest) => { const runs = driverGateRuns(SP, KEEP_RUNS); return runs.includes(QUICK) ? ' GATE RUNS: ' + runNames(runs, QUICK) + ' adds --quick (`' + gateCmd('green', g, retestFlag(retest) + ' --quick') + '`: no mutants, faster); ' + runNames(runs, FULL) + ', and whichever run is your last, without --quick: a --quick run never ends the loop and gateOk counts only a run without it.' : '' }
const greenLoop = (g, retest) => KEEP + ' Edit the sources, run the test files until they pass, then run `' + gateCmd('green', g, retestFlag(retest)) + '` and read every reason after "not ok:". Failing or flaky tests, no signal, scope, coverage: fix the code, run the gate again. A surviving mutant is a TEST gap and the tests are frozen: list it under testGaps and stop.' + ADMIT + quickRuns(g, retest)
const strengthenLoop = (g, retest) => KEEP + ' Add or restore the tests, run each file (it must pass), then run `' + gateCmd('green', g, retestFlag(retest)) + '`: a mutant that still survives needs a sharper assertion, so edit and run again.' + ADMIT

function strengthenPrompt(g, o) {
  const gaps = o.strengthen || [], back = o.restore || [], wrong = o.fixWrong || []
  return [
    head(g, 'driver: ' + (gaps.length || wrong.length ? 'STRENGTHEN' : 'RESTORE') + ' the tests; the implementation is done and passes', 'red-driver'),
    'DEFINITION OF DONE:\n' + dodLines(g),
    gaps.length ? 'These mutants SURVIVED, so no test pins that code. Add or sharpen tests so each one would fail; every new test must PASS on the current code. Never weaken, skip or delete a test. Name new tests with their DoD id set apart by non-alphanumerics (test_ac1_edge_...).\n' + defectLines(gaps) : '',
    wrong.length ? 'These tests are outright WRONG: they assert behavior the DoD text does not ask for. Correct each assertion IN PLACE so it matches the DoD text (keep the test name, never delete or skip a test); every corrected test must PASS on the current code.\n' + defectLines(wrong) : '',
    back.length ? 'The frozen tests changed since RED, or a DoD pair is no longer closed. Undo that: compare each test file with the version the RED gate saw (`git show <snapshot>:<file>`, snapshot = the "snapshot" field of ' + RUN + '/gates/' + g.id + '.red.json) and put back every test that was removed, skipped, loosened or renamed; tests added on purpose stay.\n' + defectLines(back) : '',
    leadNote(g), FENCE(g.tests), TOOLS, PRECEDENT, o.solo === false ? ALONE : strengthenLoop(g, gaps.length > 0 || wrong.length > 0 || o.retest),
    'RETURN: matrix = one row per NEW test {dod, kind, test, file}; files; outOfScope; reuse; gateOk; gateRuns; remaining; notes (<= 400 chars). ' + cap('red-driver'),
  ].filter(Boolean).join('\n\n')
}
function redPrompt(g, o) {
  if (o.strengthen || o.restore || o.fixWrong) return strengthenPrompt(g, o)
  return [
    head(g, 'driver: write the FAILING tests (RED) for this group', 'red-driver'),
    'DEFINITION OF DONE (one test per item and kind; every test name MUST contain its item id set apart by non-alphanumerics, e.g. test_ac1_happy_...; one test serves one item and kind only; a kind you cannot test is a defect to report, not to skip):\n' + dodLines(g),
    FENCE(g.tests), TOOLS, RESEARCH, PRECEDENT,
    'Each new test must fail for the RIGHT reason: an assertion about behavior that does not exist yet, not a typo.',
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : '', leadNote(g), redLoop(g),
    'RETURN: matrix = one row per test {dod, kind, test, file} (test = the exact function name); files = test files touched; outOfScope; reuse; gateOk; gateRuns; remaining; notes (<= 400 chars). ' + cap('red-driver'),
  ].filter(Boolean).join('\n\n')
}
// fast mode: the one driver of a group. RED is proven by the gate BEFORE any source exists, then the tests are frozen; GREEN is proven by the same gate as in the default pipeline.
function fastDriverPrompt(g) {
  return [
    head(g, 'driver: RED then GREEN in one pass (fast mode: one navigator judges both gates after you)', 'tdd-driver'),
    'DEFINITION OF DONE (one test per item and kind; every test name MUST contain its item id set apart by non-alphanumerics, e.g. test_ac1_happy_...; one test serves one item and kind only; a kind you cannot test is a defect to report, not to skip):\n' + dodLines(g),
    FENCE(g.tests.concat(g.src)), TOOLS, RESEARCH, PRECEDENT, leadNote(g),
    'STEP 1, RED: write ONLY the tests; each must fail for the RIGHT reason (an assertion about behavior that does not exist yet, not a typo). Run each file once and read why it fails, then run `' + gateCmd('red', g) + '` and `' + dodCmd(g, 'red') + '` (one --row per test you wrote) until both print ok=true: fix the tests, run both again. Write no source before that.',
    'STEP 2, GREEN: the tests are now FROZEN (' + g.tests.join(', ') + '): never edit, skip, loosen or delete one and never run the RED gate again (from your first source edit it keeps the RED you had as the reference, so an edited test fails GREEN); a test that is wrong goes under testDefects. Write the minimum code in the src files until the tests pass, then run `' + gateCmd('green', g) + '` and read every reason after "not ok:": failing or flaky tests, no signal, scope, coverage: fix the code, run it again. A surviving mutant is a TEST gap and the tests are frozen: list it under testGaps and stop. At most ONE cleanup pass, only for a duplicated block (3+ copies) or dead code you added, then run the gate again.' + quickRuns(g, false),
    KEEP.replace('At most 3 gate runs;', 'At most 3 gate runs per step;') + ADMIT,
    'RETURN: matrix = one row per test {dod, kind, test, file} (test = the exact function name); files = test files; srcFiles = source files touched; cleanup; reuse; testDefects; testGaps; outOfScope; gateOk (the GREEN gate); gateRuns; remaining; notes (<= 400 chars). ' + cap('tdd-driver'),
  ].filter(Boolean).join('\n\n')
}
function greenPrompt(g, o) {
  return [
    head(g, 'driver: GREEN, the minimum code that makes the RED tests pass', 'green-driver'),
    'DEFINITION OF DONE:\n' + dodLines(g),
    'THE TESTS ARE FROZEN: ' + g.tests.join(', ') + '. Never edit, skip, loosen or delete a test to get green; a test that is wrong goes under testDefects (file, line, why).',
    FENCE(g.src), TOOLS, RESEARCH,
    o.defects ? '' : 'After GREEN, at most ONE cleanup pass, only for a duplicated block (3+ copies) or dead code you added; otherwise cleanup = "none".' + (o.solo === false ? '' : ' Run the gate again after it.'),
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : '', leadNote(g), o.solo === false ? ALONE : greenLoop(g, o.retest),
    'RETURN: files = source files touched; cleanup; reuse; testDefects; testGaps; outOfScope; gateOk; gateRuns; remaining; notes (<= 400 chars). ' + cap('green-driver'),
  ].filter(Boolean).join('\n\n')
}
// ---- ADR 0011, fast mode with the test writer: the test writer sees the DoD, the plan's file list, the base code and the ADR Interface, never the code driver's source or notes
const base8 = String(A.base).slice(0, 8)
const IFACE = 'INTERFACE (the API: names, inputs, outputs, errors), from the `## Interface` section of ' + (A.dodFile || 'the ADR') + ' (the user approved it; `git show ' + base8 + ':' + (A.dodFile || '<adr>') + '`):\n' + clip(A.interface, 2400)
const noteLines = ns => ns.map(n => '- ' + clip(n.test, 120) + ': ' + clip(n.reason, 400)).join('\n')
const survivorLines = ss => ss.map(m => '- ' + m.id + (m.file ? ' ' + m.file + (m.line ? ':' + m.line : '') : '') + (m.op ? ' ' + m.op : '') + (m.before !== undefined && m.after !== undefined ? ': ' + clip(String(m.before).trim(), 80) + ' -> ' + clip(String(m.after).trim(), 80) : '')).join('\n')
const rewriteLoop = (g, alone) => alone ? ALONE : KEEP + ' After your test edits re-baseline RED with red --rewrite: `' + gateCmd('red', g, ' --rewrite') + '` (the tests as they are now become the RED reference; each edited test must still fail without the group code) and `' + dodCmd(g, 'red') + '`, then `' + gateCmd('green', g) + '` (it must pass on the current code; never --retest).' + ADMIT
function testWriterPrompt(g, o) {
  const notes = o.notes || [], surv = o.survivors || [], defects = o.defects || []
  const later = notes.length || surv.length || defects.length
  return [
    head(g, 'test writer: ' + (later ? 'you own the tests of this group; the code exists now and was written by a separate code driver against your tests' : 'write the FAILING tests (RED) for this group; a separate code driver writes the code after you, against your tests'), 'test-writer'),
    'DEFINITION OF DONE (one test per item and kind; every test name MUST contain its item id set apart by non-alphanumerics, e.g. test_ac1_happy_...; one test serves one item and kind only):\n' + dodLines(g),
    'PLAN FILES: tests ' + g.tests.join(', ') + '; code ' + g.src.join(', ') + '. Read existing code only as it is at BASE ' + base8 + ' (`git show ' + base8 + ':<file>`); never read the group\'s source files in the working tree: your tests come from the DoD and the Interface, not from the code.',
    IFACE, FENCE(g.tests), TOOLS, RESEARCH, PRECEDENT,
    notes.length ? 'TEST-IS-WRONG NOTES from the code driver (it may not edit a test). For each: when the DoD text or the Interface agrees with the note, correct that test in place (keep its name); otherwise keep the test and return the note under rejected with your reason (the code driver gets it).\n' + noteLines(notes) : '',
    surv.length ? 'These mutants SURVIVED the final gate (every changed line) and the judge did not mark them equivalent: no test fails with them. Add or sharpen tests so each would fail; every new test must PASS on the current code; never weaken, skip or delete a test. Then also run `' + TDD + ' final --run ' + RUN + ' --again`.\n' + survivorLines(surv) : '',
    defects.length ? 'FIX EXACTLY THESE TEST DEFECTS FROM THE CHECK (a gap: add or sharpen a test; a changed frozen test: put it back; a wrong test: correct it in place):\n' + defectLines(defects) : '',
    leadNote(g), later ? rewriteLoop(g, o.solo === false) : 'Each new test must fail for the RIGHT reason: an assertion about behavior that does not exist yet, not a typo. Write no source file. ' + redLoop(g),
    'RETURN: done; rejected = [{test, reason}] for each note you did not accept (else empty); matrix = one row per test {dod, kind, test, file} (test = the exact function name); files = test files touched; outOfScope; reuse; gateOk; gateRuns; remaining; notes (<= 400 chars). ' + cap('test-writer'),
  ].filter(Boolean).join('\n\n')
}
function codeDriverPrompt(g, o) {
  const rejected = o.rejected || []
  return [
    head(g, 'code driver: GREEN, the minimum code that makes the test writer\'s RED tests pass', 'code-driver'),
    'DEFINITION OF DONE:\n' + dodLines(g), IFACE,
    'THE TESTS BELONG TO THE TEST WRITER: ' + g.tests.join(', ') + '. Never edit, skip, loosen or delete a test, and never re-baseline one. A test you believe is WRONG (it asserts what the DoD text and the Interface do not ask for): return it under testWrong [{test, reason}] and stop; the test writer fixes it or rejects it with a reason.',
    FENCE(g.src), TOOLS, RESEARCH,
    rejected.length ? 'THE TEST WRITER REJECTED your testWrong notes; those tests stand, make the code pass them:\n' + noteLines(rejected) : '',
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : 'After GREEN, at most ONE cleanup pass, only for a duplicated block (3+ copies) or dead code you added; otherwise cleanup = "none". Run the gate again after it.',
    leadNote(g), o.solo === false ? ALONE : greenLoop(g, false),
    'RETURN: done; testWrong = [{test, reason}] (empty when every test is right); files = source files touched; srcFiles; cleanup; reuse; testGaps; outOfScope; gateOk; gateRuns; remaining; notes (<= 400 chars). ' + cap('code-driver'),
  ].filter(Boolean).join('\n\n')
}
const judgePrompt = surv => [
  'ROLE: judge of surviving mutants. You wrote neither the tests nor the code, and you edit no file.' + pony(NODE.judge.ponytail) + '\n' + WHERE,
  'The final gate mutated every changed line; with each mutant below every test still passed:\n' + survivorLines(surv),
  'For each, read the file at that line and decide. EQUIVALENT only when no input can tell the mutant apart from the original (the same observable behavior for every input). Mark it: `' + TDD + ' equivalent --run ' + RUN + ' --add <id> --reason \'<why no input can tell them apart, at least 20 characters>\'` (refused unless the id survived the last final run). Anything a test COULD catch is a test gap: leave it unmarked, the test writer gets it. When in doubt, unmarked: the list goes to the user in the PR.',
  'Then run once: `' + TDD + ' final --run ' + RUN + ' --again` and read its mutation lines.',
  'RETURN: done; marked = the ids you marked; unmarked = the other survivor ids; finalOk = the ok= value of that final run; notes (<= 400 chars). ' + cap('judge'),
].join('\n\n')
const knownGaps = chk => chk.missing.map(m => m.dod + '/' + m.kind + ' has no test').concat(chk.bad.map(b => b.row.dod + ': ' + b.why)).join('; ')
const NAV_TAIL = 'RETURN: verdict PASS|FAIL; defects = only what MUST be fixed, each {cls test|impl|gap|scope|env, file, line, what, fix}, at most 6 (anything softer goes in notes); a gate verdict `unverifiable` (not `unverifiable (timeout)`, which is a hanging test or code: cls impl or test) is the environment, not the code: report that ONE defect as cls env and nothing else; gateOk = true only if every command printed ok=true; notes <= 400 chars. A claim you did not see in command output or in a file you read is not a fact. '
function redNavPrompt(g, rows, chk, recheck, n) {
  return [
    head(g, 'navigator: verify the RED tests; you did not write them, so judge them independently', 'red-navigator'),
    'FIRST commands, once (T0 facts; do not run the tests yourself): `' + gateCmd('red', g) + '` then `' + dodCmd(g, 'red', rows) + '`. Their output is ground truth; the first names the patch to Read. A DoD gap or a row naming a test that is not in its file is a defect (cls gap or test).',
    'DEFINITION OF DONE:\n' + dodLines(g) + '\nDRIVER MATRIX (a claim):\n' + (rows || []).map(r => r.dod + '/' + r.kind + ' ' + r.test + ' (' + r.file + ')').join('\n'),
    chk.missing.length || chk.bad.length ? 'KNOWN GAPS (code-checked): ' + knownGaps(chk) : '',
    recheck ? 'RE-CHECK ' + n + ' after a rework. Defects reported before:\n' + defectLines(recheck) + '\nVerify each is really fixed; the output above is fresh.' : '',
    'CHECK: (1) the gate: every file fails now; "fails-to-load" only when the code under test does not exist yet; "passes-already" needs a stated reason or it is a defect. (2) every matrix row is a real test in that file, named with its id, asserting what the DoD text requires: no tautology, no assertion of the implementation, no mocking of the unit under test. (3) ' + PRECEDENT + ' (4) gap-hunting: legitimate inputs the new check would wrongly reject, and kinds covered by a token test only. (5) scope: only ' + g.tests.join(', ') + ' changed (the gate lists strays).',
    NAV_TAIL + cap('red-navigator'),
  ].filter(Boolean).join('\n\n')
}
// fast mode: ONE navigator judges both gates of a group whose one driver wrote the tests and the code (there was no RED navigator to see the tests first)
const WRONG = 'WRONG TEST' // the prefix by which the one navigator of a one-driver group says that a test (not just a weak one) is wrong: the repair corrects it in place instead of restoring the RED version
const WRONG_RE = new RegExp('^\\s*' + WRONG, 'i') // read leniently: a model that writes "wrong test ..." or indents it still means it
const isWrongTest = d => d.cls === 'test' && WRONG_RE.test(String(d.what || ''))
const mergedNavNote = (g, o) => 'ALSO judge RED: run `' + gateCmd('red', g) + '` then `' + dodCmd(g, 'red', o.rows) + '` once (their output is ground truth for RED). RED CHECK: every test file fails now by an assertion (fails-to-load is right only when the code under test did not exist yet); every matrix row is a real test named with its id, asserting what the DoD text requires: no tautology, no assertion of the implementation, no mocking of the unit under test; no kind covered by a token test only. ' + PRECEDENT + ' The tests are frozen: report a weak RED test as cls gap (repaired by adding or sharpening tests, never by removing one); report a test that is outright WRONG (it asserts behavior the DoD text does not ask for) as cls test with `what` starting `' + WRONG + ' <test name>:` (it is corrected in place); anything softer goes in notes.' // a matrix gap needs no line here: a one-driver group that left one is blocked before any navigator
// PTDD_GATE_REUSE_ENABLED: the navigator's gate reuses the driver's last full run on byte-identical files (tdd.mjs green --reuse, keyed by gatecache.mjs)
const REUSE_NOTE = ' --reuse: when the group files, the snapshot and the gate arguments are byte-identical to the driver\'s last full run, the gate reuses its test probe, mutants and coverage and re-runs only the flake check (the output says so); anything else runs it in full.'
function greenNavPrompt(g, o) {
  return [
    head(g, 'navigator: verify GREEN; you did not write this code, so judge it independently', 'green-navigator'),
    'FIRST commands, once (T0 facts: tests pass and exercise the change, flake, frozen tests, scope, mutants, coverage; do not re-run them): `' + gateCmd('green', g, (o.retest ? ' --retest' : '') + (navigatorReuses(SP) ? ' --reuse' : '')) + '` then `' + dodCmd(g, 'green', o.rows) + '` (the DoD pairs closed by tests that failed at RED and pass now). Read the patch the gate names.' + (navigatorReuses(SP) ? REUSE_NOTE : ''),
    'DEFINITION OF DONE:\n' + dodLines(g),
    o.merged ? mergedNavNote(g, o) : '',
    o.recheck ? 'RE-CHECK ' + o.n + ' after a rework' + (o.retest ? ' (tests were strengthened on purpose: the gate ran with --retest; judge those test changes yourself: only additions, nothing weakened)' : '') + '. Defects reported before:\n' + defectLines(o.recheck) + '\nVerify each is really fixed.' : '',
    'CHECK: (1) every reason after "not ok:" in either command is a defect: a surviving mutant or a test that passes without the new code = cls gap (name the assertion that is missing), changed tests or a DoD pair no longer closed = cls test, anything else (a flaky run too) cls impl; a stray file the gate lists is only a hint (other groups share the tree): cls scope only if the patch shows THIS group created it. (2) minimal: no behavior beyond the DoD; a new helper that duplicates an existing one (grep) is cls impl. (3) no test weakened, skipped or loosened. (4) a cleanup, if any, left behavior unchanged and abstracted nothing prematurely. (5) gap-hunting: legitimate future edits or inputs that the new code would wrongly reject.',
    NAV_TAIL + cap('green-navigator'),
  ].filter(Boolean).join('\n\n')
}
const integPrompt = () => [
  'ROLE: integration tester (all groups are green).' + pony(NODE['integration-tester'].ponytail) + '\n' + WHERE,
  'Write ONE integration test at ' + A.integration.file + ' that drives the full path through the real dependency (no mocks of it): ' + clip(A.integration.goal, 400) + '. ' + FENCE([A.integration.file]),
  TOOLS.replace('your own test files, one at a time', 'that one file'), 'Run it for real and report the exit code; every defect it exposes is a finding string with the output. RETURN: file, exit, findings, notes. ' + cap('integration-tester'),
].join('\n\n')
const SEVERITY = 'SEVERITY: critical = data loss, security flaw or production outage; high = a likely bug or a DoD item not met; medium = a plausible risk or a weak test; low = minor; nit = style. A hazard in untouched code is not a finding unless this diff newly routes traffic through it.'
const PROOF_RULE = 'PROOF (a tool re-checks every ref and quote): read = ref path:startLine-endLine in the reviewed tree, quote copied verbatim from it; executed = ref the id after `ZT-RUN` that a gate run printed, quote verbatim from its output; inferred = a guess, allowed only for low and nit. medium and above need executed or read. quote = the offending code verbatim (<= 300 chars); replacement = the exact new text of startLine..endLine for a mechanical fix of <= 40 lines, else empty.'
// alongside: the integration test file written at the same time (PTDD_PARALLEL_REVIEW_ENABLED); the reviewer leaves it out, its own agent runs it and verify reads the exit code
const reviewPrompt = alongside => [
  'ROLE: reviewer, the final gate: read the WHOLE change once and file only what you can substantiate. No AI or automation wording in findings: a sharp engineer, defect first, concrete failing input.\n' + WHERE,
  'FIRST command, once (T0 facts for the integrated tree: all group tests together, existing tests that mention the changed modules, scope): `' + TDD + ' final --run ' + RUN + '`. Then Read ' + RUN + '/diff/final.patch and, per group, ' + RUN + '/gates/<group>.green.json (mutants, coverage). Groups: ' + G.map(g => g.id + ' (' + g.tests.concat(g.src).join(', ') + ')').join('; '),
  ...(alongside ? ['The integration test ' + alongside + ' is being written now by another agent, at the same time as your review: leave it out (it is gated on its own: its agent runs it for real and verify reads the exit code); its lines in final.patch, whole or half-written, are not findings.'] : []),
  'DEFINITION OF DONE:\n' + DOD.map(d => d.id + ' [' + (d.kinds || ['happy', 'fail', 'edge']).join(',') + '] ' + clip(d.text, 200)).join('\n'),
  'LOOK FOR: every `not ok:` reason of the final gate (one high finding per root cause); a DoD item the code does not meet; a weak, tautological or over-mocked test; a branch no test pins; input validation missing at a trust boundary; a reinvented helper (grep for the existing one); a comment, docstring or example the change made stale or wrong (check every number in an example). One finding per root cause.',
  SEVERITY, PROOF_RULE, (TW ? 'RETURN: findings (empty when none); final = {ok, survivors} copied from that first final run: ok = its ok= value, survivors = one {id, file, line, op, before, after} per `survivor` line (a surviving mutant goes to the judge, not into findings); notes <= 400 chars. ' : 'RETURN: findings (empty when none) and notes <= 400 chars. ') + cap('reviewer'),
].join('\n\n')
const fixLoop = gid => gid === '_extra' ? 'Run the tests that cover the files you changed.'
  : TW ? KEEP + ' After the fixes run `' + gateCmd('green', { id: gid }) + '` (never --retest: the test writer owns the tests) and read every reason after "not ok:": caused by your change, fix it and run again; not caused by it, say so in notFixed.'
  : KEEP + ' After the fixes run `' + gateCmd('green', { id: gid }, ' --retest') + '` (tests may have been sharpened on purpose) and read every reason after "not ok:": caused by your change, fix it and run again; not caused by it, say so in notFixed.'
const fixPrompt = (gid, files, fs) => [
  'ROLE: fixer for group ' + gid + '. Fix exactly these findings and nothing else.' + pony(NODE.fixer.ponytail) + '\n' + WHERE,
  'FINDINGS:\n' + fs.map(c => c.id + ' [' + c.severity + '] ' + c.file + (c.startLine ? ':' + c.startLine + '-' + c.endLine : '') + ' ' + clip(c.title, 120) + ' | ' + clip(c.hazard, 300) + (c.replacement ? ' | replacement for those lines:\n' + c.replacement : c.suggestedFix ? ' | fix: ' + clip(c.suggestedFix, 300) : '')).join('\n'),
  FENCE(files), TOOLS, TW ? 'Never edit a test: the test writer owns them. A finding that needs a test change, or one you cannot fix inside the fence: notFixed with why.' : 'Tests may be added or sharpened, never weakened, skipped or deleted. A finding you cannot fix inside the fence: notFixed with why.', fixLoop(gid),
  'RETURN: fixed (ids), notFixed [{id, why}], outOfScope, gateOk, gateRuns. ' + cap('fixer'),
].join('\n\n')
const verifyPrompt = () => [
  'ROLE: courier. Run ONE command, copy what it says, judge nothing.\n' + WHERE,
  'Run once: `' + TDD + ' final --run ' + RUN + ' --again`. Read the `FINAL ok=` line and every line under it.',
  'RETURN: ok = the ok= value; problems = one {file, group, what} per failing file or reason after "not ok:": file = the test or source file the line names (empty if none), group = the id of the group whose code it points at (' + G.map(g => g.id).join(', ') + ') or empty when you cannot tell, what = the gate\'s own words (<= 200 chars); notes <= 200 chars. ' + cap('final-verifier'),
].join('\n\n')

// ---------------------------------------------------------------- dry run
const ex = A.expect || { integration: A.integration ? 1 : 0, findingGroups: 1 }
if (dry) {
  const g = G[0], chk = { missing: [], bad: [] }
  const sample = itemsOf(g).flatMap(i => i.kinds.map(k => ({ dod: i.id, kind: k, test: 'test_' + i.id.toLowerCase() + '_' + k + '_case', file: g.tests[0] }))) // the navigators carry one row per DoD pair: size them with it
  // per group: 1 driver + 1 matrix rework + (1 + R) checks + R reworks (RED), 1 driver + (1 + R) checks + up to 2 jobs a round (GREEN) = 5 + 5R; not counted: the reviewer, fixers, couriers, retries
  // fast mode: the ceiling below is the default pipeline's, an upper bound (a one-driver group costs at most 2 + 3R); the two extra prompts are the one driver and the navigator that judges both gates
  const solo = G.filter(x => groupMode(FAST, x, 'red') === 'fast').length
  return { dryRun: true, plan: plan(G.length, ex.integration, ex.findingGroups, solo, TW), rounds: ROUNDS, repairBudget: BUDGET, worstBuildAgents: Math.min(ACTIVE * (5 + 5 * ROUNDS), 4 * ACTIVE + 3 * BUDGET), prompts: [['red-driver', redPrompt(g, {})], ['red-navigator', redNavPrompt(g, sample, chk)], ['green-driver', greenPrompt(g, {})], ['green-navigator', greenNavPrompt(g, { rows: sample })], ['reviewer', reviewPrompt()], ['fixer', fixPrompt(g.id, g.tests.concat(g.src), [])], ['final-verifier', verifyPrompt()], ...(FAST ? [['tdd-driver', fastDriverPrompt(g)], ['green-navigator-merged', greenNavPrompt(g, { rows: sample, merged: true })]] : []), ...(TW ? [['test-writer', testWriterPrompt(g, {})], ['code-driver', codeDriverPrompt(g, {})], ['judge', judgePrompt([{ id: 'X-00000000', file: g.src[0], line: 1, op: 'const-inc', before: 'x', after: 'y' }])]] : [])].map(([node, p]) => ({ node, promptChars: p.length })) }
}

// ---------------------------------------------------------------- build: one pipeline per group, no barrier between groups
phase('Build')
log('groups ' + G.map(g => g.id + (g.after && g.after.length ? ' (after ' + g.after.join(',') + ')' : '')).join(', ') + '; pool ' + LIM.pool + '; run folder ' + RUN)
if (FAST) log('fast mode: one driver and one navigator for each group that waits for no other; the other groups run the default pipeline')
const state = {}, spent = {}
const reserved = g => G.reduce((n, h) => n + (h.id !== g.id && state[h.id] && state[h.id].state === 'running' ? Math.max(0, SHARE - (spent[h.id] || 0)) : 0), 0)
const takeRepair = g => (repairsLeft > 0 && ((spent[g.id] || 0) < SHARE || repairsLeft > reserved(g)) ? (repairsLeft--, spent[g.id] = (spent[g.id] || 0) + 1, true) : false)
const waiting = new Map(G.map(g => { let res; const p = new Promise(r => { res = r }); return [g.id, { p, res }] }))
const as = (node, prompt, schema, label, model) => runR(node, prompt, { schema, label, phase: 'Build', ...model }, label) // model: {model, effort} of an escalated repair (`tdd.mjs resume --escalate G`)
const gaps = chk => chk.missing.map(m => ({ cls: 'gap', what: 'DoD ' + m.dod + ' has no ' + m.kind + ' test (a test whose name contains ' + m.dod + ')' })).concat(chk.bad.map(b => ({ cls: 'test', what: 'matrix row ' + b.row.dod + '/' + b.row.kind + ' ' + b.row.test + ' cannot count: ' + b.why })))
const wrongOf = r => (Array.isArray(r && r.testWrong) ? r.testWrong : []).filter(n => n && typeof n.test === 'string' && n.test).slice(0, 6)
const needsWork = n => n.verdict !== 'PASS' || (n.defects || []).length > 0 || n.gateOk === false // a PASS that admits a command printed ok=false is not a pass

// A stage is a loop, not a shot: a driver pass, then an independent check on fresh gate facts; the defects go back to the driver until the check passes, the same defects
// come back (no progress), or ROUNDS repair rounds are spent. Labels: the first repair is :rework / :recheck, the next :rework2 / :recheck2.
const lab = (node, gid, tag, n) => node + ':' + gid + (n ? ':' + tag + (n > 1 ? n : '') : '')
const defectsOf = (nav, cls) => ((nav.defects || []).length ? nav.defects : [{ cls, what: 'the navigator reported ' + (nav.verdict !== 'PASS' ? 'FAIL' : 'PASS with gateOk=false') + ': ' + clip(nav.notes, 300) }])

async function build(g) {
  const R = RESUME && RESUME.groups[g.id] ? RESUME.groups[g.id] : null // the continue file's entry: where this group stood when the last run stopped
  const from = R && ['done', 'red', 'red-check', 'red-fix', 'green', 'green-check', 'green-fix'].includes(R.next) ? R.next : 'red'
  const st = state[g.id] = { state: 'running', red: { reworks: 0 }, green: { reworks: 0 }, matrix: R && R.matrix ? R.matrix : [], files: R && R.files ? R.files : [] }
  const stop = (s, why) => { st.state = s; st.reason = why; st.retest = retest; log(g.id + ' ' + s.toUpperCase() + ': ' + why); return false }
  const items = itemsOf(g)
  const seen = (stage, nav, driver) => ({ reworks: st[stage].reworks, verdict: needsWork(nav) ? 'FAIL' : 'PASS', defects: nav.defects || [], gateOk: nav.gateOk, driver })
  const drv = r => ({ gateOk: r.gateOk, gateRuns: r.gateRuns })
  // What a maker that stopped on a failing gate still knew (and what `tdd.mjs resume` read off the gate files): the next pass starts from that list, so no check is
  // spent on a failure that is already known. A PASS is never taken from a maker: only a navigator on fresh gate facts can end a stage.
  const admit = r => (r && r.gateOk === false && Array.isArray(r.remaining) && r.remaining.length ? r.remaining.slice(0, 6) : null)
  let chk = checkMatrix(items, st.matrix, g.tests), driver = {}, retest = !!(R && R.retest) // retest: set by a strengthening pass (cls gap) only, never by an unsanctioned edit
  const testDefects = [], tdKey = t => JSON.stringify([t.file, t.line, t.why])
  // `tdd.mjs resume` read the gate files and said: the sandbox is broken (env) or the same defects already stalled (hold). Nothing is spent until the lead changes that.
  if (R && (R.next === 'env' || R.next === 'hold')) return stop('paused', (R.next === 'env' ? 'environment, not code: ' : 'held: ') + clip(R.why, 400)) // paused, not blocked: nothing is reviewed until the lead has decided
  const mk = R && R.escalate ? { model: 'opus', effort: 'high' } : undefined // the lead asked for one stronger maker on this group's repairs
  // fast mode: a group that waits for no other, starting from scratch, has ONE driver (tests, RED gate, code, GREEN gate) and ONE navigator over both gates. A group that waits keeps
  // the default two-stage path (its RED runs while the other group is built), as does any group a continue file restarts mid-way; a group's own RED navigator is never skipped.
  const oneDriver = groupMode(FAST, g, from) === 'fast'
  let judgeRed = oneDriver || (FAST && !!(R && R.merged))
  const TWG = TW && judgeRed // this group's tests belong to the test writer: it, not a red-driver, changes them after RED (ADR 0011 A8) // its one navigator also judges RED, and keeps doing so when a continue file restarts the group after the first run (`merged` in the entry)
  let mergedPending = null, driverWroteCode = false
  const redNotes = [] // what the one navigator said about RED tests: kept in the return (green.redNotes), never dropped with a PASS

  // A stage is a loop, not a shot: check on fresh gate facts, send the defects to the maker, check again; it ends on a pass, on the same defects coming back (no progress),
  // after ROUNDS repairs (blocked), or when the run-wide repair budget is spent (paused: `tdd.mjs resume` continues it). Labels: :rework / :recheck, then :rework2 / :recheck2.
  async function loop(key, pending, o) {
    let before = null
    for (let n = 0; ; n++) {
      if (!pending) {
        const nav = await o.check(n, before)
        if (!nav) return stop('failed', key + '-navigator returned nothing' + (n ? ' on re-check ' + n : ''))
        st[key] = { ...seen(key, nav, driver), ...(o.extra ? o.extra() : {}) }
        if (!needsWork(nav)) return true
        pending = defectsOf(nav, o.cls)
      }
      st[key] = { ...st[key], verdict: 'FAIL', defects: pending }
      const env = pending.find(d => d.cls === 'env') // the sandbox, not the code: a repair cannot fix it and none is spent
      if (env) return stop('paused', 'environment, not code (' + key.toUpperCase() + '): ' + clip(env.what, 200) + ' | fix the sandbox, run tdd.mjs preflight, then tdd.mjs resume: no repair was spent')
      const W = key.toUpperCase(), why = clip(pending[0].what, 200)
      if (n >= ROUNDS) return stop('blocked', W + ' still failing its check after ' + n + ' repair round(s): ' + why)
      if (before && sig(pending) === sig(before)) return stop('blocked', W + ' made no progress: the same defects came back after repair round ' + n + ': ' + why)
      if (!takeRepair(g)) return stop('paused', (repairsLeft > 0 ? 'the rest of the run-wide repair budget (' + BUDGET + ') is reserved for the groups still running' : 'the run-wide repair budget (' + BUDGET + ') is spent') + ' after ' + n + ' repair round(s), still failing: ' + clip(pending[0].what, 140) + ' | continue with tdd.mjs resume (it sets the next budget: --max-repairs N)')
      st[key].reworks = n + 1
      before = pending
      pending = await o.repair(pending, n + 1)
    }
  }
  const redStage = pending => loop('red', pending, {
    cls: 'test',
    check: (n, before) => as('red-navigator', redNavPrompt(g, st.matrix, chk, before, n), NAV, lab('red-navigator', g.id, 'recheck', n)),
    repair: async (defects, k) => {
      const again = await as('red-driver', redPrompt(g, { defects }), RED_DRIVER, lab('red-driver', g.id, 'rework', k), mk)
      if (again) { st.matrix = again.matrix || st.matrix; st.files = again.files || st.files; chk = checkMatrix(items, st.matrix, g.tests); driver = drv(again) }
      return admit(again)
    },
  })
  const greenStage = pending => loop('green', pending, {
    cls: 'impl',
    extra: () => ({ testDefects: testDefects.length ? testDefects : undefined, ...(redNotes.length ? { redNotes } : {}) }),
    check: (n, before) => {
      const check = as('green-navigator', greenNavPrompt(g, { recheck: before, retest, rows: st.matrix, n, ...(judgeRed ? { merged: true } : {}) }), NAV, lab('green-navigator', g.id, 'recheck', n))
      return !judgeRed ? check : check.then(nav => { // the one navigator's words about RED tests survive a PASS
        const note = clip(String((nav && nav.notes) || '').trim(), 400)
        if (note && redNotes.length < 4 && !redNotes.includes(note)) redNotes.push(note)
        // a note that opens with the marker is a wrong-test finding in the wrong field: a PASS that carries it is a FAIL, so the test is corrected instead of the group ending done
        return nav && WRONG_RE.test(note) && !(nav.defects || []).some(isWrongTest) ? { ...nav, defects: [...(nav.defects || []), { cls: 'test', what: note }] } : nav
      })
    },
    repair: async (defects, k) => {
      if (TWG) return writerRepair(defects, k)
      const wrong = judgeRed ? defects.filter(isWrongTest) : [] // a test the one navigator calls outright wrong: corrected in place, never "restored" to the RED version
      const weak = defects.filter(d => d.cls === 'gap'), changed = defects.filter(d => d.cls === 'test' && !wrong.includes(d)), code = defects.filter(d => d.cls !== 'gap' && d.cls !== 'test')
      const tests = weak.length + changed.length + wrong.length // a gap is strengthened; a frozen test that was changed or a DoD pair that no longer closes is RESTORED, and its gate run stays without --retest
      const solo = !(tests && code.length) // two makers on one group must not both run its gate on a half-edited tree
      const jobs = []
      if (code.length) jobs.push(() => as('green-driver', greenPrompt(g, { defects: code, solo, retest }), GREEN_DRIVER, lab('green-driver', g.id, 'rework', k), mk))
      if (tests) jobs.push(() => as('red-driver', redPrompt(g, { strengthen: weak, restore: changed, ...(wrong.length ? { fixWrong: wrong } : {}), solo, retest }), RED_DRIVER, lab('red-driver', g.id, 'strengthen', k), mk))
      const res = await parallel(jobs) // different files (src vs tests): safe side by side
      const fixedCode = (res[0] && code.length ? res[0] : {}), added = (res[code.length ? 1 : 0] || {}).matrix || []
      for (const t of fixedCode.testDefects || []) if (!testDefects.some(x => tdKey(x) === tdKey(t))) testDefects.push(t)
      if (code.length && res[0]) driver = { ...drv(res[0]), testGaps: (res[0].testGaps || []).length ? res[0].testGaps : undefined } // the latest maker's own claim
      if (weak.length || wrong.length) retest = true
      if (tests && added.length) st.matrix = st.matrix.concat(added.filter(a => !st.matrix.some(m => m.test === a.test && m.file === a.file)).map(a => ({ ...a, late: true }))) // written after GREEN: they never failed at RED, so the closure does not credit them
      return solo ? admit(res[0]) : null
    },
  })

  // fast mode with the test writer: code defects go to a code driver, test defects to the test writer (red --rewrite, never --retest); a testWrong note the code driver
  // returns instead of a fix goes back to the test writer as a test defect
  async function writerRepair(defects, k) {
    const tests = defects.filter(d => d.cls === 'gap' || d.cls === 'test'), code = defects.filter(d => d.cls !== 'gap' && d.cls !== 'test')
    const solo = !(tests.length && code.length), jobs = []
    if (code.length) jobs.push(() => as('code-driver', codeDriverPrompt(g, { defects: code, solo }), CODE_DRIVER, lab('code-driver', g.id, 'rework', k), mk))
    if (tests.length) jobs.push(() => as('test-writer', testWriterPrompt(g, { defects: tests, solo }), TEST_WRITER, lab('test-writer', g.id, 'strengthen', k), mk))
    const res = await parallel(jobs), cd = code.length ? res[0] : null, tw = res[code.length ? 1 : 0]
    if (cd) driver = { ...drv(cd), testGaps: (cd.testGaps || []).length ? cd.testGaps : undefined }
    if (tests.length && tw && (tw.matrix || []).length) { st.matrix = tw.matrix; chk = checkMatrix(items, st.matrix, g.tests) }
    const notes = cd ? wrongOf(cd) : []
    if (notes.length) return notes.map(n => ({ cls: 'test', what: WRONG + ' ' + n.test + ': ' + clip(n.reason, 300) + ' (a testWrong note of the code driver)' }))
    return solo ? admit(res[0]) : null
  }
  // the test writer writes the tests and proves RED; a code driver writes the code; its testWrong notes go back to the test writer (fix, or reject with a reason), then on
  async function writerPath() {
    let tw = await as('test-writer', testWriterPrompt(g, {}), TEST_WRITER, 'test-writer:' + g.id)
    if (!tw) return stop('failed', 'test-writer returned nothing')
    chk = checkMatrix(items, tw.matrix, g.tests)
    if ((chk.missing.length || chk.bad.length) && takeRepair(g)) { // before any code: one rework closes the matrix, as the default RED stage does
      const again = await as('test-writer', testWriterPrompt(g, { defects: gaps(chk), solo: true }), TEST_WRITER, 'test-writer:' + g.id + ':matrix', mk)
      if (again) { tw = again; chk = checkMatrix(items, tw.matrix, g.tests) }
    }
    st.matrix = tw.matrix || []
    st.files = tw.files || []
    st.red = { reworks: 0, verdict: 'merged', merged: true, writer: true } // no RED navigator: the one navigator after GREEN judges both gates
    if (chk.missing.length || chk.bad.length) return stop('blocked', 'the test writer left DoD pairs uncovered: ' + clip(knownGaps(chk), 200))
    let cd = await as('code-driver', codeDriverPrompt(g, {}), CODE_DRIVER, 'code-driver:' + g.id, mk)
    if (!cd) return stop('failed', 'code-driver returned nothing')
    for (let k = 1; wrongOf(cd).length; k++) {
      const notes = wrongOf(cd)
      if (k > ROUNDS) return stop('blocked', 'testWrong notes still open after ' + ROUNDS + ' round(s): ' + clip(notes[0].test + ': ' + notes[0].reason, 200))
      if (!takeRepair(g)) return stop('paused', 'the run-wide repair budget (' + BUDGET + ') is spent with testWrong notes open: ' + clip(notes[0].test, 100) + ' | continue with tdd.mjs resume')
      const fix = await as('test-writer', testWriterPrompt(g, { notes }), TEST_WRITER, lab('test-writer', g.id, 'wrong', k), mk)
      if (!fix) return stop('failed', 'test-writer returned nothing for a testWrong note')
      if ((fix.matrix || []).length) { st.matrix = fix.matrix; chk = checkMatrix(items, st.matrix, g.tests) }
      cd = await as('code-driver', codeDriverPrompt(g, { rejected: (fix.rejected || []).filter(n => n && n.test) }), CODE_DRIVER, lab('code-driver', g.id, 'again', k), mk)
      if (!cd) return stop('failed', 'code-driver returned nothing after the test writer answered its notes')
    }
    driver = { ...drv(cd), testGaps: (cd.testGaps || []).length ? cd.testGaps : undefined }
    driverWroteCode = true
    mergedPending = admit(cd)
    return true
  }

  // what a continue file carries over for RED: a one-driver group of the last run stays marked, since no RED navigator ever saw its tests (its green navigator keeps judging RED: judgeRed)
  const carriedRed = () => (FAST && R && R.merged ? { reworks: 0, verdict: 'merged', merged: true, carried: true } : { reworks: 0, verdict: 'PASS', carried: true })
  if (from === 'done') { // judged PASS last run, gates fresh and ok, DoD pairs closed (all read by tdd.mjs resume): nothing to spend here
    st.red = carriedRed(); st.green = { reworks: 0, verdict: 'PASS', carried: true }; st.retest = retest; st.state = 'done'
    log(g.id + ' carried over as done'); return
  }
  if (/^green/.test(from)) st.red = carriedRed()
  else if (oneDriver && TW) { if (!(await writerPath())) return }
  else if (oneDriver) {
    const r = await as('tdd-driver', fastDriverPrompt(g), TDD_DRIVER, 'tdd-driver:' + g.id)
    if (!r) return stop('failed', 'tdd-driver returned nothing')
    chk = checkMatrix(items, r.matrix, g.tests)
    st.matrix = r.matrix || []
    st.files = r.files || []
    testDefects.push(...(r.testDefects || []))
    driver = { ...drv(r), testGaps: (r.testGaps || []).length ? r.testGaps : undefined }
    if (!(r.srcFiles || []).length) { // it stopped in RED, no source written: whatever it admits is a RED defect. The default RED stage repairs it (the normal RED defects prompt, a RED navigator), GREEN follows with the default driver
      judgeRed = false
      log(g.id + ': the tdd-driver wrote no source: the default RED stage takes over')
      if (!(await redStage(admit(r)))) return
    } else if (chk.missing.length || chk.bad.length) { // a pair missing after GREEN cannot be closed: a later test never failed at RED and credits nothing, so no repair is spent on it
      st.red = { reworks: 0, verdict: 'merged', merged: true }
      return stop('blocked', 'the one driver left DoD pairs uncovered (' + clip(knownGaps(chk), 200) + ') and a test written after GREEN cannot close them: add the test, run `tdd.mjs red` and `tdd.mjs green --retest`, then `tdd.mjs resume`, or run this group without fast mode')
    } else {
      st.red = { reworks: 0, verdict: 'merged', merged: true } // no RED navigator: the one navigator after GREEN judges both gates
      driverWroteCode = true
      mergedPending = admit(r)
    }
  } else {
    let pending = from === 'red-fix' && R.defects && R.defects.length ? R.defects : null // red-check: no maker first, the navigator looks at what is on disk
    if (from === 'red') {
      let r = await as('red-driver', redPrompt(g, {}), RED_DRIVER, 'red-driver:' + g.id)
      if (!r) return stop('failed', 'red-driver returned nothing')
      chk = checkMatrix(items, r.matrix, g.tests)
      if ((chk.missing.length || chk.bad.length) && takeRepair(g)) { // code-checked before any navigator is paid for; it spends one repair of the run's budget
        log(g.id + ': matrix incomplete (' + chk.missing.length + ' missing, ' + chk.bad.length + ' unusable): one rework before the check')
        const again = await as('red-driver', redPrompt(g, { defects: gaps(chk) }), RED_DRIVER, 'red-driver:' + g.id + ':matrix')
        if (again) { r = again; chk = checkMatrix(items, r.matrix, g.tests) }
      }
      st.matrix = r.matrix || []
      st.files = r.files || []
      driver = drv(r)
      pending = admit(r)
    }
    if (!(await redStage(pending))) return
  }

  for (const d of g.after || []) if (!(await waiting.get(d).p)) return stop('blocked', 'waits for group ' + d + ', which is not done')

  let pending = from === 'green-fix' && R.defects && R.defects.length ? R.defects : null // green-check: the navigator runs the gate on what is on disk
  if (driverWroteCode) pending = mergedPending
  else if (from !== 'green-check' && from !== 'green-fix') {
    const gd = await as('green-driver', greenPrompt(g, { retest }), GREEN_DRIVER, 'green-driver:' + g.id)
    if (!gd) return stop('failed', 'green-driver returned nothing')
    testDefects.push(...(gd.testDefects || []))
    driver = { ...drv(gd), testGaps: (gd.testGaps || []).length ? gd.testGaps : undefined }
    pending = admit(gd)
  }
  if (!(await greenStage(pending))) return
  st.retest = retest
  st.state = 'done'
}
await parallel(G.map(g => async () => {
  try { await build(g) } catch (e) { const st = state[g.id] || (state[g.id] = { red: {}, green: {}, matrix: [], files: [] }); st.state = 'failed'; st.reason = String((e && e.message) || e); log(g.id + ' FAILED: ' + st.reason) } finally { waiting.get(g.id).res(!!state[g.id] && state[g.id].state === 'done') }
}))
const doneIds = G.filter(g => state[g.id] && state[g.id].state === 'done').map(g => g.id)
log('build: ' + doneIds.length + '/' + G.length + ' group(s) done' + (doneIds.length < G.length ? '; not done: ' + G.filter(g => !doneIds.includes(g.id)).map(g => g.id + ' (' + state[g.id].state + ')').join(', ') : ''))

// ---------------------------------------------------------------- review: optional integration test, then one reviewer over the whole diff
phase('Review')
let integration = null, review = null
const integrate = () => runR('integration-tester', integPrompt(), { schema: INTEG, label: 'integration-tester', phase: 'Review' }, 'integration-tester')
const pausedIds = G.filter(g => state[g.id] && state[g.id].state === 'paused').map(g => g.id)
if (reviewInParallel(SP, !!(A.integration && A.integration.file) && doneIds.length === G.length)) {
  log('integration-tester and reviewer run at the same time; the reviewer leaves ' + A.integration.file + ' out')
  const both = await parallel([integrate, () => runR('reviewer', reviewPrompt(A.integration.file), { schema: TW ? REVIEW_TW : REVIEW, label: 'reviewer', phase: 'Review' }, 'reviewer')])
  integration = both[0]
  review = both[1]
} else {
  if (A.integration && A.integration.file) {
    if (doneIds.length === G.length) integration = await integrate()
    else log('integration-tester skipped: it needs every group done')
  }
  if (doneIds.length && !pausedIds.length) review = await runR('reviewer', reviewPrompt(), { schema: TW ? REVIEW_TW : REVIEW, label: 'reviewer', phase: 'Review' }, 'reviewer')
  else log(pausedIds.length ? 'reviewer skipped: group(s) ' + pausedIds.join(', ') + ' paused; the review reads the whole change once, so continue with tdd.mjs resume first' : 'reviewer skipped: no group is done')
}
const clusters = ((review && review.findings) || []).map(f => {
  const sev = SEV[f.severity] >= 0 ? f.severity : 'low', p = f.proof || { mode: 'none' }
  const status = SEV[sev] >= SEV.medium ? (PROVEN.includes(p.mode) ? 'confirmed' : 'unproven') : sev === 'nit' ? 'unverified-nit' : 'pending-code-check'
  return { id: 'R-' + h32(f.file + ':' + f.startLine + ':' + f.title), status, severity: sev, evidence: PROVEN.includes(p.mode) ? p.mode : 'none', file: f.file, startLine: f.startLine | 0, endLine: f.endLine || f.startLine | 0, points: [], anchorable: !!f.anchorable,
    title: clip(f.title, 160), quote: clip(f.quote, 300), hazard: clip(f.hazard, 600), failureScenario: clip(f.failureScenario, 600), suggestedFix: clip(f.suggestedFix, 600),
    ...(f.replacement && f.replacement.length <= 2400 && f.anchorable ? { replacement: f.replacement } : {}), proof: PROVEN.includes(p.mode) ? { mode: p.mode, ref: clip(p.ref, 200), quote: clip(p.quote, 300), command: clip(p.command, 160), exit: p.exit } : undefined, verdicts: [] }
}).sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.id.localeCompare(b.id))

const ownerOf = f => (G.find(g => g.tests.includes(f) || g.src.includes(f)) || { id: '_extra' }).id
// ---------------------------------------------------------------- judge (ADR 0011 A16, fast mode with the test writer): the final gate's survivors, marked equivalent or sent back
// to the test writer of the group that owns the file. The reviewer ran the final gate first and copied its survivors.
const survivorsOf = rv => {
  const list = rv && rv.final && Array.isArray(rv.final.survivors) && rv.final.survivors.length ? rv.final.survivors : (rv && Array.isArray(rv.survivors) ? rv.survivors : [])
  const seenS = new Set()
  return list.filter(m => m && typeof m.id === 'string' && m.id && !seenS.has(m.id) && seenS.add(m.id)).slice(0, 20)
}
let judged = null
const survived = TW && review ? survivorsOf(review) : []
if (survived.length && !(review.final && review.final.ok === true)) {
  const j = await runR('judge', judgePrompt(survived), { schema: JUDGE, label: 'judge', phase: 'Review' }, 'judge')
  const ids = survived.map(m => m.id), marked = j ? (j.marked || []).filter(id => ids.includes(id)) : []
  judged = { marked, unmarked: ids.filter(id => !marked.includes(id)), finalOk: j ? j.finalOk : undefined, writers: {} }
  log('judge: ' + marked.length + ' survivor(s) marked equivalent, ' + judged.unmarked.length + ' go back to the test writer')
}
phase('Fix')
if (judged && judged.unmarked.length) { // a survivor no group owns by file goes to every group that is done
  const left = survived.filter(m => judged.unmarked.includes(m.id)), by = {}
  for (const m of left) { const o = ownerOf(m.file || ''); for (const gid of o !== '_extra' ? [o] : doneIds) (by[gid] = by[gid] || []).push(m) }
  await parallel(Object.keys(by).map(gid => async () => {
    const label = 'test-writer:' + gid + ':survivors'
    const r = await runR('test-writer', testWriterPrompt(byId[gid], { survivors: by[gid] }), { schema: TEST_WRITER, label, phase: 'Fix' }, label)
    judged.writers[gid] = r ? { done: r.done === true, gateOk: r.gateOk, survivors: by[gid].map(m => m.id) } : { done: false, survivors: by[gid].map(m => m.id) }
  }))
}

// ---------------------------------------------------------------- fix: one fixer per owning group, so no two fixers touch the same file
const work = {}, byHand = []
const safeFile = f => typeof f === 'string' && f !== '' && !f.startsWith('/') && !f.startsWith('.') && !f.includes('\0') && !f.split('/').includes('..')
for (const c of clusters.filter(x => x.status !== 'unverified-nit')) {
  if (ownerOf(c.file) === '_extra' && !safeFile(c.file)) { byHand.push({ id: c.id, why: 'file outside the plan is absolute, hidden or leaves the repo: fix by hand' }); continue }
  (work[ownerOf(c.file)] = work[ownerOf(c.file)] || []).push(c)
}
const fixes = {}
// A group's gate builds on the working-tree files of the groups it waits for, so a fixer starts only after the fixers of every group it (transitively) waits for are done:
// otherwise its gate runs against a half-edited dependency and overwrites its own gate file with a result nobody can reproduce. Independent groups still fix side by side.
const upstream = (id, seen = new Set()) => { for (const d of byId[id].after || []) if (!seen.has(d)) { seen.add(d); upstream(d, seen) } return seen }
async function fixInOrder(gids, job) {
  const mine = new Map(gids.filter(gid => byId[gid]).map(gid => { let res; const p = new Promise(r => { res = r }); return [gid, { p, res }] }))
  await parallel(gids.map(gid => async () => {
    try {
      for (const d of byId[gid] ? upstream(gid) : []) if (mine.has(d)) await mine.get(d).p
      await job(gid)
    } finally { if (mine.has(gid)) mine.get(gid).res(true) }
  }))
}
await fixInOrder(Object.keys(work), async gid => {
  const fs = work[gid]
  const files = gid === '_extra' ? [...new Set(fs.map(c => c.file))] : byId[gid].tests.concat(byId[gid].src)
  const r = await runR('fixer', fixPrompt(gid, files, fs.slice(0, 8)), { schema: FIX, label: 'fixer:' + gid, phase: 'Fix' }, 'fixer:' + gid)
  const over = fs.slice(8).map(c => ({ id: c.id, why: 'over the 8-finding cap of one fixer' }))
  fixes[gid] = r ? { fixed: r.fixed, notFixed: (r.notFixed || []).concat(over), outOfScope: r.outOfScope || [], gateOk: r.gateOk, gateRuns: r.gateRuns } : { fixed: [], notFixed: fs.map(c => ({ id: c.id, why: 'fixer returned nothing' })), outOfScope: [] }
})

const ranFixers = Object.keys(fixes).length
if (byHand.length) fixes._byHand = { fixed: [], notFixed: byHand, outOfScope: [] }

// ---------------------------------------------------------------- converge: fixes are edits too, so the whole change is re-checked once they are in
// A courier re-runs the final gate (it cannot be run by the fixers: they edit side by side, so the tree is never whole while they work); what it names goes back to the
// group that owns the file: check, fix, check (and once more when rounds allow: at most two fix passes). A problem with no owner, or one still failing after the last check,
// is listed under notDone. A failure caused by another group's code goes to the owner of the failing file; if its fence cannot reach the cause it says notFixed.
phase('Converge')
let verified = null, courierSkipped = false
const finalFixers = []
const asFinding = p => ({ id: 'F-' + h32(String(p.file) + String(p.what)), severity: 'high', file: p.file || '', startLine: 0, endLine: 0, title: clip(p.what, 120), hazard: clip(p.what, 300) + ' (fix the group code; never edit an existing test to make it pass; run that one test file once with the test command to see the failure)' })
if (ranFixers && doneIds.length && skipCourier(SP, fixes)) { courierSkipped = true; log('courier skipped: every fixer reported its gate ok; tdd.mjs verify re-runs the final gate and is the check') } // PTDD_COURIER_SKIP_ENABLED
else if (ranFixers && doneIds.length) {
  const last = Math.min(2, ROUNDS) + 1 // couriers: one per fix pass, plus the check after the last pass
  for (let n = 1; n <= last; n++) {
    const label = 'final-verifier' + (n > 1 ? ':' + n : '')
    const v = await runR('final-verifier', verifyPrompt(), { schema: VERIFIED, label, phase: 'Converge' }, label)
    verified = { ok: !!(v && v.ok), rounds: n, problems: v ? v.problems || [] : [{ what: 'the final verifier returned nothing' }] }
    if (!v || v.ok || n === last) break
    const mine = {} // a problem with no owner (a stray file, an unplaced regression) stays in verified.problems and under notDone
    for (const p of verified.problems) { const o = ownerOf(p.file || '') !== '_extra' ? ownerOf(p.file) : (byId[p.group] ? p.group : ''); if (o) (mine[o] = mine[o] || []).push(p) }
    if (!Object.keys(mine).length) break
    log('converge round ' + n + ': ' + Object.entries(mine).map(([gid, ps]) => gid + ' ' + ps.length).join(', ') + ' problem(s) go back to their owners')
    await fixInOrder(Object.keys(mine), async gid => {
      const fl = 'fixer:' + gid + ':final' + (n > 1 ? n : '')
      const r = await runR('fixer', fixPrompt(gid, byId[gid].tests.concat(byId[gid].src), mine[gid].slice(0, 8).map(asFinding)), { schema: FIX, label: fl, phase: 'Converge' }, fl)
      finalFixers.push({ round: n, group: gid, fixed: r ? r.fixed : [], gateOk: r ? r.gateOk : undefined })
    })
  }
  if (verified && finalFixers.length) verified.fixers = finalFixers
}

// ---------------------------------------------------------------- compact return
const total = Object.values(used).reduce((a, b) => a + b, 0)
const notDone = G.filter(g => state[g.id].state !== 'done').map(g => g.id + ' ' + state[g.id].state + ': ' + state[g.id].reason)
  .concat(judged ? Object.entries(judged.writers).filter(([, w]) => !w.done || w.gateOk === false).map(([gid, w]) => gid + ': surviving mutants not killed after the judge: ' + w.survivors.join(', ')) : [])
  .concat(verified && !verified.ok ? ['final gate still failing after ' + verified.rounds + ' round(s): ' + verified.problems.slice(0, 3).map(p => (p.file ? p.file + ' ' : '') + clip(p.what, 100)).join('; ')] : [])
const sha8 = String(A.base).slice(0, 8)
const boardMd = ['# paired-agent-tdd ' + sha8, 'Run folder: ' + RUN, '', '| group | state | RED | GREEN | reworks | note |', '|---|---|---|---|---|---|',
  ...G.map(g => { const s = state[g.id]; return '| ' + g.id + ' | ' + s.state + ' | ' + (s.red.verdict || '-') + ' | ' + (s.green.verdict || '-') + ' | ' + ((s.red.reworks || 0) + (s.green.reworks || 0)) + ' | ' + clip(s.reason || '', 80) + ' |' }),
  '', '| finding | severity | status | evidence |', '|---|---|---|---|', ...clusters.slice(0, 30).map(c => '| ' + c.id + ' | ' + c.severity + ' | ' + c.status + ' | ' + c.evidence + ' |'),
  ...G.filter(g => (state[g.id].green.redNotes || []).length).map((g, i) => (i ? '' : '\nRED notes of the one navigator (one-driver groups):\n') + '- ' + g.id + ': ' + state[g.id].green.redNotes.join(' | '))].join('\n')
const postmortemMd = ['# Postmortem ' + sha8, '', failed.length ? 'Failed jobs: ' + failed.length : 'No failed jobs.',
  ...failed.flatMap(f => ['', '## ' + f.id + ' (' + f.node + ', ' + f.attempts + ' attempts): ' + f.reason, '- DO: run `' + TDD + ' resume --run ' + RUN + '` (it reads RUN/gates, no agent) and continue with args.resume; `resumeFromRunId` with unchanged args also works in the same session.', "- DON'T: restart from zero or redo files a gate already shows done."]),
  ...notDone.map(n => '\nNot done: ' + n),
  ...(notDone.length ? ['', 'Continue without re-reading anything: `' + TDD + ' resume --run ' + RUN + ' --ret return.json` writes ' + RUN + '/continue.json from the gate files; run the Workflow again with args.resume = its content (done groups cost nothing, the others restart where they stopped; its maxRepairs is the next run\'s budget, change it with --max-repairs N; a group on hold or env needs your decision first).'] : [])].join('\n')
return {
  mode: FAST ? 'fast' : 'standard',
  counts: { groups: G.length, done: doneIds.length, findings: clusters.length, fixedGroups: Object.keys(fixes).length },
  stats: { agentsByNode: used, total, pool: LIM.pool, rounds: ROUNDS, repairBudget: BUDGET, repairsLeft, agentCap: CAP, capped },
  groups: Object.fromEntries(G.map(g => { const s = state[g.id]; return [g.id, { state: s.state, reason: s.reason, red: s.red, green: s.green, matrix: s.matrix, files: s.files, retest: s.retest }] })),
  integration, reviewed: !!review, clusters, fixes, verified, notDone, failed, boardMd, postmortemMd, ...(courierSkipped ? { courierSkipped } : {}), ...(judged ? { judge: judged } : {}),
}
