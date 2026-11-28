// Unit and fuzz tests for score.mjs scoreOf (ADR 0011 Interface, A1): value = 100 * (killed + timeout) / (total - equivalent); skipped, inconclusive and
// unverifiable count as not killed; counted 0 -> value null, pass false. value is not rounded; pass = counted > 0 && value >= min; min defaults to 100.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, rng } from './fixtures/repo.mjs';
import { scoreOf } from './score.mjs';

const RESULTS = ['killed', 'survived', 'timeout', 'inconclusive', 'skipped', 'unverifiable', 'equivalent'];
const ms = (...results) => results.map((result, i) => ({ id: `X-${String(i).padStart(8, '0')}`, file: 'src/a.mjs', line: i + 1, op: 'eq-ne', before: 'a', after: 'b', result }));

test('should give 100 and pass when every counted mutant is killed or timed out (Score happy)', () => {
  const s = scoreOf(ms('killed', 'killed', 'timeout', 'killed'), { min: 100 });
  assert.equal(s.value, 100);
  assert.equal(s.pass, true);
  assert.equal(s.counted, 4);
  assert.equal(s.equivalent, 0);
});

test('should fail at min 100 and pass at min 50 when one of two mutants survives (Score fail)', () => {
  const two = ms('killed', 'survived');
  assert.equal(scoreOf(two, { min: 100 }).value, 50);
  assert.equal(scoreOf(two, { min: 100 }).pass, false);
  assert.equal(scoreOf(two, { min: 50 }).pass, true, 'pass is value >= min');
  assert.equal(scoreOf(two, { min: 51 }).pass, false);
});

test('should give value null and pass false when no mutant is counted (Score edge)', () => {
  for (const list of [[], ms('equivalent'), ms('equivalent', 'equivalent')]) {
    const s = scoreOf(list, { min: 0 });
    assert.equal(s.value, null, JSON.stringify(list));
    assert.equal(s.pass, false, 'nothing counted never passes, even at min 0');
    assert.equal(s.counted, 0);
    assert.equal(s.equivalent, list.length);
  }
});

test('should count skipped, inconclusive and unverifiable as not killed when they are in the list (Score)', () => {
  const s = scoreOf(ms('killed', 'skipped', 'inconclusive', 'unverifiable'), { min: 0 });
  assert.equal(s.value, 25);
  assert.equal(s.counted, 4);
  assert.equal(s.pass, true);
});

test('should take equivalent mutants out of the score when some survivors are marked equivalent (Score)', () => {
  const s = scoreOf(ms('killed', 'equivalent', 'timeout', 'equivalent'), { min: 100 });
  assert.equal(s.value, 100);
  assert.equal(s.pass, true);
  assert.equal(s.counted, 2);
  assert.equal(s.equivalent, 2);
});

test('should not round the value when the fraction is not whole (Score)', () => {
  const s = scoreOf(ms('killed', 'survived', 'survived'), { min: 33 });
  assert.ok(Math.abs(s.value - 100 / 3) < 1e-9, String(s.value));
  assert.equal(s.pass, true);
  assert.equal(scoreOf(ms('killed', 'survived', 'survived'), { min: 34 }).pass, false);
});

test('should use min 100 when no min is given (Score)', () => {
  assert.equal(scoreOf(ms('killed', 'timeout')).pass, true);
  assert.equal(scoreOf(ms('killed', 'survived')).pass, false);
  assert.equal(scoreOf(ms('killed', 'survived'), {}).pass, false);
});

test('should throw when min is outside 0-100 or not a number (Score)', () => {
  for (const min of [-1, 101, Number.NaN, '50', null]) assert.throws(() => scoreOf(ms('killed'), { min }), Error, `min ${String(min)}`);
});

test('should agree with an independent oracle when it scores random mutant lists (Score fuzz)', () => {
  const rand = rng(11);
  for (let k = 0; k < 2000; k++) {
    const list = ms(...Array.from({ length: Math.floor(rand() * 12) }, () => pick(rand, RESULTS)));
    const min = Math.floor(rand() * 101);
    const n = r => list.filter(m => m.result === r).length;
    const equivalent = n('equivalent'), counted = list.length - equivalent;
    const value = counted ? (100 * (n('killed') + n('timeout'))) / counted : null;
    const s = scoreOf(list, { min });
    const why = `case ${k}: ${list.map(m => m.result).join(',')} min ${min}`;
    assert.equal(s.counted, counted, why);
    assert.equal(s.equivalent, equivalent, why);
    if (value === null) assert.equal(s.value, null, why);
    else assert.ok(Math.abs(s.value - value) < 1e-9, `${why}: ${s.value} != ${value}`);
    if (value === null || Math.abs(value - min) > 1e-9) assert.equal(s.pass, value !== null && value >= min, why);
  }
});
