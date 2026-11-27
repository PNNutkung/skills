// Unit tests for skills/mutation/proc.mjs (ADR 0011 Interface, A18): repo-relative paths, editable-install roots, git access to a change, the scratch-copy helpers
// (ensureDir, clear, restore), runIn's result fields (tail, sec), its backstop timers (checked with mocked timers, so no test waits for them), and the head run file.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, put, tempDir } from './fixtures/repo.mjs';
import { HEAD_RUN_REFUSED, TEST, baselineFrom, changes, clear, editableRoots, ensureDir, extract, gitOut, headRunDoc, isSource, rel, restore, runIn } from './proc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const realSetTimeout = setTimeout; // captured before any test mocks the timers
const sleep = ms => new Promise(r => realSetTimeout(r, ms));
const PENDING = Symbol('pending');
const settled = async (p, ms) => Promise.race([p, new Promise(r => realSetTimeout(r, ms, PENDING).unref())]);

// ---------------------------------------------------------------- isSource, rel, editableRoots, gitOut, changes

test('should say not source when a file sits under a fixtures/ folder at any depth (Proc happy)', () => {
  for (const p of ['skills/mutation/fixtures/repo.mjs', 'fixtures/a.js', 'pkg/test-support/fixtures/deep/b.py']) assert.equal(isSource(p), false, p);
});

test('should say source when fixtures is only part of a file name or a folder is named fixture (Proc edge)', () => {
  for (const p of ['src/fixtures.mjs', 'src/fixtures-x/a.mjs', 'a/fixture/b.js', 'src/myfixtures/c.js']) assert.equal(isSource(p), true, p);
});

test('should keep TEST matching what zero-trust-review triage.py matches when a fixtures file is checked (Proc fail)', () => {
  assert.equal(TEST.test('skills/mutation/fixtures/repo.mjs'), false, 'fixtures are not tests: TEST stays as triage.py has it');
  assert.equal(TEST.test('skills/mutation/proc.test.mjs'), true);
});

test('should refuse the repo root, an absolute path and a path that climbs out when a path is made repo-relative (Proc fail)', () => {
  for (const p of ['.', '', './', '/etc/passwd', 'a/../..', '../x']) assert.throws(() => rel(p), /path must stay inside the repo/, JSON.stringify(p));
  assert.equal(rel('a/./b/'), 'a/b');
});

test('should refuse the filesystem root with the same error as other paths outside the repo when a path is made repo-relative (Proc fail)', () => {
  for (const p of ['/', '//', '///']) assert.throws(() => rel(p), { message: `path must stay inside the repo: ${p}` }, JSON.stringify(p));
});

test('should grant only the directories inside the repo that a .pth file names by absolute path when editable roots are found (Proc happy)', t => {
  const { dir } = tempDir(t, 'mutation-proc-');
  const repo = join(dir, 'repo'), venv = join(repo, '.venv'), sp = join(venv, 'lib', 'python3.12', 'site-packages');
  for (const d of [join(repo, 'pkg'), join(repo, 'other'), join(dir, 'repo2', 'pkg'), join(dir, 'outside'), sp]) mkdirSync(d, { recursive: true });
  writeFileSync(join(repo, 'file.txt'), 'x');
  writeFileSync(join(sp, 'a.pth'), [
    join(repo, 'pkg'), // inside: granted
    'other', // relative: ignored
    join(dir, 'repo2', 'pkg'), // a sibling whose name starts with the repo's: outside
    join(dir, 'outside'), // outside
    venv, // the linked env itself: already granted
    join(repo, 'file.txt'), // not a directory
    join(repo, 'missing'), // missing
    'import sys',
  ].join('\n'));
  assert.deepEqual(editableRoots([realpathSync(venv)], repo), [realpathSync(join(repo, 'pkg'))]);
});

// The 256 MiB cap is read from the options gitOut hands execFileSync, in a child node with node:child_process mocked: a real run past the cap would hold
// 256 MiB in this process (about 580 MB RSS), too much for parallel CI runners.
const GIT_CALL = `import { mock } from 'node:test';
import * as cp from 'node:child_process';
mock.module('node:child_process', { namedExports: { ...cp, execFileSync: (cmd, args, o) => { console.log(JSON.stringify({ cmd, args, maxBuffer: o.maxBuffer, locks: o.env.GIT_OPTIONAL_LOCKS })); return Buffer.from(''); } } });
const { gitOut } = await import(process.argv[1]);
gitOut('/r', ['status']);`;

test('should run git with a 256 MiB output cap and no optional locks when git is run (Proc edge)', t => {
  const { repo } = tempDir(t, 'mutation-proc-');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  assert.equal(gitOut(repo, ['-c', 'alias.big=!head -c 1024 /dev/zero', 'big']).length, 1024);
  const r = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--no-warnings', '--input-type=module', '-e', GIT_CALL, join(HERE, 'proc.mjs')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { cmd: 'git', args: ['-C', '/r', 'status'], maxBuffer: 256 * 1024 * 1024, locks: '0' });
});

// base: a.txt (644) and run.sh (755); head: both changed and new.txt added
function changeRepo(t) {
  const fx = tempDir(t, 'mutation-proc-');
  mkdirSync(fx.repo);
  git(fx.repo, 'init', '-q');
  put(fx.repo, { 'a.txt': 'base a\n', 'run.sh': 'echo base\n' });
  chmodSync(join(fx.repo, 'run.sh'), 0o755);
  git(fx.repo, 'add', '-A');
  git(fx.repo, 'commit', '-qm', 'base');
  const base = git(fx.repo, 'rev-parse', 'HEAD');
  put(fx.repo, { 'a.txt': 'head a\n', 'run.sh': 'echo head\n', 'new.txt': 'new\n' });
  git(fx.repo, 'add', '-A');
  git(fx.repo, 'commit', '-qm', 'head');
  return { ...fx, base, head: git(fx.repo, 'rev-parse', 'HEAD') };
}

test('should give the old-side mode, blob and status of every changed path when the change is listed (Proc happy)', t => {
  const fx = changeRepo(t);
  const blob = p => git(fx.repo, 'rev-parse', `${fx.base}:${p}`);
  assert.deepEqual(changes(fx.repo, fx.base, fx.head), [
    { path: 'a.txt', mode: '100644', sha: blob('a.txt'), status: 'M' },
    { path: 'new.txt', mode: '000000', sha: '0'.repeat(40), status: 'A' },
    { path: 'run.sh', mode: '100755', sha: blob('run.sh'), status: 'M' },
  ]);
});

test('should put back the base content and file modes and delete added files when a head copy is restored (Proc happy)', async t => {
  const fx = changeRepo(t);
  mkdirSync(fx.scratch);
  await extract(fx.repo, fx.head, fx.scratch);
  restore(fx.repo, fx.scratch, changes(fx.repo, fx.base, fx.head));
  const mode = p => statSync(join(fx.scratch, p)).mode & 0o777;
  assert.deepEqual([readFileSync(join(fx.scratch, 'a.txt'), 'utf8'), mode('a.txt')], ['base a\n', 0o644]);
  assert.deepEqual([readFileSync(join(fx.scratch, 'run.sh'), 'utf8'), mode('run.sh')], ['echo base\n', 0o755]);
  assert.equal(existsSync(join(fx.scratch, 'new.txt')), false);
});

// ---------------------------------------------------------------- ensureDir, clear

test('should create every missing directory of a nested path when a directory is ensured (Proc happy)', t => {
  const { dir } = tempDir(t, 'mutation-proc-');
  ensureDir(dir, 'a/b/c');
  ensureDir(dir, 'a/./b/d/');
  for (const p of ['a/b/c', 'a/b/d']) assert.ok(statSync(join(dir, p)).isDirectory(), p);
});

test('should create nothing, not even the root, when the path names the root itself (Proc edge)', t => {
  const { dir } = tempDir(t, 'mutation-proc-');
  const root = join(dir, 'not-yet');
  for (const p of ['.', '', './.']) ensureDir(root, p);
  assert.equal(existsSync(root), false);
});

test('should remove a whole directory tree when a path is cleared (Proc happy)', t => {
  const { dir } = tempDir(t, 'mutation-proc-');
  put(dir, { 'd/sub/x.txt': 'x', 'd/y.txt': 'y', 'keep.txt': 'k' });
  clear(dir, 'd');
  clear(dir, 'missing/deeper');
  assert.deepEqual([existsSync(join(dir, 'd')), existsSync(join(dir, 'keep.txt')), statSync(join(dir, 'missing')).isDirectory()], [false, true, true]);
});

// ---------------------------------------------------------------- runIn: tail and sec

const inproc = (out, { exit = 0, onStart = () => {} } = {}) => async o => { onStart(o); o.onData(out); return { exit }; };
const O = more => ({ env: [], ro: [], timeout: 5, ...more });

test('should keep the last 200 characters of the output when no tail length is asked for (Proc edge)', async () => {
  const out = `${'a'.repeat(100)}${'b'.repeat(300)}`;
  assert.equal((await runIn(O({ inproc: inproc(out) }), '/w', 'true')).tail, 'b'.repeat(200));
});

test('should keep the last o.tail characters before trailing blank output when the output ends in a long run of spaces (Proc edge)', async t => {
  // the raw buffer holds 4 x o.tail characters: 35 trailing spaces leave only 5 of the 10 As in it
  const out = `${'A'.repeat(10)}${' '.repeat(35)}`;
  assert.equal((await runIn(O({ tail: 10, inproc: inproc(out) }), '/w', 'true')).tail, 'AAAAA');
  const { dir } = tempDir(t, 'mutation-proc-');
  const runner = join(dir, 'runner.mjs');
  writeFileSync(runner, `process.stdout.write(${JSON.stringify(out)});\n`);
  assert.equal((await runIn(O({ tail: 10, runner }), dir, 'true')).tail, 'AAAAA');
});

test('should report the run time in seconds rounded to a tenth when a command runs in-process or through the runner (Proc happy)', async t => {
  let now = 1_000_000;
  t.mock.method(performance, 'now', () => now);
  const r = await runIn(O({ inproc: inproc('', { onStart: () => { now += 12_345; } }) }), '/w', 'true');
  assert.equal(r.sec, 12.3);
  const { dir } = tempDir(t, 'mutation-proc-');
  const runner = join(dir, 'runner.mjs');
  writeFileSync(runner, 'process.exit(0);\n');
  now = 2_000_000;
  const pending = runIn(O({ runner }), dir, 'true');
  now += 7_960;
  const s = await pending;
  assert.deepEqual([s.exit, s.sec], [0, 8]);
});

// ---------------------------------------------------------------- runIn: backstop timers (mocked)

// an in-process runner that ignores the stop signal and ends only when hard-stopped
const hangUntilKilled = seen => o => { seen.push(o); return new Promise(r => o.kill.addEventListener('abort', () => r({ exit: null }))); };

test('should hard-stop an in-process runner exactly timeout + 10 s after it started when it hangs (Proc edge)', async t => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const seen = [];
  const pending = runIn(O({ timeout: 5, inproc: hangUntilKilled(seen) }), '/w', 'true');
  mock.timers.tick(14_999);
  assert.equal(seen[0].kill.aborted, false, 'not before 15 s');
  mock.timers.tick(1);
  assert.equal(seen[0].kill.aborted, true, 'at 15 s');
  assert.equal((await pending).exit, 124);
});

test('should hard-stop an in-process runner exactly 10 s after the stop signal when it ignores the stop (Proc edge)', async t => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const seen = [], stop = new AbortController();
  const pending = runIn(O({ timeout: 60, signal: stop.signal, inproc: hangUntilKilled(seen) }), '/w', 'true');
  stop.abort();
  assert.equal(seen[0].signal.aborted, true);
  mock.timers.tick(9_999);
  assert.equal(seen[0].kill.aborted, false, 'not before 10 s');
  mock.timers.tick(1);
  assert.equal(seen[0].kill.aborted, true, 'at 10 s');
  assert.deepEqual([(await pending).exit, (await pending).aborted], [124, true]);
});

test('should leave no backstop behind when the stop listener is called again after the command ended (Proc edge)', async t => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const seen = [], stop = new AbortController();
  const pending = runIn(O({ timeout: 60, signal: stop.signal, inproc: o => { seen.push(o); return new Promise(r => o.signal.addEventListener('abort', () => r({ exit: 143 }))); } }), '/w', 'true');
  stop.abort();
  stop.signal.dispatchEvent(new Event('abort')); // a second abort event: the listener ran once and is gone
  assert.deepEqual([(await pending).exit, (await pending).aborted], [143, true]);
  mock.timers.tick(100_000);
  assert.equal(seen[0].kill.aborted, false, 'no hard stop after the command ended');
});

// a node runner that ignores SIGTERM and never ends; it writes `ready` once its handler is in place
function stubbornRunner(t) {
  const { dir } = tempDir(t, 'mutation-proc-');
  const runner = join(dir, 'runner.mjs'), ready = join(dir, 'ready');
  writeFileSync(runner, `import { writeFileSync } from 'node:fs';\nprocess.on('SIGTERM', () => {});\nwriteFileSync(${JSON.stringify(ready)}, '');\nsetInterval(() => {}, 1000);\n`);
  return { dir, runner, ready };
}
const waitFor = async path => { for (let i = 0; i < 200 && !existsSync(path); i++) await sleep(50); assert.ok(existsSync(path), 'the runner started'); };

test('should kill the runner process exactly timeout + 10 s after it started when it hangs (Proc edge)', async t => {
  const { dir, runner, ready } = stubbornRunner(t);
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => { mock.timers.tick(1_000_000); mock.timers.reset(); }); // a failed check still ends the runner
  const pending = runIn(O({ timeout: 1, runner }), dir, 'true');
  await waitFor(ready);
  mock.timers.tick(10_999);
  assert.equal(await settled(pending, 300), PENDING, 'not before 11 s');
  mock.timers.tick(1);
  const r = await settled(pending, 5000);
  assert.notEqual(r, PENDING, 'killed at 11 s');
  assert.equal(r.exit, 124);
});

test('should kill the runner process exactly 10 s after the stop signal when it ignores SIGTERM (Proc edge)', async t => {
  const { dir, runner, ready } = stubbornRunner(t);
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => { mock.timers.tick(1_000_000); mock.timers.reset(); });
  const stop = new AbortController();
  const pending = runIn(O({ timeout: 60, runner, signal: stop.signal }), dir, 'true');
  await waitFor(ready);
  stop.abort();
  mock.timers.tick(10_000);
  const r = await settled(pending, 5000);
  assert.notEqual(r, PENDING, 'killed at 10 s');
  assert.deepEqual([r.exit, r.aborted], [124, true]);
});

// ---------------------------------------------------------------- head run file

test('should accept exit 255 and refuse exit 256 when a head run file is checked (Proc edge)', () => {
  const identity = { tree: 't' }, doc = exit => JSON.stringify(headRunDoc(identity, [{ file: 'a.test.mjs', exit, sec: 1 }]));
  assert.deepEqual(baselineFrom(doc(255), identity, ['a.test.mjs']), { exits: [255] });
  assert.deepEqual(baselineFrom(doc(256), identity, ['a.test.mjs']), { reason: HEAD_RUN_REFUSED.tests });
});
