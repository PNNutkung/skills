// Unit tests for test-names.mjs on small diffs, and the CLI on a temp git repo. Run: node --test test-names.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badNames } from './test-names.mjs';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'test-names.mjs');
const diff = (file, lines, start = 1) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;

test('should pass when every added JS and Python test says should and when', () => {
  assert.deepEqual(badNames(diff('a.test.mjs', ["test('should add when given two numbers', () => {", "it(`should run (${x}) when the flag is on`, () => {"])), []);
  assert.deepEqual(badNames(diff('tests/test_a.py', ['def test_should_add_when_given_two_numbers():'])), []);
});

test('should name the file, line and test when an added name has no when or no should', () => {
  const r = badNames(diff('a.test.mjs', ['// x', "test('adds two numbers', () => {", "  it('should add numbers', () => {"], 10));
  assert.deepEqual(r, [{ file: 'a.test.mjs', line: 11, name: 'adds two numbers' }, { file: 'a.test.mjs', line: 12, name: 'should add numbers' }]);
  assert.deepEqual(badNames(diff('tests/test_a.py', ['async def test_add():'])).map(b => b.name), ['test_add']);
});

test('should ignore removed lines, context and files that are not tests when reading a diff', () => {
  const d = "diff --git a/a.test.mjs b/a.test.mjs\n--- a/a.test.mjs\n+++ b/a.test.mjs\n@@ -1,1 +1,0 @@\n-test('old name', () => {\n"
    + diff('src/app.mjs', ["test('not a test file', () => {"]) + diff('README.md', ["test('docs', () => {"]);
  assert.deepEqual(badNames(d), []);
});

test('should pass a legacy name when the same diff moves it from one test file to another', () => {
  const gone = "diff --git a/old.test.mjs b/old.test.mjs\n--- a/old.test.mjs\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-test('legacy one', () => {\n"
    + "diff --git a/tests/test_old.py b/tests/test_old.py\n--- a/tests/test_old.py\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-def test_old():\n";
  const d = gone + diff('new.test.mjs', ["test('legacy one', () => {", "test('brand new', () => {"]) + diff('tests/test_new.py', ['def test_old():']);
  assert.deepEqual(badNames(d).map(b => b.name), ['brand new']);
  const fromSrc = "diff --git a/src/a.mjs b/src/a.mjs\n--- a/src/a.mjs\n+++ b/src/a.mjs\n@@ -1,1 +0,0 @@\n-test('not a test file', () => {\n";
  assert.deepEqual(badNames(fromSrc + diff('a.test.mjs', ["test('not a test file', () => {"])).map(b => b.name), ['not a test file'], 'a name removed from a file that is not a test was never a test');
});

test('should exit 1 on a bad added name and 0 on legacy names when run on a git repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tn-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'ignore' });
  const run = () => { const r = spawnSync(process.execPath, [CHECK, '--root', repo, '--base', 'main'], { encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout) }; };
  try {
    git('init', '-q', '-b', 'main');
    mkdirSync(join(repo, 't'));
    writeFileSync(join(repo, 't', 'old.test.mjs'), "test('legacy name', () => {});\n");
    git('add', '.'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feat');
    writeFileSync(join(repo, 't', 'new.test.mjs'), "test('should work when ready', () => {});\n");
    git('add', '.'); git('commit', '-q', '-m', 'good');
    assert.deepEqual(run(), { code: 0, out: { ok: true, base: 'main', bad: [] } });
    writeFileSync(join(repo, 't', 'new.test.mjs'), "test('should work when ready', () => {});\ntest('works', () => {});\n");
    git('commit', '-q', '-am', 'bad');
    const r = run();
    assert.equal(r.code, 1);
    assert.match(r.out.bad[0], /^t\/new\.test\.mjs:2 "works": name it should/);
    writeFileSync(join(repo, 't', 'new.test.mjs'), "test('should work when ready', () => {});\n");
    git('rm', '-q', 't/old.test.mjs');
    writeFileSync(join(repo, 't', 'moved.test.mjs'), `// a new header, long enough that git sees no rename\n${"test('should pass when moved', () => {});\n".repeat(4)}test('legacy name', () => {});\n`);
    git('add', '.'); git('commit', '-q', '-m', 'move the legacy test to its own file');
    assert.deepEqual(run(), { code: 0, out: { ok: true, base: 'main', bad: [] } }, 'a test moved to another file keeps its legacy name');
    assert.equal(spawnSync(process.execPath, [CHECK, '--root', repo, '--base', 'nope'], { encoding: 'utf8' }).status, 2);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('should see added tests that are not committed yet when run on a working tree', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tn-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'ignore' });
  const run = () => { const r = spawnSync(process.execPath, [CHECK, '--root', repo, '--base', 'main'], { encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout) }; };
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'a.test.mjs'), "test('should work when ready', () => {});\n");
    git('add', '.'); git('commit', '-q', '-m', 'base');
    writeFileSync(join(repo, 'a.test.mjs'), "test('should work when ready', () => {});\ntest('edited', () => {});\n");
    mkdirSync(join(repo, 't'));
    writeFileSync(join(repo, 't', 'new.test.mjs'), "test('should pass when fine', () => {});\ntest('untracked', () => {});\n");
    writeFileSync(join(repo, 'notes.md'), "test('not a test file', () => {});\n");
    const r = run();
    assert.equal(r.code, 1);
    assert.deepEqual(r.out.bad.map(b => b.split(' ')[0]), ['a.test.mjs:2', 't/new.test.mjs:2']);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
