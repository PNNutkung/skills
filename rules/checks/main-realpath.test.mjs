// Unit tests for main-realpath.mjs on small fixtures, and the check on this repo (the CI enforcement). Run: node --test main-realpath.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile } from './main-realpath.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = join(HERE, 'main-realpath.mjs');
const ROOT = join(HERE, '..', '..');
const GOOD = "if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();\n";

test('should pass when the main check compares both paths with realpathSync', () => {
  assert.deepEqual(checkFile('hooks/a.mjs', `import x from 'y';\n${GOOD}`), []);
});

test('should pass when the main check sits inside a try with realpathSync on both sides', () => {
  const src = 'let isMain = false;\ntry { isMain = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { }\n';
  assert.deepEqual(checkFile('hooks/a.mjs', src), []);
});

test('should report the line when the main check compares argv[1] without realpathSync', () => {
  const src = "const a = 1;\nif (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {\n";
  assert.deepEqual(checkFile('hooks/a.mjs', src), ['hooks/a.mjs:2: compare process.argv[1] and import.meta.url with realpathSync on both sides (rules/paths.md)']);
});

test('should report the line when only one side of the main check is resolved', () => {
  const src = 'if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();\n';
  assert.equal(checkFile('hooks/a.mjs', src).length, 1);
});

test('should pass when a file never compares process.argv[1] with import.meta.url', () => {
  assert.deepEqual(checkFile('hooks/a.mjs', "const HERE = fileURLToPath(import.meta.url);\nconst arg = process.argv[1];\n"), []);
});

test('should exit 0 with no violations when the check runs on this repo', () => {
  const r = spawnSync(process.execPath, [CHECK, '--root', ROOT], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout).violations, []);
  assert.equal(r.status, 0);
});

test('should exit 2 with a usage error when the arguments are unknown', () => {
  const r = spawnSync(process.execPath, [CHECK, '--nope'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).error, /usage/);
});
