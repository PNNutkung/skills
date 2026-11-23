// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over e2e.speed.test.mjs (all off, all on, VMeasure), e2e.speed.flags.test.mjs (pipeline, quick gate, reuse)
// and e2e.speed.review.test.mjs (courier skip, parallel review), so node --test runs them side by side.
// Each new flag on alone: the pipeline mode, the quick driver gate, gate reuse.
//   node --test e2e.speed.flags.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
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

test('pquick: PTDD_QUICK_DRIVER_GATE_ENABLED alone makes each driver\'s middle GREEN run quick (no mutants); the navigator\'s run mutates', async () => {
  const r = await runWith(only(SPEED_ENV.quickDriverGate));
  done(r);
  const quick = r.outputs.filter(([k]) => k === 'green-quick');
  assert.equal(quick.length, 2, 'one quick run per driver');
  assert.ok(quick.every(([, , o]) => /^GREEN \w ok=false \(quick: no mutants/.test(o) && /mutation: skipped \(--quick\)/.test(o)), quick.map(q => q[2]).join('\n'));
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, cmd, o]) => !/--quick/.test(cmd) && /mutation: \d+ of \d+ mutants/.test(o)), 'the navigator always mutates');
});

test('preuse, pvreuse: PTDD_GATE_REUSE_ENABLED alone lets each navigator reuse its driver\'s last full run (flake check re-run) and verify reuse the courier\'s final', async () => {
  const r = await runWith(only(SPEED_ENV.gateReuse));
  done(r);
  const nav = r.outputs.filter(([k]) => k === 'green-nav');
  assert.equal(nav.length, 2);
  assert.ok(nav.every(([, cmd, o]) => /--reuse$/.test(cmd) && /^GREEN \w ok=true/.test(o) && /reused: test probe, mutants and coverage/.test(o)), nav.map(n => n[2]).join('\n'));
  assert.equal(r.verify.finalReused, true, 'the courier\'s final ran on the same tree verify sees');
});
