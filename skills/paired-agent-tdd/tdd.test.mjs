// Offline checks for tdd.mjs: fixture git repos plus a stub sandbox runner, so no real sandbox is needed. Run: node --test tdd.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const planned = (t, opts) => { const fx = fixture(t, opts); const r = fx.plan(); assert.equal(r.status, 0, r.err); return fx; };
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
  const fx = planned(t, { fake: { exit: 86 } });
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

test('plan refuses: a subdirectory of a work tree, a src file the probes never count as source, an active review marker; it resolves a moving base to a sha', t => {
  const sub = fixture(t, { plan: repo => ({ repo: join(repo, 'sub') }) });
  mkdirSync(join(sub.repo, 'sub'));
  const r = sub.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /top level of its work tree/);
  const cfg = fixture(t, { plan: p => ({ groups: [{ ...PLAN(p).groups[0], src: ['src/app_config.py'] }], dod: PLAN(p).dod.slice(0, 1) }) });
  const c = cfg.plan();
  assert.equal(c.status, 2);
  assert.match(c.err, /never count as source[\s\S]*a: src\/app_config\.py/);
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
