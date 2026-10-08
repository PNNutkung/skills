// Offline check for workflow.js: canned agents, no real agent, no git, no sandbox. Run after editing workflow.js or graph.mjs: node workflow.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'workflow.js'), 'utf8');
const { pool: POOL, rounds: ROUNDS } = JSON.parse(/const LIM = (\{.*\})/.exec(SRC)[1]); // generated from graph.mjs
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', SRC.replace('export ', ''));

const KINDS = ['happy', 'fail', 'edge'];
const grp = (id, o = {}) => ({ id, goal: `goal of ${id}`, tests: [`tests/test_${id}.py`], src: [`src/${id}.py`], dod: [`${id.toUpperCase()}1`], after: [], ...o });
const BASE = {
  repo: '/repo', base: 'b'.repeat(40), cmd: 'pytest -q {file}', skillDir: HERE, runDir: '/tmp/pat-test', scratch: '/tmp/pat-scratch', maxRepairs: 40, // the old scenarios test the round cap and the stall check, not the run-wide budget (see scenario 21)
  dod: ['a', 'b', 'c', 'slow', 'fast'].map(id => ({ id: `${id.toUpperCase()}1`, text: `behavior of ${id}`, source: 'assumed' })),
  groups: [grp('a'), grp('b', { after: ['a'] }), grp('c')],
};
const rows = (g, kinds = KINDS) => g.dod.flatMap(id => kinds.map(kind => ({ dod: id, kind, test: `test_${id.toLowerCase()}_${kind}_case`, file: g.tests[0] })));
const gOf = (args, label) => (args.groups || BASE.groups).find(g => label.split(':')[1] === g.id);
const PASS = { verdict: 'PASS', defects: [], gateOk: true };
const FAIL = (cls, what) => ({ verdict: 'FAIL', defects: [{ cls, what, file: 'x.py', line: 3 }], gateOk: false });

// the happy-path answers; `over` replaces any of them by exact label
function agentsFor(args, over = {}) {
  return label => {
    if (label in over) { const v = over[label]; return typeof v === 'function' ? v() : v; }
    const node = label.split(':')[0], g = gOf(args, label);
    if (node === 'red-driver') return { matrix: rows(g), files: g.tests, reuse: 'codebase' };
    if (node === 'red-navigator' || node === 'green-navigator') return PASS;
    if (node === 'green-driver') return { files: g.src, reuse: 'docs', cleanup: 'none' };
    if (node === 'reviewer') return { findings: [] };
    if (node === 'integration-tester') return { file: 'tests/integration/test_flow.py', exit: 0, findings: [] };
    if (node === 'fixer') return { fixed: [], notFixed: [] };
    if (node === 'final-verifier') return { ok: true, problems: [] };
    return undefined;
  };
}

// real parallel() semantics: a throwing thunk resolves to null
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const pipeline = (items, ...stages) => Promise.all(items.map(async (it, i) => { try { let v = it; for (const s of stages) v = await s(v, it, i); return v; } catch { return null; } }));
const tick = ms => new Promise(r => setTimeout(r, ms));

function launch(args, respond, delay = 0) {
  const calls = [], logs = [], events = [], unexpected = [], live = { now: 0, max: 0 };
  const agent = async (prompt, o) => {
    calls.push({ prompt, o });
    events.push(`start ${o.label}`); live.now++; live.max = Math.max(live.max, live.now);
    try {
      const d = typeof delay === 'function' ? delay(o.label) : delay;
      if (d) await (typeof d === 'number' ? tick(d) : d);
      const r = await respond(o.label);
      if (r === undefined) unexpected.push(o.label);
      return r;
    } finally { live.now--; events.push(`end ${o.label}`); }
  };
  const done = wf(agent, parallel, pipeline, () => {}, m => logs.push(m), { ...BASE, ...args }, {});
  return { done, calls, logs, events, unexpected, live };
}
async function play(args, over = {}, delay = 0) {
  const h = launch(args, agentsFor({ ...BASE, ...args }, over), delay), out = await h.done;
  assert.deepEqual(h.unexpected, [], 'agent called with no canned answer');
  const broken = /NaN|undefined|\[object Object\]/; // a prompt or a reason built from a missing value: the mutation probe turned several string joins into NaN and nothing noticed
  assert.deepEqual(h.calls.filter(c => broken.test(c.prompt)).map(c => c.o.label), [], 'a prompt holds NaN, undefined or [object Object]');
  assert.deepEqual(h.logs.filter(m => broken.test(m)), [], 'a log line holds NaN, undefined or [object Object]');
  assert.deepEqual([...Object.values(out.groups || {}).map(g => g.reason || ''), ...(out.notDone || [])].filter(t => broken.test(t)), [], 'a reason holds NaN, undefined or [object Object]');
  return { out, ...h, n: out.stats && out.stats.agentsByNode, by: label => h.calls.filter(c => c.o.label === label) };
}
const idx = (events, e) => events.indexOf(e);

// 1 plan mode spawns nothing; prompt budgets hold (a prompt word is ~1% of an agent's cost: the fixed context is ~40k tokens, see runs.md)
let r = await play({ mode: 'plan' });
assert.equal(r.calls.length, 0);
assert.equal(r.out.dryRun, true);
assert.deepEqual([r.out.plan.counts['red-driver'], r.out.plan.total], [3, 15]);
assert.deepEqual([r.out.rounds, r.out.worstBuildAgents], [ROUNDS, 3 * (5 + 5 * ROUNDS)], 'the dry run states the ceiling when every check fails until the rounds run out');
const real = await play({ groups: [grp('a')] });
assert.equal(r.out.prompts.find(p => p.node === 'green-navigator').promptChars, real.by('green-navigator:a')[0].prompt.length, 'the dry run sizes the navigators with one row per DoD pair, as a real run does');
assert.equal(r.out.prompts.find(p => p.node === 'red-navigator').promptChars, real.by('red-navigator:a')[0].prompt.length);
assert.ok(r.out.prompts.filter(p => p.node !== 'reviewer').every(p => p.promptChars < 4608), JSON.stringify(r.out.prompts));
assert.ok(r.out.prompts.find(p => p.node === 'reviewer').promptChars < 5200);

// 2 happy path: every group streams through RED and GREEN; one reviewer; no fixer without findings; a dependent group waits only before GREEN
r = await play({}, {}, 4);
assert.deepEqual(r.n, { 'red-driver': 3, 'red-navigator': 3, 'green-driver': 3, 'green-navigator': 3, reviewer: 1 });
assert.deepEqual(Object.values(r.out.groups).map(g => g.state), ['done', 'done', 'done']);
assert.deepEqual(r.out.groups.a.matrix.map(m => m.kind), KINDS);
assert.ok(r.events.slice(0, 3).every(e => /^start red-driver:/.test(e)), 'every group starts RED at once, even the one that waits for another');
assert.ok(idx(r.events, 'end green-navigator:a') < idx(r.events, 'start green-driver:b'), 'b waits for a only before GREEN');
assert.ok(idx(r.events, 'start red-navigator:b') < idx(r.events, 'end green-navigator:a'), 'b was not held back in RED');
assert.ok(idx(r.events, 'start reviewer') > Math.max(...['a', 'b', 'c'].map(g => idx(r.events, `end green-navigator:${g}`))), 'the reviewer needs every group');
assert.equal(r.out.stats.total, 13);

// 3 no barrier: a group finishes the whole pipeline while a slow one is still in RED
let release;
const slow = new Promise(res => { release = res; });
const two = [grp('slow'), grp('fast')];
const h3 = launch({ groups: two }, agentsFor({ groups: two }), l => (l === 'red-driver:slow' ? slow : 0));
await tick(60);
assert.ok(h3.events.includes('end green-navigator:fast'), 'fast group did not wait for the slow one');
assert.ok(!h3.events.includes('start red-navigator:slow'));
release();
assert.equal((await h3.done).groups.slow.state, 'done');

// 4 the after edge: b's GREEN waits for a's whole group, b's RED does not
let free;
const parked = new Promise(res => { free = res; });
const h4 = launch({}, agentsFor(BASE), l => (l === 'green-navigator:a' ? parked : 0));
await tick(60);
assert.ok(h4.events.includes('end red-navigator:b') && !h4.events.includes('start green-driver:b'), 'b is RED-checked and parked');
free();
await h4.done;
assert.ok(h4.events.includes('start green-driver:b'));

// 5 the matrix is code-checked before a navigator is paid for: a missing kind costs one driver rework, not a navigator
const a = BASE.groups[0];
r = await play({}, { 'red-driver:a': () => ({ matrix: rows(a, ['happy', 'fail']), files: ['tests/test_a.py'], reuse: 'none' }) });
assert.deepEqual([r.by('red-driver:a').length, r.by('red-driver:a:matrix').length, r.by('red-navigator:a').length], [1, 1, 1]);
assert.match(r.by('red-driver:a:matrix')[0].prompt, /A1 has no edge test/);
assert.ok(idx(r.events, 'end red-driver:a:matrix') < idx(r.events, 'start red-navigator:a'));
assert.doesNotMatch(r.by('red-navigator:a')[0].prompt, /KNOWN GAPS/);
assert.equal(r.out.groups.a.state, 'done');
const thin = () => ({ matrix: rows(a, ['happy']), files: [], reuse: 'none' });
r = await play({}, { 'red-driver:a': thin, 'red-driver:a:matrix': thin });
assert.match(r.by('red-navigator:a')[0].prompt, /KNOWN GAPS \(code-checked\): A1\/fail has no test; A1\/edge has no test/);

// 6 the repair loop: a navigator FAIL goes back to the driver and is checked again, round after round, until the check passes, the same defects come back, or the round cap
r = await play({}, { 'red-navigator:a': () => FAIL('test', 'asserts the implementation') });
assert.deepEqual([r.by('red-driver:a:rework').length, r.by('red-navigator:a:recheck').length], [1, 1]);
assert.match(r.by('red-driver:a:rework')[0].prompt, /FIX EXACTLY THESE DEFECTS[\s\S]*asserts the implementation/);
assert.match(r.by('red-navigator:a:recheck')[0].prompt, /RE-CHECK 1 after a rework[\s\S]*asserts the implementation/);
assert.deepEqual([r.out.groups.a.state, r.out.groups.a.red.reworks], ['done', 1]);
r = await play({}, { 'red-navigator:a': { verdict: 'PASS', defects: [], gateOk: false, notes: 'dod said ok=false' } });
assert.deepEqual([r.by('red-driver:a:rework').length, r.out.groups.a.state], [1, 'done'], 'a PASS that admits a command printed ok=false is not a pass');
assert.match(r.by('red-driver:a:rework')[0].prompt, /the navigator reported PASS with gateOk=false: dod said ok=false/);
r = await play({}, { 'red-navigator:a': () => FAIL('test', 'wrong invariant'), 'red-navigator:a:recheck': () => FAIL('test', 'a different weak assertion') });
assert.deepEqual([r.by('red-driver:a:rework2').length, r.by('red-navigator:a:recheck2').length], [1, 1], 'a second repair round runs when the re-check finds something new');
assert.match(r.by('red-driver:a:rework2')[0].prompt, /a different weak assertion/);
assert.doesNotMatch(r.by('red-driver:a:rework2')[0].prompt, /wrong invariant/, 'a round fixes what the last check found, not the whole history');
assert.deepEqual([r.out.groups.a.state, r.out.groups.a.red.reworks], ['done', 2]);
let nth = 0;
const endless = () => FAIL('test', 'defect number ' + (++nth));
const never = Object.fromEntries(['red-navigator:a', 'red-navigator:a:recheck', 'red-navigator:a:recheck2', 'red-navigator:a:recheck3', 'red-navigator:a:recheck4'].map(l => [l, endless]));
r = await play({}, never);
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 1 + ROUNDS, 'the driver, then exactly ROUNDS repairs');
assert.deepEqual([r.out.groups.a.state, r.out.groups.b.state, r.out.groups.c.state], ['blocked', 'blocked', 'done']);
assert.match(r.out.groups.a.reason, new RegExp('after ' + ROUNDS + ' repair round'));
assert.equal(r.out.groups.a.red.reworks, ROUNDS);
assert.match(r.out.groups.b.reason, /waits for group a/);
assert.equal(r.n['green-driver'], 1, 'only the independent group reached GREEN');
assert.equal(r.out.notDone.length, 2);
assert.ok(r.out.reviewed && r.out.postmortemMd.includes('Not done'));
r = await play({}, { 'red-navigator:a': () => FAIL('test', 'wrong invariant'), 'red-navigator:a:recheck': () => FAIL('test', 'Wrong   invariant!') });
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 2, 'the same defects twice: a repair that changed nothing the check can see is not tried again');
assert.match(r.out.groups.a.reason, /RED made no progress/);
nth = 0;
r = await play({ rounds: 1 }, never);
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 2, 'plan.rounds = 1 is one repair and one re-check');
assert.match(r.out.groups.a.reason, /after 1 repair round/);
nth = 0;
r = await play({ rounds: 9 }, never);
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 1 + ROUNDS, 'an out-of-range plan.rounds falls back to the default');
assert.equal(r.out.stats.rounds, ROUNDS);
nth = 0;
r = await play({ rounds: 4 }, never);
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 5, 'plan.rounds = 4 is the top of the range');
assert.deepEqual([r.out.groups.a.red.verdict, r.out.groups.a.red.defects.length, r.out.groups.a.red.reworks], ['FAIL', 1, 4], 'a blocked group keeps the defects that blocked it');
// the matrix the repair writes replaces the old one (the closure and the next check read it)
const reworked = { matrix: rows(a).map(m => ({ ...m, test: m.test + '_v2' })), files: ['tests/test_a.py'], reuse: 'none' };
r = await play({}, { 'red-navigator:a': FAIL('test', 'weak assertion'), 'red-driver:a:rework': reworked });
assert.deepEqual(r.out.groups.a.matrix.map(m => m.test.slice(-3)), ['_v2', '_v2', '_v2']);
assert.match(r.by('red-navigator:a:recheck')[0].prompt, /test_a1_happy_case_v2/);
// the same words at another line are another defect: a group that fixed the first one and now has the next is making progress, not stalling
const weakAt = line => ({ verdict: 'FAIL', gateOk: false, defects: [{ cls: 'test', what: 'assertion too weak: only checks the truthiness of the result', file: 'tests/test_a.py', line }] });
r = await play({}, { 'red-navigator:a': () => weakAt(10), 'red-navigator:a:recheck': () => weakAt(30) });
assert.deepEqual([r.by('red-driver:a:rework2').length, r.out.groups.a.state, r.out.groups.a.red.reworks], [1, 'done', 2]);
r = await play({}, { 'red-navigator:a': () => weakAt(10), 'red-navigator:a:recheck': () => weakAt(10) });
assert.match(r.out.groups.a.reason, /RED made no progress/, 'the same defect at the same line is a stall');
// the same two brakes guard GREEN: the round cap, and the same defects coming back
nth = 0;
const neverGreen = Object.fromEntries(['green-navigator:a', 'green-navigator:a:recheck', 'green-navigator:a:recheck2', 'green-navigator:a:recheck3'].map(l => [l, () => FAIL('impl', 'defect number ' + (++nth))]));
r = await play({ groups: [grp('a')] }, neverGreen);
assert.equal(r.calls.filter(c => /^green-driver:a/.test(c.o.label)).length, 1 + ROUNDS);
assert.equal(r.out.groups.a.state, 'blocked');
assert.match(r.out.groups.a.reason, new RegExp('GREEN still failing its check after ' + ROUNDS + ' repair round'));
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('impl', 'extra feature'), 'green-navigator:a:recheck': FAIL('impl', 'Extra feature') });
assert.equal(r.calls.filter(c => /^green-driver:a/.test(c.o.label)).length, 2);
assert.match(r.out.groups.a.reason, /GREEN made no progress: the same defects came back after repair round 1/);

// 7 GREEN: a surviving mutant (cls gap) goes to the test-writer tier, a code defect to the green driver, side by side; the re-check runs with --retest
const mixed = { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'gap', what: 'mutant X-1 survived: no test pins x > 0' }, { cls: 'impl', what: 'helper duplicates util.slug' }] };
const strengthened = { matrix: [{ dod: 'A1', kind: 'edge', test: 'test_a1_edge_zero', file: 'tests/test_a.py' }, { dod: 'A1', kind: 'edge', test: 'test_a1_edge_case', file: 'tests/test_a.py' }], files: ['tests/test_a.py'], reuse: 'none' };
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': mixed, 'red-driver:a:strengthen': strengthened }, 3);
assert.deepEqual([r.by('green-driver:a:rework').length, r.by('red-driver:a:strengthen').length, r.by('green-navigator:a:recheck').length], [1, 1, 1]);
assert.ok(idx(r.events, 'start red-driver:a:strengthen') < idx(r.events, 'end green-driver:a:rework'), 'the two reworks run side by side');
assert.match(r.by('red-driver:a:strengthen')[0].prompt, /STRENGTHEN[\s\S]*mutant X-1 survived/);
assert.doesNotMatch(r.by('red-driver:a:strengthen')[0].prompt, /helper duplicates/);
assert.match(r.by('green-driver:a:rework')[0].prompt, /helper duplicates util\.slug/);
assert.match(r.by('green-navigator:a:recheck')[0].prompt, /--retest/);
assert.doesNotMatch(r.by('green-navigator:a')[0].prompt, /--retest/);
assert.equal(r.out.groups.a.matrix.filter(m => m.test === 'test_a1_edge_case').length, 1, 'a strengthener row that repeats a test is not counted twice');
assert.ok(r.out.groups.a.matrix.some(m => m.test === 'test_a1_edge_zero'));
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('impl', 'extra feature') });
assert.deepEqual([r.by('red-driver:a:strengthen').length, r.by('green-navigator:a:recheck')[0].prompt.includes('--retest')], [0, false]);
assert.match(r.by('green-driver:a:rework')[0].prompt, /KEEP EDITING[\s\S]*tdd\.mjs green --run \/tmp\/pat-test --group a`/, 'a lone maker loops on the real gate');
assert.match(r.by('green-navigator:a:recheck')[0].prompt, /RE-CHECK 1 after a rework/);
assert.equal(r.out.groups.a.green.reworks, 1);
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('impl', 'extra feature'), 'green-driver:a:rework': { files: ['src/a.py'], reuse: 'none', gateOk: true, gateRuns: 2 }, 'green-driver:a': { files: ['src/a.py'], reuse: 'none', gateOk: false, gateRuns: 3 } });
assert.deepEqual([r.out.groups.a.green.driver.gateOk, r.out.groups.a.green.driver.gateRuns], [true, 2], 'the record is the LATEST maker\'s claim, not the first pass\'s');
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('impl', 'extra feature'), 'green-navigator:a:recheck': () => null });
assert.deepEqual([r.out.groups.a.state, r.out.groups.a.reason], ['failed', 'green-navigator returned nothing on re-check 1']);
// what a green rework reports about the tests is kept: the tests are frozen, so it can only say they are wrong
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('impl', 'extra feature'), 'green-driver:a:rework': { files: ['src/a.py'], reuse: 'none', testDefects: [{ file: 'tests/test_a.py', line: 9, why: 'asserts the old message' }] } });
assert.deepEqual(r.out.groups.a.green.testDefects, [{ file: 'tests/test_a.py', line: 9, why: 'asserts the old message' }]);
// two makers on one group never run its gate (they would see each other\'s half-edited tree); the check runs it after both finish
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': mixed, 'red-driver:a:strengthen': strengthened }, 3);
for (const l of ['green-driver:a:rework', 'red-driver:a:strengthen']) {
  assert.match(r.by(l)[0].prompt, /never the gate/, l);
  assert.doesNotMatch(r.by(l)[0].prompt, /tdd\.mjs (red|green) --run/, l);
}
assert.doesNotMatch(r.by('green-driver:a:rework')[0].prompt, /Run the gate again after it|cleanup pass/, 'a repair fixes exactly its defects: no cleanup, and no "run the gate" next to "never the gate"');
assert.match(r.by('green-driver:a')[0].prompt, /cleanup pass[\s\S]*Run the gate again after it/, 'the first pass keeps its one cleanup');
// a strengthening pass loops on the gate with --retest; once tests were strengthened on purpose every later gate run keeps it, and late rows never reach `dod`
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('gap', 'mutant X-9 survived'), 'red-driver:a:strengthen': strengthened, 'green-navigator:a:recheck': FAIL('impl', 'extra feature') });
assert.match(r.by('red-driver:a:strengthen')[0].prompt, /KEEP EDITING[\s\S]*tdd\.mjs green --run \/tmp\/pat-test --group a --retest/);
assert.match(r.by('green-navigator:a:recheck2')[0].prompt, /--retest/);
assert.match(r.by('green-navigator:a:recheck2')[0].prompt, /RE-CHECK 2 after a rework/);
assert.match(r.by('green-driver:a:rework2')[0].prompt, /tdd\.mjs green --run \/tmp\/pat-test --group a --retest`/, 'after a strengthening round the maker\'s own gate takes --retest too, or it fails on the very edit that was sanctioned');
assert.doesNotMatch(r.by('green-driver:a')[0].prompt, /--retest/);
assert.equal(r.out.groups.a.green.reworks, 2);
assert.doesNotMatch(r.by('green-navigator:a:recheck2')[0].prompt, /test_a1_edge_zero/, 'a late row is never offered to dod: it cannot have failed at RED');
assert.equal(r.out.groups.a.state, 'done');
// a frozen test that was changed (cls test) is RESTORED, not "strengthened", and its gate run stays WITHOUT --retest: that flag would silence the very reason that was reported
const changedTest = FAIL('test', 'tests changed since RED: tests/test_a.py (3 line(s) removed)');
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': changedTest });
const restore = r.by('red-driver:a:strengthen')[0].prompt;
assert.match(restore, /driver: RESTORE the tests[\s\S]*git show <snapshot>:<file>[\s\S]*gates\/a\.red\.json[\s\S]*tests changed since RED/);
assert.doesNotMatch(restore, /mutants SURVIVED|--retest/);
assert.doesNotMatch(r.by('green-navigator:a:recheck')[0].prompt, /--retest/);
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'gap', what: 'mutant X-1 survived' }, { cls: 'test', what: 'tests changed since RED: tests/test_a.py' }] } });
assert.match(r.by('red-driver:a:strengthen')[0].prompt, /driver: STRENGTHEN[\s\S]*mutants SURVIVED[\s\S]*Undo that[\s\S]*--retest/);
assert.match(r.by('green-navigator:a:recheck')[0].prompt, /--retest/, 'a strengthening in the same round sanctions it');
assert.ok(r.calls.every(c => /At most \d+ tool calls/.test(c.prompt)), 'every brief states its call cap, a strengthening pass included');

// 8 rolling pool: never more than POOL agents in flight, and the pool really fills
const MANY = Array.from({ length: 12 }, (_, i) => grp('g' + i));
r = await play({ groups: MANY, dod: MANY.map(g => ({ id: g.dod[0], text: 't', source: 'assumed' })) }, {}, 5);
assert.equal(r.live.max, POOL, 'pool never filled or overflowed: ' + r.live.max);

// 9 the reviewer: findings become proofcheck clusters; a medium without a checkable proof is unproven; ONE fixer per owning group, never two on a file
const F = (title, severity, file, mode = 'read', extra = {}) => ({ title, severity, file, startLine: 3, endLine: 4, hazard: 'h ' + title, failureScenario: 's', quote: 'code ' + title, suggestedFix: 'do x', anchorable: true, proof: { mode, ref: file + ':3-4', quote: 'code ' + title }, ...extra });
const found = [F('Validation missing', 'high', 'src/a.py'), F('Weak assertion', 'medium', 'tests/test_a.py', 'inferred'), F('Stale example', 'low', 'src/b.py', 'none'), F('Doc drift', 'low', 'README.md', 'none'), F('naming', 'nit', 'src/c.py', 'none')];
r = await play({}, { reviewer: { findings: found }, 'fixer:a': { fixed: ['x'], notFixed: [{ id: 'R-zzz', why: 'needs a schema change' }] } });
assert.deepEqual(r.out.fixes.a.notFixed, [{ id: 'R-zzz', why: 'needs a schema change' }], 'what a fixer could not fix is kept, never dropped');
const byTitle = t => r.out.clusters.find(c => c.title === t);
assert.deepEqual(['Validation missing', 'Weak assertion', 'Stale example', 'naming'].map(t => [byTitle(t).status, byTitle(t).evidence]), [['confirmed', 'read'], ['unproven', 'none'], ['pending-code-check', 'none'], ['unverified-nit', 'none']]);
assert.ok(/^R-[0-9a-z]+$/.test(byTitle('Validation missing').id) && byTitle('Validation missing').proof.ref === 'src/a.py:3-4');
assert.deepEqual(r.calls.filter(c => /^fixer:/.test(c.o.label)).map(c => c.o.label).sort(), ['fixer:_extra', 'fixer:a', 'fixer:b'], 'a nit is reported only; README.md has no owner');
assert.match(r.by('fixer:a')[0].prompt, /HARD SCOPE FENCE: edit or create ONLY tests\/test_a\.py, src\/a\.py\./);
assert.doesNotMatch(r.by('fixer:a')[0].prompt, /src\/b\.py/, 'the fixer of group a never sees another group\'s file');
assert.match(r.by('fixer:_extra')[0].prompt, /ONLY README\.md\./);
assert.deepEqual([r.n.reviewer, r.n.fixer], [1, 3]);
assert.equal(r.out.fixes.a.fixed[0], 'x');
const lots = Array.from({ length: 10 }, (_, i) => F('issue ' + i, 'low', 'src/a.py', 'none', { startLine: 10 + i * 5, endLine: 11 + i * 5 }));
r = await play({}, { reviewer: { findings: lots } });
assert.equal(r.out.fixes.a.notFixed.length, 2, 'one fixer takes at most 8; the rest are named, not dropped');

// 10 a null agent is retried once with a pointer to the working tree; a second null is a failed group and a postmortem, never a silent gap
let calls10 = 0;
r = await play({}, { 'red-driver:c': () => (++calls10 === 1 ? null : { matrix: rows(BASE.groups[2]), files: ['tests/test_c.py'], reuse: 'none' }) });
assert.equal(r.by('red-driver:c').length, 2);
assert.match(r.by('red-driver:c')[1].prompt, /^RETRY 2\/2 of red-driver:c[\s\S]*Its edits are already in the working tree/);
assert.doesNotMatch(r.by('red-driver:c')[0].prompt, /RETRY/);
assert.equal(r.out.groups.c.state, 'done');
r = await play({}, { 'green-driver:c': () => null });
assert.equal(r.out.groups.c.state, 'failed');
assert.deepEqual(r.out.failed.map(f => [f.id, f.attempts]), [['green-driver:c', 2]]);
assert.match(r.out.postmortemMd, /green-driver:c[\s\S]*DON'T/);
r = await play({}, { 'red-navigator:b': () => { throw new Error('gateway stall'); } });
assert.equal(r.out.groups.b.state, 'failed');
assert.deepEqual([r.out.groups.a.state, r.out.groups.c.state], ['done', 'done']);

// 11 agent types, models and efforts come from the graph; the judges cannot edit; opus only on the reviewer
r = await play({ groups: [grp('a')] }, { reviewer: { findings: [F('x', 'low', 'src/a.py', 'none')] } });
const opt = l => r.calls.find(c => c.o.label === l).o;
assert.deepEqual(['red-driver:a', 'green-driver:a', 'fixer:a'].map(l => opt(l).agentType), ['tdd-guide', 'tdd-guide', 'tdd-guide']);
assert.deepEqual(['red-navigator:a', 'green-navigator:a', 'reviewer'].map(l => opt(l).agentType), ['code-reviewer', 'code-reviewer', 'code-reviewer']);
assert.deepEqual(['reviewer', 'red-driver:a', 'green-navigator:a'].map(l => [opt(l).model, opt(l).effort]), [['opus', 'high'], ['sonnet', 'medium'], ['sonnet', 'high']]);
assert.deepEqual(r.calls.filter(c => c.o.model === 'opus').map(c => c.o.label), ['reviewer']);

// 12 what each prompt says: fences by stage, frozen tests, the gate command, no interpreter heredoc, tool discipline, precedent and research
const red = r.by('red-driver:a')[0].prompt, grn = r.by('green-driver:a')[0].prompt, rn = r.by('red-navigator:a')[0].prompt, gn = r.by('green-navigator:a')[0].prompt, rev = r.by('reviewer')[0].prompt;
assert.match(red, /ONLY tests\/test_a\.py\./);
assert.doesNotMatch(red, /ONLY[^.]*src\/a\.py/);
assert.match(grn, /ONLY src\/a\.py\./);
assert.match(grn, /THE TESTS ARE FROZEN: tests\/test_a\.py/);
assert.match(rn, /node \S+\/tdd\.mjs red --run \/tmp\/pat-test --group a/);
assert.match(gn, /node \S+\/tdd\.mjs green --run \/tmp\/pat-test --group a`/);
assert.match(rev, /tdd\.mjs final --run \/tmp\/pat-test/);
assert.ok([red, grn].every(p => /never sed or a heredoc/.test(p) && /RESEARCH FIRST/.test(p)) && /PRECEDENT/.test(red) && /PRECEDENT/.test(rn));
assert.ok([rn, gn].every(p => /ground truth|T0 facts/.test(p) && /did not write/.test(p)), 'navigators are told they judge facts and did not write the work');
assert.ok(r.calls.every(c => !/<<\s*'?EOF|python3? -c/.test(c.prompt)), 'no interpreter heredoc in any prompt');
assert.ok(r.calls.every(c => /At most \d+ tool calls/.test(c.prompt) && /REPO \/repo/.test(c.prompt)));
assert.ok(r.calls.filter(c => c.o.label !== 'reviewer').every(c => c.prompt.length < 4608), 'prompt budget');
assert.ok(rev.length < 5200, 'reviewer prompt budget');
assert.match(red, /every test name MUST contain its item id/);
assert.match(rev, /check every number in an example/, 'the stale-example finding of the first measured run is part of the brief');

// 13 integration test: once, after every group is done, before the reviewer; skipped when a group is not done
const integ = { file: 'tests/integration/test_flow.py', goal: 'drive the full path against a real database' };
assert.equal((await play({ mode: 'plan', integration: integ })).out.plan.counts['integration-tester'], 1, 'the dry run counts the integration tester once');
r = await play({ integration: integ });
assert.equal(r.n['integration-tester'], 1);
assert.ok(idx(r.events, 'end integration-tester') < idx(r.events, 'start reviewer'));
assert.match(r.by('integration-tester')[0].prompt, /ONLY tests\/integration\/test_flow\.py\./);
r = await play({ integration: integ }, { 'red-navigator:a': FAIL('test', 'x'), 'red-navigator:a:recheck': FAIL('test', 'x') });
assert.equal(r.n['integration-tester'], undefined);
assert.ok(r.logs.some(m => /integration-tester skipped/.test(m)));

// 14 no group done: no reviewer; bad args are an error, not a silent empty run
r = await play({ groups: [grp('a')] }, { 'red-navigator:a': FAIL('test', 'x'), 'red-navigator:a:recheck': FAIL('test', 'x') });
assert.equal(r.n.reviewer, undefined);
assert.equal(r.out.reviewed, false);
assert.ok((await play({ repo: undefined })).out.error);
assert.match((await play({ groups: [grp('a', { after: ['a'] })] })).out.error, /each other/);
assert.match((await play({ groups: [grp('a', { after: ['zzz'] })] })).out.error, /unknown group/);

// 15 deterministic prompts: a resumed run replays cached agents only when the prompts are byte-identical
const prompts = async () => Object.fromEntries((await play({}, {}, 0)).calls.map(c => [c.o.label, c.prompt]));
assert.deepEqual(await prompts(), await prompts());

// 16 six agents share one working tree: the brief allows read-only git only, and the fence promises only what the gates do
r = await play({ groups: [grp('a')] });
for (const l of ['red-driver:a', 'green-driver:a']) {
  const p = r.by(l)[0].prompt;
  assert.match(p, /read-only git \(status, diff, log, show\)[^.]*never stash, checkout, restore, reset or clean/);
  assert.doesNotMatch(p, /reverted and the task re-run/);
  assert.match(p, /the gate lists it and the run is not done until it is reverted/);
}

// 17 a strengthening pass gets its own brief (tests must PASS on the current code), and its rows are marked late so the DoD closure never credits them
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('gap', 'mutant X-9 survived'), 'red-driver:a:strengthen': { matrix: [{ dod: 'A1', kind: 'edge', test: 'test_a1_edge_zero', file: 'tests/test_a.py' }], files: ['tests/test_a.py'], reuse: 'none' } });
const st = r.by('red-driver:a:strengthen')[0].prompt;
assert.match(st, /every new test must PASS on the current code/);
assert.doesNotMatch(st, /must fail for the RIGHT reason|Run each test file once to see it fail/);
assert.deepEqual(r.out.groups.a.matrix.filter(m => m.late).map(m => m.test), ['test_a1_edge_zero']);
assert.ok(r.out.groups.a.matrix.filter(m => !m.late).length >= 3, 'the RED rows are not late');

// 18 a finding on a file outside the plan: a safe relative path gets the _extra fixer, an absolute, hidden or escaping path is left to a human
const odd = ['/Users/me/.zshrc', '.github/workflows/release.yml', '../other/x.py'].map((f, i) => F('odd ' + i, 'low', f, 'none'));
r = await play({}, { reviewer: { findings: [...odd, F('doc drift', 'low', 'docs/guide.md', 'none')] } });
assert.deepEqual(r.calls.filter(c => /^fixer:/.test(c.o.label)).map(c => c.o.label), ['fixer:_extra']);
assert.match(r.by('fixer:_extra')[0].prompt, /ONLY docs\/guide\.md\./);
assert.doesNotMatch(r.by('fixer:_extra')[0].prompt, /zshrc|release\.yml|other\/x/);
assert.equal(r.out.fixes._byHand.notFixed.length, 3);

// 19 a maker is told to loop on the real gate with the same commands its navigator runs; the navigators check the DoD pairs in code with `tdd.mjs dod`
r = await play({ groups: [grp('a')] });
const rd = r.by('red-driver:a')[0].prompt, gd = r.by('green-driver:a')[0].prompt, rnv = r.by('red-navigator:a')[0].prompt, gnv = r.by('green-navigator:a')[0].prompt;
assert.match(rd, /KEEP EDITING[\s\S]*tdd\.mjs red --run \/tmp\/pat-test --group a` and `[^`]*tdd\.mjs dod --run \/tmp\/pat-test --group a --stage red --row 'ID:kind:test:file'/);
assert.match(gd, /KEEP EDITING[\s\S]*tdd\.mjs green --run \/tmp\/pat-test --group a`[\s\S]*testGaps/);
assert.ok([rd, gd].every(p => /At most 3 gate runs; return gateOk/.test(p)), 'the maker\'s own loop is bounded');
assert.match(rnv, /tdd\.mjs red --run \/tmp\/pat-test --group a` then `[^`]*tdd\.mjs dod --run \/tmp\/pat-test --group a --stage red --row 'A1:happy:test_a1_happy_case:tests\/test_a\.py' --row 'A1:fail:test_a1_fail_case:tests\/test_a\.py' --row 'A1:edge:test_a1_edge_case:tests\/test_a\.py'`/);
assert.match(gnv, /tdd\.mjs green --run \/tmp\/pat-test --group a` then `[^`]*--stage green --row 'A1:happy:test_a1_happy_case:tests\/test_a\.py'/);
assert.match(gnv, /gateOk = true only if every command printed ok=true/);
const quote = [{ dod: 'A1', kind: 'happy', test: "test_a1_happy_it's", file: 'tests/test_a.py' }, { dod: 'A1', kind: 'fail', test: 'test_a1_fail_x', file: 'tests/test_a.py' }, { dod: 'A1', kind: 'edge', test: 'test_a1_edge_x', file: 'tests/test_a.py' }];
r = await play({ groups: [grp('a')] }, { 'red-driver:a': { matrix: quote, files: ['tests/test_a.py'], reuse: 'none' } });
assert.ok(r.by('red-navigator:a')[0].prompt.includes("--row 'A1:happy:test_a1_happy_it'\\''s:tests/test_a.py'"), 'a quote in a test name is escaped for the shell');
assert.equal(r.out.groups.a.red.driver.gateOk, undefined, 'a driver that reports no gate result is recorded as such, not as ok');
r = await play({ groups: [grp('a')] }, { 'red-driver:a': { matrix: rows(grp('a')), files: ['tests/test_a.py'], reuse: 'none', gateOk: true, gateRuns: 2 }, 'green-driver:a': { files: ['src/a.py'], reuse: 'none', gateOk: false, gateRuns: 3, testGaps: [{ file: 'src/a.py', line: 4, why: 'mutant X-1 survives' }] } });
assert.deepEqual([r.out.groups.a.red.driver, r.out.groups.a.green.driver.gateRuns, r.out.groups.a.green.driver.testGaps.length], [{ gateOk: true, gateRuns: 2 }, 3, 1], 'what the maker\'s own loop ended on is kept for the record, never trusted: the navigator runs the gate again');

// 20 converge: after the fixers a courier re-runs the final gate; what it names goes back to the owning group; two rounds at most; what cannot be placed is not done
const one = [F('Validation missing', 'high', 'src/a.py')], fixedA = { fixed: ['x'], notFixed: [] };
r = await play({}, { reviewer: { findings: one }, 'fixer:a': fixedA });
assert.deepEqual([r.n['final-verifier'], r.out.verified], [1, { ok: true, rounds: 1, problems: [] }]);
assert.match(r.by('final-verifier')[0].prompt, /tdd\.mjs final --run \/tmp\/pat-test --again/);
assert.deepEqual([r.by('final-verifier')[0].o.agentType, r.by('final-verifier')[0].o.model, r.by('final-verifier')[0].o.effort], ['code-reviewer', 'haiku', 'low']);
assert.match(r.by('fixer:a')[0].prompt, /KEEP EDITING[\s\S]*tdd\.mjs green --run \/tmp\/pat-test --group a --retest/, 'a fixer loops on its group gate');
assert.doesNotMatch(r.by('fixer:a')[0].prompt, /tdd\.mjs final/);
r = await play({});
assert.deepEqual([r.n['final-verifier'], r.out.verified], [undefined, null], 'no fixer ran, so there is nothing to re-check');
const bad1 = { ok: false, problems: [{ file: 'tests/test_a.py', group: '', what: 'group tests fail together: tests/test_a.py' }, { file: 'tests/test_old.py', group: 'b', what: 'existing tests broken by the change: tests/test_old.py' }, { file: 'notes.txt', group: '', what: 'files outside the plan changed: notes.txt' }] };
r = await play({}, { reviewer: { findings: one }, 'fixer:a': fixedA, 'final-verifier': bad1 });
assert.deepEqual(r.calls.filter(c => /^fixer:.*:final/.test(c.o.label)).map(c => c.o.label).sort(), ['fixer:a:final', 'fixer:b:final'], 'a file owned by a group goes to it; an unowned test goes to the group the courier named');
assert.match(r.by('fixer:a:final')[0].prompt, /group tests fail together[\s\S]*never edit an existing test[\s\S]*ONLY tests\/test_a\.py, src\/a\.py\./);
assert.doesNotMatch(r.by('fixer:a:final')[0].prompt, /test_old|notes\.txt/);
assert.doesNotMatch(r.by('fixer:a:final')[0].prompt, /test_a\.py:\d/, 'a problem names a file, not a line range it does not have');
assert.match(r.by('fixer:a:final')[0].prompt, /KEEP EDITING/);
assert.deepEqual([r.out.verified.ok, r.out.verified.rounds, r.n['final-verifier']], [true, 2, 2]);
assert.deepEqual(r.out.verified.fixers.map(f => f.group).sort(), ['a', 'b']);
const still = { ok: false, problems: [{ file: 'tests/test_a.py', group: 'a', what: 'group tests fail together: tests/test_a.py' }] };
r = await play({}, { reviewer: { findings: one }, 'fixer:a': fixedA, 'final-verifier': still, 'final-verifier:2': still, 'final-verifier:3': still });
assert.deepEqual(r.calls.filter(c => /^fixer:a:final/.test(c.o.label)).map(c => c.o.label), ['fixer:a:final', 'fixer:a:final2'], 'two fix passes at most; the last verdict is reported, not fixed again');
assert.deepEqual([r.out.verified.ok, r.out.verified.rounds, r.n['final-verifier']], [false, 3, 3]);
assert.ok(r.out.notDone.some(n => /final gate still failing after 3 round\(s\): tests\/test_a\.py group tests fail together/.test(n)));
r = await play({}, { reviewer: { findings: one }, 'fixer:a': fixedA, 'final-verifier': { ok: false, problems: [{ file: 'notes.txt', group: '', what: 'files outside the plan changed: notes.txt' }] } });
assert.equal(r.calls.filter(c => /:final/.test(c.o.label)).length, 0, 'a problem with no owner is not guessed at: it is left to the lead');
assert.deepEqual([r.out.verified.ok, r.n['final-verifier']], [false, 1]);
assert.ok(r.out.notDone.some(n => /notes\.txt/.test(n)));
r = await play({}, { reviewer: { findings: one }, 'fixer:a': fixedA, 'final-verifier': () => null });
assert.deepEqual([r.out.verified.ok, r.out.failed.map(f => f.id)], [false, ['final-verifier']]);
assert.ok(r.out.notDone.some(n => /final verifier returned nothing/.test(n)));
r = await play({ rounds: 1 }, { reviewer: { findings: one }, 'fixer:a': fixedA, 'final-verifier': still, 'final-verifier:2': still });
assert.deepEqual([r.calls.filter(c => /:final/.test(c.o.label)).length, r.n['final-verifier'], r.out.verified.rounds], [1, 2, 2], 'plan.rounds = 1 is one fix pass and one re-check');
// fixers of dependent groups never run side by side: b's gate builds on a's working-tree files, so b's fixer waits for a's; an independent group does not wait
const threeF = [F('in a', 'low', 'src/a.py', 'none'), F('in b', 'low', 'src/b.py', 'none', { startLine: 20, endLine: 21 }), F('in c', 'low', 'src/c.py', 'none', { startLine: 40, endLine: 41 })];
let freeA;
const heldA = new Promise(res => { freeA = res; });
const hf = launch({}, agentsFor(BASE, { reviewer: { findings: threeF } }), l => (l === 'fixer:a' ? heldA : 0));
await tick(80);
assert.ok(hf.events.includes('start fixer:c') && hf.events.includes('end fixer:c'), 'an independent group fixes while a is still being fixed');
assert.ok(hf.events.includes('start fixer:a') && !hf.events.includes('start fixer:b'), 'b waits for a\'s fixer: its gate would see a half-edited a');
freeA();
await hf.done;
assert.ok(idx(hf.events, 'end fixer:a') < idx(hf.events, 'start fixer:b'));
// the true ceiling of build agents per group is 5 + 5R, reached when the matrix needs a rework, every RED check fails R times and every GREEN round needs a code fix AND a strengthening pass
let mix = 0;
const thinMatrix = () => ({ matrix: rows(a, ['happy']), files: ['tests/test_a.py'], reuse: 'none' });
const failsR = () => FAIL('test', 'weak assertion ' + (++mix));
const both = () => ({ verdict: 'FAIL', gateOk: false, defects: [{ cls: 'gap', what: 'mutant ' + (++mix) + ' survived' }, { cls: 'impl', what: 'extra behavior ' + mix }] });
const rr = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`red-navigator:a${i ? ':recheck' + (i > 1 ? i : '') : ''}`, failsR]));
const gg = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`green-navigator:a${i ? ':recheck' + (i > 1 ? i : '') : ''}`, both]));
r = await play({ groups: [grp('a')] }, { 'red-driver:a': thinMatrix, 'red-driver:a:matrix': thinMatrix, ...rr(ROUNDS), ...gg(ROUNDS) });
assert.equal(r.calls.filter(c => ['red-driver', 'red-navigator', 'green-driver', 'green-navigator'].includes(c.o.label.split(':')[0]) && c.o.label.split(':')[1] === 'a').length, 5 + 5 * ROUNDS, 'the documented worst case is reached and not exceeded');
assert.equal(r.out.groups.a.state, 'done');

// 21 the run-wide repair budget: spent, a failing group is PAUSED (resumable), never retried further; the cheapest brake on tokens
nth = 0;
r = await play({ groups: [grp('a')], maxRepairs: 1 }, never);
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 2, 'the driver, then the one repair the budget allows');
assert.deepEqual([r.out.groups.a.state, r.out.stats.repairsLeft, r.out.stats.repairBudget], ['paused', 0, 1]);
assert.match(r.out.groups.a.reason, /run-wide repair budget \(1\) is spent after 1 repair round\(s\)[\s\S]*continue with tdd\.mjs resume/);
assert.ok(r.out.notDone.some(n => /^a paused/.test(n)) && /tdd\.mjs resume --run \/tmp\/pat-test --ret return\.json[\s\S]*args\.resume/.test(r.out.postmortemMd), 'the report says how to continue');
nth = 0;
r = await play({ groups: [grp('a'), grp('b', { after: ['a'] })], dod: BASE.dod, maxRepairs: 0 }, { 'red-navigator:a': FAIL('test', 'weak') });
assert.deepEqual([r.out.groups.a.state, r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, r.out.groups.b.state], ['paused', 1, 'blocked'], 'no budget: the first failing check pauses the group, and what waits for it is blocked');
const thinOnly = () => ({ matrix: rows(a, ['happy']), files: ['tests/test_a.py'], reuse: 'none' });
r = await play({ groups: [grp('a')], maxRepairs: 0 }, { 'red-driver:a': thinOnly });
assert.equal(r.by('red-driver:a:matrix').length, 0, 'the matrix rework is a repair too: with none left the navigator is told about the gap instead');
assert.match(r.by('red-navigator:a')[0].prompt, /KNOWN GAPS/);
r = await play({ groups: [grp('a'), grp('c')], maxRepairs: 1 }, { 'red-navigator:a': () => FAIL('test', 'weak a'), 'red-navigator:c': () => FAIL('test', 'weak c'), 'red-navigator:c:recheck': () => FAIL('test', 'weak c again') });
assert.equal(r.calls.filter(c => /:rework/.test(c.o.label)).length, 1, 'the budget belongs to the run, not to each group');
assert.ok(Object.values(r.out.groups).some(g => g.state === 'paused'));
r = await play({ mode: 'plan', maxRepairs: undefined });
assert.deepEqual([r.out.repairBudget, r.out.worstBuildAgents], [6, 30], 'the default is 2 repairs per group: 3 groups cap at 4 x 3 + 3 x 6 build agents');
r = await play({ mode: 'plan', maxRepairs: 99 });
assert.equal(r.out.repairBudget, 6, 'an out-of-range budget falls back to the default');

// 22 a maker that stops on a failing gate and says what remains: the next pass starts from that list, no navigator is spent on a failure it already admits; a PASS never comes from a maker
const stuck = { matrix: rows(a), files: ['tests/test_a.py'], reuse: 'none', gateOk: false, gateRuns: 3, remaining: [{ cls: 'test', file: 'tests/test_a.py', what: 'the edge test still passes already' }] };
r = await play({ groups: [grp('a')] }, { 'red-driver:a': stuck });
assert.deepEqual([r.by('red-navigator:a').length, r.by('red-driver:a:rework').length, r.by('red-navigator:a:recheck').length, r.out.groups.a.state], [0, 1, 1, 'done']);
assert.match(r.by('red-driver:a:rework')[0].prompt, /FIX EXACTLY THESE DEFECTS[\s\S]*the edge test still passes already/);
r = await play({ groups: [grp('a')] }, { 'red-driver:a': { ...stuck, gateOk: true } });
assert.equal(r.by('red-navigator:a').length, 1, 'a maker that says ok is still checked: only a navigator on fresh facts ends a stage');
r = await play({ groups: [grp('a')] }, { 'red-driver:a': stuck, 'red-driver:a:rework': stuck });
assert.deepEqual([r.calls.filter(c => /^red-navigator/.test(c.o.label)).length, r.out.groups.a.state], [0, 'blocked']);
assert.match(r.out.groups.a.reason, /RED made no progress/, 'the same admitted defects twice is a stall, with no agent spent on checking it');
const greenStuck = { files: ['src/a.py'], reuse: 'none', gateOk: false, gateRuns: 3, remaining: [{ cls: 'gap', file: 'src/a.py', line: 4, what: 'mutant X-1 survived: no test pins x > 0' }] };
r = await play({ groups: [grp('a')] }, { 'green-driver:a': greenStuck, 'red-driver:a:strengthen': strengthened });
assert.deepEqual([r.by('green-navigator:a').length, r.by('red-driver:a:strengthen').length, r.out.groups.a.state], [0, 1, 'done'], 'an admitted survivor goes straight to the strengthening pass');
assert.match(r.by('green-navigator:a:recheck')[0].prompt, /--retest/);
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': mixed, 'red-driver:a:strengthen': { ...strengthened, gateOk: false, remaining: [{ cls: 'gap', what: 'x' }] }, 'green-driver:a:rework': { files: ['src/a.py'], reuse: 'none', gateOk: false, remaining: [{ cls: 'impl', what: 'y' }] } }, 3);
assert.equal(r.by('green-navigator:a:recheck').length, 1, 'two makers in one round never ran the gate: their claims are not admissions, the check runs');

// 23 resume: a continue file (written by tdd.mjs resume from the gate files) lets a failed, blocked, paused or killed run continue; done groups cost nothing
const cont = (groups, base = 'b'.repeat(40)) => ({ resume: { version: 1, base, groups } });
const ent = (next, o = {}) => ({ next, why: 'test', matrix: rows(a), files: ['tests/test_a.py'], defects: [], retest: false, ...o });
r = await play(cont({ a: ent('done'), b: ent('done', { matrix: rows(BASE.groups[1]) }), c: ent('done', { matrix: rows(BASE.groups[2]) }) }));
assert.deepEqual([r.out.stats.total, r.n.reviewer, Object.values(r.out.groups).map(g => g.state)], [1, 1, ['done', 'done', 'done']], 'every group already done: only the review is left to pay for');
assert.deepEqual([r.out.groups.a.red.carried, r.out.groups.a.matrix.length], [true, 3], 'the carried matrix reaches the return, so verify still closes the DoD');
const only = (e, args = {}) => play({ groups: [grp('a')], ...cont({ a: e }), ...args });
r = await only(ent('green-fix', { defects: [{ cls: 'impl', file: 'tests/test_a.py', what: 'tests/test_a.py is fails-on-head: it does not pass with the group code' }] }));
assert.deepEqual([r.by('red-driver:a').length, r.by('red-navigator:a').length, r.by('green-driver:a').length, r.by('green-navigator:a').length], [0, 0, 0, 0], 'RED, the first driver and the first check are all skipped');
assert.match(r.by('green-driver:a:rework')[0].prompt, /FIX EXACTLY THESE DEFECTS[\s\S]*fails-on-head/);
assert.deepEqual([r.by('green-navigator:a:recheck').length, r.out.groups.a.state, r.out.groups.a.red.carried], [1, 'done', true]);
r = await only(ent('green-check'));
assert.deepEqual([r.out.stats.agentsByNode['red-driver'], r.out.stats.agentsByNode['green-driver'], r.by('green-navigator:a').length], [undefined, undefined, 1], 'the gates were ok and nobody judged them: one navigator, no maker');
r = await only(ent('green'));
assert.deepEqual([r.by('red-driver:a').length, r.by('green-driver:a').length, r.by('green-navigator:a').length], [0, 1, 1]);
r = await only(ent('red-check'));
assert.deepEqual([r.by('red-driver:a').length, r.by('red-navigator:a').length, r.by('green-driver:a').length], [0, 1, 1], 'a navigator looks at the tests on disk, then GREEN runs as usual');
r = await only(ent('red-fix', { defects: [{ cls: 'test', file: 'tests/test_a.py', what: 'RED gate: tests/test_a.py is passes-already' }] }));
assert.deepEqual([r.by('red-driver:a').length, r.by('red-driver:a:rework').length, r.by('red-navigator:a:recheck').length], [0, 1, 1]);
assert.match(r.by('red-driver:a:rework')[0].prompt, /passes-already/);
r = await only(ent('red'));
assert.deepEqual([r.by('red-driver:a').length, r.by('red-navigator:a').length], [1, 1], 'nothing to continue from: a normal start');
r = await only(ent('nonsense'));
assert.equal(r.by('red-driver:a').length, 1, 'an unknown entry is a normal start, never a skipped group');
r = await only(ent('green-check', { retest: true }));
assert.match(r.by('green-navigator:a')[0].prompt, /green --run \/tmp\/pat-test --group a --retest/, 'tests strengthened in the last run keep --retest');
r = await only(ent('green', { retest: true }));
assert.match(r.by('green-driver:a')[0].prompt, /green --run \/tmp\/pat-test --group a --retest/);
assert.equal(r.out.groups.a.retest, true, 'the return records it, so the next resume keeps it');
assert.match((await play(cont({}, 'c'.repeat(40)))).out.error, /another run/, 'a continue file from another base is refused');
// a group that waits for a carried-over group does not wait for anything
r = await play({ groups: [grp('a'), grp('b', { after: ['a'] })], dod: BASE.dod, ...cont({ a: ent('done'), b: ent('green', { matrix: rows(BASE.groups[1]) }) }) });
assert.deepEqual([r.out.groups.a.state, r.out.groups.b.state, r.by('red-driver:b').length], ['done', 'done', 0]);
// a dead agent's replacement is pointed at one cheap command instead of exploring the tree
calls10 = 0;
r = await play({}, { 'red-driver:c': () => (++calls10 === 1 ? null : { matrix: rows(BASE.groups[2]), files: ['tests/test_c.py'], reuse: 'none' }) });
assert.match(r.by('red-driver:c')[1].prompt, /^RETRY 2\/2 of red-driver:c[\s\S]*Run `node \S+\/tdd\.mjs resume --run \/tmp\/pat-test --group c` first/);
r = await play({}, { reviewer: () => (calls10-- > 0 ? null : { findings: [] }) });
assert.match(r.by('reviewer')[1].prompt, /^RETRY 2\/2 of reviewer[\s\S]*read the files and `git diff` first/, 'an agent with no group has no state to ask for');

// 24 pins found by the mutation probe on the resume and budget code
r = await only(ent('done'));
assert.deepEqual([r.out.groups.a.red.reworks, r.out.groups.a.green.reworks, r.out.groups.a.retest], [0, 0, false], 'a carried group has spent no repair in this run');
r = await only(ent('green'));
assert.deepEqual([r.out.groups.a.red.reworks, r.out.groups.a.red.carried], [0, true]);
r = await play({ groups: [grp('a')] });
assert.deepEqual(r.out.groups.a.files, ['tests/test_a.py'], 'the files the driver reports reach the return');
r = await play({ groups: [grp('a')], maxRepairs: 1 }, { 'red-driver:a': thinOnly });
assert.deepEqual([r.by('red-driver:a:matrix').length, r.out.stats.repairsLeft, r.out.groups.a.state], [1, 0, 'done'], 'the matrix rework runs on the LAST repair of the budget');
// the repair itself can admit: a code maker that stops on a surviving mutant sends the group straight to a strengthening pass, with no check in between
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('impl', 'extra feature'), 'green-driver:a:rework': greenStuck, 'red-driver:a:strengthen2': strengthened });
assert.deepEqual([r.by('green-navigator:a:recheck').length, r.by('red-driver:a:strengthen2').length, r.by('green-navigator:a:recheck2').length, r.out.groups.a.state], [0, 1, 1, 'done']);
assert.match(r.by('red-driver:a:strengthen2')[0].prompt, /mutant X-1 survived/);
// a test defect that two makers report is kept once, a new one is added
const td = { file: 'tests/test_a.py', line: 9, why: 'asserts the old message' }, td2 = { file: 'tests/test_a.py', line: 12, why: 'asserts the old name' };
r = await play({ groups: [grp('a')] }, {
  'green-driver:a': { files: ['src/a.py'], reuse: 'none', gateOk: false, gateRuns: 3, remaining: [{ cls: 'impl', what: 'first' }] },
  'green-driver:a:rework': { files: ['src/a.py'], reuse: 'none', gateOk: false, gateRuns: 2, testDefects: [td], remaining: [{ cls: 'impl', what: 'second' }] },
  'green-driver:a:rework2': { files: ['src/a.py'], reuse: 'none', gateOk: true, gateRuns: 1, testDefects: [td, td2] },
});
assert.deepEqual(r.out.groups.a.green.testDefects, [td, td2], 'the same test defect from two makers is kept once, a new one is added');
assert.deepEqual([r.out.groups.a.green.driver.gateOk, r.out.groups.a.green.driver.gateRuns], [true, 1], 'and the record is the latest maker\'s');
// a strengthening-only round never rewrites the record of the code maker
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': FAIL('gap', 'mutant X-3 survived'), 'red-driver:a:strengthen': { ...strengthened, gateOk: false, gateRuns: 9 } });
assert.deepEqual([r.out.groups.a.green.driver.gateRuns], [undefined], 'the green driver of the default scenario reports no gate runs, and a strengthening maker\'s claim does not replace that');
// 25 fixes from the second review: fair shares of the budget, carried groups cost no budget, a paused group is not reviewed, retest survives a stop, a continue file is bound to its run
nth = 0;
r = await play({ groups: [grp('a'), grp('c')], maxRepairs: 3 }, { ...never, 'red-navigator:c': () => FAIL('test', 'weak c') }, l => (/^red-navigator:c/.test(l) ? 40 : 0));
assert.equal(r.calls.filter(c => /^red-driver:a:rework/.test(c.o.label)).length, 2, 'the hard group takes what the easy one has not got coming, and no more');
assert.deepEqual([r.out.groups.a.state, r.out.groups.c.state], ['paused', 'done'], 'the easy group still gets its repair');
assert.match(r.out.groups.a.reason, /the rest of the run-wide repair budget \(3\) is reserved for the groups still running/);
nth = 0;
const neverC = Object.fromEntries(['green-navigator:c', 'green-navigator:c:recheck', 'green-navigator:c:recheck2', 'green-navigator:c:recheck3'].map(l => [l, () => FAIL('impl', 'defect number ' + (++nth))]));
r = await play({ maxRepairs: undefined, ...cont({ a: ent('done'), b: ent('done', { matrix: rows(BASE.groups[1]) }), c: ent('green-check', { matrix: rows(BASE.groups[2]) }) }) }, neverC);
assert.deepEqual([r.out.stats.repairBudget, r.out.groups.c.state, r.calls.filter(c => /^green-driver:c:rework/.test(c.o.label)).length], [2, 'paused', 2], 'groups carried over as done get no budget: 2 for the one group with work left, not 6');
assert.equal(r.out.reviewed, false);
assert.equal(r.n.reviewer, undefined, 'a paused group means the change is not whole: no opus review of it now, and none again after the resume');
assert.ok(r.logs.some(m => /reviewer skipped: group\(s\) c paused/.test(m)));
r = await play({ groups: [grp('a')] }, { 'green-navigator:a': () => FAIL('gap', 'mutant ' + (++nth) + ' survived'), 'green-navigator:a:recheck': () => FAIL('gap', 'mutant ' + (++nth) + ' survived'), 'green-navigator:a:recheck2': () => FAIL('gap', 'mutant ' + (++nth) + ' survived'), 'green-navigator:a:recheck3': () => FAIL('gap', 'mutant ' + (++nth) + ' survived') });
assert.deepEqual([r.out.groups.a.state, r.out.groups.a.retest], ['blocked', true], 'a group that stops after strengthening its tests records that, or the next resume would undo the strengthening');
assert.match((await play({ resume: { version: 1, base: 'b'.repeat(40), run: '/tmp/some-other-run', groups: {} } })).out.error, /another run/);
assert.match((await play({ resume: { version: 1, groups: {} } })).out.error, /another run/, 'a continue file with no base is refused, not trusted');
assert.equal((await play({ ...cont({ a: ent('done'), b: ent('done', { matrix: rows(BASE.groups[1]) }), c: ent('done', { matrix: rows(BASE.groups[2]) }) }), resume: { version: 1, base: 'b'.repeat(40), run: '/tmp/pat-test/', groups: { a: ent('done'), b: ent('done', { matrix: rows(BASE.groups[1]) }), c: ent('done', { matrix: rows(BASE.groups[2]) }) } } })).out.error, undefined, 'the same run folder, with or without a trailing slash');
r = await play({}, { 'green-driver:c': () => null });
assert.match(r.out.postmortemMd, /tdd\.mjs resume --run \/tmp\/pat-test[\s\S]*args\.resume/, 'the postmortem points at the cheap way back, not at redoing the work');
assert.match(r.by('green-navigator:a')[0].prompt, /passes without the new code = cls gap[\s\S]*a flaky run too\) cls impl/);

// the shares, at their boundaries: a group is never held to less than its share, and never takes what a group still running is owed
const easy = (id, ms = 40) => ({ over: { [`red-navigator:${id}`]: () => FAIL('test', 'weak ' + id) }, delay: l => (l.startsWith(`red-navigator:${id}`) ? ms : 0) });
nth = 0;
r = await play({ groups: [grp('a'), grp('c')], maxRepairs: 2 }, { ...never, ...easy('c').over }, easy('c').delay);
assert.equal(r.calls.filter(c => /^red-driver:a:rework/.test(c.o.label)).length, 1, 'a has spent its share and the last repair belongs to c: exactly 1');
assert.deepEqual([r.out.groups.a.state, r.out.groups.c.state], ['paused', 'done']);
nth = 0;
r = await play({ groups: [grp('a'), grp('c'), grp('d')], dod: BASE.dod, maxRepairs: 3 }, { ...never, ...easy('c').over, ...easy('d').over }, l => (/^red-navigator:[cd]/.test(l) ? 40 : 0));
assert.deepEqual([r.calls.filter(c => /^red-driver:a:rework/.test(c.o.label)).length, r.out.groups.c.state, r.out.groups.d.state], [1, 'done', 'done'], 'three groups, three repairs: the hard one keeps one, each easy one gets its own');
r = await play({ groups: [grp('a')] });
assert.deepEqual([r.out.groups.a.red.reworks, r.out.groups.a.green.reworks], [0, 0], 'a group that needed nothing spent nothing');

console.log('ok - paired-agent-tdd workflow.js: 26 scenarios');
