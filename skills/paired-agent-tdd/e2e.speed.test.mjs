// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over e2e.speed.test.mjs (all off, all on, VMeasure), e2e.speed.flags.test.mjs (pipeline, quick gate, reuse)
// and e2e.speed.review.test.mjs (courier skip, parallel review), so node --test runs them side by side.
// VMeasure: prints agent count, critical-path agent hops and gate wall-clock, all off vs all on.
//   node --test e2e.speed.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_OFF_ENV, ON_ENV, SPEED_OFF_ENV, done, runWith, runWithJs } from './test-e2e-speed.mjs';

const results = {};

test('fcompat: every speed flag off runs the v2.0.0 pipeline: four agents a group, a courier, the reviewer after the integration tester', async () => {
  const r = results.off = await runWith(SPEED_OFF_ENV);
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual([r.gateMs['green-quick'], r.outputs.some(([, , o]) => /reused:/.test(o)), 'finalReused' in r.verify], [undefined, false, false]);
});

test('vmeasure: all flags on against all off: fewer agents and hops; prints agent count, critical-path hops and gate wall-clock', async () => {
  const off = results.off ?? await runWith(SPEED_OFF_ENV), on = results.on = await runWith(ON_ENV);
  done(on);
  const row = (name, r) => `${name.padEnd(8)} agents ${String(r.agents).padStart(2)}  critical-path hops ${String(r.hops).padStart(2)}  gate wall-clock ${(r.gateTotal / 1000).toFixed(2)} s (${Object.entries(r.gateMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}`).join(', ')})`;
  console.log(`# VMeasure (2 groups, b after a, integration test, 1 finding; same scripted agents)\n# ${row('all off', off)}\n# ${row('all on', on)}`);
  assert.ok(on.agents < off.agents, `${on.agents} < ${off.agents}`);
  assert.ok(on.hops < off.hops, `${on.hops} < ${off.hops}`);
});

test('fcompat: with truly every flag off (PTDD and ZT) the whole run is the v2.0.0 path end to end: same agents, no speed key, no head run, no baseline reuse, no courier skip', async () => {
  const r = await runWithJs(ALL_OFF_ENV); // the JS fixture: it asserts that every navigator GREEN gate mutated
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual(['courierSkipped' in r.out, 'finalReused' in r.verify, r.outputs.some(([, , o]) => /reused:|mutation probe:/.test(o))], [false, false, false]);
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, , o]) => /mutation: \d+ of \d+ mutants/.test(o)), 'every navigator GREEN gate mutated, as in v2.0.0');
});
