// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over e2e.speed.test.mjs (all off, all on, VMeasure), e2e.speed.flags.test.mjs (pipeline, quick gate, reuse)
// and e2e.speed.review.test.mjs (courier skip, parallel review), so node --test runs them side by side.
// Each new flag on alone: the courier skip (and a fixer that breaks another group), the parallel review.
//   node --test e2e.speed.review.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, SPEED_ENV, done, only, runWith } from './test-e2e-speed.mjs';

test('pcourier: PTDD_COURIER_SKIP_ENABLED alone spawns no courier when the fixer reports its gate ok; verify is the check', async () => {
  const r = await runWith(only(SPEED_ENV.courierSkip));
  done(r);
  assert.deepEqual([r.labels.filter(l => /^final-verifier/.test(l)), r.out.courierSkipped, r.out.verified], [[], true, null]);
});

test('pparrev: PTDD_PARALLEL_REVIEW_ENABLED alone runs the integration tester and the reviewer at the same time; the reviewer leaves the integration file out', async () => {
  const r = await runWith(only(SPEED_ENV.parallelReview));
  done(r);
  const at = e => r.events.indexOf(e);
  assert.ok(at('start reviewer') < at('end integration-tester') && at('start integration-tester') < at('end reviewer'), r.events.join(', '));
  assert.match(r.calls.find(c => c.label === 'reviewer').prompt, /tests\/integration\/test_flow\.sh is being written now/);
});

test('pcourier: a fixer of group a that breaks group b and still reports its own gate ok: the courier is skipped and verify reports the run not done', async () => {
  const BREAKS_B = `slugify() {\n  [ $# -ge 1 ] || { echo 'text is required' >&2; return 1; }\n  if [ "$1" = 'hello, world' ]; then printf hello_world; return 0; fi\n  s=$(printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-*//; s/-*$//')\n  printf '%s' "$s" | cut -c1-"\${2:-40}" | sed 's/-*$//'\n}\n`;
  const r = await runWith(only(SPEED_ENV.courierSkip), ({ put, exec, cmdOf, GREEN_ANY }) => ({
    fixer: (gid, p) => {
      put(GROUPS.a.src, BREAKS_B); // the TODO is gone, and title('hello, world') no longer gives 'Hello World'; group a's own tests still pass
      exec(cmdOf(p, GREEN_ANY), 'green');
      return { fixed: [/^(R-\S+) \[/m.exec(p)[1]], notFixed: [], gateOk: true, gateRuns: 1 }; // what a fixer reports from its own-group gate
    },
  }));
  assert.deepEqual([r.labels.filter(l => /^final-verifier/.test(l)), r.out.courierSkipped, r.out.groups.b.state], [[], true, 'done']);
  assert.equal(r.verify.final, false, JSON.stringify(r.verify));
  assert.ok(r.verify.notDone.some(n => /^b: final gate not ok \(its tests fail with the whole change: tests\/test_title\.sh\)/.test(n)), JSON.stringify(r.verify.notDone));
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total], [5, 8], 'group b\'s stale GREEN gate covers none of its 3 pairs');
});
