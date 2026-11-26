import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheRoot, runDir, sessionMarker } from './paths.mjs';

const HOME = '/home/someone';

test('should use VERIFY_CACHE_DIR first, then XDG_CACHE_HOME, then ~/.cache when the env names them (Run)', () => {
  assert.equal(cacheRoot({ VERIFY_CACHE_DIR: '/c/v', XDG_CACHE_HOME: '/x' }, HOME), '/c/v');
  assert.equal(cacheRoot({ XDG_CACHE_HOME: '/x' }, HOME), '/x/verify');
  assert.equal(cacheRoot({}, HOME), join(HOME, '.cache', 'verify'));
  assert.equal(cacheRoot({ VERIFY_CACHE_DIR: '', XDG_CACHE_HOME: '' }, HOME), join(HOME, '.cache', 'verify'));
});

test('should put the session marker under sessions/ when the session id is safe (Guard)', () => {
  assert.equal(sessionMarker('abc-123', { VERIFY_CACHE_DIR: '/c' }, HOME), join('/c', 'sessions', 'abc-123.json'));
});

test('should return null when the session id is missing or could escape the folder (Guard edge)', () => {
  for (const bad of [undefined, '', '../x', 'a/b', 'a b', 'x'.repeat(200)]) assert.equal(sessionMarker(bad, {}, HOME), null, String(bad));
});

test('should key the run dir by repo basename and a hash of its real path when the repo is reached through a link (Run edge)', () => {
  const base = mkdtempSync(join(tmpdir(), 'verify-paths-'));
  const repo = join(base, 'my repo');
  mkdirSync(repo);
  const link = join(base, 'link');
  symlinkSync(repo, link);
  const key = `my_repo-${createHash('sha256').update(realpathSync(repo)).digest('hex').slice(0, 12)}`;
  assert.equal(runDir(link, 'demo', { VERIFY_CACHE_DIR: '/c' }, HOME), join('/c', key, 'demo'));
  assert.equal(runDir(repo, 'demo', { VERIFY_CACHE_DIR: '/c' }, HOME), runDir(link, 'demo', { VERIFY_CACHE_DIR: '/c' }, HOME));
});
