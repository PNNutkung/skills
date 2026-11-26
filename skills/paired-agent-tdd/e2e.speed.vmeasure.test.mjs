// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// All flags off, and VMeasure: agent count, critical-path agent hops and gate wall-clock, all off vs all on (the two runs side by side in worker threads).
// Both tests share the same two runs (ADR 0008 A6): the all-off run is the one the v2.0.0 pipeline test asserts on, so it runs once.
//   node --test e2e.speed.vmeasure.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ON_ENV, SPEED_OFF_ENV, done, runWithInWorker } from './test-e2e-speed.mjs';

let shared;
const runs = () => (shared ??= Promise.all([runWithInWorker(SPEED_OFF_ENV), runWithInWorker(ON_ENV)])); // two worker threads: about one run of wall time

test('should run the v2.0.0 pipeline (four agents a group, a courier, the reviewer after the integration tester) when every speed flag is off (fcompat)', async () => {
  const [r] = await runs();
  done(r);
  assert.equal('speed' in r.ARGS, false);
  assert.deepEqual(r.labels, ['red-driver:a', 'red-driver:b', 'red-navigator:a', 'red-navigator:b', 'green-driver:a', 'green-navigator:a', 'green-driver:b', 'green-navigator:b', 'integration-tester', 'reviewer', 'fixer:a', 'final-verifier']);
  assert.ok(r.calls.every(c => !/--quick|--reuse|being written now/.test(c.prompt)));
  assert.deepEqual([r.gateMs['green-quick'], r.outputs.some(([, , o]) => /reused:/.test(o)), 'finalReused' in r.verify], [undefined, false, false]);
});

test('should use fewer agents and hops, and print agent count, critical-path hops and gate wall-clock, when all flags are on against all off (vmeasure)', async () => {
  const [off, on] = await runs();
  done(on);
  const row = (name, r) => `${name.padEnd(8)} agents ${String(r.agents).padStart(2)}  critical-path hops ${String(r.hops).padStart(2)}  gate wall-clock ${(r.gateTotal / 1000).toFixed(2)} s (${Object.entries(r.gateMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)}`).join(', ')})`;
  console.log(`# VMeasure (2 groups, b after a, integration test, 1 finding; same scripted agents)\n# ${row('all off', off)}\n# ${row('all on', on)}`);
  assert.ok(on.agents < off.agents, `${on.agents} < ${off.agents}`);
  assert.ok(on.hops < off.hops, `${on.hops} < ${off.hops}`);
});
