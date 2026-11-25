// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// The courier skip on alone.
//   node --test e2e.speed.courier.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_ENV, done, only, runWith } from './test-e2e-speed.mjs';

test('pcourier: PTDD_COURIER_SKIP_ENABLED alone spawns no courier when the fixer reports its gate ok; verify is the check', async () => {
  const r = await runWith(only(SPEED_ENV.courierSkip));
  done(r);
  assert.deepEqual([r.labels.filter(l => /^final-verifier/.test(l)), r.out.courierSkipped, r.out.verified], [[], true, null]);
});
