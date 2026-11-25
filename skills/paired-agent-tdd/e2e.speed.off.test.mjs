// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// All flags off: the v2.0.0 pipeline.
//   node --test e2e.speed.off.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_OFF_ENV, done, runWith } from './test-e2e-speed.mjs';

test('should run the v2.0.0 pipeline (four agents a group, a courier, the reviewer after the integration tester) when every speed flag is off (fcompat)', async () => {
  const r = await runWith(SPEED_OFF_ENV);
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual([r.gateMs['green-quick'], r.outputs.some(([, , o]) => /reused:/.test(o)), 'finalReused' in r.verify], [undefined, false, false]);
});
