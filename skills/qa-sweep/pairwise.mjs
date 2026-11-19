// Input combinations for a requirement with several inputs: every pair of values by default,
// the full product when it is small.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { touch } from './run.mjs';

export const FULL_MAX = 50;
const BAD_INPUT = 'params must be a non-empty object of non-empty arrays';

const isParams = (p) =>
  p !== null && typeof p === 'object' && !Array.isArray(p) &&
  Object.keys(p).length > 0 && Object.values(p).every((v) => Array.isArray(v) && v.length > 0);

const fullProduct = (keys, params) =>
  keys.reduce((rows, k) => rows.flatMap((r) => params[k].map((v) => ({ ...r, [k]: v }))), [{}]);

export function pairwise(params, { fullMax = FULL_MAX } = {}) {
  if (!isParams(params)) throw new Error(BAD_INPUT);
  const keys = Object.keys(params);
  const size = keys.reduce((n, k) => n * params[k].length, 1);
  if (size <= fullMax || keys.length === 1) return fullProduct(keys, params);

  // A pair is "ki,vi,kj,vj" with indexes; uncovered holds those no row has covered yet.
  const id = (i, a, j, b) => `${i},${a},${j},${b}`;
  const uncovered = new Set();
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      for (let a = 0; a < params[keys[i]].length; a++)
        for (let b = 0; b < params[keys[j]].length; b++) uncovered.add(id(i, a, j, b));

  // Uncovered pairs that value b of param k would add with the values already chosen.
  const gain = (chosen, k, b) =>
    chosen.reduce((n, a, i) => {
      if (a === undefined) return n;
      return uncovered.has(i < k ? id(i, a, k, b) : id(k, b, i, a)) ? n + 1 : n;
    }, 0);

  const rows = [];
  while (uncovered.size > 0) {
    // Seed with the first uncovered pair so every row makes progress, then fill the rest greedily.
    const [i, a, j, b] = [...uncovered][0].split(',').map(Number);
    const chosen = new Array(keys.length);
    chosen[i] = a;
    chosen[j] = b;
    for (let k = 0; k < keys.length; k++) {
      if (chosen[k] !== undefined) continue;
      let best = 0, bestGain = -1;
      for (let v = 0; v < params[keys[k]].length; v++) {
        const g = gain(chosen, k, v); // strict > keeps the first value on ties
        if (g > bestGain) { best = v; bestGain = g; }
      }
      chosen[k] = best;
    }
    for (let x = 0; x < keys.length; x++)
      for (let y = x + 1; y < keys.length; y++) uncovered.delete(id(x, chosen[x], y, chosen[y]));
    rows.push(Object.fromEntries(keys.map((k, n) => [k, params[k][chosen[n]]])));
  }
  return rows;
}

function main() {
  const file = process.argv[2];
  try {
    if (!file) throw new Error('usage: node pairwise.mjs FILE.json');
    process.stdout.write(JSON.stringify(pairwise(JSON.parse(readFileSync(file, 'utf8')))) + '\n');
  } catch (e) {
    process.stderr.write(`pairwise: ${e.message}\n`);
    process.exit(2);
  }
  try { touch({ session: process.env.CLAUDE_CODE_SESSION_ID }); } catch {}
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
