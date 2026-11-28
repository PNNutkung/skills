// Mutation-gate gap tests for tdd.mjs at the FINAL gate: how many broken existing tests the report lists, the mutant counts, and a mutation run that cannot start.
// tdd.mjs runs in-process through the shared fixture. Run: node --test tdd.mut-final.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put } from './test-fixture.mjs';
import { CALC, CALC_TEST, FG, TW_OFF, jsTest, mfx } from './fixtures/mutation.mjs';

/** plan, RED, source, GREEN (not judged), then FINAL: -> the final result */
async function finalOf(fx, { test: text, src }) {
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: text });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: src });
  assert.equal((await fx.go('green', ['--group', 'a'])).status, 0);
  const final = await fx.go('final');
  assert.equal(final.status, 0, final.err);
  return final;
}

test('should list the first 3 existing tests broken by the change and count all 4 when 4 of them break', async t => {
  const existing = n => `import { g } from '../src/calc.mjs';\nif (g() !== 3) process.exit(1);\n// existing ${n}\n`;
  const files = { [CALC]: 'export const g = () => 3;\n', ...Object.fromEntries([1, 2, 3, 4].map(n => [`tests/existing_${n}.test.mjs`, existing(n)])) };
  const fx = mfx(t, { files, env: TW_OFF });
  const final = await finalOf(fx, { test: jsTest([['f', 2], ['g', 4]]), src: 'export const f = () => 2;\nexport const g = () => 4;\n' });
  assert.match(final.out, /^FINAL ok=false/m, final.out);
  assert.match(final.out, /4 broken by this change/);
  const shown = [...final.out.matchAll(/^ {4}(tests\/existing_\d\.test\.mjs) exit 1 run /gm)].map(m => m[1]);
  assert.equal(shown.length, 3, final.out);
  assert.equal(new Set(shown).size, 3);
});

test('should count each mutant result once when the final report sums the results', async t => {
  const fx = mfx(t, { env: TW_OFF });
  const final = await finalOf(fx, { test: jsTest([['f', 2]]), src: FG }); // f is pinned (killed), g is not (survives)
  assert.match(final.out, /^FINAL ok=false/m, final.out);
  assert.match(final.out, /2 mutant\(s\): 1 killed, 1 survived;/, final.out);
});

test('should count the killed mutants as they are when every mutant is killed', async t => {
  const fx = mfx(t, { env: TW_OFF });
  const final = await finalOf(fx, { test: jsTest([['f', 2], ['g', 3]]), src: FG });
  assert.match(final.out, /^FINAL ok=true/m, final.out);
  assert.match(final.out, /2 mutant\(s\): 2 killed;/, final.out);
});

test('should report the whole message of a mutation run that cannot start when the plan has a bad killExits', async t => {
  const fx = mfx(t, { plan: { killExits: [0] }, env: TW_OFF });
  const final = await finalOf(fx, { test: jsTest([['f', 2], ['g', 3]]), src: FG });
  assert.match(final.out, /^FINAL ok=false/m, final.out);
  assert.match(final.out, /mutation run: killExits must be a list of integers 1-255/, final.out);
});
