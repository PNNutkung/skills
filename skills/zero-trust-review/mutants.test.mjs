// Offline checks for mutants.mjs (the deterministic mutant generator, no model and no I/O). Run: node --test mutants.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, generateMutants, sample } from './mutants.mjs';

const PY = `def f(a, b):
    if a == b and not b:
        return a + 1
    x = g(a)
    return None
`;
const all = text => text.split('\n').map((_, i) => i + 1);
const gen = (path, text, lines = all(text), opts) => generateMutants(path, text, lines, opts);
const byOp = ms => Object.fromEntries(ms.map(m => [m.op, m.newLine]));

test('python: one operator family per mutant, applied to the original line', () => {
  const ms = byOp(gen('a.py', PY));
  assert.equal(ms['eq-ne'], '    if a != b and not b:');
  assert.equal(ms['and-or'], '    if a == b or not b:');
  assert.equal(ms['not-drop'], '    if a == b and b:');
  assert.equal(ms['add-sub'], '        return a - 1');
  assert.equal(ms['const-inc'], '        return a + 2');
  assert.equal(ms['return-none'], '        return None');
  assert.equal(ms['stmt-drop'], '    pass');
});

test('only the requested lines are mutated', () => {
  const ms = gen('a.py', PY, [3]);
  assert.ok(ms.length > 0);
  assert.deepEqual([...new Set(ms.map(m => m.line))], [3]);
});

test('javascript: === !== && || ! true/false and return null', () => {
  const js = 'function f(a, b) {\n  if (a === b && !b) {\n    return a + 1;\n  }\n  return true;\n}\n';
  const ms = byOp(gen('a.js', js));
  assert.equal(ms['eq-ne'], '  if (a !== b && !b) {');
  assert.equal(ms['and-or'], '  if (a === b || !b) {');
  assert.equal(ms['not-drop'], '  if (a === b && b) {');
  assert.equal(ms['return-none'], '  return null;');
  assert.equal(ms['true-false'], '  return false;');
});

test('comparisons: < <= > >= each flip to the boundary neighbour', () => {
  const ms = byOp(gen('a.py', 'ok = n <= 3 and m > 4\n'));
  assert.equal(ms['le-lt'], 'ok = n < 3 and m > 4');
  assert.equal(ms['gt-ge'], 'ok = n <= 3 and m >= 4');
  assert.equal(byOp(gen('a.py', 'ok = n < 3\n'))['lt-le'], 'ok = n <= 3');
  assert.equal(byOp(gen('a.py', 'ok = n >= 3\n'))['ge-gt'], 'ok = n > 3');
});

test('strings and comments are never mutated', () => {
  const text = 'msg = "a == b and not c + 1"  # x == y and 2\n';
  const ms = gen('a.py', text);
  assert.ok(ms.every(m => !/a != b|a == b or|a == b and c|c \+ 2|x != y|x == y or/.test(m.newLine)), JSON.stringify(ms.map(m => m.newLine)));
  assert.deepEqual(ms.map(m => m.op).filter(o => o !== 'stmt-drop'), []);
});

test('python docstrings are skipped, code after them is not', () => {
  const text = 'def f(a):\n    """if a == 1 and not a:\n    return 1\n    """\n    return a == 2\n';
  const lines = gen('a.py', text).map(m => m.line);
  assert.ok(!lines.includes(2) && !lines.includes(3) && !lines.includes(4), `lines ${lines}`);
  assert.ok(lines.includes(5));
});

test('python `in`: only in conditions, never a for-loop or comprehension', () => {
  assert.equal(byOp(gen('a.py', 'if x in xs:\n    pass\n', [1]))['in-notin'], 'if x not in xs:');
  assert.equal(byOp(gen('a.py', 'if x not in xs:\n    pass\n', [1]))['notin-in'], 'if x in xs:');
  assert.deepEqual(gen('a.py', 'for x in xs:\n    pass\n', [1]).map(m => m.op), []);
  assert.deepEqual(gen('a.py', 'ys = [x for x in xs if x]\n', [1]).filter(m => m.op === 'in-notin'), []);
});

test('python `is None` flips both ways, `is not` is left alone by not-drop', () => {
  assert.equal(byOp(gen('a.py', 'if a is None:\n    pass\n', [1]))['none-flip'], 'if a is not None:');
  const ms = gen('a.py', 'if a is not None:\n    pass\n', [1]);
  assert.equal(byOp(ms)['none-flip'], 'if a is None:');
  assert.ok(!ms.some(m => m.op === 'not-drop'));
});

test('statement drop only for whole simple statements', () => {
  assert.equal(byOp(gen('a.py', '    log.info(x)\n', [1]))['stmt-drop'], '    pass');
  assert.equal(byOp(gen('a.py', '    self.n = n + 1\n', [1]))['stmt-drop'], '    pass');
  for (const t of ['    if x:\n', '    return y\n', '    import os\n', '    x = foo(\n', '    @decorator\n', '    else:\n', '    raise ValueError(x)\n', '    foo(a,\n']) {
    assert.ok(!gen('a.py', t, [1]).some(m => m.op === 'stmt-drop'), t);
  }
});

test('a javascript `!` is not dropped inside != or !==, and generics/arrows are not comparisons', () => {
  const ms = gen('a.ts', 'const ok = a !== b && c != d;\nconst f = (x) => x;\nconst l: Array<string> = [];\n');
  assert.ok(!ms.some(m => m.op === 'not-drop'));
  assert.ok(!ms.some(m => ['lt-le', 'gt-ge'].includes(m.op)), JSON.stringify(ms.map(m => [m.op, m.newLine])));
  assert.equal(byOp(ms)['ne-eq'], 'const ok = a === b && c != d;');
});

test('javascript and c-like block-comment lines are never mutated, the code after them is', () => {
  const js = '/**\n * a == b and 2 + 3\n * returns a - 1\n */\nconst x = a == b;\n/* c == d */\n';
  assert.deepEqual([...new Set(gen('a.js', js).map(m => m.line))], [5]);
  assert.deepEqual(gen('a.go', '// a == b\n/* a == b */\n * a == b\n', [1, 2, 3]), []);
});

test('unknown file types and import lines produce nothing', () => {
  assert.deepEqual(gen('a.md', 'a == b and c\n'), []);
  assert.deepEqual(gen('a.py', 'import os\nfrom a import b\n'), []);
  assert.deepEqual(gen('a.js', "const x = require('a');\nimport y from 'y';\n"), []);
});

test('mutants are deterministic, unique by id, and capped per line', () => {
  const a = gen('a.py', PY), b = gen('a.py', PY);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map(m => m.id)).size, a.length);
  assert.ok(a.every(m => /^X-[0-9a-f]{8}$/.test(m.id)));
  const busy = gen('a.py', 'r = a == b and c != d or e + 1 > 2 and not f\n', [1], { perLine: 3 });
  assert.equal(busy.length, 3);
});

test('every mutant really changes its line, and only that line', () => {
  for (const m of gen('a.py', PY)) {
    assert.notEqual(m.newLine, PY.split('\n')[m.line - 1]);
    assert.equal(m.after, m.newLine.trim());
  }
});

test('sample: deterministic, spread over files, never more than max', () => {
  const ms = ['a.py', 'b.py'].flatMap(f => gen(f, PY));
  assert.deepEqual(sample(ms, 100), [...ms].sort((x, y) => (x.file + String(x.line).padStart(6, '0') + x.op).localeCompare(y.file + String(y.line).padStart(6, '0') + y.op)));
  const s = sample(ms, 5);
  assert.equal(s.length, 5);
  assert.deepEqual(s, sample(ms, 5));
  assert.deepEqual(new Set(s.map(m => m.file)), new Set(['a.py', 'b.py']));
});

test('changedLines: added and changed lines of a -U0 diff, new-side numbers', () => {
  const patch = [
    'diff --git a/src/a.py b/src/a.py', 'index 1..2 100644', '--- a/src/a.py', '+++ b/src/a.py',
    '@@ -3 +3,2 @@ def f():', '-old', '+new1', '+new2',
    '@@ -10,2 +11,0 @@', '-gone', '-gone2',
    '@@ -20,0 +21 @@', '+added',
    'diff --git a/gone.py b/gone.py', 'deleted file mode 100644', '--- a/gone.py', '+++ /dev/null', '@@ -1 +0,0 @@', '-x',
    'diff --git a/n.py b/n.py', 'new file mode 100644', '--- /dev/null', '+++ b/n.py', '@@ -0,0 +1,3 @@', '+a', '+b', '+c',
  ].join('\n');
  assert.deepEqual(changedLines(patch), new Map([['src/a.py', [3, 4, 21]], ['n.py', [1, 2, 3]]]));
});
