// Unit tests for skills/mutation/mutants.mjs (ADR 0011 Interface, A16): the generator moved from zero-trust-review, plus EquivSkip: no const-inc/const-dec on a
// digit inside a regex character class. A digit elsewhere on the same line (outside the class, or in a quantifier) is still a candidate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, fileRanges, generateMutants, sample } from './mutants.mjs';

const all = text => text.split('\n').map((_, i) => i + 1);
const gen = (path, text) => generateMutants(path, text, all(text));
const CONST = /^const-/;
const classes = line => line.match(/\[[^\]]*\]/g) ?? [];

test('should generate the same mutants with the same ids as the zero-trust-review generator did when the line holds no regex (EquivSkip happy)', () => {
  const js = 'function f(a, b) {\n  if (a === b && !b) {\n    return a * 2;\n  }\n  return n <= 3;\n}\n';
  // ids are a hash of file, line, op and the new line: unchanged by the move, so marks in mutation-equivalent.json keep matching
  assert.deepEqual(gen('a.js', js).map(m => [m.id, m.line, m.op, m.after]), [
    ['X-8f7cb79a', 2, 'eq-ne', 'if (a !== b && !b) {'], ['X-a0582480', 2, 'and-or', 'if (a === b || !b) {'], ['X-d822ce2f', 2, 'not-drop', 'if (a === b && b) {'],
    ['X-c862e00f', 3, 'return-none', 'return null;'], ['X-8fdbef49', 3, 'mul-div', 'return a / 2;'], ['X-df526c82', 3, 'const-inc', 'return a * 3;'],
    ['X-94bb2ba6', 5, 'return-none', 'return null;'], ['X-2450f181', 5, 'le-lt', 'return n < 3;'], ['X-5d84c7eb', 5, 'const-inc', 'return n <= 4;'],
  ]);
  assert.deepEqual([...changedLines('+++ b/a.js\n@@ -0,0 +1,2 @@\n+x\n+y\n')], [['a.js', [1, 2]]]);
  assert.deepEqual([...fileRanges('a.py:2-3,b.py')], [['a.py', [[2, 3]]], ['b.py', null]]);
  assert.equal(sample(gen('a.js', js), 3).length, 3);
});

test('should not change a digit inside a regex character class when it makes constant mutants (EquivSkip fail)', () => {
  for (const line of ['const re = /^[a-z0-9]+$/;', 'const NAME_RE = /\\[([a-z0-9][a-z0-9_-]*)\\]/gi;', 'if (/[0-9]/.test(s)) return 1;', 'const r = /[1-3x]/u;']) {
    const ms = gen('a.mjs', `${line}\n`);
    for (const m of ms.filter(x => CONST.test(x.op))) assert.deepEqual(classes(m.after), classes(m.before), `${line}: ${m.op} ${m.after}`);
  }
});

test('should still mutate a digit outside the character class when the same line holds one (EquivSkip edge)', () => {
  const ms = gen('a.mjs', 'const re = /^[a-z0-9]+$/; const n = 5;\n').filter(x => CONST.test(x.op));
  assert.ok(ms.some(m => m.after === 'const re = /^[a-z0-9]+$/; const n = 6;'), JSON.stringify(ms.map(m => m.after)));
  const q = gen('a.mjs', 'const re = /[0-9]x{2}/;\n').filter(x => CONST.test(x.op));
  assert.ok(q.every(m => classes(m.after)[0] === '[0-9]'), JSON.stringify(q.map(m => m.after)));
});
