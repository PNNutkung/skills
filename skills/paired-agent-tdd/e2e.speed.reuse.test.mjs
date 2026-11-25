// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// Gate reuse on alone.
//   node --test e2e.speed.reuse.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_ENV, done, only, runWith } from './test-e2e-speed.mjs';

test('preuse, pvreuse: PTDD_GATE_REUSE_ENABLED alone lets each navigator reuse its driver\'s last full run (flake check re-run) and verify reuse the courier\'s final', async () => {
  const r = await runWith(only(SPEED_ENV.gateReuse));
  done(r);
  const nav = r.outputs.filter(([k]) => k === 'green-nav');
  assert.equal(nav.length, 2);
  assert.ok(nav.every(([, cmd, o]) => /--reuse$/.test(cmd) && /^GREEN \w ok=true/.test(o) && /reused: test probe, mutants and coverage/.test(o)), nav.map(n => n[2]).join('\n'));
  assert.equal(r.verify.finalReused, true, 'the courier\'s final ran on the same tree verify sees');
});
