import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairwise } from './pairwise.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'pairwise.mjs');
const P = { a: [1, 2, 3], b: ['x', 'y'], c: [true, false], d: [0, 1, 2, 3] };

// Count value pairs of every two distinct params that no row covers.
function uncoveredPairs(params, rows) {
  const keys = Object.keys(params);
  let missing = 0;
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      for (const x of params[keys[i]])
        for (const y of params[keys[j]])
          if (!rows.some((r) => r[keys[i]] === x && r[keys[j]] === y)) missing++;
  return missing;
}

test('a small product is returned in full', () => assert.equal(pairwise({ a: [1, 2, 3], b: ['x', 'y', 'z'] }).length, 9));
test('5 params of 4 values cover every pair in far fewer than 1024 rows', () => {
  const p = Object.fromEntries('abcde'.split('').map((k) => [k, [0, 1, 2, 3]]));
  const rows = pairwise(p);
  console.log(`5x4 rows: ${rows.length}`);
  assert.ok(rows.length <= 35, `got ${rows.length}`);
  assert.equal(uncoveredPairs(p, rows), 0);
});
test('mixed value counts above fullMax cover every pair', () => {
  const rows = pairwise(P, { fullMax: 10 });
  assert.ok(rows.length < 48);
  assert.equal(uncoveredPairs(P, rows), 0);
});
test('the same input gives the same rows', () => assert.deepEqual(pairwise(P, { fullMax: 10 }), pairwise(P, { fullMax: 10 })));
test('rows keep keys in input order', () => assert.deepEqual(Object.keys(pairwise(P, { fullMax: 10 })[0]), Object.keys(P)));
test('one param gives its values', () => assert.deepEqual(pairwise({ a: [1, 2] }), [{ a: 1 }, { a: 2 }]));
test('bad input throws', () => {
  for (const bad of [{}, { a: [] }, null, [], { a: 1 }]) assert.throws(() => pairwise(bad), /non-empty/);
});
test('the CLI prints the rows and exits 2 on a bad file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  const good = join(dir, 'g.json'), bad = join(dir, 'b.json');
  writeFileSync(good, JSON.stringify({ a: [1, 2], b: [3] }));
  writeFileSync(bad, '{nope');
  assert.deepEqual(JSON.parse(execFileSync('node', [CLI, good], { encoding: 'utf8' })), [{ a: 1, b: 3 }, { a: 2, b: 3 }]);
  assert.equal(spawnSync('node', [CLI, bad]).status, 2);
  assert.equal(spawnSync('node', [CLI, join(dir, 'missing.json')]).status, 2);
  assert.equal(spawnSync('node', [CLI]).status, 2);
});
