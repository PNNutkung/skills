// Offline checks for mutate.mjs: fixture git repos plus a stub runner, so no real sandbox is needed. Run: node --test mutate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MUTATE = join(HERE, 'mutate.mjs');
const hasPython = spawnSync('python3', ['--version']).status === 0;

// Honors the runner flags, logs its argv, runs the command after `--` in --cwd, then prints the ledger line a real runner prints (ZT-RUN <id> exit=<n>).
// config.json {exit} fakes 86/124 for every call.
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
const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')), fake = cfg.exit;
if (fake) process.exit(fake);
if (cfg.fakeMutantExit && cmd.join(' ').includes('ZT-MUTANT')) process.exit(cfg.fakeMutantExit);
const env = { ...process.env };
for (const kv of vals('--env')) env[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1);
const code = spawnSync(cmd[0], cmd.slice(1), { cwd: vals('--cwd')[0], env, stdio: 'inherit' }).status ?? 1;
process.stderr.write('ZT-RUN stub-' + process.pid + ' exit=' + code + '\\n');
process.exit(code);
`;

const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (repo, files) => {
  for (const [p, c] of Object.entries(files)) {
    const f = join(repo, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
};

const CALC = `def classify(n):
    if n >= 10:
        return "big"
    return "small"


def half(n):
    return n / 2
`;
// pins classify (both sides of the boundary) and says nothing about half
const TEST_CALC = `from src.calc import classify
assert classify(10) == "big"
assert classify(9) == "small"
`;

function fixture(t, { source = CALC, testText = TEST_CALC, extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mut-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  put(repo, { 'README.md': 'x\n' });
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  put(repo, { 'src/calc.py': source, 'tests/test_calc.py': testText, ...extra });
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'head');
  return { dir, repo, base, head: git(repo, 'rev-parse', 'HEAD'), scratch: join(dir, 'scratch') };
}

function mutate(fx, args = [], fake = {}, { cmd = 'python3 {file}', runner } = {}) {
  const sd = join(fx.dir, 'stub');
  mkdirSync(sd, { recursive: true });
  writeFileSync(join(sd, 'stub-runner.mjs'), STUB);
  writeFileSync(join(sd, 'config.json'), JSON.stringify(fake));
  const r = spawnSync(process.execPath, [MUTATE, '--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--scratch', fx.scratch, '--cmd', cmd,
    '--runner', runner ?? join(sd, 'stub-runner.mjs'), '--jobs', '2', ...args], { encoding: 'utf8' });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* usage error */ }
  return { ...r, out, calls: existsSync(join(sd, 'calls.log')) ? readFileSync(join(sd, 'calls.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [] };
}

const skip = !hasPython && 'python3 not available';

test('tests that pin the code kill its mutants; code the tests never touch survives, with a citable run id', { skip }, t => {
  const r = mutate(fixture(t));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.out.mutants.length > 0);
  for (const m of r.out.mutants.filter(m => m.line <= 4)) assert.equal(m.result, 'killed', `${m.file}:${m.line} ${m.op}`);
  const half = r.out.mutants.filter(m => m.line === 8);
  assert.ok(half.length > 0 && half.every(m => m.result === 'survived'), JSON.stringify(half));
  assert.ok(half.every(m => /^stub-\d+$/.test(m.run)), 'a survivor names the sandbox run that decided it');
  assert.ok(r.out.mutants.filter(m => m.result === 'killed').every(m => m.by === 'tests/test_calc.py' && m.exit === 1));
  assert.match(r.out.summary, /mutation: \d+ of \d+ mutants on changed lines/);
  assert.match(r.out.summary, /survived X-[0-9a-f]{8} src\/calc\.py:8 [a-z-]+: .* -> .* \(run stub-\d+\)/);
  assert.equal(r.out.score.total, r.out.mutants.length);
  assert.equal(r.out.score.killed + r.out.score.survived, r.out.score.total);
});

test('mutants carry no full-line payload, only before/after, and every id is unique', { skip }, t => {
  const r = mutate(fixture(t));
  assert.ok(r.out.mutants.every(m => !('newLine' in m) && m.before && m.after && m.before !== m.after));
  assert.equal(new Set(r.out.mutants.map(m => m.id)).size, r.out.mutants.length);
});

test('--max samples deterministically', { skip }, t => {
  const a = mutate(fixture(t), ['--max', '3']), b = mutate(fixture(t), ['--max', '3']);
  assert.equal(a.out.mutants.length, 3);
  assert.deepEqual(a.out.mutants.map(m => m.id), b.out.mutants.map(m => m.id));
  assert.ok(a.out.available > 3);
});

test('--kill-exits: a failure with another exit code is inconclusive, not a kill', { skip }, t => {
  const fx = fixture(t, { testText: 'import sys\nsys.exit(0 if ">= 10" in open("src/calc.py").read() else 2)\n' });
  const strict = mutate(fx, ['--kill-exits', '1']), loose = mutate(fx);
  assert.ok(strict.out.mutants.some(m => m.result === 'inconclusive'));
  assert.ok(!strict.out.mutants.some(m => m.result === 'killed'));
  assert.ok(loose.out.mutants.some(m => m.result === 'killed' && m.exit === 2));
});

test('a test file that already fails on HEAD is ignored; none left means unverifiable', { skip }, t => {
  const r = mutate(fixture(t, { testText: 'assert False\n' }));
  assert.match(r.out.summary, /unverifiable: no changed test file passes on HEAD/);
  assert.ok(r.out.mutants.every(m => m.result === 'unverifiable'));
});

test('unverifiable: runner exit 86 means no sandbox, and nothing was run as a mutant', { skip }, t => {
  const r = mutate(fixture(t), [], { exit: 86 });
  assert.match(r.out.summary, /unverifiable: no sandbox/);
  assert.ok(r.out.mutants.every(m => m.result === 'unverifiable'));
});

test('timeout (124) on a mutant counts as caught and is reported on its own', { skip }, t => {
  const fx = fixture(t, { testText: 'import sys\nsys.exit(0 if ">= 10" in open("src/calc.py").read() else 124)\n' });
  const r = mutate(fx);
  assert.ok(r.out.mutants.some(m => m.result === 'timeout'));
  assert.ok(r.out.score.timeout > 0);
});

test('--budget 0 skips every mutant', { skip }, t => {
  const r = mutate(fixture(t), ['--budget', '0']);
  assert.ok(r.out.mutants.every(m => m.result === 'skipped'));
});

test('python never writes bytecode into the trees: a same-size mutant must run the new code', { skip }, t => {
  const fx = fixture(t);
  const r = mutate(fx);
  assert.ok(r.calls.length > 0 && r.calls.every(a => a.some((x, i) => x === '--env' && a[i + 1] === 'PYTHONDONTWRITEBYTECODE=1')));
  const scratch = realpathSync(fx.scratch);
  for (const d of readdirSync(scratch)) assert.equal(existsSync(join(scratch, d, 'src', '__pycache__')), false, d);
  const sameSize = r.out.mutants.find(m => m.op === 'const-inc' && m.line === 2);
  assert.equal(sameSize.after.length, sameSize.before.length);
  assert.equal(sameSize.result, 'killed');
});

test('a survivor and a killed mutant both carry a quote that the ledger output will contain', { skip }, t => {
  const r = mutate(fixture(t));
  for (const m of r.out.mutants) assert.match(m.quote, new RegExp(`^ZT-MUTANT ${m.id} ${m.file.replace('.', '\\.')}:${m.line} ${m.op} exit=${m.result === 'survived' ? 0 : '[1-9]\\d*'}$`));
  const stamped = r.calls.filter(a => a.at(-1).includes('ZT-MUTANT X-'));
  assert.equal(stamped.length, r.out.mutants.length, 'one stamped run per mutant (one test file); the baseline run is not stamped');
  assert.ok(stamped.every(a => a.at(-1).includes('( ') && a.at(-1).includes('cat ') && a.at(-1).endsWith('exit "$zt"')));
});

const REAL_RUNNER = join(HERE, 'sandbox-run.mjs');
const realSandbox = existsSync(REAL_RUNNER) && spawnSync(process.execPath, [REAL_RUNNER, '--check'], { encoding: 'utf8' }).status === 0;

// An untrusted test can swap a source file for a symlink to anywhere. The tool must never write through it from the HOST: mutants are applied and undone by the
// sandboxed command itself, where the write is refused. (Before the fix the host-side restore overwrote the file the link points to, with the change request's own bytes.)
test('a test that swaps the mutated file for a symlink cannot make the host write outside the tree', { skip: !realSandbox && 'no sandbox on this host' }, t => {
  const fx = fixture(t);
  const outside = join(fx.dir, 'outside.txt');
  writeFileSync(outside, 'SAFE\n');
  put(fx.repo, { 'tests/swap.sh': `rm -f src/calc.py\nln -s '${outside}' src/calc.py\n` });
  git(fx.repo, 'add', '-A'); git(fx.repo, 'commit', '-qm', 'hostile test');
  const r = mutate({ ...fx, head: git(fx.repo, 'rev-parse', 'HEAD') }, ['--tests', 'tests/swap.sh', '--timeout', '30'], {}, { cmd: 'sh {file}', runner: REAL_RUNNER });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(outside, 'utf8'), 'SAFE\n', 'the host wrote through a planted symlink');
  assert.ok(r.out.mutants.length > 0);
});

test('a mutant whose run did not finish cleanly (no stamp: killed, timed out) gets its tree replaced, never reused', { skip }, t => {
  const fx = fixture(t);
  const r = mutate(fx, [], { fakeMutantExit: 124 });
  assert.equal(r.out.score.timeout, r.out.mutants.length);
  const scratch = realpathSync(fx.scratch), dirs = readdirSync(scratch);
  assert.ok(dirs.length <= 2, `${dirs.length} trees left in scratch (one per worker; discarded trees are removed)`);
  for (const d of dirs) {
    assert.equal(readFileSync(join(scratch, d, 'src/calc.py'), 'utf8'), CALC, d);
    assert.equal(existsSync(join(scratch, d, 'src/calc.py.zt-orig')), false, d);
  }
});

test('the repo is never modified, and mutated files are restored in the scratch trees', { skip }, t => {
  const fx = fixture(t);
  const before = git(fx.repo, 'status', '--porcelain');
  mutate(fx);
  assert.equal(git(fx.repo, 'status', '--porcelain'), before);
  const scratch = realpathSync(fx.scratch);
  for (const d of readdirSync(scratch)) assert.equal(readFileSync(join(scratch, d, 'src/calc.py'), 'utf8'), CALC, d);
});

test('every command goes through the runner, with --cwd and --rw on a scratch tree, never the repo', { skip }, t => {
  const fx = fixture(t);
  const r = mutate(fx);
  assert.ok(r.calls.length > 0);
  const scratch = realpathSync(fx.scratch);
  for (const a of r.calls) {
    assert.equal(a[a.indexOf('--cwd') + 1].startsWith(scratch), true);
    assert.equal(a[a.indexOf('--rw') + 1], a[a.indexOf('--cwd') + 1]);
    assert.ok(a.includes('--timeout'));
  }
});

test('nothing to mutate: no changed tests, no changed sources, nothing mutable', { skip }, t => {
  const noTests = fixture(t);
  git(noTests.repo, 'rm', '-q', '--cached', 'tests/test_calc.py');
  git(noTests.repo, 'commit', '-qm', 'drop tests');
  noTests.head = git(noTests.repo, 'rev-parse', 'HEAD');
  assert.match(mutate(noTests).out.summary, /no changed test files/);

  const noSrc = fixture(t);
  git(noSrc.repo, 'rm', '-q', '--cached', 'src/calc.py');
  git(noSrc.repo, 'commit', '-qm', 'drop src');
  noSrc.head = git(noSrc.repo, 'rev-parse', 'HEAD');
  assert.match(mutate(noSrc).out.summary, /no changed source files/);

  assert.match(mutate(fixture(t, { source: '# only a comment\n' })).out.summary, /no mutable changed lines/);
});

test('summary stays within 6 lines', { skip }, t => {
  const many = Array.from({ length: 12 }, (_, i) => `def f${i}(n):\n    return n + ${i + 1}\n`).join('\n');
  const r = mutate(fixture(t, { source: `${CALC}\n${many}` }), ['--max', '40']);
  assert.ok(r.out.summary.split('\n').length <= 6, r.out.summary);
  assert.match(r.out.summary, /more survivors/);
});

test('usage errors exit 2', () => {
  for (const args of [[], ['--repo', '.'], ['--repo', '.', '--base', 'a', '--head', 'b', '--scratch', '/x', '--cmd', 'no placeholder']]) {
    assert.equal(spawnSync(process.execPath, [MUTATE, ...args], { encoding: 'utf8' }).status, 2);
  }
  const bad = spawnSync(process.execPath, [MUTATE, '--repo', '.', '--base', 'a', '--head', 'b', '--scratch', '/x', '--cmd', 'x {file}', '--kill-exits', '0'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

// --files: one commit, no base branch; src/calc.py has exactly 3 mutable lines
const FILES_CALC = `same = a == b
total = a + b
both = same and total
`;
function filesFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mut-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  put(repo, { 'src/calc.py': FILES_CALC, 'tests/test_calc.py': 'print("ok")\n' });
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'only');
  const sd = join(dir, 'stub');
  mkdirSync(sd);
  writeFileSync(join(sd, 'stub-runner.mjs'), STUB);
  writeFileSync(join(sd, 'config.json'), '{}');
  return { repo, scratch: join(dir, 'scratch'), runner: join(sd, 'stub-runner.mjs') };
}
const runMutateRaw = (fx, args) => spawnSync(process.execPath, [MUTATE, '--repo', fx.repo, '--scratch', fx.scratch, '--cmd', 'python3 {file}', '--runner', fx.runner, '--jobs', '2', ...args], { encoding: 'utf8' });
const runMutate = (fx, args) => JSON.parse(runMutateRaw(fx, args).stdout);

test('--files mutates only the named lines and needs no --base', { skip }, t => {
  const out = runMutate(filesFixture(t), ['--files', 'src/calc.py:2-2', '--tests', 'tests/test_calc.py', '--head', 'HEAD']);
  assert.ok(out.mutants.length > 0);
  assert.ok(out.mutants.every(m => m.file === 'src/calc.py' && m.line === 2));
});

test('--files clamps a range past the end of the file', { skip }, t => {
  const out = runMutate(filesFixture(t), ['--files', 'src/calc.py:2-999', '--tests', 'tests/test_calc.py', '--head', 'HEAD']);
  assert.ok(out.mutants.length > 0);
  assert.ok(out.mutants.every(m => m.line >= 2 && m.line <= 3));
});

test('--files with a bare path mutates every line of the file', { skip }, t => {
  const out = runMutate(filesFixture(t), ['--files', 'src/calc.py', '--tests', 'tests/test_calc.py', '--head', 'HEAD']);
  assert.deepEqual([...new Set(out.mutants.map(m => m.line))].sort(), [1, 2, 3]);
});

test('--files without --tests is a usage error', () => {
  const r = runMutateRaw({ repo: '.', scratch: '/x', runner: process.execPath }, ['--files', 'src/calc.py', '--head', 'HEAD']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--tests is required with --files/);
});

test('without --files, --base is still required', () => {
  const r = runMutateRaw({ repo: '.', scratch: '/x', runner: process.execPath }, ['--head', 'HEAD', '--tests', 'tests/test_calc.py']);
  assert.match(r.stderr, /--base is required/);
});

// ---- ZT_MUTATION_BASELINE_REUSE_ENABLED, ZT_MUTATION_BUDGET_STRICT_ENABLED, ZT_TEST_PROCESS_MAX
const TESTPROBE = join(HERE, 'testprobe.mjs');
const FLAGS = { reuse: 'ZT_MUTATION_BASELINE_REUSE_ENABLED', strict: 'ZT_MUTATION_BUDGET_STRICT_ENABLED', max: 'ZT_TEST_PROCESS_MAX' };
const ALL_OFF = { [FLAGS.reuse]: 'false', [FLAGS.strict]: 'false' };
const SLEEP_SEC = 30;

// Like the real runner: the command runs in a process group of its own, SIGTERM kills that group, and the ledger line closes the output (a fixed run id, so
// output is comparable byte for byte). Each run leaves a marker in live/ while it lasts and logs how many markers it saw (peak.log) and its group (groups.log),
// all in STUB_LOG_DIR: one runner path per fixture, as a real caller passes the same runner to testprobe.mjs and mutate.mjs.
const PROC_STUB = `
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.env.STUB_LOG_DIR, a = process.argv.slice(2);
if (a[0] === '--check') { console.log('stub'); process.exit(0); }
appendFileSync(join(dir, 'calls.log'), JSON.stringify(a) + '\\n');
const cut = a.indexOf('--'), flags = a.slice(0, cut), cmd = a.slice(cut + 1);
const vals = k => flags.flatMap((f, i) => (f === k ? [flags[i + 1]] : []));
const live = join(dir, 'live'), me = join(live, String(process.pid));
mkdirSync(live, { recursive: true });
writeFileSync(me, '');
appendFileSync(join(dir, 'peak.log'), readdirSync(live).length + '\\n');
const env = { ...process.env };
for (const kv of vals('--env')) env[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1);
const child = spawn(cmd[0], cmd.slice(1), { cwd: vals('--cwd')[0], env, stdio: 'inherit', detached: true });
appendFileSync(join(dir, 'groups.log'), child.pid + '\\n');
process.on('SIGTERM', () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } });
child.on('exit', code => { rmSync(me, { force: true }); process.stderr.write('ZT-RUN stub exit=' + (code ?? 1) + '\\n'); process.exit(code ?? 1); });
`;

function procStub(fx) {
  const runner = join(fx.dir, 'proc-stub-runner.mjs'), sd = mkdtempSync(join(fx.dir, 'pstub-'));
  if (!existsSync(runner)) writeFileSync(runner, PROC_STUB);
  const lines = name => (existsSync(join(sd, name)) ? readFileSync(join(sd, name), 'utf8').trim().split('\n').filter(Boolean) : []);
  return { runner, logs: sd, calls: () => lines('calls.log').map(l => JSON.parse(l)), peak: () => Math.max(0, ...lines('peak.log').map(Number)), groups: () => lines('groups.log').map(Number) };
}
const flagEnv = (flags, stub) => {
  const env = { ...process.env };
  for (const k of Object.values(FLAGS)) delete env[k];
  return { ...env, ...flags, ...(stub && { STUB_LOG_DIR: stub.logs }) };
};
const common = (fx, stub, cmd) => ['--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--cmd', cmd, '--runner', stub.runner, '--jobs', '2'];
function mutateProc(fx, { args = [], flags = {}, cmd = 'python3 {file}' } = {}) {
  const stub = procStub(fx), t0 = performance.now();
  const r = spawnSync(process.execPath, [MUTATE, ...common(fx, stub, cmd), '--scratch', mkdtempSync(join(fx.dir, 'scr-')), ...args], { encoding: 'utf8', env: flagEnv(flags, stub) });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* usage error */ }
  return { ...r, out, ms: performance.now() - t0, stub };
}
function headRun(fx, { args = [], flags = {}, cmd = 'python3 {file}' } = {}) {
  const stub = procStub(fx), file = join(mkdtempSync(join(fx.dir, 'ho-')), 'head.json');
  const r = spawnSync(process.execPath, [TESTPROBE, ...common(fx, stub, cmd), '--scratch', mkdtempSync(join(fx.dir, 'scr-')), '--head-out', file, ...args], { encoding: 'utf8', env: flagEnv(flags, stub) });
  assert.equal(r.status, 0, r.stderr);
  return file;
}
// argv of every runner call, scratch paths made stable, sorted (runs are concurrent)
const normalCalls = (fx, calls) => {
  const roots = [realpathSync(fx.dir), fx.dir];
  return calls.map(a => a.map(x => roots.reduce((s, root) => s.replaceAll(root, '<D>'), x).replace(/(mut|scr|pstub)-[A-Za-z0-9]{6}/g, '$1-X'))).map(a => JSON.stringify(a)).sort();
};
const baselineCalls = calls => calls.filter(a => !a.at(-1).includes('ZT-MUTANT'));

// captured from mutate.mjs before the three flags existed
const MUTATE_GOLDEN = {
  stdout: "{\"backend\":\"stub\",\"available\":7,\"mutants\":[{\"id\":\"X-70051e88\",\"file\":\"src/calc.py\",\"line\":2,\"op\":\"const-inc\",\"before\":\"if n >= 10:\",\"after\":\"if n >= 11:\",\"result\":\"killed\",\"by\":\"tests/test_calc.py\",\"exit\":1,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-70051e88 src/calc.py:2 const-inc exit=1\"},{\"id\":\"X-9b3f726a\",\"file\":\"src/calc.py\",\"line\":2,\"op\":\"ge-gt\",\"before\":\"if n >= 10:\",\"after\":\"if n > 10:\",\"result\":\"killed\",\"by\":\"tests/test_calc.py\",\"exit\":1,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-9b3f726a src/calc.py:2 ge-gt exit=1\"},{\"id\":\"X-1e026ee2\",\"file\":\"src/calc.py\",\"line\":3,\"op\":\"return-none\",\"before\":\"return \\\"big\\\"\",\"after\":\"return None\",\"result\":\"killed\",\"by\":\"tests/test_calc.py\",\"exit\":1,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-1e026ee2 src/calc.py:3 return-none exit=1\"},{\"id\":\"X-84aedc46\",\"file\":\"src/calc.py\",\"line\":4,\"op\":\"return-none\",\"before\":\"return \\\"small\\\"\",\"after\":\"return None\",\"result\":\"killed\",\"by\":\"tests/test_calc.py\",\"exit\":1,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-84aedc46 src/calc.py:4 return-none exit=1\"},{\"id\":\"X-212b413e\",\"file\":\"src/calc.py\",\"line\":8,\"op\":\"const-inc\",\"before\":\"return n / 2\",\"after\":\"return n / 3\",\"result\":\"survived\",\"exit\":0,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-212b413e src/calc.py:8 const-inc exit=0\"},{\"id\":\"X-f05bb7a9\",\"file\":\"src/calc.py\",\"line\":8,\"op\":\"div-mul\",\"before\":\"return n / 2\",\"after\":\"return n * 2\",\"result\":\"survived\",\"exit\":0,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-f05bb7a9 src/calc.py:8 div-mul exit=0\"},{\"id\":\"X-7199f9de\",\"file\":\"src/calc.py\",\"line\":8,\"op\":\"return-none\",\"before\":\"return n / 2\",\"after\":\"return None\",\"result\":\"survived\",\"exit\":0,\"run\":\"stub\",\"quote\":\"ZT-MUTANT X-7199f9de src/calc.py:8 return-none exit=0\"}],\"tests\":{\"run\":[\"tests/test_calc.py\"],\"notUsable\":[]},\"score\":{\"total\":7,\"killed\":4,\"survived\":3,\"timeout\":0,\"inconclusive\":0,\"skipped\":0,\"unverifiable\":0},\"summary\":\"mutation: 7 of 7 mutants on changed lines: 4 killed, 3 survived\\nsurvived X-212b413e src/calc.py:8 const-inc: return n / 2 -> return n / 3 (run stub)\\nsurvived X-f05bb7a9 src/calc.py:8 div-mul: return n / 2 -> return n * 2 (run stub)\\nsurvived X-7199f9de src/calc.py:8 return-none: return n / 2 -> return None (run stub)\"}\n",
  calls: [
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 1 src/calc.py; printf '%s\\\\n' '    if n > 10:'; tail -n +3 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-9b3f726a src/calc.py:2 ge-gt exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 1 src/calc.py; printf '%s\\\\n' '    if n >= 11:'; tail -n +3 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-70051e88 src/calc.py:2 const-inc exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 2 src/calc.py; printf '%s\\\\n' '        return None'; tail -n +4 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-1e026ee2 src/calc.py:3 return-none exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 3 src/calc.py; printf '%s\\\\n' '    return None'; tail -n +5 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-84aedc46 src/calc.py:4 return-none exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 7 src/calc.py; printf '%s\\\\n' '    return None'; tail -n +9 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-7199f9de src/calc.py:8 return-none exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 7 src/calc.py; printf '%s\\\\n' '    return n * 2'; tail -n +9 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-f05bb7a9 src/calc.py:8 div-mul exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"cp src/calc.py src/calc.py.zt-orig && { head -n 7 src/calc.py; printf '%s\\\\n' '    return n / 3'; tail -n +9 src/calc.py; } > src/calc.py.zt-new && cat src/calc.py.zt-new > src/calc.py || { rm -f src/calc.py.zt-orig src/calc.py.zt-new; exit 125; }; ( python3 tests/test_calc.py ); zt=$?; cat src/calc.py.zt-orig > src/calc.py; rm -f src/calc.py.zt-orig src/calc.py.zt-new; printf '%s%s\\\\n' 'ZT-MUTANT X-212b413e src/calc.py:8 const-inc exit=' \\\"$zt\\\"; exit \\\"$zt\\\"\"]",
    "[\"--cwd\",\"<D>/scr-X/mut-X\",\"--rw\",\"<D>/scr-X/mut-X\",\"--timeout\",\"120\",\"--env\",\"PYTHONDONTWRITEBYTECODE=1\",\"--env\",\"PYTHONPATH=<D>/scr-X/mut-X\",\"--\",\"sh\",\"-c\",\"python3 tests/test_calc.py\"]",
  ],
};

test('should print byte-identical output and make the same runner calls as before when every new flag is off', { skip }, t => {
  const fx = fixture(t);
  const variants = [ALL_OFF, { ...ALL_OFF, [FLAGS.max]: 'unlimited' }, { ...ALL_OFF, [FLAGS.max]: '' }];
  for (const flags of variants) {
    const r = mutateProc(fx, { flags });
    assert.equal(r.status, 0, r.stderr);
    const got = { stdout: r.stdout, calls: normalCalls(fx, r.stub.calls()) };
    assert.equal(got.stdout, MUTATE_GOLDEN.stdout, JSON.stringify(flags));
    assert.deepEqual(got.calls, MUTATE_GOLDEN.calls, JSON.stringify(flags));
  }
});

const goldenMutants = () => JSON.parse(MUTATE_GOLDEN.stdout).mutants;

test('should take the baseline from testprobe --head-out when it ran on the same tree and command, and run no baseline of its own', { skip }, t => {
  const fx = fixture(t);
  const file = headRun(fx);
  const r = mutateProc(fx, { args: ['--baseline-from', file] });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(baselineCalls(r.stub.calls()), [], 'no unmutated run');
  assert.deepEqual(r.out.mutants, goldenMutants(), 'same verdicts as with its own baseline');
  assert.deepEqual(r.out.baseline, { reused: true });
});

test('should trust a matching head run that says the test fails on HEAD, and run nothing', { skip }, t => {
  const fx = fixture(t, { testText: 'assert False\n' });
  const r = mutateProc(fx, { args: ['--baseline-from', headRun(fx)] });
  assert.match(r.out.summary, /unverifiable: no changed test file passes on HEAD/);
  assert.deepEqual(r.stub.calls(), []);
});

test('should run its own baseline when the head run is from another tree, another command or another environment', { skip }, t => {
  const fx = fixture(t);
  const oldTree = headRun(fx);
  put(fx.repo, { 'tests/test_calc.py': `${TEST_CALC}# edited\n` });
  git(fx.repo, 'add', '-A'); git(fx.repo, 'commit', '-qm', 'edit test');
  const moved = { ...fx, head: git(fx.repo, 'rev-parse', 'HEAD') };
  const cases = [
    [moved, oldTree, {}],
    [fx, headRun(fx, { cmd: 'python3 -B {file}' }), {}],
    [fx, headRun(fx, { args: ['--env', 'A=1'] }), {}],
    [fx, headRun(fx, { args: ['--timeout', '30'] }), {}],
  ];
  for (const [f, file, flags] of cases) {
    const r = mutateProc(f, { args: ['--baseline-from', file], flags });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(baselineCalls(r.stub.calls()).length, 1, file);
    assert.deepEqual(r.out.baseline, { reused: false, reason: 'the head run is from another tree, command or environment' });
  }
});

test('should run its own baseline when the head run file is missing, unreadable or garbled', { skip }, t => {
  const fx = fixture(t);
  const good = readFileSync(headRun(fx), 'utf8');
  const dir = mkdtempSync(join(fx.dir, 'bad-'));
  const cases = [
    [join(dir, 'missing.json'), null, 'no head run file'],
    [dir, null, 'the head run file cannot be read'],
    [join(dir, 'cut.json'), good.slice(0, good.length >> 1), 'the head run file is not JSON'],
    [join(dir, 'schema.json'), good.replace('"schema":1', '"schema":2'), 'the head run file has another schema'],
    [join(dir, 'tests.json'), good.replace('"tests/test_calc.py"', '"tests/other.py"'), 'the head run does not cover every test file'],
  ];
  for (const [file, text, reason] of cases) {
    if (text !== null) writeFileSync(file, text);
    const r = mutateProc(fx, { args: ['--baseline-from', file] });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(baselineCalls(r.stub.calls()).length, 1, reason);
    assert.deepEqual(r.out.baseline, { reused: false, reason });
    assert.deepEqual(r.out.mutants, goldenMutants());
  }
});

test('should ignore --baseline-from and print exactly what it printed before when ZT_MUTATION_BASELINE_REUSE_ENABLED=false', { skip }, t => {
  const fx = fixture(t);
  const r = mutateProc(fx, { args: ['--baseline-from', headRun(fx)], flags: ALL_OFF });
  assert.equal(r.stdout, MUTATE_GOLDEN.stdout);
  assert.deepEqual(normalCalls(fx, r.stub.calls()), MUTATE_GOLDEN.calls);
});

// every changed line of classify() makes the test hang when mutated; half() is never tested, so its mutants survive at once
const HANGS = `import time
from src.calc import classify
if classify(10) != "big" or classify(9) != "small":
    time.sleep(${SLEEP_SEC})
`;
const groupAlive = g => { try { process.kill(-g, 0); return true; } catch { return false; } };
const REAP_WAIT_MS = 3000;
// killed processes are reaped asynchronously: poll until every group is gone or the wait is over
async function survivors(groups) {
  const until = performance.now() + REAP_WAIT_MS;
  while (groups.some(groupAlive) && performance.now() < until) await new Promise(r => setTimeout(r, 50));
  return groups.filter(groupAlive);
}

test('should stop mutants already running when the budget runs out, kill their process trees, and report them as skipped', { skip }, async t => {
  const fx = fixture(t, { testText: HANGS });
  const r = mutateProc(fx, { args: ['--budget', '1', '--timeout', String(SLEEP_SEC * 2)] });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.ms < SLEEP_SEC * 1000 / 2, `took ${Math.round(r.ms)} ms: running mutants were not stopped`);
  const { score, mutants } = r.out;
  assert.deepEqual([score.killed, score.timeout, score.inconclusive], [0, 0, 0]);
  assert.ok(mutants.filter(m => m.line <= 4).every(m => m.result === 'skipped' && Object.keys(m).join() === 'id,file,line,op,before,after,result'), JSON.stringify(mutants));
  assert.ok(mutants.filter(m => m.result === 'survived').every(m => m.line === 8));
  assert.match(r.out.summary, new RegExp(`${score.skipped} skipped`));
  assert.ok(score.skipped >= 1);
  assert.deepEqual(await survivors(r.stub.groups()), [], 'a test process outlived the run');
});

test('should keep the budget check before a mutant starts only when ZT_MUTATION_BUDGET_STRICT_ENABLED=false', { skip }, t => {
  const fx = fixture(t);
  for (const flags of [{ [FLAGS.strict]: 'false' }, {}]) {
    const r = mutateProc(fx, { args: ['--budget', '0'], flags });
    assert.ok(r.out.mutants.every(m => m.result === 'skipped'), JSON.stringify(flags));
    assert.equal(r.stub.calls().length, 1, 'only the baseline ran');
  }
});

test('should never run more test processes at once than ZT_TEST_PROCESS_MAX, with the same verdicts', { skip }, t => {
  const fx = fixture(t);
  for (const max of ['1', '2']) {
    const r = mutateProc(fx, { args: ['--jobs', '4'], flags: { [FLAGS.max]: max } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stub.peak() >= 1 && r.stub.peak() <= Number(max), `peak ${r.stub.peak()} with max ${max}`);
    assert.deepEqual(r.out.mutants, goldenMutants());
  }
});

test('should combine baseline reuse with the process cap without losing a verdict', { skip }, t => {
  const fx = fixture(t);
  const r = mutateProc(fx, { args: ['--jobs', '4', '--baseline-from', headRun(fx, { flags: { [FLAGS.max]: '1' } })], flags: { [FLAGS.max]: '1' } });
  assert.equal(r.stub.peak(), 1);
  assert.deepEqual(r.out.mutants, goldenMutants());
  assert.deepEqual(r.out.baseline, { reused: true });
});

// a seeded generator, so a failing case can be replayed
const rng = seed => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const PIECES = ['true', 'false', 'TRUE', 'False', ' ', '1', '0', 'yes', 'unlimited', 'x', '-', '.', '12', '00'];
const word = rand => Array.from({ length: 1 + Math.floor(rand() * 3) }, () => PIECES[Math.floor(rand() * PIECES.length)]).join('');
const validOnOff = v => ['', 'true', 'false'].includes(v.trim().toLowerCase());
const validMax = v => { const s = v.trim(); return !s || s.toLowerCase() === 'unlimited' || (/^\d+$/.test(s) && Number(s) > 0); };

test('should stop with exit 2 naming the fix for any invalid flag value, and accept every valid one (fuzz)', t => {
  const rand = rng(1122);
  const dir = mkdtempSync(join(tmpdir(), 'mut-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const args = ['--repo', join(dir, 'no-repo'), '--base', 'a', '--head', 'b', '--scratch', join(dir, 's'), '--cmd', 'x {file}', '--runner', MUTATE];
  for (let i = 0; i < 30; i++) {
    const flags = { [FLAGS.reuse]: word(rand), [FLAGS.strict]: word(rand), [FLAGS.max]: word(rand) };
    const bad = [[FLAGS.reuse, validOnOff], [FLAGS.strict, validOnOff], [FLAGS.max, validMax]].filter(([k, ok]) => !ok(flags[k])).map(([k]) => k);
    const r = spawnSync(process.execPath, [MUTATE, ...args], { encoding: 'utf8', env: flagEnv(flags) });
    assert.equal(r.status, 2, JSON.stringify(flags));
    assert.equal(r.stdout, '');
    if (bad.length) assert.match(r.stderr, new RegExp(`^mutate: (${bad.join('|')})=.* is not valid: use `), JSON.stringify(flags));
    else assert.doesNotMatch(r.stderr, /is not valid/, JSON.stringify(flags));
  }
});
