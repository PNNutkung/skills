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
