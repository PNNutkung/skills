// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// Each new flag on alone, then all off (the v2.0.0 pipeline) and all on. VMeasure: prints agent count, critical-path agent hops and gate wall-clock, all off vs all on.
//   node --test e2e.speed.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEED_ENV, SPEED_OFF_ENV } from './speed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TDD = join(HERE, 'tdd.mjs');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const REAL = process.env.E2E_REAL === '1';
const RUNNER = REAL ? join(HERE, '..', 'zero-trust-review', 'sandbox-run.mjs') : join(HERE, 'direct-run.mjs');
const NODE = realpathSync(process.execPath);
const ON_ENV = Object.fromEntries(Object.values(SPEED_ENV).map(k => [k, '']));

const WEAK_FREE = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.mjs';
test('test_ac1_happy_words', () => assert.equal(slugify('Hello, World!'), 'hello-world'));
test('test_ac1_fail_non_string', () => assert.throws(() => slugify(42), TypeError));
test('test_ac1_edge_empty', () => assert.equal(slugify(''), ''));
test('test_ac1_edge_digits', () => assert.equal(slugify('Route 66'), 'route-66'));
test('test_ac2_happy_cut', () => assert.equal(slugify('abcdef', { maxLength: 3 }), 'abc'));
test('test_ac2_edge_no_trailing_dash', () => assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab'));
test('test_ac2_edge_default_length', () => assert.equal(slugify('a'.repeat(50)).length, 40));
`;
const SLUGS = [
  `export function slugify(text) {\n  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
  `export function slugify(text) {\n  if (typeof text !== 'string') throw new TypeError('text must be a string');\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
  `export function slugify(text, { maxLength = 40 } = {}) {\n  if (typeof text !== 'string') throw new TypeError('text must be a string');\n  // TODO: tighten the character class\n  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n  return slug.slice(0, maxLength).replace(/-+$/, '');\n}\n`,
];
const TITLE_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { title } from '../src/title.mjs';
test('test_ac3_happy_words', () => assert.equal(title('hello, world'), 'Hello World'));
test('test_ac3_fail_non_string', () => assert.throws(() => title(7), TypeError));
test('test_ac3_edge_empty', () => assert.equal(title(''), ''));
`;
const TITLES = [
  `import { slugify } from './slug.mjs';\nexport const title = text => slugify(text).split('-').join(' ');\n`,
  `import { slugify } from './slug.mjs';\nexport const title = text => slugify(text).split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('-');\n`,
  `import { slugify } from './slug.mjs';\nexport const title = text => slugify(text).split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');\n`,
];
const rows = (id, tests, file) => tests.map(([kind, t]) => ({ dod: id, kind, test: t, file }));
const GROUPS = {
  a: { tests: 'tests/test_slug.mjs', src: 'src/slug.mjs', testText: WEAK_FREE, versions: SLUGS, rows: [...rows('AC1', [['happy', 'test_ac1_happy_words'], ['fail', 'test_ac1_fail_non_string'], ['edge', 'test_ac1_edge_empty']], 'tests/test_slug.mjs'), ...rows('AC2', [['happy', 'test_ac2_happy_cut'], ['edge', 'test_ac2_edge_no_trailing_dash']], 'tests/test_slug.mjs')] },
  b: { tests: 'tests/test_title.mjs', src: 'src/title.mjs', testText: TITLE_TEST, versions: TITLES, rows: rows('AC3', [['happy', 'test_ac3_happy_words'], ['fail', 'test_ac3_fail_non_string'], ['edge', 'test_ac3_edge_empty']], 'tests/test_title.mjs') },
};
const INTEG = 'tests/integration/test_flow.mjs';

/** One whole run in its own fixture repo: plan with `env`, the Workflow with scripted agents, then verify. -> what happened and what it cost */
async function runWith(env, tweak = () => ({})) { // tweak(tools) -> scripted agents that replace the default ones
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-e2e-speed-'))), repo = join(dir, 'repo'), tmp = join(dir, 'tmp');
  for (const d of [repo, tmp]) mkdirSync(d);
  const ENV = { ...process.env, TMPDIR: tmp, ZT_MARKER_DIR: join(dir, 'marker'), ...env };
  try {
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
    const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
    git('init', '-q'); put('package.json', '{"type":"module"}\n'); put('README.md', 'text utils\n'); git('add', '-A'); git('commit', '-qm', 'base');
    const plan = {
      repo, cmd: `${REAL ? NODE : 'node'} --test {file}`, ...(REAL ? { ro: [dirname(dirname(NODE))] } : {}), mutation: { max: 10, budget: 60 }, integration: { file: INTEG, goal: 'title and slugify together, through the module boundary' },
      dod: [{ id: 'AC1', text: 'slugify lowercases and hyphenates words, throws TypeError for a non-string', source: 'assumed' }, { id: 'AC2', text: 'slugify cuts to maxLength, default 40', source: 'assumed', kinds: ['happy', 'edge'] },
        { id: 'AC3', text: 'title turns a slug into Title Case', source: 'assumed' }],
      groups: [{ id: 'a', goal: 'slugify', tests: [GROUPS.a.tests], src: [GROUPS.a.src], dod: ['AC1', 'AC2'], after: [] }, { id: 'b', goal: 'title, built on slugify', tests: [GROUPS.b.tests], src: [GROUPS.b.src], dod: ['AC3'], after: ['a'] }],
    };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    const gateMs = {}, outputs = [];
    const exec = (cmd, kind) => {
      const t0 = performance.now(), out = spawnSync('sh', ['-c', `${cmd} --runner ${RUNNER}`], { encoding: 'utf8', env: ENV });
      gateMs[kind] = (gateMs[kind] ?? 0) + (performance.now() - t0);
      assert.equal(out.status, 0, `${cmd}\n${out.stderr}`);
      outputs.push([kind, cmd, out.stdout]);
      return out.stdout;
    };
    const planned = spawnSync(process.execPath, [TDD, 'plan', '--plan', join(dir, 'plan.json'), '--runner', RUNNER], { encoding: 'utf8', env: ENV });
    assert.equal(planned.status, 0, planned.stderr);
    const ARGS = JSON.parse(planned.stdout.trim().split('\n').pop());
    const cmdOf = (prompt, re) => { const m = re.exec(prompt); return m && m[1]; };
    const GREEN_FULL = /`(node \S+\/tdd\.mjs green --run \S+ --group \w+(?: --retest)?)`/, GREEN_QUICK = /`(node \S+\/tdd\.mjs green [^`]*--quick)`/, GREEN_ANY = /`(node \S+\/tdd\.mjs green [^`]*)`/;
    const RED = /`(node \S+\/tdd\.mjs red --run \S+ --group \w+)`/, FINAL = /`(node \S+\/tdd\.mjs final --run \S+(?: --again)?)`/;
    const dodWith = (prompt, rs) => exec(`${/(node \S+\/tdd\.mjs dod --run \S+ --group \w+ --stage red)/.exec(prompt)[1]}${rs.map(r => ` --row '${r.dod}:${r.kind}:${r.test}:${r.file}'`).join('')}`, 'dod');
    const dods = prompt => [...prompt.matchAll(/`(node \S+\/tdd\.mjs dod [^`(]+)`/g)].map(m => exec(m[1], 'dod'));
    const ok = out => /ok=true/.test(out);
    // a driver's own GREEN loop: two bugs, one fixed per run; run 2 adds --quick when its prompt says so (PTDD_QUICK_DRIVER_GATE_ENABLED)
    const greenLoop = (gid, prompt) => {
      const G = GROUPS[gid], quick = cmdOf(prompt, GREEN_QUICK);
      let out = '';
      G.versions.forEach((v, i) => { put(G.src, v); out = exec(i === 1 && quick ? quick : cmdOf(prompt, GREEN_FULL), i === 1 && quick ? 'green-quick' : 'green'); });
      return { gateOk: ok(out), gateRuns: G.versions.length };
    };
    const writeRed = (gid, prompt) => { const G = GROUPS[gid]; put(G.tests, G.testText); return ok(exec(cmdOf(prompt, RED), 'red')) && ok(dodWith(prompt, G.rows)); };
    const navigator = prompt => {
      const red = cmdOf(prompt, RED) ? exec(cmdOf(prompt, RED), 'red') : 'ok=true', green = cmdOf(prompt, GREEN_ANY) && !/ROLE: navigator: verify the RED/.test(prompt) ? exec(cmdOf(prompt, GREEN_ANY), 'green-nav') : 'ok=true', dd = dods(prompt);
      return ok(red) && ok(green) && dd.every(ok) ? { verdict: 'PASS', defects: [], gateOk: true } : { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'impl', what: [red, green, ...dd].join('\n').slice(0, 300) }] };
    };
    const events = [], calls = [];
    const script = {
      'tdd-driver': (gid, p) => { writeRed(gid, p); return { matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], srcFiles: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }; },
      'red-driver': (gid, p) => ({ matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], reuse: 'none', gateOk: writeRed(gid, p), gateRuns: 1 }),
      'green-driver': (gid, p) => ({ files: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }),
      'red-navigator': (gid, p) => navigator(p),
      'green-navigator': (gid, p) => navigator(p),
      'integration-tester': () => { put(INTEG, `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { title } from '../../src/title.mjs';\ntest('flow', () => assert.equal(title('a b'), 'A B'));\n`); return { file: INTEG, exit: 0, findings: [] }; },
      reviewer: (gid, p) => {
        exec(cmdOf(p, FINAL), 'final');
        const line = readFileSync(join(repo, GROUPS.a.src), 'utf8').split('\n').findIndex(l => l.includes('TODO')) + 1;
        return { findings: [{ title: 'Leftover TODO in shipped code', severity: 'medium', file: GROUPS.a.src, startLine: line, endLine: line, hazard: 'a stale TODO', failureScenario: 'readers think the class is wrong', quote: '// TODO: tighten the character class', suggestedFix: 'delete it', anchorable: true, proof: { mode: 'read', ref: `${GROUPS.a.src}:${line}-${line}`, quote: '// TODO: tighten the character class' } }] };
      },
      fixer: (gid, p) => {
        put(GROUPS.a.src, readFileSync(join(repo, GROUPS.a.src), 'utf8').split('\n').filter(l => !l.includes('TODO')).join('\n'));
        return { fixed: [/^(R-\S+) \[/m.exec(p)[1]], notFixed: [], gateOk: ok(exec(cmdOf(p, GREEN_ANY), 'green')), gateRuns: 1 };
      },
      'final-verifier': (gid, p) => ({ ok: ok(exec(cmdOf(p, FINAL), 'final')), problems: [] }),
      ...tweak({ put, repo, exec, ok, cmdOf, GREEN_ANY }),
    };
    const agent = async (prompt, o) => {
      calls.push({ label: o.label, prompt });
      events.push(`start ${o.label}`);
      await new Promise(r => setImmediate(r)); // every agent the script starts together is in flight before any of them works
      try { const [node, gid] = o.label.split(':'); assert.ok(script[node], `no script for ${o.label}`); return script[node](gid, prompt); } finally { events.push(`end ${o.label}`); }
    };
    const out = await wf(agent, parallel, async () => [], () => {}, () => {}, ARGS, {});
    const retFile = join(dir, 'return.json');
    writeFileSync(retFile, JSON.stringify(out));
    const verify = JSON.parse(exec(`${process.execPath} ${TDD} verify --run ${ARGS.runDir} --ret ${retFile}`, 'verify').trim().split('\n').pop());
    const labels = calls.map(c => c.label);
    return { ARGS, out, verify, labels, calls, events, outputs, gateMs, hops: hops(labels, plan.groups, events), agents: labels.length, gateTotal: Object.values(gateMs).reduce((a, b) => a + b, 0) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Critical-path agent hops: inside a group the agents run one after the other; a group's GREEN starts after the groups it waits for; then review (the integration tester and the reviewer, together or not), fixers by `after`, couriers with their fixers. */
function hops(labels, groups, events) {
  const byId = Object.fromEntries(groups.map(g => [g.id, g])), mine = gid => labels.filter(l => /^(red|green|tdd)-/.test(l) && l.split(':')[1] === gid);
  const isRed = l => /^(red-driver|red-navigator):\w+(:(rework\d*|recheck\d*|matrix))?$/.test(l);
  const chain = gid => { const red = mine(gid).filter(isRed).length, green = mine(gid).length - red, deps = byId[gid].after.map(chain); return deps.length ? Math.max(red, ...deps) + green : red + green; };
  const overlap = (x, y) => events.indexOf(`start ${x}`) < events.indexOf(`end ${y}`) && events.indexOf(`start ${y}`) < events.indexOf(`end ${x}`);
  const review = labels.includes('integration-tester') && labels.includes('reviewer') ? (overlap('integration-tester', 'reviewer') ? 1 : 2) : labels.includes('reviewer') ? 1 : 0;
  const fixers = labels.filter(l => /^fixer:\w+$/.test(l)).map(l => l.split(':')[1]), fdepth = gid => 1 + Math.max(0, ...byId[gid].after.filter(d => fixers.includes(d)).map(fdepth));
  const converge = labels.filter(l => /^final-verifier/.test(l)).length + new Set(labels.filter(l => /^fixer:\w+:final/.test(l)).map(l => l.split(':')[2])).size;
  return Math.max(...groups.map(g => chain(g.id))) + review + Math.max(0, ...fixers.map(fdepth)) + converge;
}

const done = r => {
  assert.deepEqual([r.out.groups.a.state, r.out.groups.b.state], ['done', 'done'], JSON.stringify(r.out.notDone));
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.final, r.verify.unfixed, r.verify.integration], [8, 8, true, [], 'ok'], JSON.stringify(r.verify));
};
const only = flag => ({ ...SPEED_OFF_ENV, ...(flag === SPEED_ENV.pipeline ? { [flag]: 'fast' } : { [flag]: 'true' }) });
const results = {};

test('fcompat: every speed flag off runs the v2.0.0 pipeline: four agents a group, a courier, the reviewer after the integration tester', async () => {
  const r = results.off = await runWith(SPEED_OFF_ENV);
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual([r.gateMs['green-quick'], r.outputs.some(([, , o]) => /reused:/.test(o)), 'finalReused' in r.verify], [undefined, false, false]);
});

test('pmode: PTDD_PIPELINE_MODE=fast alone gives the group with no after one tdd-driver and one navigator over both gates', async () => {
  const r = await runWith(only(SPEED_ENV.pipeline));
  done(r);
  assert.deepEqual(r.labels.filter(l => /^(red|green|tdd)-\S+:a$/.test(l)), ['tdd-driver:a', 'green-navigator:a']);
  assert.deepEqual(r.labels.filter(l => /^(red|green|tdd)-\S+:b$/.test(l)), ['red-driver:b', 'red-navigator:b', 'green-driver:b', 'green-navigator:b']);
  assert.equal(r.out.groups.a.red.merged, true);
});

test('pquick: PTDD_QUICK_DRIVER_GATE_ENABLED alone makes each driver\'s middle GREEN run quick (no mutants); the navigator\'s run mutates', async () => {
  const r = await runWith(only(SPEED_ENV.quickDriverGate));
  done(r);
  const quick = r.outputs.filter(([k]) => k === 'green-quick');
  assert.equal(quick.length, 2, 'one quick run per driver');
  assert.ok(quick.every(([, , o]) => /^GREEN \w ok=false \(quick: no mutants/.test(o) && /mutation: skipped \(--quick\)/.test(o)), quick.map(q => q[2]).join('\n'));
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, cmd, o]) => !/--quick/.test(cmd) && /mutation: \d+ of \d+ mutants/.test(o)), 'the navigator always mutates');
});

test('preuse, pvreuse: PTDD_GATE_REUSE_ENABLED alone lets each navigator reuse its driver\'s last full run (flake check re-run) and verify reuse the courier\'s final', async () => {
  const r = await runWith(only(SPEED_ENV.gateReuse));
  done(r);
  const nav = r.outputs.filter(([k]) => k === 'green-nav');
  assert.equal(nav.length, 2);
  assert.ok(nav.every(([, cmd, o]) => /--reuse$/.test(cmd) && /^GREEN \w ok=true/.test(o) && /reused: test probe, mutants and coverage/.test(o)), nav.map(n => n[2]).join('\n'));
  assert.equal(r.verify.finalReused, true, 'the courier\'s final ran on the same tree verify sees');
});

test('pcourier: PTDD_COURIER_SKIP_ENABLED alone spawns no courier when the fixer reports its gate ok; verify is the check', async () => {
  const r = await runWith(only(SPEED_ENV.courierSkip));
  done(r);
  assert.deepEqual([r.labels.filter(l => /^final-verifier/.test(l)), r.out.courierSkipped, r.out.verified], [[], true, null]);
});

test('pparrev: PTDD_PARALLEL_REVIEW_ENABLED alone runs the integration tester and the reviewer at the same time; the reviewer leaves the integration file out', async () => {
  const r = await runWith(only(SPEED_ENV.parallelReview));
  done(r);
  const at = e => r.events.indexOf(e);
  assert.ok(at('start reviewer') < at('end integration-tester') && at('start integration-tester') < at('end reviewer'), r.events.join(', '));
  assert.match(r.calls.find(c => c.label === 'reviewer').prompt, /tests\/integration\/test_flow\.mjs is being written now/);
});

test('vmeasure: all flags on against all off: fewer agents and hops; prints agent count, critical-path hops and gate wall-clock', async () => {
  const off = results.off ?? await runWith(SPEED_OFF_ENV), on = results.on = await runWith(ON_ENV);
  done(on);
  const row = (name, r) => `${name.padEnd(8)} agents ${String(r.agents).padStart(2)}  critical-path hops ${String(r.hops).padStart(2)}  gate wall-clock ${(r.gateTotal / 1000).toFixed(2)} s (${Object.entries(r.gateMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}`).join(', ')})`;
  console.log(`# VMeasure (2 groups, b after a, integration test, 1 finding; same scripted agents)\n# ${row('all off', off)}\n# ${row('all on', on)}`);
  assert.ok(on.agents < off.agents, `${on.agents} < ${off.agents}`);
  assert.ok(on.hops < off.hops, `${on.hops} < ${off.hops}`);
});

// every flag of both skills off: PTDD_* as above, and zero-trust-review's probe flags off with no process cap
const ALL_OFF_ENV = { ...SPEED_OFF_ENV, ZT_MUTATION_BASELINE_REUSE_ENABLED: 'false', ZT_MUTATION_BUDGET_STRICT_ENABLED: 'false', ZT_TEST_PROCESS_MAX: '' };

test('fcompat: with truly every flag off (PTDD and ZT) the whole run is the v2.0.0 path end to end: same agents, no speed key, no head run, no baseline reuse, no courier skip', async () => {
  const r = await runWith(ALL_OFF_ENV);
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual(['courierSkipped' in r.out, 'finalReused' in r.verify, r.outputs.some(([, , o]) => /reused:|mutation probe:/.test(o))], [false, false, false]);
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, , o]) => /mutation: \d+ of \d+ mutants/.test(o)), 'every navigator GREEN gate mutated, as in v2.0.0');
});

test('pcourier: a fixer of group a that breaks group b and still reports its own gate ok: the courier is skipped and verify reports the run not done', async () => {
  const BREAKS_B = `export function slugify(text, { maxLength = 40 } = {}) {\n  if (typeof text !== 'string') throw new TypeError('text must be a string');\n  if (text === 'hello, world') return 'hello_world';\n  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n  return slug.slice(0, maxLength).replace(/-+$/, '');\n}\n`;
  const r = await runWith(only(SPEED_ENV.courierSkip), ({ put, exec, cmdOf, GREEN_ANY }) => ({
    fixer: (gid, p) => {
      put(GROUPS.a.src, BREAKS_B); // the TODO is gone, and title('hello, world') no longer gives 'Hello World'; group a's own tests still pass
      exec(cmdOf(p, GREEN_ANY), 'green');
      return { fixed: [/^(R-\S+) \[/m.exec(p)[1]], notFixed: [], gateOk: true, gateRuns: 1 }; // what a fixer reports from its own-group gate
    },
  }));
  assert.deepEqual([r.labels.filter(l => /^final-verifier/.test(l)), r.out.courierSkipped, r.out.groups.b.state], [[], true, 'done']);
  assert.equal(r.verify.final, false, JSON.stringify(r.verify));
  assert.ok(r.verify.notDone.some(n => /^b: final gate not ok \(its tests fail with the whole change: tests\/test_title\.mjs\)/.test(n)), JSON.stringify(r.verify.notDone));
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total], [5, 8], 'group b\'s stale GREEN gate covers none of its 3 pairs');
});
