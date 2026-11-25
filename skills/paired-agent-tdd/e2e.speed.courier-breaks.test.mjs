// End to end with the speed flags (ADR 0001): the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name.
// The fixture and the run are in test-e2e-speed.mjs; the flag sets are split over the e2e.speed.<mode>.test.mjs files, one test and one run of wall time a file
// (ADR 0007), so node --test runs them side by side.
// The courier skip on alone, with a fixer that breaks another group.
//   node --test e2e.speed.courier-breaks.test.mjs        (E2E_REAL=1: the zero-trust-review sandbox instead of the direct runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, SPEED_ENV, done, only, runWith } from './test-e2e-speed.mjs';

test('should skip the courier and have verify report the run not done when a fixer of group a breaks group b and still reports its own gate ok (pcourier)', async () => {
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
