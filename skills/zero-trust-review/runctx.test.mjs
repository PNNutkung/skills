// Trust anchor for the run folder: node --test runctx.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STALE_MS, activate, appendSafe, checkRunDir, deactivate, markerFile, readMarker, resolveRun, writeSafe } from './runctx.mjs';

const mk = () => mkdtempSync(join(tmpdir(), 'zt-ctx-'));
const env = dir => ({ ZT_MARKER_DIR: dir });
const stranger = { uid: (process.getuid ? process.getuid() : 0) + 1 };  // a user that does not own anything here

test('a marker in a private per-user dir resolves to its run dir', () => {
  const md = mk(), run = mk(); chmodSync(md, 0o700); chmodSync(run, 0o700);
  writeFileSync(join(md, '.active'), run + '\n', { mode: 0o600 });
  assert.equal(readMarker({ env: env(md) }), realpathSync(run));
});

test('a marker that others could have written is rejected', () => {
  const md = mk(), run = mk(); chmodSync(run, 0o700);
  writeFileSync(join(md, '.active'), run + '\n'); chmodSync(join(md, '.active'), 0o666); chmodSync(md, 0o700);
  assert.equal(readMarker({ env: env(md) }), '', 'world-writable marker');
  chmodSync(join(md, '.active'), 0o600); chmodSync(md, 0o777);
  assert.equal(readMarker({ env: env(md) }), '', 'world-writable marker dir');
});

test('a symlinked marker or marker dir is rejected', () => {
  const md = mk(), run = mk(), other = mk(); chmodSync(md, 0o700); chmodSync(run, 0o700);
  writeFileSync(join(other, 'real'), run + '\n', { mode: 0o600 });
  symlinkSync(join(other, 'real'), join(md, '.active'));
  assert.equal(readMarker({ env: env(md) }), '');
  const link = join(mk(), 'link'); symlinkSync(md, link);
  assert.equal(readMarker({ env: env(link) }), '');
});

test('a foreign owner is rejected for the marker dir and the run dir', { skip: !process.getuid }, () => {
  const md = mk(), run = mk(); chmodSync(md, 0o700); chmodSync(run, 0o700);
  writeFileSync(join(md, '.active'), run + '\n', { mode: 0o600 });
  assert.equal(readMarker({ env: env(md), ...stranger }), '');
  assert.equal(checkRunDir(run, stranger), '');
});

test('a stale marker is ignored', () => {
  const md = mk(), run = mk(); chmodSync(md, 0o700); chmodSync(run, 0o700);
  const f = join(md, '.active'); writeFileSync(f, run + '\n', { mode: 0o600 });
  const old = new Date(Date.now() - STALE_MS - 60e3); utimesSync(f, old, old);
  assert.equal(readMarker({ env: env(md) }), '');
});

test('a run dir must be absolute, real, a directory, not a symlink and closed to others', () => {
  const run = mk(); chmodSync(run, 0o700);
  assert.ok(checkRunDir(run));
  assert.equal(checkRunDir('relative/dir'), '');
  assert.equal(checkRunDir(join(run, 'missing')), '');
  writeFileSync(join(run, 'f'), 'x'); assert.equal(checkRunDir(join(run, 'f')), '', 'a file');
  const l = join(mk(), 'l'); symlinkSync(run, l); assert.equal(checkRunDir(l), '', 'a symlink');
  chmodSync(run, 0o777); assert.equal(checkRunDir(run), '', 'world-writable');
});

test('resolveRun order: --run, then ZT_RUN_DIR, then the marker; each is trust-checked and must live under the per-user base', () => {
  const tmp = mk(), md = mk(); chmodSync(md, 0o700);
  const a = activate('a', { tmp, env: env(md) }), b = activate('b', { tmp, env: env(md) }), c = activate('c', { tmp, env: env(md) });  // the marker now points at c
  assert.equal(resolveRun({ tmp, run: a, env: { ZT_RUN_DIR: b, ...env(md) } }), a);
  assert.equal(resolveRun({ tmp, env: { ZT_RUN_DIR: b, ...env(md) } }), b);
  assert.equal(resolveRun({ tmp, env: env(md) }), c);
  const outside = mk(); chmodSync(outside, 0o700);  // ours and closed, but not a run dir that activate made
  assert.equal(resolveRun({ tmp, run: outside, env: env(md) }), c, 'an arbitrary dir of ours is never a run dir');
  assert.equal(resolveRun({ tmp, env: { ZT_RUN_DIR: outside, ...env(md) } }), c);
  chmodSync(a, 0o777); assert.equal(resolveRun({ tmp, run: a, env: env(md) }), c, 'an unsafe --run falls through, never trusted');
});

test('appendSafe appends one line inside the run dir with mode 0600 and never follows a leaf symlink', () => {
  const run = mk(); chmodSync(run, 0o700);
  const f = join(run, 'exec.jsonl');
  appendSafe(run, f, '{"a":1}\n'); appendSafe(run, f, '{"a":2}\n');
  assert.equal(readFileSync(f, 'utf8'), '{"a":1}\n{"a":2}\n');
  assert.equal(lstatSync(f).mode & 0o777, 0o600);
  const victim = join(mk(), 'victim'); writeFileSync(victim, 'keep\n');
  symlinkSync(victim, join(run, 'ledger.jsonl'));
  assert.throws(() => appendSafe(run, join(run, 'ledger.jsonl'), 'x\n'));
  assert.equal(readFileSync(victim, 'utf8'), 'keep\n', 'the symlink target is untouched');
  assert.throws(() => appendSafe(run, join(mk(), 'elsewhere.jsonl'), 'x\n'), /outside run folder/);
});

test('writeSafe replaces a file inside the run dir (0600) and never follows a leaf symlink or leaves the run dir', () => {
  const run = mk(); chmodSync(run, 0o700);
  writeSafe(run, join(run, 'evidence.md'), 'one\n'); writeSafe(run, join(run, 'evidence.md'), 'two\n');
  assert.equal(readFileSync(join(run, 'evidence.md'), 'utf8'), 'two\n');
  assert.equal(lstatSync(join(run, 'evidence.md')).mode & 0o777, 0o600);
  const victim = join(mk(), 'victim'); writeFileSync(victim, 'keep\n');
  symlinkSync(victim, join(run, 'verified.json'));
  assert.throws(() => writeSafe(run, join(run, 'verified.json'), 'x\n'));
  assert.equal(readFileSync(victim, 'utf8'), 'keep\n');
  assert.throws(() => writeSafe(run, join(mk(), 'elsewhere.md'), 'x\n'), /outside run folder/);
  chmodSync(run, 0o777);
  assert.throws(() => writeSafe(run, join(run, 'a.md'), 'x\n'), /unsafe/, 'a run dir others can write is refused');
});

test('activate creates a private per-uid run dir and the marker; deactivate removes only its own marker', () => {
  const tmp = mk(), md = mk(); chmodSync(md, 0o700);
  const run = activate('repo-abc12345', { tmp, env: env(md) });
  assert.ok(run.startsWith(realpathSync(tmp)) && /zt-review(-\d+)?\/repo-abc12345$/.test(run));
  assert.equal(lstatSync(run).mode & 0o077, 0, 'private run dir');
  assert.equal(readMarker({ env: env(md) }), run);
  assert.equal(lstatSync(markerFile(env(md))).mode & 0o077, 0, 'private marker');
  assert.equal(activate('repo-abc12345', { tmp, env: env(md) }), run, 'idempotent');
  deactivate('/some/other/run', { env: env(md) });
  assert.equal(readMarker({ env: env(md) }), run, 'someone else is not deactivated');
  deactivate(run, { env: env(md) });
  assert.equal(readMarker({ env: env(md) }), '');
  assert.throws(() => activate('../escape', { tmp, env: env(md) }));
  assert.throws(() => activate('a/b', { tmp, env: env(md) }));
});

test('activate refuses a base dir that is a symlink or owned by someone else', () => {
  const tmp = mk(), md = mk(); chmodSync(md, 0o700);
  const uid = process.getuid ? '-' + process.getuid() : '';
  symlinkSync(mk(), join(tmp, 'zt-review' + uid));
  assert.throws(() => activate('x', { tmp, env: env(md) }), /unsafe/);
  if (process.getuid) {
    const t2 = mk(); mkdirSync(join(t2, 'zt-review-' + process.getuid()), { mode: 0o700 });
    assert.throws(() => activate('x', { tmp: t2, env: env(md), ...stranger }), /unsafe/);
  }
});
