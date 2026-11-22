import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEslint, parseRuff, toolsFor } from './adapters.mjs';

test('should turn ESLint JSON into eslint: violations with repo paths when ESLint reports (RtLint)', () => {
  const out = JSON.stringify([{ filePath: '/r/src/a.ts', messages: [{ ruleId: 'no-unused-vars', line: 3 }, { ruleId: null, fatal: true, line: 1, message: 'Parsing error' }, { ruleId: null, severity: 1, message: 'File ignored' }] }]);
  const r = parseEslint(out, '/r');
  assert.deepEqual(r.violations, [{ rule: 'eslint:no-unused-vars', file: 'src/a.ts', line: 3 }]);
  assert.deepEqual(r.errors, ['src/a.ts:1 Parsing error']);
});

test('should turn ruff JSON into ruff: violations when ruff reports (RtLint)', () => {
  const out = JSON.stringify([{ code: 'PLR2004', filename: '/r/tools/x.py', location: { row: 9, column: 1 } }, { code: null, filename: '/r/y.py', location: { row: 2 }, message: 'SyntaxError' }]);
  const r = parseRuff(out, '/r');
  assert.deepEqual(r.violations, [{ rule: 'ruff:PLR2004', file: 'tools/x.py', line: 9 }]);
  assert.deepEqual(r.errors, ['y.py:2 SyntaxError']);
});

test('should say which tool counts each rule when rules are listed (RtLint)', () => {
  assert.deepEqual(toolsFor(['eslint:a', 'ruff:B', 'retro:ts-as-cast', 'team:todo'], { 'team:todo': {} }), { eslint: ['eslint:a'], ruff: ['ruff:B'], patterns: ['retro:ts-as-cast', 'team:todo'], unknown: [] });
  assert.deepEqual(toolsFor(['mystery:x'], {}).unknown, ['mystery:x']);
});

test('should report an error instead of throwing when linter output is not JSON (RtLint fuzz)', () => {
  for (const bad of ['', 'oops', '{', 'null', '[1,2]', '[{"messages":5}]', '[{"filename":null}]']) {
    assert.ok(Array.isArray(parseEslint(bad, '/r').errors));
    assert.ok(Array.isArray(parseRuff(bad, '/r').errors));
  }
  assert.ok(parseEslint('oops', '/r').errors.length);
});
