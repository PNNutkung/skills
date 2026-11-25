// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// The pipeline mode on alone.
//   node --test e2e.speed.pipeline.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_ENV, done, only, runWith } from './test-e2e-speed.mjs';

test('pmode: PTDD_PIPELINE_MODE=fast alone gives the group with no after one tdd-driver and one navigator over both gates', async () => {
  const r = await runWith(only(SPEED_ENV.pipeline));
  done(r);
  assert.deepEqual(r.labels.filter(l => /^(red|green|tdd)-\S+:a$/.test(l)), ['tdd-driver:a', 'green-navigator:a']);
  assert.deepEqual(r.labels.filter(l => /^(red|green|tdd)-\S+:b$/.test(l)), ['red-driver:b', 'red-navigator:b', 'green-driver:b', 'green-navigator:b']);
  assert.equal(r.out.groups.a.red.merged, true);
});
