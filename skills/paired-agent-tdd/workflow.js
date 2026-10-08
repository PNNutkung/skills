export const meta = {
  name: 'paired-agent-tdd',
  description: 'Paired TDD as per-group pipelines: RED then GREEN, each checked by an independent navigator against T0 gate facts; one whole-diff review; one fixer per group. One rolling agent pool, no barrier between groups',
  whenToUse: 'Run after `node tdd.mjs plan`; args = the JSON it prints. mode "plan" returns the agent count and prompt sizes without spawning an agent',
  phases: [
    { title: 'Build', detail: 'per group: red-driver -> red-navigator -> green-driver -> green-navigator; a group that waits for another starts GREEN when that one is done' },
    { title: 'Review', detail: 'optional integration-tester, then ONE opus reviewer over the whole diff' },
    { title: 'Fix', detail: 'one fixer per group that has findings' },
  ],
}

// GENERATED:nodes (node graph.mjs --write)

const NODE = {
  'red-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":40},
  'red-navigator': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":25},
  'green-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":45},
  'green-navigator': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":25},
  'integration-tester': {"model":"sonnet","effort":"high","ponytail":"lite","agentType":"tdd-guide","cap":35},
  'reviewer': {"model":"opus","effort":"high","ponytail":"off","agentType":"code-reviewer","cap":40},
  'fixer': {"model":"sonnet","effort":"medium","ponytail":"full","agentType":"tdd-guide","cap":35},
}
const LIM = {"pool":6,"retry":1,"rework":1}
function plan(g, integration, findingGroups) {
  const counts = { 'red-driver': g, 'red-navigator': g, 'green-driver': g, 'green-navigator': g, 'integration-tester': integration ? 1 : 0, reviewer: 1, fixer: findingGroups };
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// /GENERATED:nodes

// GENERATED:matrix (node graph.mjs --write)

function checkMatrix(items, rows, files) {
  const good = [], bad = [];
  for (const r of rows || []) {
    const it = items.find(i => i.id === (r && r.dod));
    const why = !it ? 'unknown DoD id' : !['happy', 'fail', 'edge'].includes(r.kind) ? 'kind must be happy, fail or edge'
      : !files.includes(r.file) ? 'file is not one of the group test files' : !String(r.test || '').toLowerCase().includes(r.dod.toLowerCase()) ? 'test name must contain its DoD id' : '';
    if (why) bad.push({ row: r, why }); else good.push(r);
  }
  const missing = [];
  for (const it of items) for (const k of it.kinds) if (!good.some(r => r.dod === it.id && r.kind === k)) missing.push({ dod: it.id, kind: k });
  return { missing, bad };
}

// /GENERATED:matrix

// ---------------------------------------------------------------- args and helpers
const A = args || {}
const dry = A.mode === 'plan'
for (const k of ['repo', 'base', 'cmd', 'skillDir', 'runDir']) if (!A[k]) return { error: 'args must be the JSON that `tdd.mjs plan` prints; missing ' + k }
const G = Array.isArray(A.groups) ? A.groups : [], DOD = Array.isArray(A.dod) ? A.dod : []
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
const used = {}
// One rolling pool for every agent of the run: never more than LIM.pool in flight, no wave barrier, a stalled agent holds one slot.
const slot = { n: 0, q: [], take() { return this.n < LIM.pool ? (this.n++, null) : new Promise(r => this.q.push(r)) }, free() { const w = this.q.shift(); if (w) w(); else this.n-- } }
const run = async (node, prompt, o) => {
  used[node] = (used[node] || 0) + 1
  await slot.take()
  try { return await agent(prompt, { model: NODE[node].model, effort: NODE[node].effort, agentType: NODE[node].agentType, ...o }) } finally { slot.free() }
}
const attempts = {}, failed = []
// The working tree is the checkpoint: a dead driver's edits are already on disk, so its successor reads them instead of starting over.
const retryNote = (n, id) => 'RETRY ' + n + '/' + (1 + LIM.retry) + ' of ' + id + ': your predecessor died or returned nothing. Its edits are already in the working tree: read the files and `git diff` first, do not redo finished work.\n\n'
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
const RED_DRIVER = { type: 'object', properties: { matrix: { type: 'array', items: ROW }, files: { type: 'array', items: STR }, outOfScope: OOS, reuse: REUSE, notes: STR }, required: ['matrix', 'files', 'reuse'] }
const GREEN_DRIVER = { type: 'object', properties: { files: { type: 'array', items: STR }, cleanup: STR, reuse: REUSE, testDefects: OOS, outOfScope: OOS, notes: STR }, required: ['files', 'reuse'] }
const DEFECT = { type: 'object', properties: { cls: { enum: ['test', 'impl', 'gap', 'scope'] }, file: STR, line: INT, what: STR, fix: STR }, required: ['cls', 'what'] }
const NAV = { type: 'object', properties: { verdict: { enum: ['PASS', 'FAIL'] }, defects: { type: 'array', items: DEFECT }, gateOk: { type: 'boolean' }, notes: STR }, required: ['verdict', 'defects', 'gateOk'] }
const INTEG = { type: 'object', properties: { file: STR, exit: INT, findings: { type: 'array', items: STR }, notes: STR }, required: ['file', 'exit'] }
const PROOF = { type: 'object', properties: { mode: { enum: ['executed', 'read', 'log', 'metric', 'trace', 'inferred', 'none'] }, ref: STR, quote: STR, command: STR, exit: INT }, required: ['mode'] }
const FINDING = {
  type: 'object',
  properties: { title: STR, severity: { enum: ['critical', 'high', 'medium', 'low', 'nit'] }, file: STR, startLine: INT, endLine: INT, hazard: STR, failureScenario: STR, quote: STR, suggestedFix: STR, replacement: STR, anchorable: { type: 'boolean' }, proof: PROOF },
  required: ['title', 'severity', 'file', 'startLine', 'endLine', 'hazard', 'quote', 'proof'],
}
const REVIEW = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, notes: STR }, required: ['findings'] }
const FIX = { type: 'object', properties: { fixed: { type: 'array', items: STR }, notFixed: { type: 'array', items: { type: 'object', properties: { id: STR, why: STR }, required: ['id', 'why'] } }, outOfScope: OOS }, required: ['fixed', 'notFixed'] }

// ---------------------------------------------------------------- prompts (rules are stated once, tersely; the long form is briefs.md)
const WHERE = 'REPO ' + A.repo + '  BASE ' + String(A.base).slice(0, 8) + '  RUN ' + RUN
const pony = lvl => (lvl === 'off' ? '' : ' PONYTAIL ' + lvl + ': the smallest change that works; evidence and checks are never shortened.')
const cap = node => 'At most ' + NODE[node].cap + ' tool calls.'
const FENCE = files => 'HARD SCOPE FENCE: edit or create ONLY ' + files.join(', ') + '. A file outside that list that needs a change: do NOT edit it, list it under outOfScope (file, line, why). Touching one fails the task; it is reverted and the task re-run.'
const TOOLS = 'TOOLS: Read/Edit/Write/Grep/Glob for files; Bash only for the test command, git and linters; never sed or a heredoc to edit a file. Run only your own test files, one at a time: `' + A.cmd + '`; never the whole suite.'
const RESEARCH = 'RESEARCH FIRST: (1) grep this repo for a sibling pattern, helper or test setup to reuse, (2) the installed library docs for a built-in, (3) only then anything broader. Report which applied as reuse = codebase|docs|oss|none; "nothing to reuse" is a valid answer.'
const PRECEDENT = 'PRECEDENT: before asserting a fail or edge behavior, grep the existing tests for the same flag or mode on a sibling path. A new assertion that contradicts an existing passing test is probably wrong: settle that before you finish.'
const itemsOf = g => g.dod.map(id => { const d = DOD.find(x => x.id === id) || {}; return { id, kinds: d.kinds || ['happy', 'fail', 'edge'], text: d.text || '' } })
const dodLines = g => itemsOf(g).map(i => i.id + ' [' + i.kinds.join(',') + '] ' + clip(i.text, 220)).join('\n')
const head = (g, role, node) => 'ROLE: ' + role + ' (group ' + g.id + ').' + pony(NODE[node].ponytail) + '\n' + WHERE + '\nGOAL: ' + clip(g.goal, 400) + (g.mirror ? '\nMIRROR the existing pattern in ' + g.mirror : '')
const defectLines = ds => ds.map(d => '- [' + (d.cls || 'defect') + '] ' + (d.file ? d.file + (d.line ? ':' + d.line : '') + ' ' : '') + clip(d.what, 300) + (d.fix ? ' | fix: ' + clip(d.fix, 200) : '')).join('\n')
const gateCmd = (stage, g, extra) => TDD + ' ' + stage + ' --run ' + RUN + ' --group ' + g.id + (extra || '')

function redPrompt(g, o) {
  return [
    head(g, 'driver: write the FAILING tests (RED) for this group', 'red-driver'),
    'DEFINITION OF DONE (one test per item and kind; every test name MUST contain its item id, e.g. test_ac1_happy_...; a kind you cannot test is a defect to report, not to skip):\n' + dodLines(g),
    FENCE(g.tests), TOOLS, RESEARCH, PRECEDENT,
    'Each new test must fail for the RIGHT reason: an assertion about behavior that does not exist yet, not a typo. Run each test file once to see it fail.',
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : '',
    o.strengthen ? 'STRENGTHEN: the implementation is done and these mutants SURVIVED, so no test pins that code. Add or sharpen tests so each one would fail (the test must still pass on the current code). Never weaken, skip or delete a test; keep names containing the DoD id.\n' + defectLines(o.strengthen) : '',
    'RETURN: matrix = one row per test {dod, kind, test, file} (test = the exact function name); files = test files touched; outOfScope; reuse; notes (<= 400 chars). ' + cap('red-driver'),
  ].filter(Boolean).join('\n\n')
}
function greenPrompt(g, o) {
  return [
    head(g, 'driver: GREEN, the minimum code that makes the RED tests pass', 'green-driver'),
    'DEFINITION OF DONE:\n' + dodLines(g),
    'THE TESTS ARE FROZEN: ' + g.tests.join(', ') + '. Never edit, skip, loosen or delete a test to get green; a test that is wrong goes under testDefects (file, line, why).',
    FENCE(g.src), TOOLS, RESEARCH,
    'After GREEN, at most ONE cleanup pass, only for a duplicated block (3+ copies) or dead code you added; otherwise cleanup = "none". Re-run the tests after it.',
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : '',
    'RETURN: files = source files touched; cleanup; reuse; testDefects; outOfScope; notes (<= 400 chars). ' + cap('green-driver'),
  ].filter(Boolean).join('\n\n')
}
const NAV_TAIL = 'RETURN: verdict PASS|FAIL; defects = only what MUST be fixed, each {cls test|impl|gap|scope, file, line, what, fix}, at most 6 (anything softer goes in notes); gateOk = the `ok=` value the gate printed; notes <= 400 chars. A claim you did not see in the gate output or in a file you read is not a fact. '
function redNavPrompt(g, rows, chk, recheck) {
  return [
    head(g, 'navigator: verify the RED tests; you did not write them, so judge them independently', 'red-navigator'),
    'FIRST command, once (T0 facts; do not run the tests yourself): `' + gateCmd('red', g) + '`. Its output is ground truth; it names the patch to Read.',
    'DEFINITION OF DONE:\n' + dodLines(g) + '\nDRIVER MATRIX (a claim):\n' + (rows || []).map(r => r.dod + '/' + r.kind + ' ' + r.test + ' (' + r.file + ')').join('\n'),
    chk.missing.length || chk.bad.length ? 'KNOWN GAPS (code-checked): ' + chk.missing.map(m => m.dod + '/' + m.kind + ' has no test').concat(chk.bad.map(b => b.row.dod + ': ' + b.why)).join('; ') : '',
    recheck ? 'RE-CHECK after one rework. Defects reported before:\n' + defectLines(recheck) + '\nVerify each is really fixed; the gate output above is fresh.' : '',
    'CHECK: (1) the gate: every file fails now; "fails-to-load" only when the code under test does not exist yet; "passes-already" needs a stated reason or it is a defect. (2) every matrix row is a real test in that file, named with its id, asserting what the DoD text requires: no tautology, no assertion of the implementation, no mocking of the unit under test. (3) ' + PRECEDENT + ' (4) gap-hunting: legitimate inputs the new check would wrongly reject, and kinds covered by a token test only. (5) scope: only ' + g.tests.join(', ') + ' changed (the gate lists strays).',
    NAV_TAIL + cap('red-navigator'),
  ].filter(Boolean).join('\n\n')
}
function greenNavPrompt(g, o) {
  return [
    head(g, 'navigator: verify GREEN; you did not write this code, so judge it independently', 'green-navigator'),
    'FIRST command, once (T0 facts: tests pass and exercise the change, flake, frozen tests, scope, mutants, coverage; do not re-run them): `' + gateCmd('green', g, o.retest ? ' --retest' : '') + '`. Read the patch it names.',
    'DEFINITION OF DONE:\n' + dodLines(g),
    o.recheck ? 'RE-CHECK after one rework' + (o.retest ? ' (tests were strengthened on purpose: the gate ran with --retest; judge those test changes yourself: only additions, nothing weakened)' : '') + '. Defects reported before:\n' + defectLines(o.recheck) + '\nVerify each is really fixed.' : '',
    'CHECK: (1) every reason after "not ok:" in the gate is a defect: a surviving mutant = cls gap (name the assertion that is missing), changed tests = cls test, a stray file = cls scope, anything else cls impl. (2) minimal: no behavior beyond the DoD; a new helper that duplicates an existing one (grep) is cls impl. (3) no test weakened, skipped or loosened. (4) a cleanup, if any, left behavior unchanged and abstracted nothing prematurely. (5) gap-hunting: legitimate future edits or inputs that the new code would wrongly reject.',
    NAV_TAIL + cap('green-navigator'),
  ].filter(Boolean).join('\n\n')
}
const integPrompt = () => [
  'ROLE: integration tester (all groups are green).' + pony(NODE['integration-tester'].ponytail) + '\n' + WHERE,
  'Write ONE integration test at ' + A.integration.file + ' that drives the full path through the real dependency (no mocks of it): ' + clip(A.integration.goal, 400) + '. ' + FENCE([A.integration.file]),
  TOOLS.replace('your own test files, one at a time', 'that one file'), 'Run it for real and report the exit code; every defect it exposes is a finding string with the output. RETURN: file, exit, findings, notes. ' + cap('integration-tester'),
].join('\n\n')
const SEVERITY = 'SEVERITY: critical = data loss, security flaw or production outage; high = a likely bug or a DoD item not met; medium = a plausible risk or a weak test; low = minor; nit = style. A hazard in untouched code is not a finding unless this diff newly routes traffic through it.'
const PROOF_RULE = 'PROOF (a tool re-checks every ref and quote): read = ref path:startLine-endLine in the reviewed tree, quote copied verbatim from it; executed = ref the id after `ZT-RUN` that a sandbox run printed, quote verbatim from its output; inferred = a guess, allowed only for low and nit. medium and above need executed or read. quote = the offending code verbatim (<= 300 chars); replacement = the exact new text of startLine..endLine for a mechanical fix of <= 40 lines, else empty.'
const reviewPrompt = () => [
  'ROLE: reviewer, the final gate: read the WHOLE change once and file only what you can substantiate. No AI or automation wording in findings: a sharp engineer, defect first, concrete failing input.\n' + WHERE,
  'FIRST command, once (T0 facts for the integrated tree: all group tests together, existing tests that mention the changed modules, scope): `' + TDD + ' final --run ' + RUN + '`. Then Read ' + RUN + '/diff/final.patch and, per group, ' + RUN + '/gates/<group>.green.json (mutants, coverage). Groups: ' + G.map(g => g.id + ' (' + g.tests.concat(g.src).join(', ') + ')').join('; '),
  'DEFINITION OF DONE:\n' + DOD.map(d => d.id + ' [' + (d.kinds || ['happy', 'fail', 'edge']).join(',') + '] ' + clip(d.text, 200)).join('\n'),
  'LOOK FOR: a DoD item the code does not meet; a weak, tautological or over-mocked test; a branch no test pins; input validation missing at a trust boundary; a reinvented helper (grep for the existing one); a comment, docstring or example the change made stale or wrong (check every number in an example). One finding per root cause.',
  SEVERITY, PROOF_RULE, 'RETURN: findings (empty when none) and notes <= 400 chars. ' + cap('reviewer'),
].join('\n\n')
const fixPrompt = (gid, files, fs) => [
  'ROLE: fixer for group ' + gid + '. Fix exactly these findings and nothing else.' + pony(NODE.fixer.ponytail) + '\n' + WHERE,
  'FINDINGS:\n' + fs.map(c => c.id + ' [' + c.severity + '] ' + c.file + ':' + c.startLine + '-' + c.endLine + ' ' + clip(c.title, 120) + ' | ' + clip(c.hazard, 300) + (c.replacement ? ' | replacement for those lines:\n' + c.replacement : c.suggestedFix ? ' | fix: ' + clip(c.suggestedFix, 300) : '')).join('\n'),
  FENCE(files), TOOLS, 'Tests may be added or sharpened, never weakened, skipped or deleted. After the fixes run the group tests. A finding you cannot fix inside the fence: notFixed with why. RETURN: fixed (ids), notFixed [{id, why}], outOfScope. ' + cap('fixer'),
].join('\n\n')

// ---------------------------------------------------------------- dry run
const ex = A.expect || { integration: A.integration ? 1 : 0, findingGroups: 1 }
if (dry) {
  const g = G[0], chk = { missing: [], bad: [] }
  return { dryRun: true, plan: plan(G.length, ex.integration, ex.findingGroups), prompts: [['red-driver', redPrompt(g, {})], ['red-navigator', redNavPrompt(g, [], chk)], ['green-driver', greenPrompt(g, {})], ['green-navigator', greenNavPrompt(g, {})], ['reviewer', reviewPrompt()], ['fixer', fixPrompt(g.id, g.tests.concat(g.src), [])]].map(([node, p]) => ({ node, promptChars: p.length })) }
}

// ---------------------------------------------------------------- build: one pipeline per group, no barrier between groups
phase('Build')
log('groups ' + G.map(g => g.id + (g.after && g.after.length ? ' (after ' + g.after.join(',') + ')' : '')).join(', ') + '; pool ' + LIM.pool + '; run folder ' + RUN)
const state = {}
const waiting = new Map(G.map(g => { let res; const p = new Promise(r => { res = r }); return [g.id, { p, res }] }))
const as = (node, prompt, schema, label) => runR(node, prompt, { schema, label, phase: 'Build' }, label)
const gaps = chk => chk.missing.map(m => ({ cls: 'gap', what: 'DoD ' + m.dod + ' has no ' + m.kind + ' test (a test whose name contains ' + m.dod + ')' })).concat(chk.bad.map(b => ({ cls: 'test', what: 'matrix row ' + b.row.dod + '/' + b.row.kind + ' ' + b.row.test + ' cannot count: ' + b.why })))
const needsWork = n => n.verdict !== 'PASS' || (n.defects || []).length > 0
const firstWhy = n => clip(((n.defects || [])[0] || {}).what || n.notes, 200)

async function build(g) {
  const st = state[g.id] = { state: 'running', red: { reworks: 0 }, green: { reworks: 0 }, matrix: [], files: [] }
  const stop = (s, why) => { st.state = s; st.reason = why; log(g.id + ' ' + s.toUpperCase() + ': ' + why) }
  const items = itemsOf(g)

  let r = await as('red-driver', redPrompt(g, {}), RED_DRIVER, 'red-driver:' + g.id)
  if (!r) return stop('failed', 'red-driver returned nothing')
  let chk = checkMatrix(items, r.matrix, g.tests)
  if (chk.missing.length || chk.bad.length) { // code-checked before any navigator is paid for
    log(g.id + ': matrix incomplete (' + chk.missing.length + ' missing, ' + chk.bad.length + ' unusable): one rework before the check')
    const again = await as('red-driver', redPrompt(g, { defects: gaps(chk) }), RED_DRIVER, 'red-driver:' + g.id + ':matrix')
    if (again) { r = again; chk = checkMatrix(items, r.matrix, g.tests) }
  }
  st.matrix = r.matrix || []
  st.files = r.files || []
  let nav = await as('red-navigator', redNavPrompt(g, st.matrix, chk), NAV, 'red-navigator:' + g.id)
  if (!nav) return stop('failed', 'red-navigator returned nothing')
  if (needsWork(nav)) {
    st.red.reworks = 1
    const before = (nav.defects || []).length ? nav.defects : [{ cls: 'test', what: 'the navigator said FAIL: ' + clip(nav.notes, 300) }]
    const again = await as('red-driver', redPrompt(g, { defects: before }), RED_DRIVER, 'red-driver:' + g.id + ':rework')
    if (again) { st.matrix = again.matrix || st.matrix; st.files = again.files || st.files; chk = checkMatrix(items, st.matrix, g.tests) }
    nav = await as('red-navigator', redNavPrompt(g, st.matrix, chk, before), NAV, 'red-navigator:' + g.id + ':recheck')
    if (!nav) return stop('failed', 'red-navigator returned nothing on the re-check')
  }
  st.red = { reworks: st.red.reworks, verdict: needsWork(nav) ? 'FAIL' : 'PASS', defects: nav.defects || [], gateOk: nav.gateOk }
  if (st.red.verdict !== 'PASS') return stop('blocked', 'RED still failing its check after one rework: ' + firstWhy(nav))

  for (const d of g.after || []) if (!(await waiting.get(d).p)) return stop('blocked', 'waits for group ' + d + ', which is not done')

  const gd = await as('green-driver', greenPrompt(g, {}), GREEN_DRIVER, 'green-driver:' + g.id)
  if (!gd) return stop('failed', 'green-driver returned nothing')
  let gn = await as('green-navigator', greenNavPrompt(g, {}), NAV, 'green-navigator:' + g.id)
  if (!gn) return stop('failed', 'green-navigator returned nothing')
  if (needsWork(gn)) {
    st.green.reworks = 1
    const before = (gn.defects || []).length ? gn.defects : [{ cls: 'impl', what: 'the navigator said FAIL: ' + clip(gn.notes, 300) }]
    const tests = before.filter(d => d.cls === 'gap' || d.cls === 'test'), code = before.filter(d => d.cls !== 'gap' && d.cls !== 'test')
    const jobs = []
    if (code.length) jobs.push(() => as('green-driver', greenPrompt(g, { defects: code }), GREEN_DRIVER, 'green-driver:' + g.id + ':rework'))
    if (tests.length) jobs.push(() => as('red-driver', redPrompt(g, { strengthen: tests }), RED_DRIVER, 'red-driver:' + g.id + ':strengthen'))
    const res = await parallel(jobs) // different files (src vs tests): safe side by side
    const added = (res[code.length ? 1 : 0] || {}).matrix || []
    if (tests.length && added.length) st.matrix = st.matrix.concat(added.filter(a => !st.matrix.some(m => m.test === a.test && m.file === a.file)))
    gn = await as('green-navigator', greenNavPrompt(g, { recheck: before, retest: tests.length > 0 }), NAV, 'green-navigator:' + g.id + ':recheck')
    if (!gn) return stop('failed', 'green-navigator returned nothing on the re-check')
  }
  st.green = { reworks: st.green.reworks, verdict: needsWork(gn) ? 'FAIL' : 'PASS', defects: gn.defects || [], gateOk: gn.gateOk, testDefects: (gd.testDefects || []).length ? gd.testDefects : undefined }
  if (st.green.verdict !== 'PASS') return stop('blocked', 'GREEN still failing its check after one rework: ' + firstWhy(gn))
  st.state = 'done'
}
await parallel(G.map(g => async () => {
  try { await build(g) } catch (e) { const st = state[g.id] || (state[g.id] = { red: {}, green: {}, matrix: [], files: [] }); st.state = 'failed'; st.reason = String((e && e.message) || e); log(g.id + ' FAILED: ' + st.reason) } finally { waiting.get(g.id).res(!!state[g.id] && state[g.id].state === 'done') }
}))
const doneIds = G.filter(g => state[g.id] && state[g.id].state === 'done').map(g => g.id)
log('build: ' + doneIds.length + '/' + G.length + ' group(s) done' + (doneIds.length < G.length ? '; not done: ' + G.filter(g => !doneIds.includes(g.id)).map(g => g.id + ' (' + state[g.id].state + ')').join(', ') : ''))

// ---------------------------------------------------------------- review: optional integration test, then one reviewer over the whole diff
phase('Review')
let integration = null
if (A.integration && A.integration.file) {
  if (doneIds.length === G.length) integration = await runR('integration-tester', integPrompt(), { schema: INTEG, label: 'integration-tester', phase: 'Review' }, 'integration-tester')
  else log('integration-tester skipped: it needs every group done')
}
let review = null
if (doneIds.length) review = await runR('reviewer', reviewPrompt(), { schema: REVIEW, label: 'reviewer', phase: 'Review' }, 'reviewer')
else log('reviewer skipped: no group is done')
const clusters = ((review && review.findings) || []).map(f => {
  const sev = SEV[f.severity] >= 0 ? f.severity : 'low', p = f.proof || { mode: 'none' }
  const status = SEV[sev] >= SEV.medium ? (PROVEN.includes(p.mode) ? 'confirmed' : 'unproven') : sev === 'nit' ? 'unverified-nit' : 'pending-code-check'
  return { id: 'R-' + h32(f.file + ':' + f.startLine + ':' + f.title), status, severity: sev, evidence: PROVEN.includes(p.mode) ? p.mode : 'none', file: f.file, startLine: f.startLine | 0, endLine: f.endLine || f.startLine | 0, points: [], anchorable: !!f.anchorable,
    title: clip(f.title, 160), quote: clip(f.quote, 300), hazard: clip(f.hazard, 600), failureScenario: clip(f.failureScenario, 600), suggestedFix: clip(f.suggestedFix, 600),
    ...(f.replacement && f.replacement.length <= 2400 && f.anchorable ? { replacement: f.replacement } : {}), proof: PROVEN.includes(p.mode) ? { mode: p.mode, ref: clip(p.ref, 200), quote: clip(p.quote, 300), command: clip(p.command, 160), exit: p.exit } : undefined, verdicts: [] }
}).sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.id.localeCompare(b.id))

// ---------------------------------------------------------------- fix: one fixer per owning group, so no two fixers touch the same file
phase('Fix')
const ownerOf = f => (G.find(g => g.tests.includes(f) || g.src.includes(f)) || { id: '_extra' }).id
const work = {}
for (const c of clusters.filter(x => x.status !== 'unverified-nit')) (work[ownerOf(c.file)] = work[ownerOf(c.file)] || []).push(c)
const fixes = {}
await parallel(Object.entries(work).map(([gid, fs]) => async () => {
  const files = gid === '_extra' ? [...new Set(fs.map(c => c.file))] : byId[gid].tests.concat(byId[gid].src)
  const r = await runR('fixer', fixPrompt(gid, files, fs.slice(0, 8)), { schema: FIX, label: 'fixer:' + gid, phase: 'Fix' }, 'fixer:' + gid)
  const over = fs.slice(8).map(c => ({ id: c.id, why: 'over the 8-finding cap of one fixer' }))
  fixes[gid] = r ? { fixed: r.fixed, notFixed: (r.notFixed || []).concat(over), outOfScope: r.outOfScope || [] } : { fixed: [], notFixed: fs.map(c => ({ id: c.id, why: 'fixer returned nothing' })), outOfScope: [] }
}))

// ---------------------------------------------------------------- compact return
const total = Object.values(used).reduce((a, b) => a + b, 0)
const notDone = G.filter(g => state[g.id].state !== 'done').map(g => g.id + ' ' + state[g.id].state + ': ' + state[g.id].reason)
const sha8 = String(A.base).slice(0, 8)
const boardMd = ['# paired-agent-tdd ' + sha8, 'Run folder: ' + RUN, '', '| group | state | RED | GREEN | reworks | note |', '|---|---|---|---|---|---|',
  ...G.map(g => { const s = state[g.id]; return '| ' + g.id + ' | ' + s.state + ' | ' + (s.red.verdict || '-') + ' | ' + (s.green.verdict || '-') + ' | ' + ((s.red.reworks || 0) + (s.green.reworks || 0)) + ' | ' + clip(s.reason || '', 80) + ' |' }),
  '', '| finding | severity | status | evidence |', '|---|---|---|---|', ...clusters.slice(0, 30).map(c => '| ' + c.id + ' | ' + c.severity + ' | ' + c.status + ' | ' + c.evidence + ' |')].join('\n')
const postmortemMd = ['# Postmortem ' + sha8, '', failed.length ? 'Failed jobs: ' + failed.length : 'No failed jobs.',
  ...failed.flatMap(f => ['', '## ' + f.id + ' (' + f.node + ', ' + f.attempts + ' attempts): ' + f.reason, '- DO: read the working tree and RUN/gates first; resume with `Workflow({scriptPath, resumeFromRunId})` and unchanged args.', "- DON'T: restart from zero or redo files a gate already shows done."]),
  ...notDone.map(n => '\nNot done: ' + n)].join('\n')
return {
  mode: 'standard',
  counts: { groups: G.length, done: doneIds.length, findings: clusters.length, fixedGroups: Object.keys(fixes).length },
  stats: { agentsByNode: used, total, pool: LIM.pool },
  groups: Object.fromEntries(G.map(g => { const s = state[g.id]; return [g.id, { state: s.state, reason: s.reason, red: s.red, green: s.green, matrix: s.matrix, files: s.files }] })),
  integration, reviewed: !!review, clusters, fixes, notDone, failed, boardMd, postmortemMd,
}
