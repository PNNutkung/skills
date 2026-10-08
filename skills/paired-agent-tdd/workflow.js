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
  'red-navigator': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":25},
  'green-driver': {"model":"sonnet","effort":"medium","ponytail":"ultra","agentType":"tdd-guide","cap":45},
  'green-navigator': {"model":"sonnet","effort":"high","ponytail":"full","agentType":"code-reviewer","cap":25},
  'integration-tester': {"model":"sonnet","effort":"high","ponytail":"lite","agentType":"tdd-guide","cap":35},
  'reviewer': {"model":"opus","effort":"high","ponytail":"off","agentType":"code-reviewer","cap":40},
  'fixer': {"model":"sonnet","effort":"medium","ponytail":"full","agentType":"tdd-guide","cap":35},
  'final-verifier': {"model":"haiku","effort":"low","ponytail":"off","agentType":"code-reviewer","cap":6},
}
const LIM = {"pool":6,"retry":1,"rounds":3}
function plan(g, integration, findingGroups) {
  const counts = { 'red-driver': g, 'red-navigator': g, 'green-driver': g, 'green-navigator': g, 'integration-tester': integration ? 1 : 0, reviewer: 1, fixer: findingGroups, 'final-verifier': findingGroups ? 1 : 0 };
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
const ROUNDS = Number.isInteger(A.rounds) && A.rounds >= 1 && A.rounds <= 4 ? A.rounds : LIM.rounds // repair rounds per stage; plan.rounds overrides the default
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
const GATE = { gateOk: { type: 'boolean' }, gateRuns: INT } // what the driver's own loop ended on: the navigator runs the gate again, so this is a claim
const RED_DRIVER = { type: 'object', properties: { matrix: { type: 'array', items: ROW }, files: { type: 'array', items: STR }, outOfScope: OOS, reuse: REUSE, notes: STR, ...GATE }, required: ['matrix', 'files', 'reuse'] }
const GREEN_DRIVER = { type: 'object', properties: { files: { type: 'array', items: STR }, cleanup: STR, reuse: REUSE, testDefects: OOS, testGaps: OOS, outOfScope: OOS, notes: STR, ...GATE }, required: ['files', 'reuse'] }
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
const FIX = { type: 'object', properties: { fixed: { type: 'array', items: STR }, notFixed: { type: 'array', items: { type: 'object', properties: { id: STR, why: STR }, required: ['id', 'why'] } }, outOfScope: OOS, ...GATE }, required: ['fixed', 'notFixed'] }
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
const gateCmd = (stage, g, extra) => TDD + ' ' + stage + ' --run ' + RUN + ' --group ' + g.id + (extra || '')
const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'"
const dodCmd = (g, stage, rows) => TDD + ' dod --run ' + RUN + ' --group ' + g.id + ' --stage ' + stage + (rows ? rows.filter(r => !r.late).map(r => ' --row ' + shq([r.dod, r.kind, r.test, r.file].join(':'))).join('') : " --row 'ID:kind:test:file'")
// Two defect lists are the same when they name the same classes, files, lines and words: a repair that changed nothing the check can see. A false "same" blocks a group
// that is making progress (and everything after it), a false "different" only costs a round, so the line and most of the text are part of the key.
const sig = ds => (ds || []).map(d => [d.cls || '', d.file || '', d.line || '', String(d.what || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)].join('|')).sort().join('\n')
// The loop every maker runs on itself with the SAME commands its navigator will run, so "done" is something it saw in a real run, not a feeling.
const KEEP = 'KEEP EDITING until the gate says ok; never stop at a first draft. Every gate command is a real run in the sandbox. At most 3 gate runs; return gateOk (true only when every command printed ok=true) and gateRuns.'
const ALONE = 'Another maker edits the other file set of this group right now: run only your own test files, never the gate; the check runs it after you both finish.'
const redLoop = g => KEEP + ' Write the tests, run each file once and read why it fails, then run `' + gateCmd('red', g) + '` and `' + dodCmd(g, 'red') + '` (one --row per test you wrote). Anything but ok=true (a class other than fails or fails-to-load, a DoD gap, a row naming a test that is not in its file): fix the tests, run both again.'
// --retest only once the tests were strengthened on purpose: it silences "tests changed since RED", which must stay audible for an edit nobody sanctioned.
const retestFlag = on => (on ? ' --retest' : '')
const greenLoop = (g, retest) => KEEP + ' Edit the sources, run the test files until they pass, then run `' + gateCmd('green', g, retestFlag(retest)) + '` and read every reason after "not ok:". Failing or flaky tests, no signal, scope, coverage: fix the code, run the gate again. A surviving mutant is a TEST gap and the tests are frozen: list it under testGaps and stop.'
const strengthenLoop = (g, retest) => KEEP + ' Add or restore the tests, run each file (it must pass), then run `' + gateCmd('green', g, retestFlag(retest)) + '`: a mutant that still survives needs a sharper assertion, so edit and run again.'

function strengthenPrompt(g, o) {
  const gaps = o.strengthen || [], back = o.restore || []
  return [
    head(g, 'driver: ' + (gaps.length ? 'STRENGTHEN' : 'RESTORE') + ' the tests; the implementation is done and passes', 'red-driver'),
    'DEFINITION OF DONE:\n' + dodLines(g),
    gaps.length ? 'These mutants SURVIVED, so no test pins that code. Add or sharpen tests so each one would fail; every new test must PASS on the current code. Never weaken, skip or delete a test. Name new tests with their DoD id set apart by non-alphanumerics (test_ac1_edge_...).\n' + defectLines(gaps) : '',
    back.length ? 'The frozen tests changed since RED, or a DoD pair is no longer closed. Undo that: compare each test file with the version the RED gate saw (`git show <snapshot>:<file>`, snapshot = the "snapshot" field of ' + RUN + '/gates/' + g.id + '.red.json) and put back every test that was removed, skipped, loosened or renamed; tests added on purpose stay.\n' + defectLines(back) : '',
    FENCE(g.tests), TOOLS, PRECEDENT, o.solo === false ? ALONE : strengthenLoop(g, gaps.length > 0 || o.retest),
    'RETURN: matrix = one row per NEW test {dod, kind, test, file}; files; outOfScope; reuse; gateOk; gateRuns; notes (<= 400 chars). ' + cap('red-driver'),
  ].filter(Boolean).join('\n\n')
}
function redPrompt(g, o) {
  if (o.strengthen || o.restore) return strengthenPrompt(g, o)
  return [
    head(g, 'driver: write the FAILING tests (RED) for this group', 'red-driver'),
    'DEFINITION OF DONE (one test per item and kind; every test name MUST contain its item id set apart by non-alphanumerics, e.g. test_ac1_happy_...; one test serves one item and kind only; a kind you cannot test is a defect to report, not to skip):\n' + dodLines(g),
    FENCE(g.tests), TOOLS, RESEARCH, PRECEDENT,
    'Each new test must fail for the RIGHT reason: an assertion about behavior that does not exist yet, not a typo.',
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : '', redLoop(g),
    'RETURN: matrix = one row per test {dod, kind, test, file} (test = the exact function name); files = test files touched; outOfScope; reuse; gateOk; gateRuns; notes (<= 400 chars). ' + cap('red-driver'),
  ].filter(Boolean).join('\n\n')
}
function greenPrompt(g, o) {
  return [
    head(g, 'driver: GREEN, the minimum code that makes the RED tests pass', 'green-driver'),
    'DEFINITION OF DONE:\n' + dodLines(g),
    'THE TESTS ARE FROZEN: ' + g.tests.join(', ') + '. Never edit, skip, loosen or delete a test to get green; a test that is wrong goes under testDefects (file, line, why).',
    FENCE(g.src), TOOLS, RESEARCH,
    o.defects ? '' : 'After GREEN, at most ONE cleanup pass, only for a duplicated block (3+ copies) or dead code you added; otherwise cleanup = "none".' + (o.solo === false ? '' : ' Run the gate again after it.'),
    o.defects ? 'FIX EXACTLY THESE DEFECTS FROM THE CHECK (and nothing else):\n' + defectLines(o.defects) : '', o.solo === false ? ALONE : greenLoop(g, o.retest),
    'RETURN: files = source files touched; cleanup; reuse; testDefects; testGaps; outOfScope; gateOk; gateRuns; notes (<= 400 chars). ' + cap('green-driver'),
  ].filter(Boolean).join('\n\n')
}
const NAV_TAIL = 'RETURN: verdict PASS|FAIL; defects = only what MUST be fixed, each {cls test|impl|gap|scope, file, line, what, fix}, at most 6 (anything softer goes in notes); gateOk = true only if every command printed ok=true; notes <= 400 chars. A claim you did not see in command output or in a file you read is not a fact. '
function redNavPrompt(g, rows, chk, recheck, n) {
  return [
    head(g, 'navigator: verify the RED tests; you did not write them, so judge them independently', 'red-navigator'),
    'FIRST commands, once (T0 facts; do not run the tests yourself): `' + gateCmd('red', g) + '` then `' + dodCmd(g, 'red', rows) + '`. Their output is ground truth; the first names the patch to Read. A DoD gap or a row naming a test that is not in its file is a defect (cls gap or test).',
    'DEFINITION OF DONE:\n' + dodLines(g) + '\nDRIVER MATRIX (a claim):\n' + (rows || []).map(r => r.dod + '/' + r.kind + ' ' + r.test + ' (' + r.file + ')').join('\n'),
    chk.missing.length || chk.bad.length ? 'KNOWN GAPS (code-checked): ' + chk.missing.map(m => m.dod + '/' + m.kind + ' has no test').concat(chk.bad.map(b => b.row.dod + ': ' + b.why)).join('; ') : '',
    recheck ? 'RE-CHECK ' + n + ' after a rework. Defects reported before:\n' + defectLines(recheck) + '\nVerify each is really fixed; the output above is fresh.' : '',
    'CHECK: (1) the gate: every file fails now; "fails-to-load" only when the code under test does not exist yet; "passes-already" needs a stated reason or it is a defect. (2) every matrix row is a real test in that file, named with its id, asserting what the DoD text requires: no tautology, no assertion of the implementation, no mocking of the unit under test. (3) ' + PRECEDENT + ' (4) gap-hunting: legitimate inputs the new check would wrongly reject, and kinds covered by a token test only. (5) scope: only ' + g.tests.join(', ') + ' changed (the gate lists strays).',
    NAV_TAIL + cap('red-navigator'),
  ].filter(Boolean).join('\n\n')
}
function greenNavPrompt(g, o) {
  return [
    head(g, 'navigator: verify GREEN; you did not write this code, so judge it independently', 'green-navigator'),
    'FIRST commands, once (T0 facts: tests pass and exercise the change, flake, frozen tests, scope, mutants, coverage; do not re-run them): `' + gateCmd('green', g, o.retest ? ' --retest' : '') + '` then `' + dodCmd(g, 'green', o.rows) + '` (the DoD pairs closed by tests that failed at RED and pass now). Read the patch the gate names.',
    'DEFINITION OF DONE:\n' + dodLines(g),
    o.recheck ? 'RE-CHECK ' + o.n + ' after a rework' + (o.retest ? ' (tests were strengthened on purpose: the gate ran with --retest; judge those test changes yourself: only additions, nothing weakened)' : '') + '. Defects reported before:\n' + defectLines(o.recheck) + '\nVerify each is really fixed.' : '',
    'CHECK: (1) every reason after "not ok:" in either command is a defect: a surviving mutant = cls gap (name the assertion that is missing), changed tests or a DoD pair no longer closed = cls test, anything else cls impl; a stray file the gate lists is only a hint (other groups share the tree): cls scope only if the patch shows THIS group created it. (2) minimal: no behavior beyond the DoD; a new helper that duplicates an existing one (grep) is cls impl. (3) no test weakened, skipped or loosened. (4) a cleanup, if any, left behavior unchanged and abstracted nothing prematurely. (5) gap-hunting: legitimate future edits or inputs that the new code would wrongly reject.',
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
  'LOOK FOR: every `not ok:` reason of the final gate (one high finding per root cause); a DoD item the code does not meet; a weak, tautological or over-mocked test; a branch no test pins; input validation missing at a trust boundary; a reinvented helper (grep for the existing one); a comment, docstring or example the change made stale or wrong (check every number in an example). One finding per root cause.',
  SEVERITY, PROOF_RULE, 'RETURN: findings (empty when none) and notes <= 400 chars. ' + cap('reviewer'),
].join('\n\n')
const fixLoop = gid => gid === '_extra' ? 'Run the tests that cover the files you changed.'
  : KEEP + ' After the fixes run `' + gateCmd('green', { id: gid }, ' --retest') + '` (tests may have been sharpened on purpose) and read every reason after "not ok:": caused by your change, fix it and run again; not caused by it, say so in notFixed.'
const fixPrompt = (gid, files, fs) => [
  'ROLE: fixer for group ' + gid + '. Fix exactly these findings and nothing else.' + pony(NODE.fixer.ponytail) + '\n' + WHERE,
  'FINDINGS:\n' + fs.map(c => c.id + ' [' + c.severity + '] ' + c.file + (c.startLine ? ':' + c.startLine + '-' + c.endLine : '') + ' ' + clip(c.title, 120) + ' | ' + clip(c.hazard, 300) + (c.replacement ? ' | replacement for those lines:\n' + c.replacement : c.suggestedFix ? ' | fix: ' + clip(c.suggestedFix, 300) : '')).join('\n'),
  FENCE(files), TOOLS, 'Tests may be added or sharpened, never weakened, skipped or deleted. A finding you cannot fix inside the fence: notFixed with why.', fixLoop(gid),
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
  return { dryRun: true, plan: plan(G.length, ex.integration, ex.findingGroups), rounds: ROUNDS, worstBuildAgents: G.length * (5 + 5 * ROUNDS), prompts: [['red-driver', redPrompt(g, {})], ['red-navigator', redNavPrompt(g, sample, chk)], ['green-driver', greenPrompt(g, {})], ['green-navigator', greenNavPrompt(g, { rows: sample })], ['reviewer', reviewPrompt()], ['fixer', fixPrompt(g.id, g.tests.concat(g.src), [])], ['final-verifier', verifyPrompt()]].map(([node, p]) => ({ node, promptChars: p.length })) }
}

// ---------------------------------------------------------------- build: one pipeline per group, no barrier between groups
phase('Build')
log('groups ' + G.map(g => g.id + (g.after && g.after.length ? ' (after ' + g.after.join(',') + ')' : '')).join(', ') + '; pool ' + LIM.pool + '; run folder ' + RUN)
const state = {}
const waiting = new Map(G.map(g => { let res; const p = new Promise(r => { res = r }); return [g.id, { p, res }] }))
const as = (node, prompt, schema, label) => runR(node, prompt, { schema, label, phase: 'Build' }, label)
const gaps = chk => chk.missing.map(m => ({ cls: 'gap', what: 'DoD ' + m.dod + ' has no ' + m.kind + ' test (a test whose name contains ' + m.dod + ')' })).concat(chk.bad.map(b => ({ cls: 'test', what: 'matrix row ' + b.row.dod + '/' + b.row.kind + ' ' + b.row.test + ' cannot count: ' + b.why })))
const needsWork = n => n.verdict !== 'PASS' || (n.defects || []).length > 0 || n.gateOk === false // a PASS that admits a command printed ok=false is not a pass
const firstWhy = n => clip(((n.defects || [])[0] || {}).what || n.notes, 200)

// A stage is a loop, not a shot: a driver pass, then an independent check on fresh gate facts; the defects go back to the driver until the check passes, the same defects
// come back (no progress), or ROUNDS repair rounds are spent. Labels: the first repair is :rework / :recheck, the next :rework2 / :recheck2.
const lab = (node, gid, tag, n) => node + ':' + gid + (n ? ':' + tag + (n > 1 ? n : '') : '')
const defectsOf = (nav, cls) => ((nav.defects || []).length ? nav.defects : [{ cls, what: 'the navigator reported ' + (nav.verdict !== 'PASS' ? 'FAIL' : 'PASS with gateOk=false') + ': ' + clip(nav.notes, 300) }])

async function build(g) {
  const st = state[g.id] = { state: 'running', red: { reworks: 0 }, green: { reworks: 0 }, matrix: [], files: [] }
  const stop = (s, why) => { st.state = s; st.reason = why; log(g.id + ' ' + s.toUpperCase() + ': ' + why) }
  const items = itemsOf(g)
  const seen = (stage, nav, driver) => ({ reworks: st[stage].reworks, verdict: needsWork(nav) ? 'FAIL' : 'PASS', defects: nav.defects || [], gateOk: nav.gateOk, driver })
  const drv = r => ({ gateOk: r.gateOk, gateRuns: r.gateRuns })

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
  let driver = drv(r), nav = null, before = null
  for (let n = 0; ; n++) {
    nav = await as('red-navigator', redNavPrompt(g, st.matrix, chk, before, n), NAV, lab('red-navigator', g.id, 'recheck', n))
    if (!nav) return stop('failed', 'red-navigator returned nothing' + (n ? ' on re-check ' + n : ''))
    st.red = seen('red', nav, driver)
    if (!needsWork(nav)) break
    const defects = defectsOf(nav, 'test')
    if (n >= ROUNDS) return stop('blocked', 'RED still failing its check after ' + n + ' repair round(s): ' + firstWhy(nav))
    if (before && sig(defects) === sig(before)) return stop('blocked', 'RED made no progress: the same defects came back after repair round ' + n + ': ' + firstWhy(nav))
    st.red.reworks = n + 1
    const again = await as('red-driver', redPrompt(g, { defects }), RED_DRIVER, lab('red-driver', g.id, 'rework', n + 1))
    if (again) { st.matrix = again.matrix || st.matrix; st.files = again.files || st.files; chk = checkMatrix(items, st.matrix, g.tests); driver = drv(again) }
    before = defects
  }

  for (const d of g.after || []) if (!(await waiting.get(d).p)) return stop('blocked', 'waits for group ' + d + ', which is not done')

  const gd = await as('green-driver', greenPrompt(g, {}), GREEN_DRIVER, 'green-driver:' + g.id)
  if (!gd) return stop('failed', 'green-driver returned nothing')
  const testDefects = [...(gd.testDefects || [])]
  driver = { ...drv(gd), testGaps: (gd.testGaps || []).length ? gd.testGaps : undefined }
  let gn = null, retest = false // set ONLY by a strengthening pass (cls gap): --retest silences "tests changed since RED", which must stay audible for an edit nobody sanctioned
  const tdKey = t => JSON.stringify([t.file, t.line, t.why])
  before = null
  for (let n = 0; ; n++) {
    gn = await as('green-navigator', greenNavPrompt(g, { recheck: before, retest, rows: st.matrix, n }), NAV, lab('green-navigator', g.id, 'recheck', n))
    if (!gn) return stop('failed', 'green-navigator returned nothing' + (n ? ' on re-check ' + n : ''))
    st.green = { ...seen('green', gn, driver), testDefects: testDefects.length ? testDefects : undefined }
    if (!needsWork(gn)) break
    const defects = defectsOf(gn, 'impl')
    if (n >= ROUNDS) return stop('blocked', 'GREEN still failing its check after ' + n + ' repair round(s): ' + firstWhy(gn))
    if (before && sig(defects) === sig(before)) return stop('blocked', 'GREEN made no progress: the same defects came back after repair round ' + n + ': ' + firstWhy(gn))
    st.green.reworks = n + 1
    const weak = defects.filter(d => d.cls === 'gap'), changed = defects.filter(d => d.cls === 'test'), code = defects.filter(d => d.cls !== 'gap' && d.cls !== 'test')
    const tests = weak.length + changed.length // a gap is strengthened; a frozen test that was changed or a DoD pair that no longer closes is RESTORED, and its gate run stays without --retest
    const solo = !(tests && code.length) // two makers on one group must not both run its gate on a half-edited tree
    const jobs = []
    if (code.length) jobs.push(() => as('green-driver', greenPrompt(g, { defects: code, solo, retest }), GREEN_DRIVER, lab('green-driver', g.id, 'rework', n + 1)))
    if (tests) jobs.push(() => as('red-driver', redPrompt(g, { strengthen: weak, restore: changed, solo, retest }), RED_DRIVER, lab('red-driver', g.id, 'strengthen', n + 1)))
    const res = await parallel(jobs) // different files (src vs tests): safe side by side
    const fixedCode = (res[0] && code.length ? res[0] : {}), added = (res[code.length ? 1 : 0] || {}).matrix || []
    for (const t of fixedCode.testDefects || []) if (!testDefects.some(x => tdKey(x) === tdKey(t))) testDefects.push(t)
    if (code.length && res[0]) driver = { ...drv(res[0]), testGaps: (res[0].testGaps || []).length ? res[0].testGaps : undefined } // the latest maker's own claim
    if (weak.length) retest = true
    if (tests && added.length) st.matrix = st.matrix.concat(added.filter(a => !st.matrix.some(m => m.test === a.test && m.file === a.file)).map(a => ({ ...a, late: true }))) // written after GREEN: they never failed at RED, so the closure does not credit them
    before = defects
  }
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
let verified = null
const finalFixers = []
const asFinding = p => ({ id: 'F-' + h32(String(p.file) + String(p.what)), severity: 'high', file: p.file || '', startLine: 0, endLine: 0, title: clip(p.what, 120), hazard: clip(p.what, 300) + ' (fix the group code; never edit an existing test to make it pass; run that one test file once with the test command to see the failure)' })
if (ranFixers && doneIds.length) {
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
  .concat(verified && !verified.ok ? ['final gate still failing after ' + verified.rounds + ' round(s): ' + verified.problems.slice(0, 3).map(p => (p.file ? p.file + ' ' : '') + clip(p.what, 100)).join('; ')] : [])
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
  stats: { agentsByNode: used, total, pool: LIM.pool, rounds: ROUNDS },
  groups: Object.fromEntries(G.map(g => { const s = state[g.id]; return [g.id, { state: s.state, reason: s.reason, red: s.red, green: s.green, matrix: s.matrix, files: s.files }] })),
  integration, reviewed: !!review, clusters, fixes, verified, notDone, failed, boardMd, postmortemMd,
}
