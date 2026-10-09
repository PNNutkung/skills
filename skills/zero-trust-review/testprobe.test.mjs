// Offline checks for testprobe.mjs: fixture git repos plus a stub runner, so no real sandbox is needed. Run: node --test testprobe.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, 'testprobe.mjs');
const REAL_RUNNER = join(HERE, 'sandbox-run.mjs');

// Honors the runner flags, logs its argv, then runs the command after `--` in --cwd. config.json {exit} fakes 86/124.
const STUB = `
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)), a = process.argv.slice(2);
if (a[0] === '--check') { console.log('stub'); process.exit(0); }
appendFileSync(join(dir, 'calls.log'), JSON.stringify(a) + '\\n');
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

// base: src/value.txt=old + tests/check.sh (passes only when value.txt has "new"); head: value.txt=new plus `head`
function fixture(t, { base = {}, head = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  put(repo, { 'src/value.txt': 'old\n', 'tests/check.sh': 'grep -q new src/value.txt\n', ...base });
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  const baseRev = git(repo, 'rev-parse', 'HEAD');
  put(repo, { 'src/value.txt': 'new\n', ...head });
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'head');
  return { dir, repo, base: baseRev, head: git(repo, 'rev-parse', 'HEAD'), scratch: join(dir, 'scratch') };
}

function probe(fx, args = [], fake = {}, runner) {
  const sd = join(fx.dir, 'stub');
  mkdirSync(sd, { recursive: true });
  writeFileSync(join(sd, 'stub-runner.mjs'), STUB);
  writeFileSync(join(sd, 'config.json'), JSON.stringify(fake));
  const r = spawnSync(process.execPath, [PROBE, '--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--scratch', fx.scratch, '--cmd', 'sh {file}', '--runner', runner ?? join(sd, 'stub-runner.mjs'), ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'stdout is one JSON line');
  const log = join(sd, 'calls.log');
  return { out: JSON.parse(lines[0]), calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [] };
}
const vals = (argv, k) => argv.slice(0, argv.indexOf('--')).flatMap((f, i) => (f === k ? [argv[i + 1]] : []));

test('exercises-change: passes on HEAD, fails once changed source is restored to BASE', t => {
  const { out } = probe(fixture(t), ['--tests', 'tests/check.sh']);
  const [r] = out.tests;
  assert.equal(r.verdict, 'exercises-change');
  assert.equal(r.head.exit, 0);
  assert.notEqual(r.base.exit, 0);
  assert.equal(typeof r.head.sec, 'number');
  assert.deepEqual(r.flake, { runs: 3, exits: [0, 0, 0], nondeterministic: false });
  assert.equal(out.backend, 'stub');
  assert.match(out.summary, /1 exercises-change/);
});

test('no-signal: a test that always passes does not exercise the change', t => {
  const { out } = probe(fixture(t, { head: { 'tests/always.sh': 'exit 0\n' } }));
  assert.deepEqual(out.tests.map(r => [r.file, r.verdict, r.base.exit]), [['tests/always.sh', 'no-signal', 0]]);
  assert.match(out.summary, /tests\/always\.sh: no-signal/);
});

test('no-signal explains itself when only tests changed', t => {
  const { out } = probe(fixture(t, { head: { 'src/value.txt': 'old\n', 'tests/new.sh': 'exit 0\n' } }));
  assert.deepEqual([out.tests[0].verdict, out.tests[0].reason], ['no-signal', 'no changed source files']);
});

test('--src: a file the caller declares as source is restored to BASE too, whatever its name (a config file the tests need)', t => {
  const fx = fixture(t, { base: { 'config/app.json': '{"mode":"old"}\n', 'tests/cfg.sh': 'grep -q new config/app.json\n' }, head: { 'src/value.txt': 'old\n', 'config/app.json': '{"mode":"new"}\n' } });
  const plain = probe(fx, ['--tests', 'tests/cfg.sh']).out.tests[0];
  assert.deepEqual([plain.verdict, plain.reason], ['no-signal', 'no changed source files'], 'a config file alone is not source: nothing is reverted, so the test seems to pin nothing');
  const declared = probe(fx, ['--tests', 'tests/cfg.sh', '--src', 'config/app.json']).out.tests[0];
  assert.deepEqual([declared.verdict, declared.head.exit !== declared.base.exit], ['exercises-change', true], 'declared as source it is reverted, and the test fails without it');
});

test('fails-on-head: exit code kept, stderr tail capped at 200 chars', t => {
  const { out } = probe(fixture(t, { head: { 'tests/bad.sh': 'echo boom-' + 'x'.repeat(300) + ' >&2; exit 3\n' } }));
  const [r] = out.tests;
  assert.deepEqual([r.verdict, r.head.exit], ['fails-on-head', 3]);
  assert.ok(r.tail.length <= 200 && /x{50}/.test(r.tail), r.tail);
  assert.match(out.summary, /tests\/bad\.sh: fails-on-head/);
});

test('nondeterministic: differing exit codes across HEAD runs', t => {
  const fx = fixture(t, { head: {} });
  const counter = join(fx.dir, 'counter');
  mkdirSync(counter);
  // mkdir is atomic, so every concurrent run claims a distinct index and exits with its parity
  put(fx.repo, { 'tests/flaky.sh': 'i=0; while ! mkdir "' + counter + '/$i" 2>/dev/null; do i=$((i+1)); done; exit $((i % 2))\n' });
  git(fx.repo, 'add', '-A'); git(fx.repo, 'commit', '-qm', 'flaky');
  const { out } = probe({ ...fx, head: git(fx.repo, 'rev-parse', 'HEAD') }, ['--tests', 'tests/flaky.sh']);
  const [r] = out.tests;
  assert.equal(r.flake.nondeterministic, true);
  assert.equal(r.flake.exits.length, 3);
  assert.match(out.summary, /tests\/flaky\.sh.*nondeterministic/);
});

test('unverifiable: runner exit 86 means no sandbox', t => {
  const { out } = probe(fixture(t), ['--tests', 'tests/check.sh'], { exit: 86 });
  const [r] = out.tests;
  assert.deepEqual([r.verdict, r.reason], ['unverifiable', 'no sandbox']);
  assert.equal(out.backend, 'none');
  assert.match(out.summary, /no sandbox/);
});

test('unverifiable: runner exit 124 means timeout', t => {
  const { out } = probe(fixture(t), ['--tests', 'tests/check.sh'], { exit: 124 });
  assert.deepEqual([out.tests[0].verdict, out.tests[0].reason], ['unverifiable', 'timeout']);
  assert.match(out.summary, /1 unverifiable/);
});

test('default discovery: changed, non-deleted test files only', t => {
  const fx = fixture(t, { base: { 'tests/gone_test.sh': 'exit 0\n', 'docs/guide.md': 'a\n' }, head: {
    'tests/check.sh': 'grep -q new src/value.txt # edited\n', 'tests/test_new.sh': 'exit 0\n', 'lib/foo_test.sh': 'exit 0\n',
    'tests/gone_test.sh': null, 'docs/guide.md': 'b\n', 'src/helper.sh': 'exit 0\n', 'conf/settings.yaml': 'a: 1\n', 'tests/fixtures/data.json': '{}\n',
  } });
  const { out } = probe(fx);
  assert.deepEqual(out.tests.map(r => r.file).sort(), ['lib/foo_test.sh', 'tests/check.sh', 'tests/test_new.sh']);
});

test('BASE-src restores modified and deleted sources and deletes files added at HEAD', t => {
  const fx = fixture(t, { base: { 'src/gone.txt': 'x\n', 'tests/added.sh': 'test -e src/added.txt\n', 'tests/gone.sh': 'test ! -e src/gone.txt\n' }, head: { 'src/added.txt': 'y\n', 'src/gone.txt': null } });
  const { out } = probe(fx, ['--tests', 'tests/added.sh,tests/gone.sh']);
  assert.deepEqual(out.tests.map(r => [r.file, r.verdict]), [['tests/added.sh', 'exercises-change'], ['tests/gone.sh', 'exercises-change']]);
});

test('the repo is never modified', t => {
  const fx = fixture(t);
  put(fx.repo, { 'venv/x': '1\n' });
  const snap = () => [git(fx.repo, 'status', '--porcelain'), git(fx.repo, 'rev-parse', 'HEAD'), git(fx.repo, 'stash', 'list')].join('|');
  const before = snap();
  probe(fx, ['--tests', 'tests/check.sh', '--link', 'venv']);
  assert.equal(snap(), before);
});

test('every command goes through the runner, with its flags', t => {
  const fx = fixture(t, { head: { 'tests/mark.sh': 'echo run >> "$MARKS"\n' } });
  const marks = join(fx.dir, 'marks');
  const { out, calls } = probe(fx, ['--tests', 'tests/mark.sh', '--env', 'MARKS=' + marks]);
  assert.equal(out.tests[0].verdict, 'no-signal');
  assert.equal(calls.length, 5, 'head + base + 3 flake runs');
  assert.equal(readFileSync(marks, 'utf8').trim().split('\n').length, 5, 'the test never ran outside the runner');
  for (const a of calls) {
    const [cwd] = vals(a, '--cwd');
    assert.deepEqual([vals(a, '--rw'), vals(a, '--timeout')], [[cwd], ['120']]);
    assert.ok(vals(a, '--env').includes('PYTHONPATH=' + cwd) && vals(a, '--env').includes('MARKS=' + marks));
    assert.deepEqual(a.slice(a.indexOf('--')), ['--', 'sh', '-c', 'sh tests/mark.sh']);
    assert.ok(cwd.startsWith(realpathSync(fx.scratch)) && cwd !== fx.repo);
  }
  assert.equal(new Set(calls.map(a => vals(a, '--cwd')[0])).size, 2, 'one HEAD copy, one BASE-src copy');
});

test('PYTHONPATH from the caller is not overridden', t => {
  const { calls } = probe(fixture(t), ['--tests', 'tests/check.sh', '--flake', '0', '--env', 'PYTHONPATH=/mine', '--timeout', '7']);
  assert.equal(calls.length, 2);
  for (const a of calls) assert.deepEqual([vals(a, '--env').filter(e => e.startsWith('PYTHONPATH=')), vals(a, '--timeout')], [['PYTHONPATH=/mine'], ['7']]);
});

test('--link symlinks an untracked dir into both copies and passes it as --ro', t => {
  const fx = fixture(t, { head: { 'tests/link.sh': 'test -f venv/marker\n' } });
  put(fx.repo, { 'venv/marker': '1\n' });
  const { out, calls } = probe(fx, ['--tests', 'tests/link.sh', '--link', 'venv']);
  assert.deepEqual([out.tests[0].head.exit, out.tests[0].base.exit], [0, 0]);
  for (const a of calls) assert.deepEqual(vals(a, '--ro'), [realpathSync(join(fx.repo, 'venv'))]);
});

test('--link also grants read-only access to editable-install roots from .pth files, only those inside the repo', t => {
  const fx = fixture(t, { head: { 'tests/link.sh': 'exit 0\n' } });
  const outside = join(fx.dir, 'outside'); mkdirSync(outside);
  put(fx.repo, { 'pkg/src/mod.py': 'x = 1\n', 'venv/marker': '1\n' });
  const sp = join(fx.repo, 'venv/lib/python3.11/site-packages'); mkdirSync(sp, { recursive: true });
  writeFileSync(join(sp, '__editable__.pkg.pth'), [join(fx.repo, 'pkg/src'), outside, 'relative/dir', join(fx.repo, 'missing'), 'import sys; sys.x = 1', ''].join('\n'));
  const { calls } = probe(fx, ['--tests', 'tests/link.sh', '--link', 'venv']);
  assert.ok(calls.length > 0);
  for (const a of calls) assert.deepEqual(vals(a, '--ro').sort(), [realpathSync(join(fx.repo, 'venv')), realpathSync(join(fx.repo, 'pkg/src'))].sort());
});

test('summary stays within 6 lines', t => {
  const head = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`tests/t${i}.sh`, 'exit 0\n']));
  const { out } = probe(fixture(t, { head }), ['--flake', '1']);
  assert.equal(out.tests.length, 8);
  assert.ok(out.summary.split('\n').length <= 6, out.summary);
});

test('usage errors exit 2', t => {
  assert.equal(spawnSync(process.execPath, [PROBE], { encoding: 'utf8' }).status, 2);
  const fx = fixture(t);
  const r = spawnSync(process.execPath, [PROBE, '--repo', fx.repo, '--base', 'no-such-rev', '--head', fx.head, '--scratch', fx.scratch, '--cmd', 'sh {file}'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.length > 0 && r.stdout === '');
});

const realSandbox = existsSync(REAL_RUNNER) && spawnSync(process.execPath, [REAL_RUNNER, '--check']).status === 0;
test('real sandbox runner end to end', { skip: !realSandbox && 'sandbox-run.mjs missing or no sandbox available' }, t => {
  const { out } = probe(fixture(t), ['--tests', 'tests/check.sh'], {}, REAL_RUNNER);
  assert.equal(out.tests[0].verdict, 'exercises-change');
  assert.notEqual(out.backend, 'none');
});
