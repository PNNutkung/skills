// Unit tests for run-tests.mjs (order, args, concurrency, timings file), its CLI with a real node --test, and the CI workflow that calls it.
// Run: node --test rules/checks/run-tests.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCURRENCY_FLAG, FlagError, chooseConcurrency, defaultConcurrency, mergeTimes, nodeArgs, orderFiles, parseArgs, renderTimes } from './run-tests.mjs';
import { DEFAULT_SECONDS, FLAG } from './test-time.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const RUN = join(HERE, 'run-tests.mjs');
// a node --test started from inside a test sees NODE_TEST_CONTEXT (even empty) and runs no files of its own
const cleanEnv = (extra = {}) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT' && k !== CONCURRENCY_FLAG)), ...extra });
const tmp = t => { const d = mkdtempSync(join(tmpdir(), 'rt-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

test('should put files missing from the timings first and the rest slowest first when it orders test files (Concurrency)', () => {
  const times = { 'a.test.mjs': 1000, 'b.test.mjs': 9000, 'c.test.mjs': 5000, 'd.test.mjs': 5000 };
  assert.deepEqual(orderFiles(['a.test.mjs', 'new2.test.mjs', 'd.test.mjs', 'b.test.mjs', 'new1.test.mjs', 'c.test.mjs'], times),
    ['new2.test.mjs', 'new1.test.mjs', 'b.test.mjs', 'd.test.mjs', 'c.test.mjs', 'a.test.mjs']);
  assert.deepEqual(orderFiles([], times), []);
  assert.deepEqual(orderFiles(['x.test.mjs', 'y.test.mjs'], {}), ['x.test.mjs', 'y.test.mjs'], 'no timings: the listed order');
  assert.deepEqual(orderFiles(['./sub/b.test.mjs', 'a.test.mjs'], { 'a.test.mjs': 1, 'sub/b.test.mjs': 2 }, f => f.replace(/^\.\//, '')), ['./sub/b.test.mjs', 'a.test.mjs'], 'looked up by key');
});

test('should derive the concurrency from the cores and read the override when it chooses how many files run at once (Concurrency)', () => {
  for (const cores of [1, 2, 3, 4, 8, 16]) {
    assert.equal(chooseConcurrency({}, cores), defaultConcurrency(cores));
    assert.ok(defaultConcurrency(cores) > Math.max(1, cores - 1), `more than node's default at ${cores} cores`);
  }
  assert.equal(defaultConcurrency(4), 5);
  assert.equal(chooseConcurrency({ [CONCURRENCY_FLAG]: ' 9 ' }, 4), 9);
  assert.equal(chooseConcurrency({ [CONCURRENCY_FLAG]: '' }, 4), 5, 'empty is the default');
});

test('should throw a FlagError naming the fix when the concurrency override is not a whole number above 0 (Concurrency)', () => {
  for (const v of ['0', '-2', '1.5', 'unlimited', 'many', '4x']) {
    assert.throws(() => chooseConcurrency({ [CONCURRENCY_FLAG]: v }, 4), e => e instanceof FlagError && e.message === `${CONCURRENCY_FLAG}=${v} is not valid: use a whole number above 0`, v);
  }
});

test('should split test files from node options and keep option values given after a space when it reads its arguments (Concurrency)', () => {
  assert.deepEqual(parseArgs(['--test-reporter=spec', '--test-reporter', './rules/checks/test-time.mjs', '--test-reporter-destination', 'out.jsonl', 'a.test.mjs', '--test-name-pattern=x', 'b.test.mjs']),
    { files: ['a.test.mjs', 'b.test.mjs'], pass: ['--test-reporter=spec', '--test-reporter', './rules/checks/test-time.mjs', '--test-reporter-destination', 'out.jsonl', '--test-name-pattern=x'], writeTimes: null, times: null, dryRun: false });
  assert.deepEqual(parseArgs([]), { files: [], pass: [], writeTimes: null, times: null, dryRun: false });
  assert.deepEqual(parseArgs(['--write-times', 't.jsonl', '--times=x.json']), { files: [], pass: [], writeTimes: 't.jsonl', times: 'x.json', dryRun: false });
  assert.deepEqual(parseArgs(['--write-times=t.jsonl', '--dry-run', '--times', 'y.json']), { files: [], pass: [], writeTimes: 't.jsonl', times: 'y.json', dryRun: true });
  assert.throws(() => parseArgs(['--write-times']), /--write-times needs a file/);
  assert.throws(() => parseArgs(['--times']), /--times needs a file/);
});

test('should pass every option through and set the concurrency unless one is given when it builds the node command (Concurrency)', () => {
  assert.deepEqual(nodeArgs({ files: ['b', 'a'], pass: ['--test-reporter=dot'], concurrency: 6 }), ['--test', '--test-concurrency=6', '--test-reporter=dot', 'b', 'a']);
  assert.deepEqual(nodeArgs({ files: ['a'], pass: ['--test-concurrency=2'], concurrency: 6 }), ['--test', '--test-concurrency=2', 'a'], 'an explicit option wins');
  assert.deepEqual(nodeArgs({ files: ['a'], pass: ['--test-concurrency', '3'], concurrency: 6 }), ['--test', '--test-concurrency', '3', 'a']);
});

test('should keep tracked files, take the new times and write sorted rounded keys when it refreshes the timings file', () => {
  const merged = mergeTimes({ 'old.test.mjs': 100, 'gone.test.mjs': 5, 'kept.test.mjs': 7 }, [{ file: 'old.test.mjs', ms: 2500.6 }, { file: 'new.test.mjs', ms: 10 }], ['old.test.mjs', 'kept.test.mjs', 'new.test.mjs']);
  assert.deepEqual(merged, { 'kept.test.mjs': 7, 'new.test.mjs': 10, 'old.test.mjs': 2501 });
  assert.equal(renderTimes({ 'b.test.mjs': 2, 'a.test.mjs': 1.4 }), '{\n  "a.test.mjs": 1,\n  "b.test.mjs": 2\n}\n');
  assert.equal(renderTimes(merged), renderTimes(JSON.parse(renderTimes(merged))), 'stable when written again');
});

// New or renamed files only start first until the next refresh, so this asks for most files, not every one.
test('should hold a time for most tracked test files in sorted rounded form when the timings file is committed (Concurrency)', () => {
  const times = JSON.parse(readFileSync(join(HERE, 'test-times.json'), 'utf8'));
  const tracked = git(ROOT, 'ls-files', '*.test.mjs').stdout.trim().split('\n').filter(Boolean);
  const missing = tracked.filter(f => !(f in times));
  assert.ok(missing.length <= tracked.length * 0.2, `refresh rules/checks/test-times.json (rules/performance.md): missing ${missing.join(', ')}`);
  for (const [f, ms] of Object.entries(times)) assert.ok(Number.isInteger(ms) && ms >= 0, f);
  assert.equal(readFileSync(join(HERE, 'test-times.json'), 'utf8'), renderTimes(times), 'sorted keys, rounded ms');
});

test('should run every listed test file slowest first, pass reporters through and exit with the node exit code when it runs a real node --test (Concurrency, NoSkip)', t => {
  const d = tmp(t);
  git(d, 'init', '-q');
  const ok = name => `import { test } from 'node:test';\ntest('${name}', () => { process.stdout.write('RAN ${name}\\n'); });\n`;
  mkdirSync(join(d, 'sub'));
  writeFileSync(join(d, 'fast.test.mjs'), ok('fast'));
  writeFileSync(join(d, 'sub', 'slow.test.mjs'), ok('slow'));
  writeFileSync(join(d, 'new.test.mjs'), ok('new'));
  writeFileSync(join(d, 'helper.mjs'), 'export {};\n');
  git(d, 'add', '.');
  writeFileSync(join(d, 'times.json'), renderTimes({ 'fast.test.mjs': 10, 'sub/slow.test.mjs': 9000 }));
  const run = (args, env = {}) => spawnSync(process.execPath, [RUN, '--times', 'times.json', ...args], { cwd: d, encoding: 'utf8', env: cleanEnv(env) });
  const dry = run(['--test-reporter=dot', '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.concurrency, defaultConcurrency(plan.cores));
  assert.deepEqual(plan.args, ['--test', `--test-concurrency=${plan.concurrency}`, '--test-reporter=dot', 'new.test.mjs', 'sub/slow.test.mjs', 'fast.test.mjs']);
  const r = run(['--test-reporter=tap', '--test-reporter', join(HERE, 'test-time.mjs'), '--test-reporter-destination=stdout', '--test-reporter-destination', 'tt.jsonl'], { [CONCURRENCY_FLAG]: '2' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /# pass 3\n/);
  assert.match(r.stdout, /# skipped 0\n/);
  assert.deepEqual(readFileSync(join(d, 'tt.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l).file).filter(Boolean).sort(), ['fast.test.mjs', 'new.test.mjs', 'sub/slow.test.mjs']);
  writeFileSync(join(d, 'bad.test.mjs'), "import { test } from 'node:test';\ntest('bad', () => { throw new Error('no'); });\n");
  const one = run(['bad.test.mjs']);
  assert.equal(one.status, 1, 'a failing file given as an argument fails the run');
  const bad = run([], { [CONCURRENCY_FLAG]: 'unlimited' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /CHECKS_TEST_CONCURRENCY_MAX=unlimited is not valid: use a whole number above 0/);
});

test('should rewrite the timings file from a test-time reporter output when it runs with --write-times', t => {
  const d = tmp(t);
  git(d, 'init', '-q');
  writeFileSync(join(d, 'a.test.mjs'), '');
  writeFileSync(join(d, 'b.test.mjs'), '');
  git(d, 'add', '.');
  writeFileSync(join(d, 'times.json'), renderTimes({ 'a.test.mjs': 1, 'gone.test.mjs': 2 }));
  writeFileSync(join(d, 'tt.jsonl'), [{ file: 'b.test.mjs', ms: 1234.4 }, { file: 'a.test.mjs', ms: 50 }, { suite: 2000 }].map(o => JSON.stringify(o)).join('\n') + '\n');
  const r = spawnSync(process.execPath, [RUN, '--write-times', 'tt.jsonl', '--times', 'times.json'], { cwd: d, encoding: 'utf8', env: cleanEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(d, 'times.json'), 'utf8'), '{\n  "a.test.mjs": 50,\n  "b.test.mjs": 1234\n}\n');
  writeFileSync(join(d, 'empty.jsonl'), '');
  const e = spawnSync(process.execPath, [RUN, '--write-times', 'empty.jsonl', '--times', 'times.json'], { cwd: d, encoding: 'utf8', env: cleanEnv() });
  assert.equal(e.status, 2);
  assert.match(e.stderr, /no test file timings/);
});

test('should run every CI test step through run-tests.mjs with no filter and keep the 30 s and 120 s caps when it reads the workflow (Concurrency, NoSkip)', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'test.yml'), 'utf8');
  const steps = yml.split(/\n(?=\s+- name: )/).filter(s => /- name: Run tests\b/.test(s));
  assert.equal(steps.length, 3, 'test, asdf and wsl jobs');
  for (const s of steps) {
    assert.match(s, /node rules\/checks\/run-tests\.mjs/);
    assert.doesNotMatch(s, /xargs -0 node --test|--test-name-pattern|--test-skip-pattern|--test-only|--test-shard|--test-concurrency/);
  }
  assert.match(steps[0], /--test-reporter=spec --test-reporter-destination=stdout/);
  assert.match(steps[0], /--test-reporter=\.\/rules\/checks\/test-time\.mjs --test-reporter-destination=test-time\.jsonl/);
  assert.match(steps[1], /command -v node \| grep -q '\/\.asdf\/shims\/node'/);
  assert.match(yml, /node rules\/checks\/test-time\.mjs test-time\.jsonl/);
  assert.deepEqual([DEFAULT_SECONDS.file, DEFAULT_SECONDS.suite], [30, 120]);
  for (const name of [FLAG.file, FLAG.suite]) assert.ok(!yml.includes(name), `${name} stays unset in CI`);
  assert.match(yml, /uses: actions\/upload-artifact@v\d+\n[\s\S]*?path: test-time\.jsonl\n[\s\S]*?if-no-files-found: ignore/);
});

test('should list every existing tracked test file when it is given no file in this repo (NoSkip)', () => {
  const r = spawnSync(process.execPath, [RUN, '--dry-run'], { cwd: ROOT, encoding: 'utf8', env: cleanEnv() });
  assert.equal(r.status, 0, r.stderr);
  const files = new Set(JSON.parse(r.stdout).args.filter(a => !a.startsWith('-')));
  const tracked = git(ROOT, 'ls-files', '*.test.mjs').stdout.trim().split('\n').filter(f => f && existsSync(join(ROOT, f)));
  assert.deepEqual(tracked.filter(f => !files.has(f)), []);
});

test('should list the tracked and the new untracked test files, not ignored or deleted ones, once each, when it is given no file (NoSkip)', t => {
  const d = tmp(t);
  git(d, 'init', '-q');
  for (const f of ['kept.test.mjs', 'deleted.test.mjs', 'new.test.mjs', 'ignored.test.mjs', 'helper.mjs']) writeFileSync(join(d, f), '');
  writeFileSync(join(d, '.gitignore'), 'ignored.test.mjs\n');
  git(d, 'add', 'kept.test.mjs', 'deleted.test.mjs', '.gitignore');
  rmSync(join(d, 'deleted.test.mjs'));
  const r = spawnSync(process.execPath, [RUN, '--dry-run', '--times', 'none.json'], { cwd: d, encoding: 'utf8', env: cleanEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).args.filter(a => !a.startsWith('-')).sort(), ['kept.test.mjs', 'new.test.mjs']);
});

test('should stop the node child and exit with its code when only run-tests.mjs gets SIGINT or SIGTERM (Concurrency)', async t => {
  const d = tmp(t);
  git(d, 'init', '-q');
  writeFileSync(join(d, 'slow.test.mjs'), "import { test } from 'node:test';\nimport { writeFileSync } from 'node:fs';\ntest('slow', async () => { writeFileSync('started', ''); await new Promise(r => setTimeout(r, 60000)); });\n");
  for (const sig of ['SIGINT', 'SIGTERM']) {
    rmSync(join(d, 'started'), { force: true });
    const p = spawn(process.execPath, [RUN, '--times', 'none.json', '--test-reporter=dot'], { cwd: d, env: cleanEnv(), stdio: 'ignore' });
    const ended = new Promise(r => p.on('close', (code, s) => r({ code, s })));
    const until = performance.now() + 15000;
    while (!existsSync(join(d, 'started')) && performance.now() < until) await new Promise(r => setTimeout(r, 50));
    p.kill(sig);
    const end = await Promise.race([ended, new Promise(r => setTimeout(() => r('hung'), 10000))]);
    if (end === 'hung') p.kill('SIGKILL');
    assert.notEqual(end, 'hung', `${sig}: run-tests.mjs ended`);
    assert.ok(Number.isInteger(end.code) && end.code !== 0, `${sig}: the child's failing exit code, got ${JSON.stringify(end)}`);
  }
});
