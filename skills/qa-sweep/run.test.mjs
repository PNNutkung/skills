import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { IDLE_MS, end, markerPath, readActive, snap, start, touch } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const mk = p => mkdtempSync(join(tmpdir(), p));

// each test gets its own marker dir, run base and fixture git repo: nothing touches ~/.cache/qa-sweep
function fixture() {
  const repo = mk('qa-repo-'), tmp = mk('qa-tmp-'), markers = mk('qa-mark-');
  execFileSync('git', ['init', '-q', repo]);
  const env = { QA_MARKER_DIR: markers };
  return { repo, env, tmp, markers };
}

test('start writes a 0600 marker naming the run, session and repo', () => {
  const { repo, env, tmp } = fixture();
  const { run, marker } = start({ repo, session: 's1', env, tmp });
  const m = JSON.parse(readFileSync(marker, 'utf8'));
  assert.deepEqual([m.run, m.session, m.repo], [run, 's1', realpathSync(repo)]);
  assert.equal(statSync(marker).mode & 0o777, 0o600);
  assert.deepEqual(readActive({ session: 's1', env }), m);
});

test('start refuses while this session has a fresh run, and replaces a stale one', () => {
  const { repo, env, tmp } = fixture();
  start({ repo, session: 's1', env, tmp });
  assert.throws(() => start({ repo, session: 's1', env, tmp }), /a run is active/);
  const old = (Date.now() - IDLE_MS - 1000) / 1000; utimesSync(markerPath('s1', env), old, old);
  assert.doesNotThrow(() => start({ repo, session: 's1', env, tmp: mk('qa-tmp-') }));
});

test('readActive ignores other sessions, stale, symlinked and group-writable markers', () => {
  const { repo, env, tmp, markers } = fixture();
  start({ repo, session: 's1', env, tmp });
  assert.equal(readActive({ session: 's2', env }), null);
  const f = markerPath('s1', env), body = readFileSync(f, 'utf8');
  assert.ok(readActive({ session: 's1', env }));
  chmodSync(f, 0o620); assert.equal(readActive({ session: 's1', env }), null);
  chmodSync(f, 0o600); assert.ok(readActive({ session: 's1', env }));
  const old = (Date.now() - IDLE_MS - 1000) / 1000; utimesSync(f, old, old);
  assert.equal(readActive({ session: 's1', env }), null);
  rmSync(f); const real = join(markers, 'real.json'); // a symlink to a valid marker is still refused
  writeFileSync(real, body, { mode: 0o600 });
  symlinkSync(real, f); assert.equal(readActive({ session: 's1', env }), null);
});

test('readActive returns null when the marker names a missing run dir', () => {
  const { repo, env, tmp } = fixture();
  const { run } = start({ repo, session: 's1', env, tmp });
  rmSync(run, { recursive: true });
  assert.equal(readActive({ session: 's1', env }), null);
});

test('touch refreshes the marker and end removes it', () => {
  const { repo, env, tmp } = fixture();
  const { run, marker } = start({ repo, session: 's1', env, tmp });
  const old = (Date.now() - 3600e3) / 1000; utimesSync(marker, old, old);
  const before = statSync(marker).mtimeMs;
  touch({ session: 's1', env });
  assert.ok(statSync(marker).mtimeMs > before);
  assert.deepEqual(end({ session: 's1', env }), { ended: run });
  assert.equal(readActive({ session: 's1', env }), null);
  assert.deepEqual(end({ session: 's1', env }), { ended: null });
});

test('the CLI with no session id exits 2', () => {
  const { env } = fixture();
  const e = { ...process.env, ...env }; delete e.CLAUDE_CODE_SESSION_ID;
  const r = spawnSync('node', [join(HERE, 'run.mjs'), 'end'], { env: e, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no session id/);
});

test('the CLI start and end print one JSON line each', () => {
  const { repo, env, tmp } = fixture();
  const e = { ...process.env, ...env, TMPDIR: tmp };
  const go = (...a) => spawnSync('node', [join(HERE, 'run.mjs'), ...a], { env: e, encoding: 'utf8' });
  const s = go('start', '--repo', repo, '--session', 'c1');
  assert.equal(s.status, 0, s.stderr);
  assert.ok(JSON.parse(s.stdout).run);
  assert.equal(go('start', '--repo', repo, '--session', 'c1').status, 2);
  assert.equal(JSON.parse(go('end', '--session', 'c1').stdout).ended, JSON.parse(s.stdout).run);
});

test('importing the module with zero-trust-review missing does not exit or throw', () => {
  const r = spawnSync('node', ['-e', `const m = await import(${JSON.stringify(join(HERE, 'run.mjs'))}); console.log(m.readActive({ session: 'x', env: { QA_MARKER_DIR: '/nonexistent' } }))`, '--input-type=module'], { env: { ...process.env, ZT_DIR: '/nonexistent' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'null');
});

test('a bad session id is refused', () => assert.throws(() => markerPath('../x'), /bad session id/));

test('start throws unsafe marker dir and leaves no marker when the dir is group-writable', () => {
  const { repo, env, tmp, markers } = fixture();
  chmodSync(markers, 0o770);
  assert.throws(() => start({ repo, session: 's1', env, tmp }), /unsafe marker dir/);
  assert.equal(existsSync(markerPath('s1', env)), false);
});

// a repo with one commit, then a dirty working tree: a staged edit, an unstaged edit and two new test files
function dirtyRepo() {
  const fx = fixture(), g = (...a) => execFileSync('git', ['-C', fx.repo, ...a], { encoding: 'utf8' });
  const put = (rel, text) => { mkdirSync(dirname(join(fx.repo, rel)), { recursive: true }); writeFileSync(join(fx.repo, rel), text); };
  put('src/a.ts', 'export const a = 1;\n'); put('src/b.ts', 'export const b = 1;\n');
  g('add', '.'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  put('src/a.ts', 'export const a = 2;\n'); g('add', 'src/a.ts');
  put('src/b.ts', 'export const b = 2;\n');
  put('tests/new.test.ts', 'test("new", () => {});\n'); put('tests/other.test.ts', 'test("other", () => {});\n');
  return { ...fx, g };
}

test('snap commits HEAD plus only the named files, and leaves the index and the working tree as they were', () => {
  const { repo, env, tmp, g } = dirtyRepo();
  start({ repo, session: 's1', env, tmp });
  const before = [g('status', '--porcelain'), g('ls-files', '-s'), g('rev-parse', 'HEAD')];
  const { snap: sha } = snap({ session: 's1', env, tmp, files: ['tests/new.test.ts'] });
  assert.deepEqual([g('status', '--porcelain'), g('ls-files', '-s'), g('rev-parse', 'HEAD')], before);
  assert.equal(g('rev-parse', `${sha}^`).trim(), before[2].trim(), 'the snapshot is a child of HEAD');
  assert.deepEqual(g('ls-tree', '-r', '--name-only', sha).trim().split('\n'), ['src/a.ts', 'src/b.ts', 'tests/new.test.ts']);
  assert.equal(g('show', `${sha}:src/a.ts`), 'export const a = 1;\n', 'a staged edit stays out');
  assert.equal(g('show', `${sha}:tests/new.test.ts`), 'test("new", () => {});\n');
});

test('snap refuses with no active run, no files, or a path outside the repo', () => {
  const { repo, env, tmp } = dirtyRepo();
  assert.throws(() => snap({ session: 's1', env, tmp, files: ['tests/new.test.ts'] }), /no active run/);
  start({ repo, session: 's1', env, tmp });
  assert.throws(() => snap({ session: 's1', env, tmp, files: [] }), /snap needs --files/);
  assert.throws(() => snap({ session: 's1', env, tmp, files: ['../outside.ts'] }), /refusing to snapshot \.\.\/outside\.ts/);
  assert.throws(() => snap({ session: 's1', env, tmp, files: ['tests/missing.test.ts'] }), /refusing to snapshot tests\/missing\.test\.ts/);
});

test('the CLI snap prints one JSON line with the sha', () => {
  const { repo, env, tmp } = dirtyRepo();
  const e = { ...process.env, ...env, TMPDIR: tmp };
  const go = (...a) => spawnSync('node', [join(HERE, 'run.mjs'), ...a], { env: e, encoding: 'utf8' });
  assert.equal(go('start', '--repo', repo, '--session', 'c1').status, 0);
  const s = go('snap', '--files', 'tests/new.test.ts,tests/other.test.ts', '--session', 'c1');
  assert.equal(s.status, 0, s.stderr);
  assert.match(JSON.parse(s.stdout).snap, /^[0-9a-f]{40}$/);
  assert.equal(go('snap', '--session', 'c1').status, 2, 'no --files is a usage error');
});

test('the CLI with an unknown flag exits 2', () => {
  const r = spawnSync('node', [join(HERE, 'run.mjs'), 'start', '--bogus'], { env: { ...process.env, CLAUDE_CODE_SESSION_ID: 's1' }, encoding: 'utf8' });
  assert.equal(r.status, 2);
});
