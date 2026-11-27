// The fixture of the e2e.default*.test.mjs files: 3 independent groups, 6 DoD items, 18 pairs; the run is test-e2e-run.mjs.
// The DoD comes from an ADR (plan.dodFile) with an `## Interface` section, as the default flags need (ADR 0011: a fast plan with the test writer on reads that section).
// It sets no flag. Each test file passes its own spawn, which starts every process with that file's env (rules/flag-defaults-e2e.md: a flag set in a helper is invisible to the check).
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIRECT_RUNNER, HERE, runE2E } from './test-e2e-run.mjs';

// the definition-of-done skill renders the ADR exactly as `dod.mjs adr` does (a dynamic import: no static import across skills)
const { renderAdr } = await import(pathToFileURL(join(HERE, '..', 'definition-of-done', 'adr.mjs')).href);

const head = name => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${name} } from '../src/${name}.mjs';\n`;
export const GROUPS = {
  a: {
    goal: 'slugify', dod: ['AC1', 'AC2'], tests: 'tests/test_slugify.mjs', src: 'src/slugify.mjs',
    testText: `${head('slugify')}test('test_ac1_happy_words', () => assert.equal(slugify('Hello, World!'), 'hello-world'));
test('test_ac1_fail_non_string', () => assert.throws(() => slugify(42), TypeError));
test('test_ac1_edge_empty', () => assert.equal(slugify(''), ''));
test('test_ac2_happy_cut', () => assert.equal(slugify('abcdef', 3), 'abc'));
test('test_ac2_fail_zero', () => assert.throws(() => slugify('ab', 0), RangeError));
test('test_ac2_edge_no_trailing_dash', () => assert.equal(slugify('ab cd', 3), 'ab'));
test('test_ac2_one', () => assert.equal(slugify('ab', 1), 'a'));
test('test_ac2_default_length', () => assert.equal(slugify('a'.repeat(50)).length, 40));
test('test_ac1_leading', () => assert.equal(slugify('--Hi'), 'hi'));
test('test_ac1_digits', () => assert.equal(slugify('Route 66'), 'route-66'));
`,
    versions: [
      `export function slugify(text, max = 40) {\n  return String(text).toLowerCase();\n}\n`,
      `export function slugify(text, max = 40) {\n  if (typeof text !== 'string') throw new TypeError('text');\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
      `export function slugify(text, max = 40) {\n  if (typeof text !== 'string') throw new TypeError('text');\n  if (max < 1) throw new RangeError('max');\n  // TODO: tighten the character class\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');\n}\n`,
    ],
  },
  b: {
    goal: 'clamp', dod: ['AC3', 'AC4'], tests: 'tests/test_clamp.mjs', src: 'src/clamp.mjs',
    testText: `${head('clamp')}test('test_ac3_happy_inside', () => assert.equal(clamp(5, 0, 10), 5));
test('test_ac3_fail_non_number', () => assert.throws(() => clamp('5', 0, 10), TypeError));
test('test_ac3_edge_at_bounds', () => { assert.equal(clamp(0, 0, 10), 0); assert.equal(clamp(10, 0, 10), 10); });
test('test_ac4_happy_below', () => assert.equal(clamp(-3, 0, 10), 0));
test('test_ac4_fail_inverted', () => assert.throws(() => clamp(1, 10, 0), RangeError));
test('test_ac4_edge_above', () => assert.equal(clamp(11, 0, 10), 10));
test('test_ac4_equal_bounds', () => assert.equal(clamp(3, 2, 2), 2));
`,
    versions: [
      `export function clamp(n, lo, hi) {\n  return n;\n}\n`,
      `export function clamp(n, lo, hi) {\n  if (typeof n !== 'number') throw new TypeError('n');\n  return Math.min(hi, Math.max(lo, n));\n}\n`,
      `export function clamp(n, lo, hi) {\n  if (typeof n !== 'number') throw new TypeError('n');\n  if (lo > hi) throw new RangeError('bounds');\n  return Math.min(hi, Math.max(lo, n));\n}\n`,
    ],
  },
  c: {
    goal: 'countWords', dod: ['AC5', 'AC6'], tests: 'tests/test_countWords.mjs', src: 'src/countWords.mjs',
    testText: `${head('countWords')}test('test_ac5_happy_three', () => assert.equal(countWords('a b c'), 3));
test('test_ac5_fail_non_string', () => assert.throws(() => countWords(null), TypeError));
test('test_ac5_edge_empty', () => assert.equal(countWords(''), 0));
test('test_ac6_happy_runs_of_space', () => assert.equal(countWords('a   b'), 2));
test('test_ac6_fail_object', () => assert.throws(() => countWords({}), TypeError));
test('test_ac6_edge_padded', () => assert.equal(countWords('  a b  '), 2));
test('test_ac6_one', () => assert.equal(countWords('word'), 1));
`,
    versions: [
      `export function countWords(text) {\n  return String(text).split(' ').length;\n}\n`,
      `export function countWords(text) {\n  return String(text).split(/\\s+/).filter(Boolean).length;\n}\n`,
      `export function countWords(text) {\n  if (typeof text !== 'string') throw new TypeError('text');\n  return text.split(/\\s+/).filter(Boolean).length;\n}\n`,
    ],
  },
};
const KIND_TESTS = text => [...text.matchAll(/test\('(test_(ac\d)_(happy|fail|edge)_\w+)'/g)].map(m => ({ dod: m[2].toUpperCase(), kind: m[3], test: m[1] }));
for (const G of Object.values(GROUPS)) G.rows = KIND_TESTS(G.testText).map(r => ({ ...r, file: G.tests }));

export const ITEMS = { AC1: 'slugify lowercases and hyphenates, TypeError for a non-string', AC2: 'slugify cuts to max, RangeError below 1', AC3: 'clamp keeps a number inside, TypeError otherwise', AC4: 'clamp pulls a number to its bounds, RangeError for inverted bounds', AC5: 'countWords counts words, TypeError for a non-string', AC6: 'countWords ignores runs of white space' };
export const ADR_FILE = 'docs/adr/0001-text-utils.md';
export const INTERFACE_MARK = 'slugify(text, max = 40) -> string; clamp(n, lo, hi) -> number; countWords(text) -> number';
/** the ADR of this work: its Definition of done holds ITEMS (3 kinds each), and an `## Interface` section names the API the test writer writes tests against */
export function adrText() {
  const u = { kind: 'user', ref: 'A1', quote: 'A', question: 'Q' };
  const dod = { slug: 'text-utils', touches: ['src/**'], items: Object.entries(ITEMS).map(([id, text]) => ({ id, text, source: u })),
    required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: u }])) };
  const text = renderAdr({ dod, answers: 'A1: A\ntime: t\n', questions: 'Q1: Which helpers?\n(A) all three\n  + one change\n  - three files\n(B) slugify only\n  + smaller\n  - asked again\nrecommended: A\n', ticket: '', number: 1, date: '2026-11-27' }).text
    .replace(/^## Interface\n[\s\S]*?(?=^## )/m, '');
  const iface = `## Interface\n\n\`\`\`mermaid\nflowchart LR\n  s[src/slugify.mjs] ~~~ c[src/clamp.mjs] ~~~ w[src/countWords.mjs]\n\`\`\`\n\n- ${INTERFACE_MARK}\n- Errors: slugify and countWords throw TypeError for a non-string; slugify throws RangeError for max below 1; clamp throws TypeError for a non-number and RangeError when lo > hi.\n\n`;
  return text.replace(/^## Consequences$/m, `${iface}## Consequences`);
}

// survivor: group c's last version gains a constant no test reads, on its last line; the green sample (mutation.max 2) leaves it out, so only the final gate,
// which mutates every changed line, finds it: the judge marks it equivalent and final runs again (ADR 0011 A16)
const UNREAD = 'export const WORDS_MAX = 1000; // a limit no caller reads yet\n';
const withSurvivor = () => ({ ...GROUPS, c: { ...GROUPS.c, versions: [...GROUPS.c.versions.slice(0, -1), `${GROUPS.c.versions.at(-1)}${UNREAD}`] } });

/**
 * One whole run in its own fixture repo through the direct runner. spawn(file, args, fixtureEnv) starts each process with the caller's env. strays: files outside the plan written
 * into the repo after `plan`, as a real run left them. survivor: a mutant only the final gate finds, for the judge.
 */
export function runDefault(spawn, { strays = {}, survivor = false } = {}) {
  const groups = survivor ? withSurvivor() : GROUPS;
  const plan = {
    cmd: 'node {file}', mutation: { max: survivor ? 2 : 10, budget: 60 }, dodFile: ADR_FILE,
    groups: Object.entries(groups).map(([id, G]) => ({ id, goal: G.goal, tests: [G.tests], src: [G.src], dod: G.dod, after: [] })),
  };
  return runE2E({ spawn, runner: DIRECT_RUNNER, plan, groups, prefix: 'pat-e2e-default-', strays, base: { [ADR_FILE]: adrText() } });
}

export const allDone = r => assert.deepEqual(Object.values(r.out.groups).map(g => g.state), ['done', 'done', 'done'], JSON.stringify([r.out.notDone, r.outputs.filter(([k]) => /green|red/.test(k)).map(o => o[2].split('\n').filter(l => /survivor|^(RED|GREEN)/.test(l)).join(' | '))]));
