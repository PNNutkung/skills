// Unit: the work-tree snapshot at open and what changed since, on throwaway git repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo, writeFiles } from './fixture.mjs';
import { changedSince, snapshot } from './snapshot.mjs';

test('should list modified, staged, deleted and untracked files outside docs/verify and leave ignored files out when the work tree changed (Fail)', () => {
  const { repo } = makeRepo({ files: { '.gitignore': 'build/\n' } });
  const before = snapshot(repo);
  assert.deepEqual(before.files, {});
  assert.match(before.head, /^[0-9a-f]{40}$/);
  writeFiles(repo, { 'tool.mjs': 'changed\n', 'staged.js': 'x\n', 'build/out.js': 'ignored\n', 'docs/verify/demo.md': 'run output\n' });
  execFileSync('git', ['add', 'staged.js'], { cwd: repo });
  rmSync(join(repo, 'tool.test.mjs'));
  const after = snapshot(repo);
  assert.deepEqual(Object.keys(after.files), ['staged.js', 'tool.mjs', 'tool.test.mjs']);
  assert.equal(after.files['tool.test.mjs'], 'ENOENT');
  assert.deepEqual(changedSince(before, after), ['staged.js', 'tool.mjs', 'tool.test.mjs']);
  assert.deepEqual(changedSince(before, after, p => p === 'tool.mjs'), ['staged.js', 'tool.test.mjs']);
  assert.deepEqual(changedSince(after, snapshot(repo)), [], 'nothing changed since');
});

test('should see a second edit of a file that already differed and the files of a repo with no commit when the snapshot is taken again (Fail edge)', () => {
  const { repo } = makeRepo();
  writeFiles(repo, { 'tool.mjs': 'one\n' });
  const before = snapshot(repo);
  writeFiles(repo, { 'tool.mjs': 'two\n' });
  assert.deepEqual(changedSince(before, snapshot(repo)), ['tool.mjs']);
  const bare = join(mkdtempSync(join(tmpdir(), 'verify-snap-')), 'r');
  mkdirSync(bare);
  execFileSync('git', ['init', '-q'], { cwd: bare });
  writeFileSync(join(bare, 'a.js'), 'x\n');
  const s = snapshot(bare);
  assert.equal(s.head, null);
  assert.deepEqual(Object.keys(s.files), ['a.js']);
  assert.deepEqual(changedSince({ head: 'a'.repeat(40), files: {} }, s), [`HEAD ${'a'.repeat(12)} -> none`, 'a.js']);
});
