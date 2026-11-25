// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// Every flag of both skills off (PTDD and ZT): the v2.0.0 path end to end.
//   node --test e2e.speed.alloff.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_OFF_ENV, done, runWithJs } from './test-e2e-speed.mjs';

test('should run the v2.0.0 path end to end (same agents, no speed key, no head run, no baseline reuse, no courier skip) when truly every flag of PTDD and ZT is off (fcompat)', async () => {
  const r = await runWithJs(ALL_OFF_ENV); // the JS fixture: it asserts that every navigator GREEN gate mutated
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual(['courierSkipped' in r.out, 'finalReused' in r.verify, r.outputs.some(([, , o]) => /reused:|mutation probe:/.test(o))], [false, false, false]);
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, , o]) => /mutation: \d+ of \d+ mutants/.test(o)), 'every navigator GREEN gate mutated, as in v2.0.0');
});
