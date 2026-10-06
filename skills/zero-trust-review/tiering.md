# Tiering: which model and effort each node gets

Aligned to a global subagent routing convention: haiku for data gathering and mechanical work, sonnet for analysis, implementation and review, opus for complex reasoning and architecture. `graph.mjs` is the source of truth for each node's `model`, `effort` and `tier`; `node graph.mjs --check` enforces valid efforts (low|medium|high), tier-model agreement and opus only on the adjudicator and critic; R2, R4 and R5 are review rules.

## Tiers

| Tier | Runs as | Use for |
|---|---|---|
| T0 | code, no agent | Deterministic facts: `git diff --stat`, scoped test and lint output, triage, dedupe, report assembly. |
| T1 | haiku, effort low or medium | Data gathering and mechanical work: log and metric pulls, file reads, greps, status checks, simple edits. T1 output is LEADS, not facts: whoever consumes it re-checks the quoted evidence. |
| T2 | sonnet | Analysis and implementation with real runs: drivers, reviewers, navigators, probes. Effort medium for makers on routine work; high for checkers whose miss nothing downstream catches (gap hunting). |
| T3 | opus, effort high | Judgement over cross-cutting context: adjudicating a split, completeness critic. |

## Rules

- **R1** No tool-looping agent above effort `high` by default. The harness interrupts an agent that is silent for about 180 s and a retry restarts from zero; higher effort lengthens silent thinking. Raise a node above `high` only from a measurement, and never on a long tool loop.
- **R2** Checker >= maker (model and effort) for any node whose miss nothing downstream re-reads. Declared exception: batch-verifier (low clusters only; a miss costs a low or nit) and the deep-mode verifiers below the high reviewer, which the deep-only critic re-reads.
- **R3** Opus only on once-per-run or gated judge nodes.
- **R4** A verifier that rejects or downgrades a finding never sends it back to the reviewer; a refute/reproduce split goes to the adjudicator, and a defect the report carries is never dropped silently. In a paired-agent-tdd fix run that follows a review, a navigator defect gets one bounded rework pass.
- **R5** Move one node's model or effort at a time, only from measured runs, and log each run in `runs.md`.
- **R6** Every tier value is a starting guess, not a finding.

## Node tiers

| Node | Model / effort | Tier |
|---|---|---|
| triage | code | T0 |
| reviewer | sonnet medium (deep mode: high via `MODES.deep.effort`) | T2 |
| test-auditor | sonnet medium | T2 |
| integration-probe | sonnet medium | T2 |
| dedupe | code | T0 |
| verifier-refute | sonnet medium | T2 |
| verifier-reproduce | sonnet medium | T2 |
| batch-verifier | sonnet low | T2 |
| adjudicator | opus high | T3 |
| critic | opus high | T3 |
| gap-reviewer | sonnet high | T2 |
| report | code | T0 |

No node qualifies for haiku (T1): every agent node reads code and judges it. T1 is for a pure gather node only.

## Raising one node for one run

1. Edit `MODES.<mode>.effort` (per mode) or the node's `effort` (every mode) in `graph.mjs`. Values are `low`, `medium`, `high` only; `--check` rejects anything else.
2. `node graph.mjs --write` (regenerates the diagram and the node table in `workflow.js`).
3. `node graph.mjs --check`, then `node workflow.test.mjs`.
4. Run, then log the run in `runs.md`. Revert unless the numbers justify keeping it.

## Measured evidence (2026-10-06, an internal service MR)

- Standard zero-trust-review run: 5 files, 470 source lines, 2 groups: 7 agents (reviewer 2, verifier-refute 2, verifier-reproduce 2, batch-verifier 1), ~407k subagent tokens, ~316 s, 7 findings all low/nit, 5 confirmed.
- Paired fix run (generator + runbook, 2 drivers + 2 navigators + 1 opus reviewer, sonnet high / opus high): 5 agents, ~564k tokens, ~368 s. a navigator reported 2 real defects that the driver never fixed; the opus reviewer's re-read of the working tree found them still present, plus 2 more both navigators missed (an arithmetic error in an example and a stale code comment). The T3 final gate earned its cost.
- A second paired run (3 small assertions, 1 sonnet-high navigator): its gap-hunting checklist item ("legitimate future edits that the new check would wrongly reject") found a real false failure. Keep a gap-hunting item in every navigator checklist.
- A haiku-medium log gatherer in an earlier read-only workflow returned a claim that the synthesizer had to reject as self-contradictory: T1 output is leads, not facts.

Limitation: in the standard run two verifiers reported UNVERIFIED because the macOS host has no `timeout` binary; their probes degraded to code traces. On such hosts expect more `unverifiable` verdicts from reproduce probes.

## History

The previous version cost **USD 34.75** per run:

- **Attempt 1:** 27 agents, 6.7M tokens wasted: the harness interrupts any agent silent for ~180 s and every retry restarted from zero; 9 long reviewers died on one gateway stall.
- **Attempt 2 (resumed):** 95 agents, 5.8M tokens: 2 audit agents (~11.5k unit tests run on HEAD *and* a baseline copy; a Docker Postgres probe); 9 dimension reviewers re-reading one diff (15 of 30 points ended N/A after ~45 tool calls each); 1 opus triage; 53 clusters x 1-3 skeptics (~75 verifiers, 0 refuted, 33 "confirmed low"); 1 opus critic; 5 gap reviewers whose 13 findings were verified again. Prompts embedded ~18 KB of checklist and context; the lead's context was re-billed every turn.
