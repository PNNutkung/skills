// Keeps SKILL.md in step with the code it describes. Run: node --test docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, 'SKILL.md'), 'utf8');
const MUTANTS = join(HERE, '..', 'mutation', 'mutants.mjs');

/** The extensions in mutants.mjs's LANG table (the file types that get mutants), sorted. */
export function mutatedExtensions(src) {
  const table = /const LANG = \{([^}]*)\}/.exec(src);
  if (!table) throw new Error('no `const LANG = { ... }` table in mutants.mjs');
  return [...table[1].matchAll(/([a-z]+)\s*:/g)].map(m => m[1]).sort();
}
/** The extensions SKILL.md's "Mutation covers only" sentence names before "Any other source", sorted. */
export function documentedExtensions(md) {
  const line = md.split('\n').find(l => l.startsWith('Mutation covers only'));
  if (!line) throw new Error('SKILL.md has no "Mutation covers only ..." line');
  return [...line.split('Any other source')[0].matchAll(/`\.([a-z]+)`/g)].map(m => m[1]).sort();
}

test('should name exactly the file types mutants.mjs mutates when SKILL.md says which sources get mutants', () => {
  assert.deepEqual(documentedExtensions(skill), mutatedExtensions(readFileSync(MUTANTS, 'utf8')));
});

test('should fail the comparison when SKILL.md misses a mutated type or names one mutants.mjs does not mutate', () => {
  const src = "const LANG = { py: 'p', js: 'j', go: 'c' };";
  assert.deepEqual(mutatedExtensions(src), ['go', 'js', 'py']);
  assert.notDeepEqual(documentedExtensions('Mutation covers only `.py`, `.js`. Any other source (`.sh`) gets 0 mutants.'), mutatedExtensions(src));
  assert.notDeepEqual(documentedExtensions('Mutation covers only `.py`, `.js`, `.go`, `.sh`. Any other source gets 0 mutants.'), mutatedExtensions(src));
  assert.deepEqual(documentedExtensions('Mutation covers only `.py`, `.js`, `.go`. Any other source (`.sh`, `.txt`) gets 0 mutants.'), ['go', 'js', 'py'], 'the examples after "Any other source" do not count');
});

test('should throw naming what is missing when the LANG table or the SKILL.md line is gone', () => {
  assert.throws(() => mutatedExtensions('const OTHER = {};'), /no `const LANG/);
  assert.throws(() => documentedExtensions('# no such line'), /no "Mutation covers only/);
});
