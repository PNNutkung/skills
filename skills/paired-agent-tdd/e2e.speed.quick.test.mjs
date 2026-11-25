// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// The quick driver gate on alone.
//   node --test e2e.speed.quick.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_ENV, done, only, runWithJs } from './test-e2e-speed.mjs';

test('pquick: PTDD_QUICK_DRIVER_GATE_ENABLED alone makes each driver\'s middle GREEN run quick (no mutants); the navigator\'s run mutates', async () => {
  const r = await runWithJs(only(SPEED_ENV.quickDriverGate)); // the JS fixture: it asserts that the navigator's run mutates
  done(r);
  const quick = r.outputs.filter(([k]) => k === 'green-quick');
  assert.equal(quick.length, 2, 'one quick run per driver');
  assert.ok(quick.every(([, , o]) => /^GREEN \w ok=false \(quick: no mutants/.test(o) && /mutation: skipped \(--quick\)/.test(o)), quick.map(q => q[2]).join('\n'));
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, cmd, o]) => !/--quick/.test(cmd) && /mutation: \d+ of \d+ mutants/.test(o)), 'the navigator always mutates');
});
