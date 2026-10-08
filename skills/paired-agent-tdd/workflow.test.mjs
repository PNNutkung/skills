// Offline check for workflow.js: canned agents, no real agent, no git, no sandbox. Run after editing workflow.js or graph.mjs: node workflow.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'workflow.js'), 'utf8');
const POOL = JSON.parse(/const LIM = (\{.*\})/.exec(SRC)[1]).pool; // generated from graph.mjs
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', SRC.replace('export ', ''));

const KINDS = ['happy', 'fail', 'edge'];
const grp = (id, o = {}) => ({ id, goal: `goal of ${id}`, tests: [`tests/test_${id}.py`], src: [`src/${id}.py`], dod: [`${id.toUpperCase()}1`], after: [], ...o });
const BASE = {
  repo: '/repo', base: 'b'.repeat(40), cmd: 'pytest -q {file}', skillDir: HERE, runDir: '/tmp/pat-test', scratch: '/tmp/pat-scratch',
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
  return { out, ...h, n: out.stats && out.stats.agentsByNode, by: label => h.calls.filter(c => c.o.label === label) };
}
const idx = (events, e) => events.indexOf(e);

// 1 plan mode spawns nothing; prompt budgets hold (a prompt word is ~1% of an agent's cost: the fixed context is ~40k tokens, see runs.md)
let r = await play({ mode: 'plan' });
assert.equal(r.calls.length, 0);
assert.deepEqual([r.out.plan.counts['red-driver'], r.out.plan.total], [3, 14]);
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

// 6 a navigator FAIL gets ONE rework and ONE re-check; a second FAIL blocks the group and everything that waits for it
r = await play({}, { 'red-navigator:a': () => FAIL('test', 'asserts the implementation') });
assert.deepEqual([r.by('red-driver:a:rework').length, r.by('red-navigator:a:recheck').length], [1, 1]);
assert.match(r.by('red-driver:a:rework')[0].prompt, /FIX EXACTLY THESE DEFECTS[\s\S]*asserts the implementation/);
assert.match(r.by('red-navigator:a:recheck')[0].prompt, /RE-CHECK after one rework[\s\S]*asserts the implementation/);
assert.deepEqual([r.out.groups.a.state, r.out.groups.a.red.reworks], ['done', 1]);
r = await play({}, { 'red-navigator:a': () => FAIL('test', 'wrong invariant'), 'red-navigator:a:recheck': () => FAIL('test', 'still wrong') });
assert.equal(r.calls.filter(c => /^red-driver:a/.test(c.o.label)).length, 2, 'the driver, then exactly one rework');
assert.deepEqual([r.out.groups.a.state, r.out.groups.b.state, r.out.groups.c.state], ['blocked', 'blocked', 'done']);
assert.match(r.out.groups.b.reason, /waits for group a/);
assert.equal(r.n['green-driver'], 1, 'only the independent group reached GREEN');
assert.equal(r.out.notDone.length, 2);
assert.ok(r.out.reviewed && r.out.postmortemMd.includes('Not done'));

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

// 8 rolling pool: never more than POOL agents in flight, and the pool really fills
const MANY = Array.from({ length: 12 }, (_, i) => grp('g' + i));
r = await play({ groups: MANY, dod: MANY.map(g => ({ id: g.dod[0], text: 't', source: 'assumed' })) }, {}, 5);
assert.equal(r.live.max, POOL, 'pool never filled or overflowed: ' + r.live.max);

// 9 the reviewer: findings become proofcheck clusters; a medium without a checkable proof is unproven; ONE fixer per owning group, never two on a file
const F = (title, severity, file, mode = 'read', extra = {}) => ({ title, severity, file, startLine: 3, endLine: 4, hazard: 'h ' + title, failureScenario: 's', quote: 'code ' + title, suggestedFix: 'do x', anchorable: true, proof: { mode, ref: file + ':3-4', quote: 'code ' + title }, ...extra });
const found = [F('Validation missing', 'high', 'src/a.py'), F('Weak assertion', 'medium', 'tests/test_a.py', 'inferred'), F('Stale example', 'low', 'src/b.py', 'none'), F('Doc drift', 'low', 'README.md', 'none'), F('naming', 'nit', 'src/c.py', 'none')];
r = await play({}, { reviewer: { findings: found }, 'fixer:a': { fixed: ['x'], notFixed: [] } });
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

console.log('ok - paired-agent-tdd workflow.js: 18 scenarios');
