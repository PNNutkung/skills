import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accept, addRule, applyRenames, compare, countsOf, emptyBaseline, lower, parseBaseline, serialize } from './ratchet-core.mjs';

const base = () => ({ version: 1, rules: { 'eslint:no-explicit-any': { 'src/a.ts': 5, 'src/c.ts': 1 }, 'retro:ts-as-cast': {} }, accepted: [] });

test('should fail with the file and both counts when a count goes up (RtBase)', () => {
  const r = compare(base().rules, { 'eslint:no-explicit-any': { 'src/a.ts': 6, 'src/c.ts': 1 }, 'retro:ts-as-cast': {} });
  assert.deepEqual(r.up, [{ rule: 'eslint:no-explicit-any', file: 'src/a.ts', from: 5, to: 6 }]);
  assert.deepEqual(r.down, []);
});

test('should report a drop and nothing up when counts only go down (RtBase, RtLower)', () => {
  const r = compare(base().rules, { 'eslint:no-explicit-any': { 'src/a.ts': 3 }, 'retro:ts-as-cast': {} });
  assert.deepEqual(r.up, []);
  assert.deepEqual(r.down, [{ rule: 'eslint:no-explicit-any', file: 'src/a.ts', from: 5, to: 3 }, { rule: 'eslint:no-explicit-any', file: 'src/c.ts', from: 1, to: 0 }]);
  const lowered = lower(base(), r.down);
  assert.deepEqual(lowered.rules['eslint:no-explicit-any'], { 'src/a.ts': 3 });
});

test('should not let a fix in one file hide a new violation in another when counts are per file (RtGran)', () => {
  const r = compare(base().rules, { 'eslint:no-explicit-any': { 'src/a.ts': 4, 'src/b.ts': 1, 'src/c.ts': 1 }, 'retro:ts-as-cast': {} });
  assert.deepEqual(r.up, [{ rule: 'eslint:no-explicit-any', file: 'src/b.ts', from: 0, to: 1 }]);
  assert.equal(r.down.length, 1);
});

test('should carry the counts to the new path when git renames a file (RtGran)', () => {
  const rules = applyRenames(base().rules, [['src/a.ts', 'src/z.ts']]);
  assert.deepEqual(rules['eslint:no-explicit-any'], { 'src/z.ts': 5, 'src/c.ts': 1 });
  assert.deepEqual(compare(rules, { 'eslint:no-explicit-any': { 'src/z.ts': 5, 'src/c.ts': 1 } }).up, []);
});

test('should fail when old violations move into another file until accept records a reason (RtGran)', () => {
  const current = { 'eslint:no-explicit-any': { 'src/a.ts': 3, 'src/d.ts': 2, 'src/c.ts': 1 } };
  assert.deepEqual(compare(base().rules, current).up, [{ rule: 'eslint:no-explicit-any', file: 'src/d.ts', from: 0, to: 2 }]);
  assert.throws(() => accept(base(), { rule: 'eslint:no-explicit-any', file: 'src/d.ts', count: 2, reason: '  ' }), /reason/);
  assert.throws(() => accept(base(), { rule: 'eslint:unknown', file: 'src/d.ts', count: 2, reason: 'moved' }), /not in .ratchet.json/);
  const b = accept(base(), { rule: 'eslint:no-explicit-any', file: 'src/d.ts', count: 2, reason: 'moved from a.ts', time: 't' });
  assert.equal(b.rules['eslint:no-explicit-any']['src/d.ts'], 2);
  assert.deepEqual(b.accepted.at(-1), { rule: 'eslint:no-explicit-any', file: 'src/d.ts', from: 0, to: 2, reason: 'moved from a.ts', time: 't' });
  assert.deepEqual(compare(b.rules, current).up, []);
});

test('should only look at the given files when the check is scoped to staged files (RtRun)', () => {
  const r = compare(base().rules, { 'eslint:no-explicit-any': { 'src/b.ts': 1 } }, { files: ['src/b.ts'] });
  assert.deepEqual(r.up, [{ rule: 'eslint:no-explicit-any', file: 'src/b.ts', from: 0, to: 1 }]);
  assert.deepEqual(r.down, []);
});

test('should ignore rules that are not in the baseline when the linter reports them (RtBase)', () => {
  assert.deepEqual(compare(base().rules, { 'eslint:other': { 'x.ts': 9 } }).up, []);
});

test('should count violations per rule per file when given a flat list (RtGran)', () => {
  assert.deepEqual(countsOf([{ rule: 'r', file: 'a', line: 1 }, { rule: 'r', file: 'a', line: 2 }, { rule: 'q', file: 'b', line: 1 }]), { r: { a: 2 }, q: { b: 1 } });
});

test('should start a rule at today\'s counts when a proposal adds it (RProp, RtBase)', () => {
  const b = addRule(emptyBaseline(), 'ruff:PLR2004', { 'tools/x.py': 6 });
  assert.deepEqual(b.rules, { 'ruff:PLR2004': { 'tools/x.py': 6 } });
});

test('should round-trip a baseline with sorted keys when serialized (RtFile)', () => {
  const text = serialize({ version: 1, rules: { z: { b: 1, a: 2 }, a: {} }, accepted: [] });
  assert.equal(text, '{\n  "version": 1,\n  "rules": {\n    "a": {},\n    "z": {\n      "a": 2,\n      "b": 1\n    }\n  },\n  "accepted": []\n}\n');
  assert.deepEqual(parseBaseline(text).baseline.rules.z, { a: 2, b: 1 });
});

test('should refuse a baseline with a bad shape when parsing (RtFile)', () => {
  for (const bad of ['', 'nope', '[]', '{"version":2,"rules":{}}', '{"version":1,"rules":{"r":{"a":-1}}}', '{"version":1,"rules":{"r":{"a":1.5}}}', '{"version":1,"rules":{"r":{"/etc/x":1}}}', '{"version":1,"rules":{"r":{"../x":1}}}', '{"version":1,"rules":[]}', '{"version":1,"rules":{},"patterns":{"p":{"regex":"("}}}']) {
    const r = parseBaseline(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(r.errors.length, bad);
  }
  assert.equal(parseBaseline('{"version":1,"rules":{"retro:x":{"a.js":0}},"patterns":{"retro:x":{"regex":"foo","glob":"**/*.js"}}}').ok, true);
});

test('should keep compare and lower consistent when baselines and counts are random (RtBase fuzz)', () => {
  let seed = 7;
  const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const files = ['a', 'b', 'c', 'd/e', 'f g'];
  const rand = () => { const o = {}; for (const r of ['r1', 'r2']) { o[r] = {}; for (const f of files) if (rnd(2)) o[r][f] = rnd(5); } return o; };
  for (let i = 0; i < 400; i++) {
    const b = { version: 1, rules: rand(), accepted: [] };
    const cur = rand();
    const { up, down } = compare(b.rules, cur);
    for (const u of up) assert.ok(u.to > u.from);
    for (const d of down) assert.ok(d.to < d.from);
    const again = compare(lower(b, down).rules, cur);
    assert.deepEqual(again.down, []);
    assert.deepEqual(again.up, up);
    assert.deepEqual(compare(b.rules, b.rules), { up: [], down: [] });
    assert.equal(parseBaseline(serialize(b)).ok, true);
  }
});
