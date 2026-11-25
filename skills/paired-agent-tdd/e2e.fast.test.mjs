// End to end, fast mode (plan.mode "fast"): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, with SCRIPTED agents that follow the commands in their prompts.
// Group a waits for no other: ONE tdd-driver (tests, RED gate, code, GREEN gate) and ONE navigator over both gates. Group b waits for a: the default red-driver, red-navigator,
// green-driver, green-navigator. Then the frozen-tests guard is exercised through the real CLI. No model. Run: node e2e.fast.test.mjs
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEED_OFF_ENV } from './speed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TDD = join(HERE, 'tdd.mjs');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-e2e-fast-')));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const repo = join(dir, 'repo'), tmp = join(dir, 'tmp');
for (const d of [repo, tmp]) mkdirSync(d);
process.env.TMPDIR = tmp; // the per-user zt-review base (the run folder) lives in the fixture
process.env.ZT_MARKER_DIR = join(dir, 'marker'); // never the user's own active review marker
Object.assign(process.env, SPEED_OFF_ENV); // the v2.0.0 pipeline these assertions describe; the e2e.speed.*.test.mjs files run the speed flags
let run = '';
const RUNNER = join(HERE, 'direct-run.mjs');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
git('init', '-q');
put('package.json', '{"type":"module"}\n');
put('README.md', 'text utils\n');
put('src/title.mjs', 'export const title = text => text; // stub: group b changes it\n'); // an existing file: b's RED fails by an assertion, not by a missing module
git('add', '-A'); git('commit', '-qm', 'base');

const TICKET = 'slugify(text, {maxLength}) lowercases and hyphenates, cuts to maxLength (default 40), and throws TypeError for a non-string. title(text) turns a slug into Title Case.';
writeFileSync(join(dir, 'ticket.md'), TICKET);
const plan = {
  repo, cmd: 'node {file}', mode: 'fast', ticket: join(dir, 'ticket.md'), mutation: { max: 10, budget: 60 },
  dod: [{ id: 'AC1', text: 'slugify lowercases and hyphenates words, throws TypeError for a non-string', source: 'lowercases and hyphenates' },
    { id: 'AC2', text: 'slugify cuts to maxLength, default 40', source: 'cuts to maxLength (default 40)', kinds: ['happy', 'edge'] },
    { id: 'AC3', text: 'title turns a slug into Title Case', source: 'Title Case' }],
  groups: [{ id: 'a', goal: 'slugify', tests: ['tests/test_slug.mjs'], src: ['src/slug.mjs'], dod: ['AC1', 'AC2'], after: [] },
    { id: 'b', goal: 'title, built on slugify', tests: ['tests/test_title.mjs'], src: ['src/title.mjs'], dod: ['AC3'], after: ['a'] }],
};
writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
const tdd = (cmd, args) => spawnSync(process.execPath, [TDD, cmd, ...(run && cmd !== 'plan' ? ['--run', run] : []), '--runner', RUNNER, ...args], { encoding: 'utf8' });
const planned = tdd('plan', ['--plan', join(dir, 'plan.json')]);
assert.equal(planned.status, 0, planned.stderr);
const ARGS = JSON.parse(planned.stdout.trim().split('\n').pop());
run = ARGS.runDir;
assert.deepEqual([ARGS.mode, ARGS.fast], ['fast', true]);

const SLUG_TESTS = `import { test } from 'node:test';
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
const SLUG = `export function slugify(text, { maxLength = 40 } = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, maxLength).replace(/-+$/, '');
}
`;
const TITLE_TESTS = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { title } from '../src/title.mjs';
test('test_ac3_happy_words', () => assert.equal(title('hello, world'), 'Hello World'));
test('test_ac3_fail_non_string', () => assert.throws(() => title(7), TypeError));
test('test_ac3_edge_dashes', () => assert.equal(title('--a--'), 'A'));
`;
const TITLE = `import { slugify } from './slug.mjs';
export const title = text => slugify(text).split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
`;
const rows = (id, tests, file) => tests.map(([kind, test]) => ({ dod: id, kind, test, file }));
const ROWS_A = [...rows('AC1', [['happy', 'test_ac1_happy_words'], ['fail', 'test_ac1_fail_non_string'], ['edge', 'test_ac1_edge_empty']], 'tests/test_slug.mjs'), ...rows('AC2', [['happy', 'test_ac2_happy_cut'], ['edge', 'test_ac2_edge_no_trailing_dash']], 'tests/test_slug.mjs')];
const ROWS_B = rows('AC3', [['happy', 'test_ac3_happy_words'], ['fail', 'test_ac3_fail_non_string'], ['edge', 'test_ac3_edge_dashes']], 'tests/test_title.mjs');

// what an agent runs: the commands inside the backticks of its prompt, with the same runner
const gateAt = (prompt, stage) => {
  const m = new RegExp('node (\\S+/tdd\\.mjs) ' + stage + ' --run ([^\\s`]+)(?: --group (\\w+))?').exec(prompt);
  assert.ok(m, `the prompt names no ${stage} gate command`);
  const out = spawnSync(process.execPath, [m[1], stage, '--run', m[2], ...(m[3] ? ['--group', m[3]] : []), '--runner', RUNNER], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
};
const sh = cmd => { const out = spawnSync('sh', ['-c', cmd], { encoding: 'utf8' }); assert.equal(out.status, 0, out.stderr); return out.stdout; };
const dods = prompt => [...prompt.matchAll(/`(node \S+\/tdd\.mjs dod [^`(]+)`/g)].map(m => sh(m[1]));
const dodWith = (prompt, rs) => sh(`${/(node \S+\/tdd\.mjs dod --run \S+ --group \w+ --stage \w+)/.exec(prompt)[1]}${rs.map(r => ` --row '${r.dod}:${r.kind}:${r.test}:${r.file}'`).join('')}`);
const ok = out => /ok=true/.test(out);
const seen = [];

const script = {
  // ONE driver: the tests, the RED gate and the DoD pairs, then the code and the GREEN gate: the commands its own prompt names, in that order
  'tdd-driver:a': prompt => {
    put('tests/test_slug.mjs', SLUG_TESTS);
    const red = gateAt(prompt, 'red'), d = dodWith(prompt, ROWS_A);
    put('src/slug.mjs', SLUG);
    const green = gateAt(prompt, 'green');
    seen.push(['tdd-driver:a', red.split('\n')[0], d.split('\n')[0], green.split('\n')[0]]);
    return { matrix: ROWS_A, files: ['tests/test_slug.mjs'], srcFiles: ['src/slug.mjs'], reuse: 'none', cleanup: 'none', gateOk: ok(red) && ok(d) && ok(green), gateRuns: 2 };
  },
  // a group that waits keeps the default red-driver
  'red-driver:b': prompt => {
    put('tests/test_title.mjs', TITLE_TESTS);
    const red = gateAt(prompt, 'red'), d = dodWith(prompt, ROWS_B);
    seen.push(['red-driver:b', red.split('\n')[0], d.split('\n')[0]]);
    return { matrix: ROWS_B, files: ['tests/test_title.mjs'], reuse: 'none', gateOk: ok(red) && ok(d), gateRuns: 1 };
  },
  'green-driver:b': prompt => { put('src/title.mjs', TITLE); const out = gateAt(prompt, 'green'); return { files: ['src/title.mjs'], reuse: 'none', cleanup: 'none', gateOk: ok(out), gateRuns: 1 }; },
  reviewer: prompt => { gateAt(prompt, 'final'); return { findings: [] }; },
};
const calls = [];
const agent = async (prompt, o) => {
  calls.push({ label: o.label, prompt, o });
  if (/^(red|green)-navigator:/.test(o.label)) { // runs every gate command its prompt names (the one navigator of a one-driver group names RED too) and judges the facts
    const gates = [o.label.startsWith('red') ? 'red' : 'green', ...(/ALSO judge RED/.test(prompt) ? ['red'] : [])].map(s => gateAt(prompt, s)), dd = dods(prompt);
    seen.push([o.label, ...gates.map(g => g.split('\n')[0]), ...dd.map(d => d.split('\n')[0])]);
    return gates.every(ok) && dd.every(ok) ? { verdict: 'PASS', defects: [], gateOk: true } : { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'impl', what: [...gates, ...dd].join('\n').slice(0, 300) }] };
  }
  const f = script[o.label];
  assert.ok(f, `no script for ${o.label}`);
  return f(prompt);
};
const out = await wf(agent, parallel, async () => [], () => {}, () => {}, ARGS, {});

// ---- what the run did ----
assert.deepEqual([out.groups.a.state, out.groups.b.state, out.mode], ['done', 'done', 'fast'], JSON.stringify([out.notDone, seen]));
assert.deepEqual(calls.map(c => c.label).sort(), ['green-driver:b', 'green-navigator:a', 'green-navigator:b', 'red-driver:b', 'red-navigator:b', 'reviewer', 'tdd-driver:a'],
  'a: one driver and one navigator; b waits for a: the four default agents, its RED navigator included; no repair anywhere: 7 agents where the default pipeline spends 9');
assert.equal(out.stats.total, 7);
assert.deepEqual(calls.find(c => c.label === 'tdd-driver:a').o.agentType, 'tdd-guide');
assert.match(calls.find(c => c.label === 'green-navigator:a').prompt, /ALSO judge RED/);
assert.doesNotMatch(calls.find(c => c.label === 'green-navigator:b').prompt, /ALSO judge RED/);
const line = (l, i) => seen.find(s => s[0] === l)?.[i];
assert.match(line('tdd-driver:a', 1), /^RED a ok=true/, 'the one driver proved RED with the real gate before it wrote any source');
assert.match(line('tdd-driver:a', 2), /^DOD a stage=red ok=true covered 5\/5$/);
assert.match(line('tdd-driver:a', 3), /^GREEN a ok=true/);
assert.match(line('red-driver:b', 1), /^RED b ok=true/);
assert.match(line('red-driver:b', 2), /^DOD b stage=red ok=true covered 3\/3$/, 'b: every test failed by an assertion and the matrix closes, and a RED navigator still looks: nothing is skipped');
assert.deepEqual(seen.find(s => s[0] === 'green-navigator:a').slice(1).map(l => l.split(' ').slice(0, 3).join(' ')), ['GREEN a ok=true', 'RED a ok=true', 'DOD a stage=green', 'DOD a stage=red'], 'the one navigator of a read both gate files and both DoD stages');
assert.deepEqual(seen.find(s => s[0] === 'red-navigator:b').slice(1).map(l => l.split(' ').slice(0, 3).join(' ')), ['RED b ok=true', 'DOD b stage=red'], 'b\'s own RED navigator ran the RED gate');
assert.deepEqual([out.groups.a.red, out.groups.b.red.verdict, out.groups.b.red.reworks, 'skipped' in out.groups.b.red], [{ reworks: 0, verdict: 'merged', merged: true }, 'PASS', 0, false]);
assert.ok(seen.every(s => s.slice(1).every(l => !/ok=false/.test(l))), 'no gate said ok=false anywhere: the first pass was right');
const g = name => JSON.parse(readFileSync(join(run, 'gates', name), 'utf8'));
const tree = sha => git('rev-parse', `${sha}^{tree}`);
assert.equal(tree(g('a.red.json').firstSnapshot), tree(g('a.red.json').snapshot), 'the tests did not change since RED: the navigator\'s RED re-run (after GREEN) has the same tree as the RED the code was built against');
assert.notEqual(g('a.red.json').firstSnapshot, g('a.red.json').snapshot, 'but it is another snapshot: the first one was kept as the reference');
assert.ok(!('firstSnapshot' in g('b.green.json')) && 'firstSnapshot' in g('b.red.json'));

// ---- the lead's T0 audit ----
const retFile = join(dir, 'return.json');
writeFileSync(retFile, JSON.stringify(out));
const v = tdd('verify', ['--ret', retFile]);
assert.equal(v.status, 0, v.stderr);
const res = JSON.parse(v.stdout.trim().split('\n').pop());
assert.deepEqual([res.dod.covered, res.dod.total, res.dod.gaps], [8, 8, []]);
assert.deepEqual([res.final, res.overridden, res.unfixed, res.notDone], [true, [], [], []]);
assert.deepEqual(res.fast, { merged: ['a'] }, 'verify names the one-driver groups');
assert.deepEqual([g('a.green.json').ok, g('b.green.json').ok, g('a.green.json').mutation.survivors.length], [true, true, 0]);
assert.equal(git('rev-list', '--count', 'HEAD'), '1', 'no commit was made on the user\'s branch');
assert.deepEqual(git('status', '--porcelain').split('\n').sort(), ['?? src/slug.mjs', '?? tests/', 'M src/title.mjs'], 'the user\'s repo holds only the agents\' own edits (the git helper trims the leading blank of the first line)');

// the frozen-tests guard through the real CLI: the one driver holds the RED command, so an edit made after the code exists is caught even when it re-runs RED first
const firstRed = g('a.red.json').firstSnapshot;
put('tests/test_slug.mjs', `${SLUG_TESTS}// edited after the code was written\n`);
const rerun = tdd('red', ['--group', 'a']);
assert.match(rerun.stdout, /^RED a ok=true/, 'RED cannot tell: the edited file still fails at the base');
assert.equal(g('a.red.json').firstSnapshot, firstRed, 'the reference is still the first RED');
assert.notEqual(tree(g('a.red.json').firstSnapshot), tree(g('a.red.json').snapshot), 'while the RED snapshot of the edited file is another tree');
const again = tdd('green', ['--group', 'a']);
assert.match(again.stdout, /ok=false[\s\S]*tests changed since RED: tests\/test_slug\.mjs/, 'green names the edit');
console.log('ok - paired-agent-tdd fast mode end to end: plan -> workflow -> gates -> verify (8/8 DoD pairs, one driver + one navigator for a, the default four agents for b, an edit after the code caught by the real gate): 7 agents');
