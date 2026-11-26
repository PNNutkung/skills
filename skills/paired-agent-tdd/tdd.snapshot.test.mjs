// Snapshot batching (ADR 0008 LessWork, Parity): the batched snapshot makes the same commit as the old per-file algorithm, kept here as the reference, with fewer git processes.
//   node --test tdd.snapshot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { showText, snapshot } from './tdd.mjs';

const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const DATES = { GIT_AUTHOR_DATE: '2001-02-03T04:05:06Z', GIT_COMMITTER_DATE: '2001-02-03T04:05:06Z' }; // commit ids hold the time: both algorithms commit at one fixed time
const COMMIT_ENV = { GIT_AUTHOR_NAME: 'pat', GIT_AUTHOR_EMAIL: 'pat@localhost', GIT_COMMITTER_NAME: 'pat', GIT_COMMITTER_EMAIL: 'pat@localhost' };

// the snapshot of tdd.mjs before batching, one git call per step and per file: the reference the batched one must match byte for byte
function oldSnapshot(env, scratch, repo, on, files) {
  const g = (...a) => {
    try { return execFileSync(REAL_GIT, ['-C', repo, '-c', 'core.quotePath=false', ...a], { env: { ...env, GIT_OPTIONAL_LOCKS: '0', ...COMMIT_ENV, GIT_INDEX_FILE: index }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim(); }
    catch (e) { throw new Error(`git ${a[0]}: ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
  };
  const inside = (root, p) => { try { const r = realpathSync(dirname(p)); return r === root || r.startsWith(root + sep); } catch { return false; } };
  const index = join(scratch, `ref-idx-${process.pid}`), parent = g('rev-parse', '--verify', `${on}^{commit}`), root = realpathSync(repo);
  try {
    g('read-tree', parent);
    if (files === undefined) g('add', '-A', '--', '.');
    else for (const f of [...new Set(files)]) {
      const p = join(root, f), st = lstatSync(p, { throwIfNoEntry: false });
      if (!st) { g('update-index', '--force-remove', '--', f); continue; }
      if (!st.isFile() || !inside(root, p)) throw new Error(`refusing to snapshot ${f}: not a regular file inside the repo`);
      g('update-index', '--add', '--cacheinfo', `${st.mode & 0o111 ? '100755' : '100644'},${g('hash-object', '-w', '--no-filters', '--', p)},${f}`);
    }
    return g('commit-tree', g('write-tree'), '-p', parent, '-m', 'paired-agent-tdd snapshot');
  } finally { rmSync(index, { force: true }); }
}

// a repo with a base commit, a scratch folder, and a PATH whose git counts its own launches
function setup(t, files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ptdd-snap-'))), repo = join(dir, 'repo'), scratch = join(dir, 'scratch'), bin = join(dir, 'bin'), log = join(dir, 'git.log');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const d of [repo, scratch, bin]) mkdirSync(d);
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${REAL_GIT}' "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const env = { ...process.env, ...DATES, PATH: `${bin}:${process.env.PATH}` };
  const sh = (...a) => execFileSync(REAL_GIT, ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', env: { ...process.env, ...DATES } }).trim();
  sh('init', '-q');
  write(repo, { 'keep.txt': 'keep\n', 'gone.txt': 'gone\n', 'sub/deep/old.txt': 'old\n', ...files });
  sh('add', '-A'); sh('commit', '-qm', 'base');
  const calls = () => { try { return readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  return { repo, scratch, env, calls, head: sh('rev-parse', 'HEAD'), cx: () => ({ env, counter: 0 }) };
}
function write(repo, files) {
  for (const [p, c] of Object.entries(files)) {
    const f = join(repo, p);
    if (c === null) rmSync(f, { force: true });
    else { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, c); }
  }
}
const both = (fx, on, files) => [snapshot(fx.cx(), fx.scratch, fx.repo, on, files), oldSnapshot(fx.env, fx.scratch, fx.repo, on, files)];
const errorOf = fn => { try { fn(); return null; } catch (e) { return e.message; } };

const NAMES = ['sp ace.txt', 'q"uote.txt', "it's.txt", '"lead-quote.txt', 'café/ünï.txt', '日本/語.txt', '-dash.txt', '--', 'tab\there.txt', 'back\\slash.txt', 'new\nline.txt', 'a b/c d/e f.txt'];

test('should make the commit of the old per-file algorithm when files are added, changed, deleted, made executable and nested (Parity)', t => {
  const fx = setup(t);
  write(fx.repo, { 'keep.txt': 'changed\n', 'gone.txt': null, 'sub/deep/new.txt': 'new\n', 'run.sh': '#!/bin/sh\n', 'empty.txt': '' });
  chmodSync(join(fx.repo, 'run.sh'), 0o755);
  const files = ['keep.txt', 'gone.txt', 'sub/deep/new.txt', 'run.sh', 'empty.txt', 'never-there.txt', 'keep.txt'];
  const [now, old] = both(fx, 'HEAD', files);
  assert.equal(now, old);
  const [none, oldNone] = both(fx, fx.head, []);
  assert.equal(none, oldNone, 'no files: the base tree under a new commit');
});

test('should make the commit of the old algorithm when file names hold spaces, quotes, unicode, leading dashes, tabs and newlines (Parity)', t => {
  const fx = setup(t, { 'sp ace.txt': 'before\n', '-dash.txt': 'before\n' });
  write(fx.repo, Object.fromEntries(NAMES.map((n, i) => [n, `content ${i}\n`])));
  const [now, old] = both(fx, 'HEAD', NAMES);
  assert.equal(now, old);
  write(fx.repo, { 'sp ace.txt': null, 'new\nline.txt': null });
  const [gone, oldGone] = both(fx, now, NAMES);
  assert.equal(gone, oldGone, 'deleted names with a space and a newline');
});

test('should make the commit of the old algorithm when the whole working tree is snapshot (Parity)', t => {
  const fx = setup(t);
  write(fx.repo, { 'keep.txt': 'x\n', 'gone.txt': null, 'more/new.txt': 'y\n' });
  const [now, old] = both(fx, 'HEAD', undefined);
  assert.equal(now, old);
});

// a seeded generator: the same file sets every run, many shapes
const rng = seed => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
test('should match the old algorithm on random file sets, contents and modes when fuzzed with a fixed seed (Parity)', t => {
  const fx = setup(t), rand = rng(20260226), pick = a => a[Math.floor(rand() * a.length)];
  const pool = ['a.txt', 'b/c.txt', 'b/d e.txt', 'x/y/z.js', 'ü.md', '-n', 'q"q', 'keep.txt', 'gone.txt', 'sub/deep/old.txt'];
  let on = fx.head;
  for (let round = 0; round < 12; round++) {
    const files = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pick(pool));
    for (const f of files) {
      const r = rand();
      if (r < 0.2) rmSync(join(fx.repo, f), { force: true });
      else if (r < 0.9) {
        write(fx.repo, { [f]: Array.from({ length: Math.floor(rand() * 40) }, () => String.fromCharCode(Math.floor(rand() * 0x3000))).join('') });
        chmodSync(join(fx.repo, f), rand() < 0.3 ? 0o755 : 0o644);
      }
    }
    const [now, old] = both(fx, on, files);
    assert.equal(now, old, `round ${round}: ${JSON.stringify(files)}`);
    if (rand() < 0.5) on = now; // a child of a snapshot too, as green's baseDeps
  }
});

test('should start no git process when the same snapshot is asked again in one call (LessWork)', t => {
  const fx = setup(t), cx = fx.cx(), files = ['keep.txt', 'gone.txt', 'sub/new.txt'];
  write(fx.repo, { 'keep.txt': 'v1\n', 'gone.txt': null, 'sub/new.txt': 'n\n' });
  const first = snapshot(cx, fx.scratch, fx.repo, 'HEAD', files), used = fx.calls().length;
  assert.ok(used <= 6, `one snapshot: rev-parse, read-tree, hash-object, update-index, write-tree, commit-tree (${fx.calls().join(' | ')})`);
  assert.equal(snapshot(cx, fx.scratch, fx.repo, 'HEAD', [...files].reverse()), first);
  assert.equal(fx.calls().length, used, 'the same files with the same bytes and modes: no new git process');
  write(fx.repo, { 'keep.txt': 'v2\n' });
  const second = snapshot(cx, fx.scratch, fx.repo, 'HEAD', files);
  assert.notEqual(second, first);
  assert.equal(second, oldSnapshot(fx.env, fx.scratch, fx.repo, 'HEAD', files), 'an edit makes a new snapshot, still the old commit');
  assert.ok(!fx.calls().slice(used).some(c => /rev-parse/.test(c)), 'the rev is resolved once a call');
  chmodSync(join(fx.repo, 'keep.txt'), 0o755);
  assert.notEqual(snapshot(cx, fx.scratch, fx.repo, 'HEAD', files), second, 'a mode change is a new snapshot');
  const fresh = fx.calls().length;
  snapshot(fx.cx(), fx.scratch, fx.repo, 'HEAD', files);
  assert.ok(fx.calls().length > fresh, 'a new call starts with nothing remembered');
});

test('should use a constant number of git processes when a snapshot holds many files (LessWork)', t => {
  const fx = setup(t), files = Array.from({ length: 30 }, (_, i) => `many/f${i}.txt`);
  write(fx.repo, Object.fromEntries(files.map(f => [f, `${f}\n`])));
  const [now, old] = [snapshot(fx.cx(), fx.scratch, fx.repo, 'HEAD', [...files, 'gone.txt']), oldSnapshot(fx.env, fx.scratch, fx.repo, 'HEAD', [...files, 'gone.txt'])];
  assert.equal(now, old);
  assert.ok(fx.calls().length <= 6, `${fx.calls().length} git processes for 31 files`);
});

test('should refuse links, folders and paths outside the repo with the old error text when one is in the files (Parity)', t => {
  const fx = setup(t), outside = join(dirname(fx.repo), 'outside');
  mkdirSync(outside); writeFileSync(join(outside, 'secret.txt'), 's\n');
  symlinkSync('keep.txt', join(fx.repo, 'link.txt'));
  symlinkSync(outside, join(fx.repo, 'out'));
  for (const files of [['link.txt'], ['keep.txt', 'out/secret.txt'], ['sub'], ['gone.txt', 'sub/deep', 'keep.txt'], ['../outside/secret.txt']]) {
    const now = errorOf(() => snapshot(fx.cx(), fx.scratch, fx.repo, 'HEAD', files)), old = errorOf(() => oldSnapshot(fx.env, fx.scratch, fx.repo, 'HEAD', files));
    assert.match(now ?? '', /^refusing to snapshot \S+: not a regular file inside the repo$/, JSON.stringify(files));
    assert.equal(now, old, JSON.stringify(files));
  }
});

test('should fail with the old git error when a path is one git refuses or the rev is no commit (Parity)', t => {
  const fx = setup(t);
  for (const [on, files] of [['HEAD', ['sub/../keep.txt']], ['HEAD', ['./keep.txt']], ['nope', ['keep.txt']], ['HEAD', ['.git/config']]]) {
    const now = errorOf(() => snapshot(fx.cx(), fx.scratch, fx.repo, on, files)), old = errorOf(() => oldSnapshot(fx.env, fx.scratch, fx.repo, on, files));
    assert.match(now ?? '', /^git (update-index|rev-parse): /, `${on} ${JSON.stringify(files)}`);
    assert.equal(now, old, `${on} ${JSON.stringify(files)}`);
  }
});

test('should make the commit of the old algorithm when a deleted file is named by a path git normalizes or refuses (Parity)', t => {
  const fx = setup(t);
  write(fx.repo, { 'gone.txt': null, 'keep.txt': 'k2\n' });
  for (const files of [['./gone.txt'], ['sub/../gone.txt', 'keep.txt'], ['.git/nothere', 'keep.txt'], ['gone.txt/', 'keep.txt']]) {
    const [now, old] = both(fx, 'HEAD', files);
    assert.equal(now, old, JSON.stringify(files));
  }
});

test('should read a file at a rev with one git process, and nothing for a missing path, when asked for its text (LessWork)', t => {
  const fx = setup(t), cx = fx.cx();
  assert.equal(showText(cx, fx.repo, fx.head, 'keep.txt'), 'keep\n');
  assert.equal(fx.calls().length, 1);
  assert.equal(showText(cx, fx.repo, fx.head, 'keep.txt'), 'keep\n');
  assert.equal(fx.calls().length, 1, 'a file of a commit id never changes: read once a call');
  assert.equal(showText(cx, fx.repo, fx.head, 'no/such.txt'), '');
  assert.equal(showText(cx, fx.repo, 'HEAD', 'sub/deep/old.txt'), 'old\n');
  assert.equal(fx.calls().length, 3);
});
