// Unit tests for test-names.mjs on small diffs, and the CLI on a temp git repo. Run: node --test test-names.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badNames, removedTests, unmapped } from './test-names.mjs';

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

// ---- MergedTests (ADR 0008 A8): a test a branch removes must be listed in rules/checks/test-merges.json with the test that now holds its assertions
const minus = (file, lines, { gone = false } = {}) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ ${gone ? '/dev/null' : `b/${file}`}\n@@ -1,${lines.length} +0,0 @@\n${lines.map(l => `-${l}`).join('\n')}\n`;

test('should accept a removed test when the merge map names the test that holds its assertions now (MergedTests)', () => {
  const d = minus('a.test.mjs', ["test('should do x when y', async () => {"]) + diff('b.test.mjs', ["test('should do x and z when y', async () => {"]);
  const removed = removedTests(d);
  assert.deepEqual(removed, [{ file: 'a.test.mjs', name: 'should do x when y' }]);
  assert.deepEqual(unmapped(removed, { 'a.test.mjs::should do x when y': 'b.test.mjs::should do x and z when y' }), []);
  assert.deepEqual(removedTests(minus('tests/test_a.py', ['def test_should_go_when_ready():'], { gone: true })), [{ file: 'tests/test_a.py', name: 'test_should_go_when_ready' }], 'a deleted python test file');
});

test('should report a removed test when the merge map has no entry for it (MergedTests)', () => {
  const removed = removedTests(minus('a.test.mjs', ["test('should do x when y', () => {", "  it('should do w when v', () => {", '  assert.ok(1);'], { gone: true }));
  assert.deepEqual(unmapped(removed, {}).map(r => `${r.file}::${r.name}`), ['a.test.mjs::should do x when y', 'a.test.mjs::should do w when v']);
  assert.equal(unmapped(removed, { 'other.test.mjs::should do x when y': 'b.test.mjs::t' }).length, 2, 'the key names the file the test was removed from');
});

test('should not count a test as removed when the branch moves it to another file or leaves it in place (MergedTests)', () => {
  const moved = minus('a.test.mjs', ["test('should do x when y', () => {"], { gone: true }) + diff('b.test.mjs', ["test('should do x when y', () => {"]);
  assert.deepEqual(removedTests(moved), []);
  const edited = minus('a.test.mjs', ["test('should do x when y', () => {"]) + diff('a.test.mjs', ["test('should do x when y', async t => {"]);
  assert.deepEqual(removedTests(edited), [], 'a test whose line changed but whose name stayed');
  assert.deepEqual(removedTests(minus('src/app.mjs', ["test('not a test file', () => {"])), [], 'not a test file');
});

test('should count a renamed test as removed and need a map entry when only its name changes (MergedTests)', () => {
  const renamed = minus('a.test.mjs', ["test('should do x when y', () => {"]) + diff('a.test.mjs', ["test('should do x well when y', () => {"]);
  const removed = removedTests(renamed);
  assert.deepEqual(removed, [{ file: 'a.test.mjs', name: 'should do x when y' }]);
  assert.equal(unmapped(removed, {}).length, 1);
  assert.deepEqual(unmapped(removed, { 'a.test.mjs::should do x when y': 'a.test.mjs::should do x well when y' }), []);
});

test('should exit 1 on a removed test that is not in the merge map and 0 once it is mapped when run on a git repo (MergedTests)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tn-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'ignore' });
  const run = () => { const r = spawnSync(process.execPath, [CHECK, '--root', repo, '--base', 'main'], { encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout) }; };
  const map = m => { mkdirSync(join(repo, 'rules', 'checks'), { recursive: true }); writeFileSync(join(repo, 'rules', 'checks', 'test-merges.json'), JSON.stringify(m)); };
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'a.test.mjs'), "test('should go when ready', () => {});\ntest('should stop when told', () => {});\n");
    writeFileSync(join(repo, 'b.test.mjs'), "test('legacy b', () => {});\n");
    git('add', '.'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feat');
    git('rm', '-q', 'b.test.mjs');
    writeFileSync(join(repo, 'a.test.mjs'), "test('should go or stop when ready or told', () => {});\n");
    git('add', '.'); git('commit', '-q', '-m', 'merge');
    const r = run();
    assert.equal(r.code, 1);
    assert.deepEqual(r.out.unmapped.map(u => u.split(': ')[0]), ['a.test.mjs::should go when ready', 'a.test.mjs::should stop when told', 'b.test.mjs::legacy b']);
    const to = 'a.test.mjs::should go or stop when ready or told';
    map({ 'a.test.mjs::should go when ready': to, 'a.test.mjs::should stop when told': to, 'b.test.mjs::legacy b': 'a.test.mjs::no such test' });
    const half = run();
    assert.equal(half.code, 1, 'a map entry must point at a test that exists');
    assert.deepEqual(half.out.unmapped.map(u => u.split(': ')[0]), ['b.test.mjs::legacy b']);
    map({ 'a.test.mjs::should go when ready': to, 'a.test.mjs::should stop when told': to, 'b.test.mjs::legacy b': to });
    assert.deepEqual(run(), { code: 0, out: { ok: true, base: 'main', bad: [], merged: ['a.test.mjs::should go when ready', 'a.test.mjs::should stop when told', 'b.test.mjs::legacy b'] } });
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
