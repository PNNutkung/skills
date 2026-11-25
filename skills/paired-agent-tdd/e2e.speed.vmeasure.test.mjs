// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// VMeasure: prints agent count, critical-path agent hops and gate wall-clock, all off vs all on (the two runs side by side in worker threads).
//   node --test e2e.speed.vmeasure.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ON_ENV, SPEED_OFF_ENV, done, runWithInWorker } from './test-e2e-speed.mjs';

test('vmeasure: all flags on against all off: fewer agents and hops; prints agent count, critical-path hops and gate wall-clock', async () => {
  const [off, on] = await Promise.all([runWithInWorker(SPEED_OFF_ENV), runWithInWorker(ON_ENV)]); // two worker threads: about one run of wall time
  done(on);
  const row = (name, r) => `${name.padEnd(8)} agents ${String(r.agents).padStart(2)}  critical-path hops ${String(r.hops).padStart(2)}  gate wall-clock ${(r.gateTotal / 1000).toFixed(2)} s (${Object.entries(r.gateMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}`).join(', ')})`;
  console.log(`# VMeasure (2 groups, b after a, integration test, 1 finding; same scripted agents)\n# ${row('all off', off)}\n# ${row('all on', on)}`);
  assert.ok(on.agents < off.agents, `${on.agents} < ${off.agents}`);
  assert.ok(on.hops < off.hops, `${on.hops} < ${off.hops}`);
});
