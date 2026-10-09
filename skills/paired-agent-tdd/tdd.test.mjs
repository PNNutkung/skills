// Offline checks for tdd.mjs: fixture git repos plus a stub sandbox runner, so no real sandbox is needed. Run: node --test tdd.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TDD = join(HERE, 'tdd.mjs');
const hasPython = spawnSync('python3', ['--version']).status === 0;

// Honors the runner flags, then runs the command after `--` in --cwd. config.json {exit} fakes 86/124 for every run.
const STUB = `
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)), a = process.argv.slice(2);
if (a[0] === '--check') { console.log('stub'); process.exit(0); }
const cut = a.indexOf('--'), flags = a.slice(0, cut), cmd = a.slice(cut + 1);
const vals = k => flags.flatMap((f, i) => (f === k ? [flags[i + 1]] : []));
const fake = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).exit;
if (fake) process.exit(fake);
const env = { ...process.env };
for (const kv of vals('--env')) env[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1);
process.exit(spawnSync(cmd[0], cmd.slice(1), { cwd: vals('--cwd')[0], env, stdio: 'inherit' }).status ?? 1);
`;

const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (repo, files) => {
  for (const [p, c] of Object.entries(files)) {
    const f = join(repo, p);
    if (c === null) rmSync(f, { force: true });
    else { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, c); }
  }
};

const PLAN = repo => ({
  repo, cmd: 'sh {file}', mutation: { max: 8, budget: 30 },
  dod: [{ id: 'AC1', text: 'alpha says new', source: 'assumed', kinds: ['happy'] }, { id: 'AC2', text: 'beta says beta', source: 'assumed', kinds: ['happy'] }],
  groups: [{ id: 'a', tests: ['tests/test_alpha.sh'], src: ['src/alpha.txt'], dod: ['AC1'], after: [] }, { id: 'b', tests: ['tests/test_beta.sh'], src: ['src/beta.txt'], dod: ['AC2'], after: ['a'] }],
});

// base: src/alpha.txt=old, tests/existing_alpha.sh (needs a file src/alpha.txt). Nothing in the user's repo is ever committed by the gates.
function fixture(t, { files = {}, plan = {}, fake = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo'), stub = join(dir, 'stub'), tmp = join(dir, 'tmp');
  for (const d of [repo, stub, tmp]) mkdirSync(d); // TMPDIR=tmp: the per-user zt-review base (the only place the ledger tools approve a run folder) lives in the fixture
  git(repo, 'init', '-q');
  put(repo, { 'src/alpha.txt': 'old\n', 'tests/existing_alpha.sh': 'test -f src/alpha.txt\n', ...files });
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  writeFileSync(join(stub, 'stub-runner.mjs'), STUB);
  writeFileSync(join(stub, 'config.json'), JSON.stringify(fake));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...PLAN(repo), ...(typeof plan === 'function' ? plan(repo) : plan) }));
  const fx = { dir, repo, tmp, runner: join(stub, 'stub-runner.mjs'), stub, head: git(repo, 'rev-parse', 'HEAD'), run: undefined };
  fx.tdd = (cmd, args = [], env = {}) => {
    const r = spawnSync(process.execPath, [TDD, cmd, ...(fx.run && cmd !== 'plan' ? ['--run', fx.run] : []), '--runner', fx.runner, ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp, ZT_MARKER_DIR: join(dir, 'marker'), ...env } });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  fx.plan = (extra = []) => {
    const r = fx.tdd('plan', ['--plan', join(dir, 'plan.json'), ...extra]);
    if (r.status === 0) fx.run = JSON.parse(r.out.trim().split('\n').pop()).runDir;
    return r;
  };
  fx.gate = name => JSON.parse(readFileSync(join(fx.run, 'gates', name), 'utf8'));
  return fx;
}
const planned = (t, opts) => { const fx = fixture(t, opts); const r = fx.plan(opts?.flags ?? []); assert.equal(r.status, 0, r.err); return fx; };
const TEST_ALPHA = '# test_ac1_happy\ngrep -q new src/alpha.txt\n';
const TEST_BETA = '# test_ac2_happy\ngrep -q new src/alpha.txt && grep -q beta src/beta.txt\n';

test('plan: validates, snapshots a clean tree as HEAD, writes the run folder, prints the Workflow args', t => {
  const fx = fixture(t);
  const r = fx.plan();
  assert.equal(r.status, 0, r.err);
  const args = JSON.parse(r.out.trim().split('\n').pop());
  assert.equal(args.base, fx.head);
  assert.deepEqual([args.groups.length, args.dod.length, args.sandbox], [2, 2, 'stub']);
  assert.ok(args.runDir.startsWith(join(fx.tmp, `zt-review-${process.getuid()}`)), 'the run folder lives under the per-user zt-review base: the only place the ledger tools approve');
  assert.equal(existsSync(join(fx.tmp, `zt-review-${process.getuid()}`, '..', '.cache')), false);
  assert.ok(existsSync(join(fx.run, 'plan.json')) && existsSync(join(fx.run, 'args.json')));
  assert.ok(args.scratch.startsWith(realpathSync(tmpdir())) && args.skillDir === HERE);
});

test('plan: a dirty working tree becomes the base (a snapshot), and the user\'s repo is untouched', t => {
  const fx = fixture(t);
  put(fx.repo, { 'src/alpha.txt': 'dirty\n', 'notes.txt': 'new file\n' });
  const state = () => [git(fx.repo, 'status', '--porcelain'), git(fx.repo, 'for-each-ref'), git(fx.repo, 'rev-parse', 'HEAD'), git(fx.repo, 'diff', '--cached')];
  const before = state();
  const args = JSON.parse(fx.plan().out.trim());
  assert.notEqual(args.base, fx.head);
  assert.equal(git(fx.repo, 'show', `${args.base}:src/alpha.txt`), 'dirty');
  assert.equal(git(fx.repo, 'show', `${args.base}:notes.txt`), 'new file');
  assert.equal(git(fx.repo, 'rev-parse', `${args.base}^`), fx.head);
  assert.deepEqual(state(), before);
});

test('plan: invalid plans exit 2 with every error, an untrusted run dir exits 3, a missing zero-trust-review exits 2', t => {
  const fx = fixture(t, { plan: { cmd: 'sh', dod: [] } });
  const r = fx.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /cmd must contain \{file\}[\s\S]*at least one DoD item/);
  const open = fixture(t), loose = join(open.tmp, 'loose');
  mkdirSync(loose, { mode: 0o777 }); chmodSync(loose, 0o777);
  assert.equal(open.plan(['--run', loose]).status, 3, 'a run folder that others can write, or that plan did not create, is refused');
  assert.equal(open.tdd('red', ['--run', loose, '--group', 'a']).status, 3);
  const noZt = spawnSync(process.execPath, [TDD, 'plan'], { encoding: 'utf8', env: { ...process.env, ZT_DIR: join(fx.dir, 'nowhere') } });
  assert.equal(noZt.status, 2);
  assert.match(noZt.stderr, /zero-trust-review skill is not at/);
});

test('plan: a ticket makes every DoD quote verifiable', t => {
  const fx = fixture(t, { plan: { ticket: '/nonexistent' } });
  assert.equal(fx.plan().status, 2);
  const ok = fixture(t);
  writeFileSync(join(ok.dir, 'ticket.md'), 'The service says new.');
  const p = JSON.parse(readFileSync(join(ok.dir, 'plan.json'), 'utf8'));
  p.ticket = join(ok.dir, 'ticket.md'); p.dod[0].source = 'says new'; p.dod[1].source = 'says old';
  writeFileSync(join(ok.dir, 'plan.json'), JSON.stringify(p));
  const r = ok.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /AC2: source quote not found/);
});

test('red: a new test that fails now is RED; one that already passes is not; a missing file is named', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  let r = fx.tdd('red', ['--group', 'a']);
  assert.match(r.out, /^RED a ok=true/);
  assert.deepEqual(fx.gate('a.red.json').tests.map(x => [x.file, x.verdict, x.exit]), [['tests/test_alpha.sh', 'fails', 1]]);
  assert.ok(existsSync(join(fx.run, 'diff', 'a.red.patch')) && /test_alpha/.test(readFileSync(join(fx.run, 'diff', 'a.red.patch'), 'utf8')));
  put(fx.repo, { 'tests/test_alpha.sh': 'grep -q old src/alpha.txt\n' });
  r = fx.tdd('red', ['--group', 'a']);
  assert.match(r.out, /ok=false/);
  assert.equal(fx.gate('a.red.json').tests[0].verdict, 'passes-already');
  r = fx.tdd('red', ['--group', 'b']);
  assert.equal(fx.gate('b.red.json').tests[0].verdict, 'missing');
  assert.equal(fx.gate('b.red.json').ok, false);
});

test('red: the gate classifies a load error apart from an assertion failure', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': 'echo "ModuleNotFoundError: No module named alpha" >&2; exit 1\n' });
  fx.tdd('red', ['--group', 'a']);
  const [x] = fx.gate('a.red.json').tests;
  assert.equal(x.verdict, 'fails-to-load');
  assert.match(x.tail, /ModuleNotFoundError/);
  assert.equal(fx.gate('a.red.json').ok, true);
});

test('red: no sandbox (86) is unverifiable, never a pass', t => {
  const fx = planned(t, { fake: { exit: 86 }, flags: ['--skip-preflight'] });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  const r = fx.tdd('red', ['--group', 'a']);
  assert.match(r.out, /ok=false/);
  assert.equal(fx.gate('a.red.json').tests[0].verdict, 'unverifiable');
});

test('green: passing tests that fail once the group code is reverted are exercises-change, unchanged since RED, in scope', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  const r = fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /^GREEN a ok=true/, r.out + r.err);
  const g = fx.gate('a.green.json');
  assert.deepEqual(g.tests.map(x => [x.verdict, x.head, x.base]), [['exercises-change', 0, 1]]);
  assert.deepEqual([g.frozen.changed, g.outOfScope], [[], []]);
  assert.match(g.mutation.reason, /no mutable changed lines/);
});

test('green: tests that pass without the change give no signal; tests edited after RED are named unless --retest', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n', 'tests/test_alpha.sh': `echo extra\n${TEST_ALPHA}` });
  let r = fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /ok=false[\s\S]*tests changed since RED: tests\/test_alpha\.sh/);
  assert.match(r.out, /CHANGED tests\/test_alpha\.sh/);
  r = fx.tdd('green', ['--group', 'a', '--retest']);
  assert.match(r.out, /ok=true/);
  put(fx.repo, { 'tests/test_alpha.sh': 'true\n' });
  r = fx.tdd('green', ['--group', 'a', '--retest']);
  assert.match(r.out, /ok=false/);
  assert.equal(fx.gate('a.green.json').tests[0].verdict, 'no-signal');
});

test('green: no RED gate on record is a reason; a stray file outside the plan is a note, and blocks at final', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n' });
  assert.match(fx.tdd('green', ['--group', 'a']).out, /no RED gate on record/);
  fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'junk/stray.txt': 'x\n' });
  const r = fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /note: files outside the plan exist in the shared tree: junk\/stray\.txt/);
  assert.match(r.out, /^GREEN a ok=true/, 'a stray file cannot be pinned on one group of a shared tree: it is a note here, a blocker at final');
  assert.deepEqual(fx.gate('a.green.json').outOfScope, ['junk/stray.txt']);
  assert.match(fx.tdd('final').out, /not ok:[^\n]*files outside the plan changed: junk\/stray\.txt/);
});

test('group snapshots hold the base plus only the group\'s own files: another group\'s half-written edit is invisible', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'src/beta.txt': 'half writ', 'tests/test_beta.sh': 'syntax error (((\n' });
  fx.tdd('red', ['--group', 'a']);
  const files = git(fx.repo, 'ls-tree', '-r', '--name-only', fx.gate('a.red.json').snapshot).split('\n');
  assert.deepEqual(files.filter(f => /beta|alpha/.test(f)).sort(), ['src/alpha.txt', 'tests/existing_alpha.sh', 'tests/test_alpha.sh']);
  assert.equal(git(fx.repo, 'show', `${fx.gate('a.red.json').snapshot}:src/alpha.txt`), 'old');
});

test('a group that waits for another sees its finished files only once that group is green', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  fx.tdd('red', ['--group', 'a']);
  fx.tdd('red', ['--group', 'b']);
  assert.equal(fx.gate('b.red.json').tests[0].verdict, 'fails');
  assert.ok(!git(fx.repo, 'ls-tree', '-r', '--name-only', fx.gate('b.red.json').snapshot).includes('test_alpha'), 'a is not green: not in the world of b');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  assert.match(fx.tdd('green', ['--group', 'a']).out, /ok=true/);
  fx.tdd('red', ['--group', 'b']);
  const snap = fx.gate('b.red.json').snapshot;
  assert.equal(git(fx.repo, 'show', `${snap}:src/alpha.txt`), 'new');
  put(fx.repo, { 'src/beta.txt': 'beta\n' });
  const r = fx.tdd('green', ['--group', 'b']);
  assert.match(r.out, /^GREEN b ok=true/, r.out);
  assert.deepEqual(fx.gate('b.green.json').tests.map(x => [x.verdict, x.base]), [['exercises-change', 2]], 'b\'s own code reverted fails (no such file), with a\'s code in place');
});

test('a dependent group is judged on its OWN code: tests that pass with only the groups it waits for give no signal', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': 'grep -q new src/alpha.txt\n', 'src/beta.txt': 'beta\n' });
  fx.tdd('red', ['--group', 'a']);
  assert.match(fx.tdd('green', ['--group', 'a']).out, /ok=true/);
  fx.tdd('red', ['--group', 'b']);
  fx.tdd('green', ['--group', 'b']);
  const g = fx.gate('b.green.json');
  assert.equal(g.tests[0].verdict, 'no-signal', 'b\'s test never needs b\'s code, even though it fails once a\'s code is gone');
  assert.equal(g.ok, false);
  assert.equal(git(fx.repo, 'rev-parse', `${g.snapshot}^`), g.base, 'the group snapshot is a child of its base');
});

test('snapshots never touch the user\'s repo and refuse a symlink in a group file', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  const state = () => [git(fx.repo, 'status', '--porcelain'), git(fx.repo, 'for-each-ref'), git(fx.repo, 'diff', '--cached'), git(fx.repo, 'rev-parse', 'HEAD')];
  const before = state();
  fx.tdd('red', ['--group', 'a']);
  assert.deepEqual(state(), before);
  rmSync(join(fx.repo, 'tests/test_alpha.sh'));
  writeFileSync(join(fx.dir, 'outside.sh'), 'exit 0\n');
  symlinkSync(join(fx.dir, 'outside.sh'), join(fx.repo, 'tests/test_alpha.sh'));
  const r = fx.tdd('red', ['--group', 'a']);
  assert.equal(r.status, 1);
  assert.match(r.err, /refusing to snapshot tests\/test_alpha\.sh/);
});

test('final: group tests together and the existing tests that mention a changed module', t => {
  const fx = planned(t, { files: { 'tests/unrelated.sh': 'exit 9\n' } });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n' });
  const r = fx.tdd('final');
  assert.match(r.out, /^FINAL ok=true/m, r.out + r.err);
  const f = fx.gate('final.json');
  assert.deepEqual([f.together.map(x => x.exit), f.existing.ran], [[0, 0], ['tests/existing_alpha.sh']]);
});

test('final: an existing test that passed before the change and fails after is a regression; one that already failed is not', t => {
  const fx = planned(t, { files: { 'tests/existing_alpha.sh': 'grep -q old src/alpha.txt\n', 'tests/existing_beta.sh': 'grep -q nomatch src/beta.txt\n' } });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n' });
  const r = fx.tdd('final');
  assert.match(r.out, /ok=false[^\n]*\n\s+not ok: existing tests broken by the change: tests\/existing_alpha\.sh/);
  const f = fx.gate('final.json');
  assert.deepEqual([f.existing.regressions.map(x => x.file), f.existing.preexisting], [['tests/existing_alpha.sh'], ['tests/existing_beta.sh']]);
});

const ROW_A = 'AC1:happy:test_ac1_happy:tests/test_alpha.sh';
const dod = (fx, stage, rows = [ROW_A], group = 'a') => fx.tdd('dod', ['--group', group, '--stage', stage, ...rows.flatMap(r => ['--row', r])]);

test('dod: at RED a pair counts when its test is named in its file and the file failed; a row for a test that is not there does not', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.match(dod(fx, 'red').out, /^DOD a stage=red ok=false[\s\S]*no RED gate on record: run `tdd\.mjs red` first/);
  fx.tdd('red', ['--group', 'a']);
  let r = dod(fx, 'red');
  assert.match(r.out, /^DOD a stage=red ok=true covered 1\/1/);
  assert.match(r.out, /AC1: happy covered \(test_ac1_happy\)/);
  r = dod(fx, 'red', ['AC1:happy:test_ac1_nowhere:tests/test_alpha.sh']);
  assert.match(r.out, /ok=false[\s\S]*rows with no such test: AC1\/happy: test_ac1_nowhere is not in tests\/test_alpha\.sh[\s\S]*DoD gaps: AC1\/happy: missing/);
  assert.match(dod(fx, 'red', ['AC1:happy:test_ac1:tests/test_alpha.sh']).out, /ok=false[\s\S]*test_ac1 is not in/, 'a name that is only the start of another test is not that test');
  assert.match(dod(fx, 'red', ['nonsense']).out, /ok=false[\s\S]*1 --row not in the form ID:kind:test:file/);
  assert.match(dod(fx, 'red', []).out, /ok=false[\s\S]*DoD gaps: AC1\/happy: missing/, 'no row, no pair');
  assert.doesNotMatch(dod(fx, 'red', ['AC1:happy:test_ac1_nowhere:tests/test_alpha.sh']).out, /not in the form/, 'a row that parses but names no test is a phantom, not an unreadable row');
  assert.equal(fx.tdd('dod', ['--group', 'a']).status, 2, 'dod needs --stage');
  assert.equal(fx.tdd('dod', ['--stage', 'red']).status, 2, 'dod needs --group');
  assert.equal(fx.tdd('dod', ['--group', 'zzz', '--stage', 'red']).status, 2);
  assert.equal(fx.tdd('bogus').status, 2, 'an unknown command is a usage error');
});

test('dod: a pair whose file passed already at RED is not covered; a gate file only speaks for the tree it ran on', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q old src/alpha.txt\n' });
  fx.tdd('red', ['--group', 'a']);
  assert.match(dod(fx, 'red').out, /ok=false[\s\S]*DoD gaps: AC1\/happy: unproven/, 'passes-already proves nothing about the change');
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.match(dod(fx, 'red').out, /ok=false[\s\S]*the RED gate ran before tests\/test_alpha\.sh changed: run it again/, 'an old gate file cannot vouch for a file edited since');
  fx.tdd('red', ['--group', 'a']);
  assert.match(dod(fx, 'red').out, /ok=true/);
});

test('dod: at GREEN the pair needs the GREEN gate ok and unchanged files; a gate that said not ok closes nothing', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a']);
  assert.match(dod(fx, 'green').out, /^DOD a stage=green ok=true covered 1\/1/);
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  assert.match(dod(fx, 'green').out, /ok=false[\s\S]*the GREEN gate ran before src\/alpha\.txt changed/, 'the code changed after the gate ran');
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ntrue\n', 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a', '--retest']);
  assert.equal(fx.gate('a.green.json').ok, false, 'a test that passes without the code gives no signal');
  const r = dod(fx, 'green');
  assert.match(r.out, /covered 0\/1[\s\S]*the GREEN gate said not ok[\s\S]*DoD gaps: AC1\/happy: unproven/);
});

test('final: the first run is the reviewer\'s view; --again (a re-run after fixes) never replaces it', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n' });
  assert.match(fx.tdd('final', ['--again']).out, /^FINAL ok=true/);
  assert.equal(existsSync(join(fx.run, 'gates', 'reviewed.json')), false, 'a re-run is never the reviewer\'s tree');
  fx.tdd('final');
  const first = fx.gate('reviewed.json').snapshot;
  put(fx.repo, { 'src/beta.txt': 'beta two\n' });
  fx.tdd('final', ['--again']);
  assert.equal(fx.gate('reviewed.json').snapshot, first);
  assert.notEqual(fx.gate('final.json').snapshot, first, 'final.json is the latest run');
});

test('plan: rounds is validated and travels to the Workflow args', t => {
  const bad = fixture(t, { plan: { rounds: 9 } });
  assert.match(bad.plan().err, /rounds must be an integer from 1 to 4/);
  const ok = fixture(t, { plan: { rounds: 2 } });
  assert.equal(JSON.parse(ok.plan().out.trim().split('\n').pop()).rounds, 2);
});

const resumeOf = (fx, args = []) => { const r = fx.tdd('resume', args); assert.equal(r.status, 0, r.err); return r; };
const continueOf = fx => JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).groups;
const ROW = { dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' };

test('resume: from the gate files alone each group says where it stands; the matrix survives in rows.json; nothing is trusted from an agent', t => {
  const fx = planned(t);
  resumeOf(fx);
  assert.deepEqual(Object.values(continueOf(fx)).map(g => g.next), ['red', 'red'], 'no gate on record: a normal start');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).base, fx.head, 'the file is tied to the base it was made for');
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  dod(fx, 'red');
  assert.deepEqual(fx.gate('a.rows.json').rows, [ROW], 'every dod call persists its rows: an agent that dies takes nothing with it');
  resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.matrix], ['red-check', [ROW]], 'the RED gate is ok but no navigator has passed it: one check, never a free pass to GREEN');
  const redPass = join(fx.dir, 'red-pass.json');
  writeFileSync(redPass, JSON.stringify({ groups: { a: { red: { verdict: 'PASS' } } } }));
  resumeOf(fx, ['--ret', redPass]);
  assert.equal(continueOf(fx).a.next, 'green', 'RED passed (a navigator said so) and there is no code yet');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  resumeOf(fx);
  assert.match(JSON.stringify(continueOf(fx).a), /"next":"green-check".*code exists, no fresh GREEN gate/);
  fx.tdd('green', ['--group', 'a']);
  resumeOf(fx);
  assert.match(JSON.stringify(continueOf(fx).a), /"next":"green-check".*gates fresh and ok, not judged yet/, 'gates ok but no navigator judged them: one check, no maker');
  const ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'done', matrix: [ROW], files: ['src/alpha.txt'] } } }));
  resumeOf(fx, ['--ret', ret]);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.files], ['done', ['src/alpha.txt']], 'judged PASS last run, gates fresh and ok, DoD pair closed');
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.next, 'green-check', 'an edit after the gate ran: the old verdict no longer counts');
});

test('resume: a gate that is fresh and not ok gives its defects, read off the gate; a stale RED gate is looked at again', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q old src/alpha.txt\n' });
  fx.tdd('red', ['--group', 'a']);
  resumeOf(fx);
  const red = continueOf(fx).a;
  assert.equal(red.next, 'red-fix');
  assert.match(red.defects[0].what, /RED gate: tests\/test_alpha\.sh is passes-already/);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  resumeOf(fx);
  assert.equal(continueOf(fx).a.next, 'red', 'tests edited since the gate and no rows to hand over: start RED again');
  dod(fx, 'red');
  resumeOf(fx);
  assert.equal(continueOf(fx).a.next, 'red-check', 'with rows, a navigator looks at what is on disk');
  fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ntrue\n', 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a', '--retest']);
  resumeOf(fx);
  const green = continueOf(fx).a;
  assert.equal(green.next, 'green-fix');
  assert.deepEqual(green.defects.map(d => d.cls), ['gap'], 'a test that passes without the code pins nothing: strengthen it');
});

test('resume: tests that only GREW since RED are a strengthening (retest); tests that lost lines are not', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  dod(fx, 'red');
  put(fx.repo, { 'tests/test_alpha.sh': `echo extra\n${TEST_ALPHA}`, 'src/alpha.txt': 'new\n' }); // a line ADDED in front: the last command still decides the exit
  fx.tdd('green', ['--group', 'a']);
  assert.equal(fx.gate('a.green.json').ok, false, 'changed since RED without --retest');
  resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.retest, continueOf(fx).a.defects], [true, []], 'additions only: sanctioned, and the "changed" reason is not made a defect');
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ntrue\n' });
  fx.tdd('green', ['--group', 'a']);
  resumeOf(fx);
  assert.equal(continueOf(fx).a.retest, false, 'a line was removed: that is a weakening, not a strengthening');
  assert.match(continueOf(fx).a.defects.map(d => d.what).join(' | '), /tests changed since RED/);
  const ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', retest: true } } }));
  resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.retest, true, 'the last run knew it strengthened the tests');
});

test('resume: what the last navigator said stands while the files are unchanged; a gate that is ok does not erase it', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  dod(fx, 'red');
  const ret = join(fx.dir, 'return.json'), tautology = { cls: 'test', file: 'tests/test_alpha.sh', what: 'asserts the implementation, not the DoD' };
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'paused', red: { verdict: 'FAIL', defects: [tautology] } } } }));
  resumeOf(fx, ['--ret', ret]);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.defects], ['red-fix', [tautology]], 'a defect only a navigator can see (the gate is ok) is not forgotten: RED is not carried as PASS');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a']);
  const weak = { cls: 'gap', what: 'the edge test only checks truthiness' };
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', green: { verdict: 'FAIL', defects: [weak] } } } }));
  resumeOf(fx, ['--ret', ret]);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.defects], ['green-fix', [weak]], 'GREEN gate ok, navigator FAIL: a repair, not a navigator that pays to find the same thing again');
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.next, 'green-check', 'the code changed since: the old verdict is stale, look again');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', reason: 'GREEN made no progress: the same defects came back after repair round 1: x', green: { verdict: 'FAIL', defects: [weak] } } } }));
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a']);
  resumeOf(fx, ['--ret', ret]);
  assert.match(continueOf(fx).a.why, /STALLED last run/);
});

test('resume: the gate records whether it ran with --retest; the saved rows only ever grow with real tests; a missing snapshot is a stale gate, not a crash; the file names its run', t => {
  const fx = planned(t);
  const three = '# test_ac1_happy\n# test_ac1_fail\n# test_ac1_edge\ngrep -q new src/alpha.txt\n';
  put(fx.repo, { 'tests/test_alpha.sh': three });
  fx.tdd('red', ['--group', 'a']);
  const rows3 = ['happy', 'fail', 'edge'].map(k => `AC1:${k}:test_ac1_${k}:tests/test_alpha.sh`);
  dod(fx, 'red', rows3);
  dod(fx, 'red', [rows3[0], 'AC1:happy:test_ac1_typo:tests/test_alpha.sh']);
  assert.deepEqual(fx.gate('a.rows.json').rows.map(r => r.test), ['test_ac1_happy', 'test_ac1_fail', 'test_ac1_edge'], 'a partial call with a phantom row neither shrinks the matrix nor adds the phantom');
  put(fx.repo, { 'tests/test_alpha.sh': three.replace('grep -q new src/alpha.txt', 'grep -q new src/alpha.txt && true'), 'src/alpha.txt': 'new\n' }); // a line REPLACED: a sharpening
  fx.tdd('green', ['--group', 'a', '--retest']);
  assert.deepEqual([fx.gate('a.green.json').ok, fx.gate('a.green.json').retest], [true, true]);
  resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.retest, continueOf(fx).a.next], [true, 'green-check'], 'a sanctioned sharpening (a line removed) is still sanctioned after a restart');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).run, fx.run, 'the file names the run folder it was made for');
  const g = fx.gate('a.green.json');
  writeFileSync(join(fx.run, 'gates', 'a.green.json'), JSON.stringify({ ...g, snapshot: '0'.repeat(40) }));
  const r = resumeOf(fx);
  assert.match(r.out, /a: green-check \(code exists, no fresh GREEN gate\)/, 'a pruned snapshot makes the gate stale for that group only');
});

test('resume: a gate that says unverifiable is the sandbox, not the code: the group is on env and no agent is spent; once a gate runs again it routes normally', t => {
  const fx = planned(t, { fake: { exit: 86 }, flags: ['--skip-preflight'] });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  const r = resumeOf(fx);
  assert.match(r.out, /a: env \(the RED gate says unverifiable or timeout: the sandbox, not the code\. Fix it, then run `node [^`]*tdd\.mjs red --run [^`]* --group a` again; no agent is spent until a gate has run\)/);
  const c = JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8'));
  assert.deepEqual([c.groups.a.next, c.groups.b.next, c.warnings.length, c.maxRepairs], ['env', 'red', 1, 2], 'a group on env gets no budget: only b can spend (2 for one group)');
  writeFileSync(join(fx.stub, 'config.json'), '{}'); // the sandbox is fixed
  fx.tdd('red', ['--group', 'a']);
  resumeOf(fx);
  assert.equal(continueOf(fx).a.next, 'red-check', 'the fresh gate speaks: RED holds, one navigator looks at it');
});

test('resume: a timeout is the code when plan proved the sandbox, the environment when it did not', t => {
  const proven = planned(t);
  put(proven.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  writeFileSync(join(proven.stub, 'config.json'), JSON.stringify({ exit: 124 }));
  proven.tdd('red', ['--group', 'a']);
  resumeOf(proven);
  assert.deepEqual([continueOf(proven).a.next, continueOf(proven).a.defects[0].what], ['red-fix', 'RED gate: tests/test_alpha.sh is timeout: it timed out'], 'a test that hangs after a passing preflight is a test defect');
  const bare = fixture(t);
  assert.equal(bare.plan(['--skip-preflight']).status, 0);
  put(bare.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  writeFileSync(join(bare.stub, 'config.json'), JSON.stringify({ exit: 124 }));
  bare.tdd('red', ['--group', 'a']);
  resumeOf(bare);
  assert.equal(continueOf(bare).a.next, 'env', 'nothing proved the sandbox: a timeout may be the machine');
});

test('resume: the GREEN probe says a timeout as unverifiable (timeout): the code\'s after a proven sandbox, the environment otherwise; an exit 127 is the environment at GREEN too', t => {
  const hang = (fx, flags = []) => {
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
    fx.tdd('red', ['--group', 'a']);
    put(fx.repo, { 'src/alpha.txt': 'new\n' });
    writeFileSync(join(fx.stub, 'config.json'), JSON.stringify({ exit: 124 }));
    fx.tdd('green', ['--group', 'a', ...flags]);
    assert.deepEqual([fx.gate('a.green.json').tests[0].verdict, fx.gate('a.green.json').tests[0].reason], ['unverifiable', 'timeout']);
    resumeOf(fx);
    return continueOf(fx).a;
  };
  const proven = hang(planned(t));
  assert.equal(proven.next, 'green-fix', 'plan proved the sandbox: a hanging test or code is a defect for a maker');
  assert.match(proven.defects[0].what, /unverifiable \(timeout\)/);
  const bare = fixture(t);
  assert.equal(bare.plan(['--skip-preflight']).status, 0);
  assert.equal(hang(bare).next, 'env', 'nothing proved the sandbox');
  const gone = planned(t);
  put(gone.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  gone.tdd('red', ['--group', 'a']);
  put(gone.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\nexit 127\n', 'src/alpha.txt': 'new\n' });
  gone.tdd('green', ['--group', 'a', '--retest']);
  assert.deepEqual([gone.gate('a.green.json').tests[0].verdict, gone.gate('a.green.json').tests[0].reason], ['unverifiable', 'the test command cannot start (exit 127)']);
  resumeOf(gone);
  assert.equal(continueOf(gone).a.next, 'env', 'a command that cannot start is the environment, never a test to repair');
  const failing = planned(t);
  put(failing.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  failing.tdd('red', ['--group', 'a']);
  failing.tdd('green', ['--group', 'a']); // the code is still the old one: the test fails with the group's code, with a plain exit 1
  assert.equal(failing.gate('a.green.json').tests[0].verdict, 'fails-on-head', 'only exit 127 is relabelled: an ordinary failure stays a failure');
  resumeOf(failing);
  assert.equal(continueOf(failing).a.next, 'green-fix');
});

test('plan: preflight tries tests, not the files around them: __init__, conftest, helpers and other languages are skipped, a file that holds no test says nothing', t => {
  const noise = { 'tests/__init__.sh': 'exit 9\n', 'tests/conftest.sh': 'exit 9\n', 'tests/fixtures/data.sh': 'exit 9\n', 'tests/test_other.py': 'exit 9\n', 'scripts/run.sh': 'exit 9\n', 'tests/test_real.sh': 'true\n' };
  const fx = fixture(t, { files: noise });
  const r = fx.plan();
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(fx.gate('preflight.json').tried.map(x => x.file), ['tests/test_real.sh'], 'a test-named file of the groups\' kind goes first, and one pass ends it');
  const sized = fixture(t, { files: { 'tests/test_aaa.sh': `exit 9\n# ${'x'.repeat(200)}\n`, 'tests/test_zzz.sh': 'true\n' } });
  assert.equal(sized.plan().status, 0);
  assert.deepEqual(sized.gate('preflight.json').tried.map(x => x.file), ['tests/test_zzz.sh'], 'among the tests named like one, the smallest goes first');
  const capped = fixture(t, { files: { 'tests/test_f1.sh': 'exit 9\n', 'tests/test_f2.sh': 'exit 9\n', 'tests/test_f3.sh': 'exit 9\n' } }); // the 4th candidate, existing_alpha.sh, would pass
  const c = capped.plan();
  assert.equal(c.status, 3, 'three tries and no more: a plan is not held up by a fourth run');
  capped.run = /--run (\S+) reuses/.exec(c.err)[1]; // the run folder of the refused plan keeps the evidence
  assert.deepEqual(capped.gate('preflight.json').tried.map(x => x.file), ['tests/test_f1.sh', 'tests/test_f2.sh', 'tests/test_f3.sh']);
  const own = fixture(t, { plan: { dod: [{ id: 'AC1', text: 'alpha', source: 'assumed', kinds: ['happy'] }], groups: [{ id: 'a', tests: ['tests/existing_alpha.sh'], src: ['src/alpha.txt'], dod: ['AC1'], after: [] }] } });
  assert.equal(own.plan().status, 0);
  assert.deepEqual([own.gate('preflight.json').verdict, own.gate('preflight.json').tried], ['skipped', []], 'a file the plan owns is the change under test, never the proof of the sandbox');
  const empty = fixture(t, { files: { 'tests/test_empty.sh': 'echo "collected 0 items"; exit 5\n' } });
  assert.equal(empty.plan().status, 0);
  assert.deepEqual(empty.gate('preflight.json').tried.map(x => [x.file, x.empty]), [['tests/test_empty.sh', true], ['tests/existing_alpha.sh', undefined]], 'no test collected is skipped as a candidate, the next one proves the sandbox');
  const only = fixture(t, { files: { 'tests/existing_alpha.sh': null, 'tests/test_empty.sh': 'echo "collected 0 items"; exit 5\n' } });
  const o = only.plan();
  assert.equal(o.status, 0, o.err);
  assert.equal(only.gate('preflight.json').verdict, 'skipped', 'nothing ran a test: not evidence of a broken environment');
  assert.match(o.err, /PREFLIGHT ok=true verdict=skipped\n  no existing test at the base ran a test: set plan\.smoke/, 'a skipped proof says so, so nobody mistakes it for a verified sandbox');
});

test('plan: every try timing out, or a command that cannot start, stops the plan with its own verdict', t => {
  for (const [exit, verdict] of [[124, 'timeout'], [127, 'unverifiable']]) {
    const r = fixture(t, { fake: { exit } }).plan();
    assert.equal(r.status, 3, String(exit));
    assert.match(r.err, new RegExp(`PREFLIGHT ok=false verdict=${verdict}`));
  }
});

test('plan: with no --runner the tests run through direct-run.mjs (the preflight runs a real test through it); plan.sandbox: true asks for the zero-trust-review sandbox instead', t => {
  const run = (fx, extra = []) => spawnSync(process.execPath, [TDD, 'plan', '--plan', join(fx.dir, 'plan.json'), ...extra], { encoding: 'utf8', env: { ...process.env, TMPDIR: fx.tmp, ZT_MARKER_DIR: join(fx.dir, 'marker') } });
  const direct = run(fixture(t));
  assert.equal(direct.status, 0, direct.stderr);
  assert.deepEqual([JSON.parse(direct.stdout.trim()).sandbox, JSON.parse(direct.stdout.trim()).preflight], ['direct', 'ok']);
  assert.match(direct.stderr, /PREFLIGHT ok=true verdict=ok: tests\/existing_alpha\.sh passed/);
  const boxed = run(fixture(t, { plan: { sandbox: true } }));
  if (boxed.status === 0) assert.notEqual(JSON.parse(boxed.stdout.trim()).sandbox, 'direct', 'the sandbox backend of this machine, not the direct runner');
  else { assert.equal(boxed.status, 3); assert.match(boxed.stderr, /plan\.sandbox is true: fix the sandbox/, 'no sandbox here: the refusal says how to run directly'); }
});

test('config files are fine as group src: the GREEN probe reverts them too, so a test that needs the config exercises the change', t => {
  const fx = fixture(t, { files: { 'config/alpha.json': '{"mode":"old"}\n' }, plan: p => ({ groups: [{ ...PLAN(p).groups[0], src: ['config/alpha.json'] }], dod: PLAN(p).dod.slice(0, 1) }) });
  const r = fx.plan();
  assert.equal(r.status, 0, r.err);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q new config/alpha.json\n' });
  assert.match(fx.tdd('red', ['--group', 'a']).out, /RED a ok=true/);
  put(fx.repo, { 'config/alpha.json': '{"mode":"new"}\n' });
  const g = fx.tdd('green', ['--group', 'a']);
  assert.match(g.out, /GREEN a ok=true/, g.out);
  assert.deepEqual([fx.gate('a.green.json').tests[0].verdict, fx.gate('a.green.json').outOfScope], ['exercises-change', []]);
});

test('plan: preflight runs a test that passes at the base through the sandbox before anything else; the verdict travels in the args', t => {
  const fx = fixture(t);
  const r = fx.plan();
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /PREFLIGHT ok=true verdict=ok: tests\/existing_alpha\.sh passed in the sandbox/);
  assert.deepEqual([fx.gate('preflight.json').ok, fx.gate('preflight.json').tried.map(x => x.file)], [true, ['tests/existing_alpha.sh']]);
  assert.equal(JSON.parse(r.out.trim()).preflight, 'ok');
  const again = fx.tdd('preflight');
  assert.match(again.out, /^PREFLIGHT ok=true verdict=ok/, 'the same check as a command: re-run it after fixing the environment');
});

test('plan: a sandbox that cannot run the tests stops the plan (exit 3, nothing printed) and --skip-preflight is the explicit way past', t => {
  const fx = fixture(t, { fake: { exit: 86 } });
  const r = fx.plan();
  assert.equal(r.status, 3);
  assert.match(r.err, /PREFLIGHT ok=false verdict=unverifiable[\s\S]*tests\/existing_alpha\.sh: exit 86[\s\S]*--skip-preflight/);
  assert.equal(r.out, '', 'no Workflow args exist for an unproven environment');
  const skip = fixture(t, { fake: { exit: 86 } }).plan(['--skip-preflight']);
  assert.equal(skip.status, 0, skip.err);
  assert.equal(JSON.parse(skip.out.trim()).preflight, 'skipped');
});

test('plan: no usable runner at all exits 3 before anything is created', t => {
  const fx = fixture(t);
  const dead = join(fx.stub, 'dead-runner.mjs');
  writeFileSync(dead, 'process.exit(1);\n');
  const r = fx.plan(['--runner', dead]);
  assert.equal(r.status, 3);
  assert.match(r.err, /no usable runner[\s\S]*Fix it and run plan again/);
  assert.doesNotMatch(r.err, /plan\.sandbox is true/, 'the sandbox hint only appears when the plan asked for the sandbox');
  assert.deepEqual(readdirSync(fx.tmp), [], 'no scratch dir, no run folder');
});

test('plan: tests that fail at the base mean a wrong command or environment (exit 3); plan.smoke names tests that do pass; no test at the base is skipped, not failed', t => {
  const failing = { 'tests/existing_alpha.sh': 'exit 3\n' };
  const broken = fixture(t, { files: failing }).plan();
  assert.equal(broken.status, 3);
  assert.match(broken.err, /PREFLIGHT ok=false verdict=broken\n  a test that should pass at the base fails here[\s\S]*tests\/existing_alpha\.sh: exit 3/);
  const named = fixture(t, { files: { ...failing, 'tests/existing_ok.sh': 'true\n' }, plan: { smoke: ['tests/existing_ok.sh'] } });
  const n = named.plan();
  assert.equal(n.status, 0, n.err);
  assert.deepEqual(named.gate('preflight.json').tried.map(x => x.file), ['tests/existing_ok.sh'], 'plan.smoke replaces the guess');
  const none = fixture(t, { files: { 'tests/existing_alpha.sh': null } });
  const s = none.plan();
  assert.equal(s.status, 0, s.err);
  assert.match(s.err, /PREFLIGHT ok=true verdict=skipped/);
});

test('resume: the repair budget of the next run is decided here and travels in continue.json; the plan\'s own maxRepairs no longer applies', t => {
  const fx = planned(t, { plan: { maxRepairs: 0 } });
  const r = resumeOf(fx);
  assert.match(r.out, /next run: repair budget 4 \(2 for each of the 2 group\(s\) that still work\), at most 20 build agents; the plan's own maxRepairs no longer applies; change it: --max-repairs N/, 'worst(2 groups, 3 rounds, 4 repairs) = min(2 x 20, 4 x 2 + 3 x 4)');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).maxRepairs, 4);
  assert.match(resumeOf(fx, ['--max-repairs', '1']).out, /next run: repair budget 1, at most 11 build agents/, 'an explicit budget is not described as the default: 4 x 2 + 3 x 1');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).maxRepairs, 1);
  assert.match(resumeOf(fx, ['--max-repairs=40']).out, /next run: repair budget 40,/, '40 is the top of the range');
  for (const bad of ['-1', '41', 'x', '1.5']) assert.equal(fx.tdd('resume', [`--max-repairs=${bad}`]).status, 2, bad);
});

test('resume: a group that stalled and is unchanged since is on hold (no agent); --retry, --hint and --escalate spend on purpose; an edit clears the hold', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  fx.tdd('red', ['--group', 'a']);
  dod(fx, 'red');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a']);
  const weak = { cls: 'gap', what: 'the edge test only checks truthiness' }, ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', reason: 'GREEN made no progress: the same defects came back after repair round 1: x', green: { verdict: 'FAIL', defects: [weak] } } } }));
  const r = resumeOf(fx, ['--ret', ret]);
  assert.match(r.out, /a: hold \(STALLED last run \(made no progress\): the same defects came back after a repair and no file was touched since[\s\S]*--hint a="\.\.\."[\s\S]*--escalate a[\s\S]*--retry a\)/);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.defects, JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).maxRepairs], ['hold', [weak], 2], 'a held group gets no budget: only b works');
  resumeOf(fx, ['--ret', ret, '--retry', 'b', '--retry', 'a']);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.stalled, continueOf(fx).a.hint, continueOf(fx).a.escalate], ['green-fix', true, undefined, undefined], 'a forced retry is told the last repair changed nothing');
  resumeOf(fx, ['--ret', ret, '--hint', 'a=use grep -c, not -q', '--hint', 'b=check the other file', '--escalate', 'a', '--escalate', 'b']);
  assert.deepEqual([continueOf(fx).b.hint, continueOf(fx).b.escalate], ['check the other file', true], 'the flags repeat: one per group');
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.hint, continueOf(fx).a.escalate], ['green-fix', 'use grep -c, not -q', true]);
  const srcTime = statSync(join(fx.repo, 'src/alpha.txt')).mtime;
  utimesSync(ret, srcTime, srcTime); // the return was saved at the very moment of the last edit: nothing is later than it
  for (const f of ['tests/test_alpha.sh', 'src/alpha.txt']) utimesSync(join(fx.repo, f), srcTime, srcTime);
  assert.equal(resumeOf(fx, ['--ret', ret]).out.includes('a: hold'), true, 'a file as old as the return is not an edit made after it');
  const longAgo = new Date(Date.now() - 60000);
  utimesSync(ret, longAgo, longAgo); // the return was saved a minute ago: every edit below is later
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.next, 'green-check', 'the code changed since: the gate is stale and a navigator looks again, nothing is held');
  fx.tdd('green', ['--group', 'a']); // the lead re-ran the gate after the edit: it is fresh again
  const again = resumeOf(fx, ['--ret', ret]);
  assert.match(again.out, /a: green-fix \(the last navigator reported defects the gate cannot see; STALLED last run, but files were edited since: a repair may work now\)/, 'a fresh gate does not hide the edit: the hold is lifted by a file touched after the return, not by the gate');
  assert.equal(fx.tdd('resume', ['--hint', 'a=']).status, 2);
  assert.equal(fx.tdd('resume', ['--retry', 'zzz']).status, 2);
});

test('resume: the same row or the same defect from two sources is kept once', t => {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q old src/alpha.txt\n' });
  fx.tdd('red', ['--group', 'a']);
  dod(fx, 'red');
  const fromGate = 'RED gate: tests/test_alpha.sh is passes-already: it passes without new code, so it pins no new behavior';
  const ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'paused', matrix: [ROW, { ...ROW, kind: 'fail', test: 'not_in_the_file' }], red: { verdict: 'FAIL', defects: [{ cls: 'test', what: fromGate }, { cls: 'test', what: 'tautology' }] } } } }));
  resumeOf(fx, ['--ret', ret]);
  assert.deepEqual(continueOf(fx).a.matrix, [ROW], 'rows.json and the return both name the test once; a row whose test is gone from its file is dropped');
  assert.deepEqual(continueOf(fx).a.defects.map(d => d.what), [fromGate, 'tautology'], 'the navigator and the gate said the same thing once');
});

test('resume --group prints one group and writes no file: it is what a replacement for a dead agent runs instead of exploring the tree', t => {
  const fx = planned(t);
  const r = resumeOf(fx, ['--group', 'b']);
  assert.match(r.out, /^RESUME b: 1 of 1 group\(s\) need work\n  b: red \(no RED gate on record\)/);
  assert.equal(existsSync(join(fx.run, 'continue.json')), false);
  assert.equal(fx.tdd('resume', ['--group', 'zzz']).status, 2);
  assert.equal(fx.tdd('resume', ['--ret', join(fx.dir, 'nope.json')]).status, 2);
});

test('coverage: changed lines covered below the minimum is a reason; the lcov file comes from the sandboxed command', t => {
  const cover = hits => `printf 'SF:src/alpha.txt\\nDA:1,${hits}\\nend_of_record\\n' > {out}`;
  for (const [hits, ok] of [[0, false], [3, true]]) {
    const fx = planned(t, { plan: { cover: cover(hits), coverMin: 80 } });
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
    fx.tdd('red', ['--group', 'a']);
    put(fx.repo, { 'src/alpha.txt': 'new\n' });
    const r = fx.tdd('green', ['--group', 'a']);
    assert.match(r.out, new RegExp(`ok=${ok}`), r.out);
    assert.equal(fx.gate('a.green.json').coverage.pct, hits ? 100 : 0);
    if (!ok) assert.match(r.out, /changed-line coverage 0% < 80%/);
  }
  const none = planned(t, { plan: { cover: 'true {out}' } });
  put(none.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  none.tdd('red', ['--group', 'a']);
  put(none.repo, { 'src/alpha.txt': 'new\n' });
  assert.match(none.tdd('green', ['--group', 'a']).out, /cover command wrote no zt-coverage\.lcov/);
});

const PY_TEST = 'cd "$(dirname "$0")/.." && python3 -c "from src.calc import sign; assert sign(5) == 1"\n';
test('green: a mutant the tests never pin survives, with a citable stamp, and makes the gate not ok', { skip: !hasPython && 'python3 not available' }, t => {
  const fx = planned(t, { plan: { groups: [{ id: 'a', tests: ['tests/test_calc.sh'], src: ['src/calc.py'], dod: ['AC1', 'AC2'], after: [] }] } });
  put(fx.repo, { 'tests/test_calc.sh': PY_TEST });
  fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/calc.py': 'def sign(x):\n    if x > 0:\n        return 1\n    return 0\n' });
  const r = fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /ok=false/);
  const g = fx.gate('a.green.json');
  assert.ok(g.mutation.survivors.length >= 1, JSON.stringify(g.mutation));
  assert.match(g.mutation.survivors[0].quote, /^ZT-MUTANT X-[0-9a-f]{8} src\/calc\.py:\d+ \S+ exit=0$/);
  assert.match(r.out, /survivor X-[0-9a-f]{8} src\/calc\.py/);
  assert.match(g.reasons.join(), /mutant\(s\) survived/);
});

const RET = (matrix, extra = {}) => ({
  groups: { a: { state: 'done', red: { verdict: 'PASS' }, green: { verdict: 'PASS' }, matrix: [{ dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' }] },
    b: { state: 'done', red: { verdict: 'PASS' }, green: { verdict: 'PASS' }, matrix }, ...extra }, clusters: [],
});
const BETA_ROW = [{ dod: 'AC2', kind: 'happy', test: 'test_ac2_happy', file: 'tests/test_beta.sh' }];

function built(t) {
  const fx = planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  fx.tdd('red', ['--group', 'a']); fx.tdd('red', ['--group', 'b']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  fx.tdd('green', ['--group', 'a']);
  put(fx.repo, { 'src/beta.txt': 'beta\n' });
  fx.tdd('green', ['--group', 'b']);
  return fx;
}
const verify = (fx, ret) => { const f = join(fx.dir, 'ret.json'); writeFileSync(f, JSON.stringify(ret)); const r = fx.tdd('verify', ['--ret', f]); assert.equal(r.status, 0, r.err); return JSON.parse(r.out.trim().split('\n').pop()); };

test('verify: the DoD closure comes from the gate files, not from what an agent said', t => {
  const fx = built(t);
  let v = verify(fx, RET(BETA_ROW));
  assert.deepEqual([v.dod.covered, v.dod.total, v.dod.gaps, v.final, v.overridden, v.notDone], [2, 2, [], true, [], []]);
  assert.match(readFileSync(join(fx.run, 'dod-matrix.md'), 'utf8'), /DoD closure: 2\/2/);
  v = verify(fx, RET([]));
  assert.deepEqual(v.dod.gaps, ['AC2/happy: missing']);
  v = verify(fx, RET([{ dod: 'AC2', kind: 'happy', test: 'test_ac2_happy', file: 'tests/test_alpha.sh' }]));
  assert.deepEqual(v.dod.gaps, ['AC2/happy: missing'], 'a row naming a file that is not the group\'s test file does not count');
});

test('verify: a matrix row naming a test that is not in its file is a phantom, never coverage', t => {
  const fx = built(t);
  const v = verify(fx, RET([{ dod: 'AC2', kind: 'happy', test: 'test_ac2_does_not_exist', file: 'tests/test_beta.sh' }]));
  assert.deepEqual(v.dod.phantom, ['AC2/happy: test_ac2_does_not_exist is not in tests/test_beta.sh']);
  assert.deepEqual(v.dod.gaps, ['AC2/happy: missing']);
});

test('verify: a PASS the gate contradicts is flagged, a group that is not done is listed', t => {
  const fx = built(t);
  rmSync(join(fx.run, 'gates', 'a.red.json'));
  const gate = fx.gate('b.green.json');
  writeFileSync(join(fx.run, 'gates', 'b.green.json'), JSON.stringify({ ...gate, ok: false, reasons: ['1 mutant(s) survived'] }));
  const v = verify(fx, RET(BETA_ROW, { c: { state: 'blocked' } }));
  assert.deepEqual(v.overridden, ['a/red: PASS with no gate on record', 'b/green: PASS although the gate said not ok (1 mutant(s) survived)']);
  assert.deepEqual(v.notDone, ['c: blocked']);
});

test('verify: a reviewer finding whose code is still there after the fix is unfixed; a fixed one is not', t => {
  const fx = built(t);
  const cl = (id, file, quote) => ({ id, status: 'confirmed', severity: 'medium', file, startLine: 1, endLine: 1, title: `finding ${id}`, quote });
  const v = verify(fx, { ...RET(BETA_ROW), clusters: [cl('C-1', 'src/alpha.txt', 'old'), cl('C-2', 'src/alpha.txt', 'new'), { ...cl('C-3', 'src/alpha.txt', 'new'), status: 'refuted' }] });
  assert.deepEqual(v.unfixed, ['C-2 medium src/alpha.txt:1 finding C-2']);
});

test('plan refuses: a subdirectory of a work tree, a src file with a test-like path, an active review marker; it resolves a moving base to a sha', t => {
  const sub = fixture(t, { plan: repo => ({ repo: join(repo, 'sub') }) });
  mkdirSync(join(sub.repo, 'sub'));
  const r = sub.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /top level of its work tree/);
  const cfg = fixture(t, { plan: p => ({ groups: [{ ...PLAN(p).groups[0], src: ['src/test_alpha_helper.txt'] }], dod: PLAN(p).dod.slice(0, 1) }) });
  const c = cfg.plan();
  assert.equal(c.status, 2);
  assert.match(c.err, /src files with a test-like path: a: src\/test_alpha_helper\.txt/);
  const marked = fixture(t);
  const md = join(marked.dir, 'marker'), live = join(marked.dir, 'live-run');
  for (const d of [md, live]) { mkdirSync(d); chmodSync(d, 0o700); }
  writeFileSync(join(md, '.active'), `${live}\n`, { mode: 0o600 });
  const m = marked.plan();
  assert.equal(m.status, 3);
  assert.match(m.err, /zero-trust-review run is still active[\s\S]*deactivate/);
  const moving = fixture(t, { plan: { base: 'HEAD' } });
  assert.equal(JSON.parse(moving.plan().out.trim()).base, moving.head, 'HEAD is stored as the sha it is now');
});

test('a non-ASCII path is judged like any other: names stay raw, so nothing reads as stray', t => {
  const fx = planned(t, { plan: p => ({ groups: [{ id: 'a', tests: ['tests/test_café.sh'], src: ['src/café.txt'], dod: ['AC1', 'AC2'], after: [] }] }) });
  put(fx.repo, { 'tests/test_café.sh': '# test_ac1_happy\ngrep -q new src/café.txt\n' });
  assert.match(fx.tdd('red', ['--group', 'a']).out, /RED a ok=true/);
  put(fx.repo, { 'src/café.txt': 'new\n' });
  const g = fx.tdd('green', ['--group', 'a']);
  assert.match(g.out, /^GREEN a ok=true/, g.out);
  assert.deepEqual(fx.gate('a.green.json').outOfScope, []);
  const f = fx.tdd('final');
  assert.match(f.out, /^FINAL ok=true/m, f.out);
});

test('the integration test is not run in the sandbox (it needs its real dependency); verify reads the exit code its agent reported', t => {
  const integ = { file: 'tests/integration/test_flow.sh', goal: 'drive the full path' };
  const fx = planned(t, { plan: { integration: integ } });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n', [integ.file]: '# mentions alpha\nexit 1\n' });
  const f = fx.tdd('final');
  assert.match(f.out, /^FINAL ok=true/m, f.out);
  assert.ok(!fx.gate('final.json').existing.ran.includes(integ.file) && fx.gate('final.json').outOfScope.length === 0);
  const ok = verify(fx, { ...RET(BETA_ROW), integration: { file: integ.file, exit: 0 } });
  assert.deepEqual([ok.integration, ok.notDone], ['ok', []]);
  const bad = verify(fx, { ...RET(BETA_ROW), integration: { file: integ.file, exit: 3 } });
  assert.deepEqual(bad.notDone, [`integration: ${integ.file} exited 3`]);
  assert.deepEqual(verify(fx, RET(BETA_ROW)).notDone, [`integration: not run`]);
});

test('verify: a nit is reported, never "unfixed"; a matrix row whose name only starts with a real test name is a phantom', t => {
  const fx = built(t);
  const cl = (id, status) => ({ id, status, severity: 'nit', file: 'src/alpha.txt', startLine: 1, endLine: 1, title: `t ${id}`, quote: 'new' });
  const v = verify(fx, { ...RET([{ dod: 'AC2', kind: 'happy', test: 'test_ac2', file: 'tests/test_beta.sh' }]), clusters: [cl('R-1', 'unverified-nit')] });
  assert.deepEqual(v.unfixed, []);
  assert.deepEqual(v.dod.phantom, ['AC2/happy: test_ac2 is not in tests/test_beta.sh']);
});

test('gates leave no scratch tree behind', t => {
  const fx = built(t);
  fx.tdd('final');
  const args = JSON.parse(readFileSync(join(fx.run, 'args.json'), 'utf8'));
  assert.deepEqual(readdirSync(args.scratch).filter(n => /^(red|gp|gm|cov|fin|finb)-/.test(n)), []);
});
