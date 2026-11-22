// Unit and fuzz tests for speed.mjs: every combination of the five speed flags, and garbage where a decision reads state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlagError } from './flags.mjs';
import { FULL, QUICK, SPEED_DEFAULT, SPEED_ENV, SPEED_OFF, SPEED_OFF_ENV, driverGateRuns, groupMode, mayStore, navigatorReuses, pipelineOf, readSpeed, reviewInParallel, skipCourier, speedForArgs, speedOf, verifyReuses } from './speed.mjs';

const BOOLS = ['quickDriverGate', 'gateReuse', 'courierSkip', 'parallelReview'];
const COMBOS = ['fast', 'paired'].flatMap(pipeline => Array.from({ length: 16 }, (_, i) => ({ pipeline, ...Object.fromEntries(BOOLS.map((k, b) => [k, !!(i & (1 << b))])) })));
const envOf = sp => ({ [SPEED_ENV.pipeline]: sp.pipeline, ...Object.fromEntries(BOOLS.map(k => [SPEED_ENV[k], String(sp[k])])) });
const GARBAGE = [undefined, null, 0, 1, '', 'fast', [], [true], { pipeline: 'FAST' }, { quickDriverGate: 'true' }, { gateReuse: 1 }, { courierSkip: {} }, { parallelReview: [true] }, Object.create(null)];
let seed = 7;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

test('should cover all 32 flag combinations', () => assert.equal(new Set(COMBOS.map(c => JSON.stringify(c))).size, 32));

test('should read the defaults when no flag is set: fast pipeline, every other flag on', () => {
  assert.deepEqual(readSpeed({}), SPEED_DEFAULT);
  assert.deepEqual(SPEED_DEFAULT, { pipeline: 'fast', quickDriverGate: true, gateReuse: true, courierSkip: true, parallelReview: true });
});

test('should read every combination from the environment, in any case, and give it back unchanged through speedOf', () => {
  for (const sp of COMBOS) {
    assert.deepEqual(readSpeed(envOf(sp)), sp);
    assert.deepEqual(readSpeed(Object.fromEntries(Object.entries(envOf(sp)).map(([k, v]) => [k, ` ${v.toUpperCase()} `]))), sp);
    assert.deepEqual(speedOf(sp), sp);
  }
});

test('should stop with the fix when a speed flag holds a value that is not valid', () => {
  assert.throws(() => readSpeed({ PTDD_PIPELINE_MODE: 'turbo' }), e => e instanceof FlagError && e.message === 'PTDD_PIPELINE_MODE=turbo is not valid: use one of fast, paired');
  for (const k of BOOLS) for (const v of ['1', 'yes', 'on', 'ture']) {
    assert.throws(() => readSpeed({ [SPEED_ENV[k]]: v }), e => e instanceof FlagError && e.message === `${SPEED_ENV[k]}=${v} is not valid: use true or false`, `${k}=${v}`);
  }
});

test('should turn every flag off with the all-off environment', () => assert.deepEqual(readSpeed(SPEED_OFF_ENV), SPEED_OFF));

test('should write nothing into the Workflow args when every flag is off, and the whole set otherwise', () => {
  for (const sp of COMBOS) {
    const off = JSON.stringify(sp) === JSON.stringify(SPEED_OFF);
    assert.deepEqual(speedForArgs(sp), off ? undefined : sp, JSON.stringify(sp));
  }
});

test('should read args.speed with every flag off when it is missing or garbage, and take only a real true or the exact "fast"', () => {
  for (const g of GARBAGE) assert.deepEqual(speedOf(g), SPEED_OFF, JSON.stringify(g));
  assert.deepEqual(speedOf({ pipeline: 'fast', gateReuse: true, courierSkip: 'yes' }), { ...SPEED_OFF, pipeline: 'fast', gateReuse: true });
});

test('pmode: plan.mode "fast" or "paired" overrides the flag; unset follows it; any other value is the paired pipeline, as in v2.0.0', () => {
  for (const flag of ['fast', 'paired']) {
    assert.equal(pipelineOf(flag, 'fast'), 'fast');
    assert.equal(pipelineOf(flag, 'paired'), 'paired');
    for (const unset of [undefined, null, '']) assert.equal(pipelineOf(flag, unset), flag);
    for (const other of ['Fast', 'standard', 'FAST', 3, true]) assert.equal(pipelineOf(flag, other), 'paired', `${flag}/${other}`);
  }
});

test('pmode: a group runs fast only in a fast run, from scratch, waiting for no other group', () => {
  const free = { id: 'a', after: [] }, waits = { id: 'b', after: ['a'] }, bare = { id: 'c' };
  assert.equal(groupMode(true, free, 'red'), 'fast');
  assert.equal(groupMode(true, bare, 'red'), 'fast');
  assert.equal(groupMode(true, waits, 'red'), 'paired');
  assert.equal(groupMode(false, free, 'red'), 'paired');
  for (const from of ['red-check', 'red-fix', 'green', 'green-check', 'green-fix', 'done']) assert.equal(groupMode(true, free, from), 'paired', from);
});

test('pquick: the first and the last of a driver\'s gate runs mutate, only a middle run is quick, and never with the flag off', () => {
  for (const sp of COMBOS) for (const runs of [0, 1, 2, 3, 4, 5]) {
    const plan = driverGateRuns(sp, runs);
    assert.equal(plan.length, Math.max(1, runs));
    assert.equal(plan[0], FULL);
    assert.equal(plan[plan.length - 1], FULL);
    assert.ok(plan.every((p, i) => p === (sp.quickDriverGate && i > 0 && i < plan.length - 1 ? QUICK : FULL)), `${JSON.stringify(sp)} ${runs}: ${plan}`);
  }
  assert.deepEqual(driverGateRuns({ ...SPEED_OFF, quickDriverGate: true }, 3), [FULL, QUICK, FULL]);
});

test('preuse, pvreuse: the navigator and verify ask the gate cache only with the flag on, and a store never follows a quick run', () => {
  for (const sp of COMBOS) {
    assert.equal(navigatorReuses(sp), sp.gateReuse);
    assert.equal(mayStore(sp, false, false), sp.gateReuse);
    assert.equal(mayStore(sp, true, false), true, 'an explicit --reuse stores');
    assert.equal(mayStore(sp, true, true), false, 'a quick run has no mutants to store');
    assert.equal(verifyReuses(sp), sp.gateReuse);
  }
});

test('pcourier: the courier is skipped only with the flag on and when every fixer ran and reported its gate ok', () => {
  for (const sp of COMBOS) {
    assert.equal(skipCourier(sp, { a: { gateOk: true }, b: { gateOk: true }, _byHand: { notFixed: [{ id: 'x' }] } }), sp.courierSkip);
    assert.equal(skipCourier(sp, { a: { gateOk: true }, b: { gateOk: false } }), false);
    assert.equal(skipCourier(sp, { a: { gateOk: true }, _extra: { fixed: [] } }), false, 'a fixer with no gate result gets the courier');
    assert.equal(skipCourier(sp, {}), false);
    assert.equal(skipCourier(sp, { _byHand: { notFixed: [] } }), false, 'no fixer ran');
  }
  const on = { ...SPEED_OFF, courierSkip: true };
  for (let i = 0; i < 500; i++) {
    const fixes = Object.fromEntries(Array.from({ length: rnd(4) }, (_, j) => [`g${j}`, [{ gateOk: true }, { gateOk: false }, {}, null, { gateOk: 'true' }][rnd(5)]]));
    const want = Object.keys(fixes).length > 0 && Object.values(fixes).every(f => f && f.gateOk === true);
    assert.equal(skipCourier(on, fixes), want, JSON.stringify(fixes));
  }
  for (const g of GARBAGE) assert.equal(skipCourier(on, g), false, JSON.stringify(g));
});

test('pparrev: the integration tester and the reviewer run together only with the flag on and an integration test to write', () => {
  for (const sp of COMBOS) {
    assert.equal(reviewInParallel(sp, true), sp.parallelReview);
    assert.equal(reviewInParallel(sp, false), false);
  }
});

test('fcompat: every decision with every flag off is the v2.0.0 one', () => {
  for (const off of [SPEED_OFF, speedOf(undefined), speedOf(SPEED_OFF)]) {
    assert.deepEqual(driverGateRuns(off, 3), [FULL, FULL, FULL]);
    assert.equal(navigatorReuses(off), false);
    assert.equal(mayStore(off, false, false), false);
    assert.equal(verifyReuses(off), false);
    assert.equal(skipCourier(off, { a: { gateOk: true } }), false);
    assert.equal(reviewInParallel(off, true), false);
  }
});
