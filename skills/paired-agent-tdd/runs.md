date | run | graph | agents by node | tokens | wall-clock | note
---|---|---|---|---|---|---
2026-10-06 | paired fix run (generator + runbook), an internal service MR | sonnet high / opus high | 2 drivers, 2 navigators, 1 opus reviewer (5 agents) | ~564k | ~368 s | Runbook navigator reported 2 real defects the driver never fixed; opus reviewer re-read the working tree and caught those plus 2 more both navigators missed (arithmetic error in an example, stale code comment). T3 final gate earned its cost.
2026-10-06 | second paired run (3 small assertions), an internal service MR | single sonnet-high navigator | 1 navigator | n/a | n/a | Gap-hunting checklist item ("legitimate future edits that the new check would wrongly reject") found a real false failure. Keep a gap-hunting item in every navigator brief.

## Measured, 2026-10-08 (the rewrite on top of the old graph)

- **Fixed cost per agent type** (Agent tool, one `echo ok` task each, all-in subagent tokens): general-purpose 98,078; code-reviewer 41,261; tdd-guide 38,189; code-simplifier 37,490. A narrow agent type costs about 2.4x less before it does any work, and the judges (code-reviewer) also lose Edit and Write. Drivers, fixer and integration tester use `tdd-guide`; navigators and the reviewer `code-reviewer`.
- **Skill text loaded per invocation:** `SKILL.md` 22,038 bytes before, 13,032 after; the rules moved into briefs the script writes (`workflow.js` prompts are 0.9-1.8 KB each) and into `probes.md` / `tiering.md`, read on demand.
- **Offline proofs, no model:** 37 unit tests for the gates and plan validation (`gates.test.mjs`, `tdd.test.mjs`), 15 scenarios for `workflow.js` with canned agents (streaming without a barrier, the `after` edge, bounded rework, the matrix checked in code, one fixer per owning group, the pool of 6, retry, determinism for resume), and `e2e.test.mjs`: the real `workflow.js` and the real gates in a fixture repo with scripted agents, once with a stub runner and once in the **real seatbelt sandbox** (`E2E_REAL=1`). The end-to-end run exercises: `plan`, RED gate, GREEN gate that **refused weak tests because a mutant survived**, a strengthening pass, the `--retest` re-check, a reviewer finding with a `read` proof, a fixer, `verify` (DoD 8/8 pairs, finding gone, proof confirmed against the tree the reviewer saw), and the user's repo untouched (no commit, no ref).
- **Bugs those tests caught before any real run:** (1) a dependent group's snapshot was a sibling of its base, so the probes' `base...head` merge-base diff dragged the other group's files into its change and mutated them; fixed by making it a child (unit test `a dependent group is judged on its OWN code`). (2) A `mktemp -d` run folder is not approved by `sandbox-run` or `proofcheck` (explicit run dirs must live under the per-user `zt-review-<uid>` base), so the ledger and the proof checks would silently have been off; fixed with `createRunDir` in `runctx.mjs` (no marker, so the review-only guard hook does not restrict the code-writing agents).

- **Independent review of the first version** (a read-only code-reviewer agent, 228k tokens, 29 tool calls, ~16 min) found 10 substantiated defects that all offline tests had missed; each is fixed with a test: (1) the DoD closure credited rows no test backed (`ac10` serving `ac1`, one test listed for three kinds, an empty name); (2) a nit blocked `done` forever; (3) the integration test was never gated; (4) the closure ignored flaky and changed-since-RED groups and credited tests written after GREEN; (5) the prompt allowed `git stash`/`checkout` while six agents share one tree; (6) a stray file made by one group blocked another group's gate; (7) the fixer fence for out-of-plan files came from the reviewer's free text, and the strengthen prompt told the driver to write failing tests; (8) a `src` file the probes never count as source made a group unable to go green; (9) non-ASCII paths were quoted by git and read as stray; (10) a repo that is a subdirectory of a work tree broke the snapshots (RED `ok` for a test that never ran). It also found scratch trees never deleted, a moving `base`, and a stale review marker silently putting the guard on the code-writing agents.

## Estimates, not measurements

- Agents for a 3-group change with one group getting findings: 14 (`graph.mjs --plan 3 0 1`); the old graph for the same change about 27 (1 auditor + 6 per group + integration + 3 dimension reviewers + ~4 fixers; its own counts were never logged). Agent hops on one group's critical path: 6 (7 with an integration test) against 8 (9 with the graph-planner).
- Wall-clock and cost units follow from those counts and the ~40k fixed cost, but **no real run of the new design has been timed yet**.

## On-job runs

One line per real run, from `record.mjs` (`node record.mjs --run RUN --ret return.json --transcript DIR --note JOB --append runs.md`): what happened on a real change, no baseline. A single run is an observation, not a rate: read several before moving a node's model, effort or agent type.

## Not measured yet

- Tokens, cost units, wall-clock and findings of a real model-driven run of the new design on a real change: the first line under **On-job runs** will be the first such number.
- How many survivors are equivalent mutants (a survivor the tests cannot and need not kill), and the mutation time per group on a real suite (default budget 60 s, 12 mutants).
- Whether folding the refactor pair into the green driver loses premature-abstraction catches the old refactor navigator made, and whether the single reviewer still catches what two navigators miss (the 2026-10-06 run).
- Linux `bwrap` and docker backends, a project whose tests need a database (the gates then say `unverifiable`), and a non-JS/Python language.
