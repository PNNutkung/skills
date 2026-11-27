// Unit tests for skills/mutation/mutants.mjs (ADR 0011 Interface, A18, A20): the generator moved from zero-trust-review, plus EquivSkip: EQUIV_SKIP lists
// known-equivalent patterns that are not emitted; it starts empty. A regex digit range edit ([a-z0-9] -> [a-z0-10]) is NOT equivalent, so it is still a mutant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as M from './mutants.mjs';

const { changedLines, fileRanges, generateMutants, sample } = M;

const all = text => text.split('\n').map((_, i) => i + 1);
const gen = (path, text) => generateMutants(path, text, all(text));
const CONST = /^const-/;
// the first /.../flags literal in a line, as a RegExp
const regexIn = line => { const m = /\/(.+)\/([a-z]*)/.exec(line); return new RegExp(m[1], m[2].replace('g', '')); };

test('should generate the same mutants with the same ids as the zero-trust-review generator did when the line holds no regex (Module edge)', () => {
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

test('should export EQUIV_SKIP as an empty list when no pattern has a test proving it equivalent (EquivSkip happy)', () => {
  assert.ok(Array.isArray(M.EQUIV_SKIP), `EQUIV_SKIP is ${typeof M.EQUIV_SKIP}`);
  assert.equal(M.EQUIV_SKIP.length, 0);
});

test('should mutate a digit inside a regex character class because the edit matches other inputs (EquivSkip fail)', () => {
  for (const [line, after, input] of [
    ['const re = /^[a-z0-9]+$/;', 'const re = /^[a-z0-10]+$/;', '5'],
    ['const ENV_NAME_RE = /\\[([a-z0-9][a-z0-9_-]*)\\]/gi;', 'const ENV_NAME_RE = /\\[([a-z0-10][a-z0-9_-]*)\\]/gi;', '[5]'],
    ['if (/[0-9]/.test(s)) return 1;', 'if (/[1-9]/.test(s)) return 1;', '0'],
  ]) {
    const ms = gen('a.mjs', `${line}\n`).filter(x => CONST.test(x.op));
    assert.ok(ms.some(m => m.after === after), `${line}: ${JSON.stringify(ms.map(m => m.after))}`);
    // a real test gap: the original and the mutant disagree on `input`
    assert.notEqual(regexIn(line).test(input), regexIn(after).test(input), `${line} vs ${after} on ${input}`);
  }
});

test('should give the regex-class mutant the usual id (hash of file, line, op and new line) when the skip list is empty (EquivSkip edge)', () => {
  const text = 'const n = 5;\nconst re = /^[a-z0-9]+$/;\n';
  const ms = gen('a.mjs', text).filter(x => CONST.test(x.op));
  const id = (line, op, newLine) => `X-${createHash('sha1').update(`a.mjs:${line}:${op}:${newLine}`).digest('hex').slice(0, 8)}`;
  assert.deepEqual(ms.map(m => [m.id, m.line, m.after]), [
    [id(1, 'const-inc', 'const n = 6;'), 1, 'const n = 6;'],
    [id(2, 'const-inc', 'const re = /^[a-z0-10]+$/;'), 2, 'const re = /^[a-z0-10]+$/;'],
  ]);
});

// skip option (A20 Interface): an entry {op, line, reason} drops mutants whose op equals entry.op on original lines that entry.line matches
const JS = 'function f(a, b) {\n  if (a === b && !b) {\n    return a * 2;\n  }\n  return n <= 3;\n}\n';
const REASON = 'test fixture: not a real equivalent pattern';

test('should drop exactly the listed op on matching lines and keep every other mutant and id when skip lists a pattern (EquivSkip happy)', () => {
  const all = gen('a.js', JS);
  const ms = generateMutants('a.js', JS, [1, 2, 3, 4, 5, 6], { skip: [{ op: 'const-inc', line: /\ba \* 2\b/, reason: REASON }] });
  // only the const-inc on line 3 goes; mul-div and return-none on line 3 and const-inc on line 5 stay
  assert.deepEqual(ms, all.filter(m => !(m.line === 3 && m.op === 'const-inc')));
  assert.ok(ms.some(m => m.line === 5 && m.op === 'const-inc'));
  assert.equal(ms.length, all.length - 1);
});

test('should drop nothing when the listed pattern names an op other than the one on the matching line (EquivSkip fail)', () => {
  const ms = generateMutants('a.js', JS, [1, 2, 3, 4, 5, 6], { skip: [{ op: 'eq-ne', line: /\ba \* 2\b/, reason: REASON }] });
  assert.deepEqual(ms, gen('a.js', JS));
});

test('should equal the default output when skip is an empty list (EquivSkip edge)', () => {
  for (const text of [JS, 'const re = /^[a-z0-9]+$/;\n']) assert.deepEqual(generateMutants('a.mjs', text, all(text), { skip: [] }), gen('a.mjs', text));
});
