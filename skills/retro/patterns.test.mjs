import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN, applicablePatterns, countPatterns, matchGlob } from './patterns.mjs';

const lines = (rule, file, text, patterns = {}) => countPatterns([{ file, text }], [rule], patterns).filter(v => v.rule === rule).map(v => v.line);

test('should count as casts but not as const, import aliases or comments when the file is TypeScript (CCats)', () => {
  const ts = ['const a = x as Foo;', 'const b = y as const;', "import { z as w } from 'm';", '// x as Foo', "const s = 'a as B';", 'f(<T>(q as unknown as T));', 'export const e = v as E;', "export { p as q } from 'm';", "export * as ns from 'm';"].join('\n');
  assert.deepEqual(lines('retro:ts-as-cast', 'src/a.ts', ts), [1, 6, 6, 7]);
  assert.deepEqual(lines('retro:ts-as-cast', 'src/a.js', 'const a = x as Foo;'), []);
});

test('should count intersection types but not && or &= when the file is TypeScript (CCats)', () => {
  const ts = ['type A = B & C;', 'let ok = a && b;', 'x &= 1;', 'function f(p: Foo & { id: string }) {}'].join('\n');
  assert.deepEqual(lines('retro:ts-intersection', 'a.tsx', ts), [1, 4]);
  assert.deepEqual(lines('retro:ts-intersection', 'a.py', 'x = a & b'), []);
});

test('should count one magic string when a literal is used three or more times in one file (CCats)', () => {
  const js = ["if (s === 'pending') a();", "if (t === 'pending') b();", "log('pending');", "use('done'); use('done');", "import x from 'pending';"].join('\n');
  assert.deepEqual(lines('retro:magic-string', 'x.js', js), [1]);
  assert.deepEqual(lines('retro:magic-string', 'x.py', "A='abc'\nB='abc'\nC=\"abc\""), [1]);
});

test('should count comment lines above a quarter of the code lines when comments outweigh code (CCats)', () => {
  const heavy = ['// one', '// two', '// three', 'a();', 'b();', 'c();', 'd();'].join('\n');
  assert.equal(lines('retro:comment-ratio', 'x.js', heavy).length, 2);
  assert.equal(lines('retro:comment-ratio', 'x.py', '# c\nx=1\ny=2\nz=3\nw=4').length, 0);
});

test('should count commented-out code when a line comment holds code (CCats)', () => {
  const js = ['// const x = 1;', '// explains why we wait', '// try {', '  // return a;', 'call(); // trailing note'].join('\n');
  assert.deepEqual(lines('retro:code-in-comment', 'x.ts', js), [1, 3, 4]);
  assert.deepEqual(lines('retro:code-in-comment', 'x.py', '# import os\n# a note'), [1]);
});

test('should count a custom pattern from .ratchet.json when its glob matches (RtLint)', () => {
  const patterns = { 'team:todo': { regex: 'TODO\\(', glob: 'src/**/*.js' } };
  assert.deepEqual(lines('team:todo', 'src/a/b.js', 'x // TODO( me\nTODO( two', patterns), [1, 2]);
  assert.deepEqual(lines('team:todo', 'lib/b.js', 'TODO(', patterns), []);
});

test('should only offer language rules the repo has when it lists applicable patterns (CCats)', () => {
  assert.deepEqual(applicablePatterns(['a.py', 'b.md']).sort(), ['retro:code-in-comment', 'retro:comment-ratio', 'retro:magic-string']);
  assert.ok(applicablePatterns(['src/x.ts']).includes('retro:ts-as-cast'));
  assert.ok(Object.keys(BUILTIN).every(k => k.startsWith('retro:')));
});

test('should match globs with ** * ? and braces when paths are given (RtLint)', () => {
  for (const [g, p, ok] of [['**/*.ts', 'a/b/c.ts', true], ['**/*.ts', 'c.ts', true], ['src/*.js', 'src/a/b.js', false], ['src/**', 'src/a/b.js', true], ['*.{ts,tsx}', 'a.tsx', true], ['a?.js', 'ab.js', true], ['a?.js', 'a/.js', false], ['docs/[x].md', 'docs/[x].md', true]]) assert.equal(matchGlob(g, p), ok, `${g} ${p}`);
});

test('should never throw when file text is random (CCats fuzz)', () => {
  const alphabet = ["'", '"', '`', '/', '*', '#', '&', ' as ', 'const ', '\n', '{', ';', 'x', '\\', 'ก'];
  let seed = 3;
  for (let i = 0; i < 300; i++) {
    let text = '';
    for (let j = 0; j < 40; j++) text += alphabet[(seed = (seed * 48271) % 2147483647) % alphabet.length];
    for (const file of ['a.ts', 'b.py', 'c.js']) assert.ok(Array.isArray(countPatterns([{ file, text }], Object.keys(BUILTIN), {})));
  }
});
