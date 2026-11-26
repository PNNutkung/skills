// Offline checks for testprobe.mjs: fixture git repos plus a stub runner, so no real sandbox is needed. Run: node --test testprobe.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, 'testprobe.mjs');
const REAL_RUNNER = join(HERE, 'sandbox-run.mjs');

// Honors the runner flags, logs its argv, then runs the command after `--` in --cwd. config.sh FAKE_EXIT fakes 86/124 for every call.
// A sh script, run directly (probelib runs a runner that is not a node file itself): no node start per call (ADR 0008).
// calls.log: one record per call, the args each ended by \037 (unit separator), the record by \036 and a newline, written in one append.
const STUB = `#!/bin/sh
d=\${0%/*}
[ "$1" = --check ] && { echo stub; exit 0; }
rec=$(printf '%s\\037' "$@")
printf '%s\\036\\n' "$rec" >> "$d/calls.log"
. "$d/config.sh"
[ -n "$FAKE_EXIT" ] && exit "$FAKE_EXIT"
cwd=
while [ "$#" -gt 0 ] && [ "$1" != -- ]; do
  case "$1" in --cwd) cwd=$2;; --env) export "$2";; esac
  shift 2
done
shift
cd "$cwd" || exit 1
exec "$@"
`;
const writeExec = (f, text) => { writeFileSync(f, text); chmodSync(f, 0o755); };
const readCalls = f => (existsSync(f) ? readFileSync(f, 'utf8').split('\x1e\n').filter(Boolean).map(rec => rec.split('\x1f').slice(0, -1)) : []);

// maintenance.auto=false: a commit starts no `git maintenance run --auto` process
const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...a], { encoding: 'utf8' }).trim();
const put = (repo, files) => {
  for (const [p, c] of Object.entries(files)) {
    const f = join(repo, p);
    if (c === null) rmSync(f, { force: true });
    else { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, c); }
  }
};

// base: src/value.txt=old + tests/check.sh (passes only when value.txt has "new"); head: value.txt=new plus `head`
// Each fixture repo is built once a process and copied into each test's own dir (ADR 0008): git init and two commits cost tens of ms CPU a repo, a copy a few.
const templates = new Map();
let templateRoot;
function fixture(t, { base = {}, head = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo'), key = JSON.stringify([base, head]);
  if (!templates.has(key)) {
    if (!templateRoot) {
      templateRoot = mkdtempSync(join(tmpdir(), 'tp-tpl-'));
      process.on('exit', () => rmSync(templateRoot, { recursive: true, force: true }));
    }
    const r = join(templateRoot, String(templates.size));
    mkdirSync(r);
    git(r, 'init', '-q');
    put(r, { 'src/value.txt': 'old\n', 'tests/check.sh': 'grep -q new src/value.txt\n', ...base });
    git(r, 'add', '-A'); git(r, 'commit', '-qm', 'base');
    const baseRev = git(r, 'rev-parse', 'HEAD');
    put(r, { 'src/value.txt': 'new\n', ...head });
    git(r, 'add', '-A'); git(r, 'commit', '-qm', 'head');
    templates.set(key, { repo: r, base: baseRev, head: git(r, 'rev-parse', 'HEAD') });
  }
  const tpl = templates.get(key);
  cpSync(tpl.repo, repo, { recursive: true });
  return { dir, repo, base: tpl.base, head: tpl.head, scratch: join(dir, 'scratch') };
}

function probe(fx, args = [], fake = {}, runner) {
  const sd = join(fx.dir, 'stub');
  mkdirSync(sd, { recursive: true });
  writeExec(join(sd, 'stub-runner'), STUB);
  writeFileSync(join(sd, 'config.sh'), `FAKE_EXIT=${fake.exit ?? ''}\n`);
  const r = spawnSync(process.execPath, [PROBE, '--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--scratch', fx.scratch, '--cmd', 'sh {file}', '--runner', runner ?? join(sd, 'stub-runner'), ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'stdout is one JSON line');
  return { out: JSON.parse(lines[0]), calls: readCalls(join(sd, 'calls.log')) };
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

// ---- ZT_TEST_PROCESS_MAX and --head-out
const MAX_FLAG = 'ZT_TEST_PROCESS_MAX';

// Like the real runner: the ledger line closes the output (a fixed run id). Each run leaves a marker in live/ while it lasts and logs how many markers it saw
// (peak.log). A sh script like STUB: no node start per call; no test here kills a running command, so it needs no process group of its own.
const PROC_STUB = `#!/bin/sh
d=\${0%/*}
[ "$1" = --check ] && { echo stub; exit 0; }
rec=$(printf '%s\\037' "$@")
printf '%s\\036\\n' "$rec" >> "$d/calls.log"
mkdir -p "$d/live"
me="$d/live/$$"
: > "$me"
n=$(ls "$d/live" | wc -l)
echo $n >> "$d/peak.log"
cwd=
while [ "$#" -gt 0 ] && [ "$1" != -- ]; do
  case "$1" in --cwd) cwd=$2;; --env) export "$2";; esac
  shift 2
done
shift
cd "$cwd" || { rm -f "$me"; exit 1; }
"$@"; code=$?
rm -f "$me"
printf 'ZT-RUN stub exit=%s\\n' "$code" >&2
exit "$code"
`;

function probeProc(fx, { args = [], flags = {} } = {}) {
  const sd = mkdtempSync(join(fx.dir, 'pstub-'));
  writeExec(join(sd, 'stub-runner'), PROC_STUB);
  const env = { ...process.env };
  delete env[MAX_FLAG];
  const r = spawnSync(process.execPath, [PROBE, '--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--scratch', mkdtempSync(join(fx.dir, 'scr-')), '--cmd', 'sh {file}',
    '--runner', join(sd, 'stub-runner'), ...args], { encoding: 'utf8', env: { ...env, ...flags } });
  const lines = name => (existsSync(join(sd, name)) ? readFileSync(join(sd, name), 'utf8').trim().split('\n').filter(Boolean) : []);
  return { ...r, runner: join(sd, 'stub-runner'), calls: readCalls(join(sd, 'calls.log')), peak: Math.max(0, ...lines('peak.log').map(Number)) };
}
const stableOut = s => s.replace(/"sec":[\d.]+/g, '"sec":0');
const normalCalls = (fx, calls) => {
  const roots = [realpathSync(fx.dir), fx.dir];
  return calls.map(a => a.map(x => roots.reduce((s, root) => s.replaceAll(root, '<D>'), x).replace(/(head|base|scr)-[A-Za-z0-9]{6}/g, '$1-X'))).map(a => JSON.stringify(a)).sort();
};
const PROBE_FIXTURE = { head: { 'tests/always.sh': 'exit 0\n', 'tests/bad.sh': 'echo boom >&2; exit 3\n' } };

// captured from testprobe.mjs before ZT_TEST_PROCESS_MAX and --head-out existed (durations zeroed)
const PROBE_GOLDEN = {
  stdout: "{\"backend\":\"stub\",\"tests\":[{\"file\":\"tests/always.sh\",\"head\":{\"exit\":0,\"sec\":0},\"base\":{\"exit\":0,\"sec\":0},\"verdict\":\"no-signal\",\"flake\":{\"runs\":3,\"exits\":[0,0,0],\"nondeterministic\":false}},{\"file\":\"tests/bad.sh\",\"head\":{\"exit\":3,\"sec\":0},\"base\":{\"exit\":3,\"sec\":0},\"verdict\":\"fails-on-head\",\"tail\":\"boom\\nZT-RUN stub exit=3\",\"flake\":{\"runs\":3,\"exits\":[3,3,3],\"nondeterministic\":false}}],\"summary\":\"2 test file(s): 1 no-signal, 1 fails-on-head\\ntests/always.sh: no-signal\\ntests/bad.sh: fails-on-head\"}\n",
  calls: [
    "[\"--cwd\",\"<D>/scr-X/base-X\",\"--rw\",\"<D>/scr-X/base-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/base-X\",\"--\",\"sh\",\"-c\",\"sh tests/always.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/base-X\",\"--rw\",\"<D>/scr-X/base-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/base-X\",\"--\",\"sh\",\"-c\",\"sh tests/bad.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/always.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/always.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/always.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/always.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/bad.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/bad.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/bad.sh\"]",
    "[\"--cwd\",\"<D>/scr-X/head-X\",\"--rw\",\"<D>/scr-X/head-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONPATH=<D>/scr-X/head-X\",\"--\",\"sh\",\"-c\",\"sh tests/bad.sh\"]",
  ],
};

test('should print byte-identical output and make the same runner calls as before when ZT_TEST_PROCESS_MAX is unset or unlimited', t => {
  const fx = fixture(t, PROBE_FIXTURE);
  for (const flags of [{}, { [MAX_FLAG]: 'unlimited' }, { [MAX_FLAG]: 'UNLIMITED' }, { [MAX_FLAG]: '' }]) {
    const r = probeProc(fx, { flags });
    assert.equal(r.status, 0, r.stderr);
    const got = { stdout: stableOut(r.stdout), calls: normalCalls(fx, r.calls) };
    assert.equal(got.stdout, PROBE_GOLDEN.stdout, JSON.stringify(flags));
    assert.deepEqual(got.calls, PROBE_GOLDEN.calls, JSON.stringify(flags));
  }
});

test('should write the head run to --head-out, keyed to the tree it ran on, and print the same stdout as without it', t => {
  const fx = fixture(t, PROBE_FIXTURE);
  const file = join(fx.dir, 'head.json');
  const plain = probeProc(fx);
  const r = probeProc(fx, { args: ['--head-out', file, '--env', 'K=V', '--timeout', '30'] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stableOut(r.stdout), stableOut(plain.stdout));
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(doc), ['schema', 'kind', 'identity', 'tests']);
  assert.deepEqual([doc.schema, doc.kind], [1, 'zt-head-run']);
  assert.deepEqual(doc.identity, { tree: git(fx.repo, 'rev-parse', `${fx.head}^{tree}`), cmd: 'sh {file}', env: ['K=V'], link: [], ro: [], timeout: 30, runner: r.runner });
  assert.deepEqual(doc.tests.map(({ file: f, pass, exit }) => [f, pass, exit]), out.tests.map(x => [x.file, x.head.exit === 0, x.head.exit]));
  assert.deepEqual(doc.tests.map(x => x.sec), out.tests.map(x => x.head.sec));
  assert.ok(doc.tests.every(x => typeof x.sec === 'number' && x.sec >= 0));
});

test('should write no file and change nothing when --head-out is not given', t => {
  const fx = fixture(t, PROBE_FIXTURE);
  const before = new Set(readdirSync(fx.dir));
  probeProc(fx);
  assert.deepEqual(readdirSync(fx.dir).filter(n => !before.has(n) && !/^(pstub|scr)-/.test(n)), []);
});

test('should stop with exit 2 when the --head-out file cannot be written', t => {
  const fx = fixture(t, PROBE_FIXTURE);
  const r = probeProc(fx, { args: ['--head-out', join(fx.dir, 'no-such-dir', 'head.json')] });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^testprobe: /);
});

test('should never run more test processes at once than ZT_TEST_PROCESS_MAX, with the same verdicts', t => {
  const fx = fixture(t, PROBE_FIXTURE);
  const free = probeProc(fx, { args: ['--jobs', '4'] });
  for (const max of [1, 2]) {
    const r = probeProc(fx, { args: ['--jobs', '4'], flags: { [MAX_FLAG]: String(max) } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.peak >= 1 && r.peak <= max, `peak ${r.peak} with max ${max}`);
    assert.equal(stableOut(r.stdout), stableOut(free.stdout));
    assert.equal(r.calls.length, free.calls.length);
  }
});

// a seeded generator, so a failing case can be replayed
const rng = seed => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const ALPHABET = ['0', '1', '7', '-', '.', ' ', 'x', 'unlimited', 'UNLIMITED', 'true', 'max', '00', '12', 'e3'];
const validMax = v => { const s = v.trim(); return !s || s.toLowerCase() === 'unlimited' || (/^\d+$/.test(s) && Number(s) > 0); };

test('should stop with exit 2 naming the fix for any ZT_TEST_PROCESS_MAX that is not a whole number above 0 or unlimited (fuzz)', t => {
  const rand = rng(20261122), fx = fixture(t, PROBE_FIXTURE);
  const values = Array.from({ length: 16 }, () => Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join(''));
  for (const v of [...values, '0', '-1', '1.5', 'unlimited', ' 3 ']) {
    const r = probeProc(fx, { args: ['--flake', '0', '--tests', 'tests/always.sh'], flags: { [MAX_FLAG]: v } });
    if (validMax(v)) assert.equal(r.status, 0, `${JSON.stringify(v)}: ${r.stderr}`);
    else {
      assert.equal(r.status, 2, JSON.stringify(v));
      assert.equal(r.stderr.trim(), `testprobe: ${MAX_FLAG}=${v} is not valid: use a whole number above 0, or unlimited`);
      assert.equal(r.calls.length, 0, 'nothing ran');
    }
  }
});

// ---------------------------------------------------------------- --runner-inprocess (ADR 0008 A18)
const DIRECT_RUN = join(HERE, '..', 'paired-agent-tdd', 'direct-run.mjs');
const spawnProbe = (fx, args) => spawnSync(process.execPath, [PROBE, '--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--scratch', fx.scratch, '--cmd', 'sh {file}', ...args], { encoding: 'utf8' });

test('should give the same verdicts with --runner-inprocess as with the spawned direct runner, and report it as direct, when --runner is direct-run.mjs (RunnerFlag, Parity)', t => {
  const fx = fixture(t, { head: { 'tests/always.sh': 'exit 0\n' } });
  const slim = out => ({ ...out, tests: out.tests.map(({ head, base, ...r }) => ({ ...r, head: head.exit, base: base.exit })) });
  const [spawned, inproc] = [[], ['--runner-inprocess']].map(extra => spawnProbe(fx, ['--runner', DIRECT_RUN, '--flake', '1', ...extra]));
  assert.equal(inproc.status, 0, inproc.stderr);
  assert.deepEqual(slim(JSON.parse(inproc.stdout)), slim(JSON.parse(spawned.stdout)));
  assert.equal(JSON.parse(inproc.stdout).backend, 'direct');
});

test('should exit 2 naming the fix when --runner-inprocess is given with a runner that is not direct-run.mjs (RunnerFlag)', t => {
  const fx = fixture(t);
  const r = spawnProbe(fx, ['--runner', join(HERE, 'sandbox-run.mjs'), '--runner-inprocess']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^testprobe: --runner-inprocess needs --runner to be the built-in direct-run.mjs of paired-agent-tdd/);
});
