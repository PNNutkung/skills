# Tiering: which model and effort each node gets

Aligned to a global subagent routing convention: haiku for data gathering and mechanical work, sonnet for analysis, implementation and review, opus for complex reasoning and architecture. `graph.mjs` is the source of truth for each node's `model`, `effort` and `tier`; `node graph.mjs --check` enforces valid efforts (low|medium|high), tier-model agreement and opus only on the adjudicator and critic; R2, R4 and R5 are review rules.

## Tiers

| Tier | Runs as | Use for |
|---|---|---|
| T0 | code, no agent | Deterministic facts: `git diff --stat`, scoped test and lint output, triage, dedupe, report assembly. |
| T1 | haiku, effort low or medium | Data gathering and mechanical work: log and metric pulls, file reads, greps, status checks, simple edits. T1 output is hints, not facts: whoever consumes it re-checks the quoted evidence. |
| T2 | sonnet | Analysis and implementation with real runs: drivers, reviewers, navigators, probes. Effort medium for makers on routine work; high for checkers whose miss nothing downstream catches (gap hunting). |
| T3 | opus, effort high | Judgement over cross-cutting context: adjudicating a split, completeness critic. |

## Rules

- **R1** No tool-looping agent above effort `high` by default. The harness interrupts an agent that is silent for about 180 s and a retry restarts from zero; higher effort lengthens silent thinking. Raise a node above `high` only from a measurement, and never on a long tool loop.
- **R2** Checker >= maker (model and effort) for any node whose miss nothing downstream re-reads. Declared exception: the deep-mode verifiers below the high reviewer, which the deep-only critic re-reads. Lows have no agent: `proofcheck` (T0) re-checks their quote against the real code.
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
| proofcheck | code | T0 |
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

## Lessons that shaped the tiers

Full figures and dates live in `runs.md`.

- A navigator's real defects that the driver never fixed were caught only by the T3 re-read of the working tree, which also found defects both navigators missed: keep the T3 final gate in paired fix runs.
- Keep a gap-hunting item ("legitimate future edits that the new check would wrongly reject") in every navigator checklist; it has found a real false failure.
- T1 output is hints, not facts: a haiku gatherer returned a claim the synthesizer had to reject as self-contradictory.
- Stock macOS has no `timeout` binary, which once degraded every probe to a code trace. `sandbox-run.mjs` now enforces the timeout itself and sandboxes the run; a host with no sandbox backend (exit 86) makes probes `unverifiable`, never a bare run.
- Cost scales with tool calls times context: the old baseline's slowest reviewer made 16 calls and read 700k cache tokens. Cut calls (T0 probes, prompt text that saves a search), not model tier, first.
- The full-fleet design (one opus triage, a dimension reviewer per theme re-reading one diff, 1-3 skeptics per cluster, the checklist embedded in every prompt, a long-lived lead context) ran 95 agents with 0 refuted and 33 "confirmed low"; the cost levers in SKILL.md exist because of it.
