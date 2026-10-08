---
name: paired-agent-tdd
description: Use for a non-trivial, multi-file feature or bugfix that must be built test-first, with independent verification and a written definition of done (DoD) that the tests demonstrably cover; not for a single-file or one-line change.
---

# Paired Agent TDD

TDD (RED, GREEN) as **driver/navigator pairs**, one pipeline per file group, run by a Workflow script ([`workflow.js`](./workflow.js)) from an execution graph ([`graph.mjs`](./graph.mjs)). Plain-code **gates** ([`tdd.mjs`](./tdd.mjs), [`probes.md`](./probes.md)) produce the facts: tests run in a sandbox, new code is mutated, scope is diffed, the DoD is closed against real runs. Agents judge those facts and never grade their own work. The lead coordinates and never edits code.

**Requires:** Node 18+, git, the Workflow tool, the sibling skill `zero-trust-review` (sandbox runner, mutation probe, `proofcheck.mjs`; `ZT_DIR` if it lives elsewhere), and a sandbox (macOS `sandbox-exec`, Linux `bwrap` or docker). With none, every gate reports `unverifiable`: nothing runs bare. Agent types `tdd-guide` and `code-reviewer` (the judges have no Edit or Write).

Cost levers (figures and what is still an estimate: [`runs.md`](./runs.md)): groups stream through RED and GREEN with no barrier between them; gates are code, not agents; cleanup is one step of the green driver, not two agents; one whole-diff reviewer; one fixer per group; narrow agent types (an agent costs ~40k tokens before it works, so cut agents, not words). **Do not use it reflexively**: it earns its cost only on a multi-file change with real invariants.

## Progress checklist

```
- [ ] 0 Gate: skill needed? DoD written with source quotes; groups partitioned, one owner per file
- [ ] 1 tdd.mjs plan ok; agent count shown (confirm if > 25)
- [ ] 2 Workflow run; compact return read, saved as return.json
- [ ] 3 tdd.mjs verify: DoD closure, unfixed, overridden, notDone, proofcheck
- [ ] 4 Full suite and lint on changed files, once; record the run; report
```

## When to use

- A multi-file change with tests expected, whose files split into groups that can be owned independently (**one owner per file**: teammates share one working tree).
- Not for single-file or one-line changes (use `tdd` or a lone subagent), exploration, or work with no tests. For one group with no fan-out the pairs still buy independent verification, but nothing else.

## Step 0 — Write plan.json (the lead, no agent)

| Field | Rule |
|---|---|
| `dod[]` | One observable behavior each: `{id, text, source, kinds?}`. `id` is alphanumeric (`AC1`: it goes into test names). `source` = a **verbatim quote** from the ticket or request, else `"assumed"`; list the assumed items for the user before spending. `kinds` defaults to `happy, fail, edge`; narrow it only with a reason you state in the report. |
| `groups[]` | `{id, goal, tests[], src[], dod[], after[], mirror?}`: files each group owns, the DoD ids it covers (every id in some group), `after` only when its code imports another group's new code (its GREEN waits; its RED does not), `mirror` = a sibling file whose pattern to copy. |
| `cmd` | The project's one-test-file command with `{file}`, e.g. `pytest -q {file}`. Agents run it directly; the gates run it in the sandbox. `link` (venv dir), `ro` (interpreter install) and `env` as in [`probes.md`](./probes.md). |
| options | `ticket` (path: DoD quotes are checked against it), `cover` + `coverMin` (an lcov-writing command, default minimum 80% of changed lines), `integration {file, goal}` only when the change crosses a process, DB or network boundary, `mutation {max, budget, off}`. |

Partition by file ownership, never by chore. Run the `graph-planner` (opus, one agent) only when files import one another and the groups are unclear; six independent files need no planner. If a driver would need a file another group owns, the groups are wrong: merge them.

## Step 1 — Plan

```bash
SK=${SK:-$HOME/.claude/skills/paired-agent-tdd}
node $SK/tdd.mjs plan --plan plan.json > args.json    # validates, snapshots the base tree, creates the run folder RUN, prints the Workflow args
node $SK/graph.mjs --plan <groups> <integration 0|1> <groups expected to get findings>
```

`plan` refuses an invalid plan with every error at once (unknown DoD id, a file with two owners, a cycle, a quote not in the ticket). The base is HEAD, or a snapshot of the dirty working tree; your repo's index, refs and files are never touched. Show the user the groups, the DoD (assumed items marked) and the agent count. **If the total exceeds 25, confirm before spending.**

## Step 2 — Run

```
Workflow({ scriptPath: "$SK/workflow.js", args: <the JSON in args.json> })
```

`mode: "plan"` is a dry run (counts and prompt sizes). Read the **compact return** only: `{groups{state, reason, red, green, matrix, files}, clusters, fixes, notDone, stats, boardMd, postmortemMd}`. Save it as `return.json`; write `boardMd` and `postmortemMd` into `$RUN`. Resume with `Workflow({scriptPath, resumeFromRunId})` and unchanged args; first check `git status` and `$RUN/gates/*`, because the working tree is the checkpoint (a killed driver's edits are already on disk).

## Step 3 — Verify, then report

```bash
node $SK/tdd.mjs verify --run $RUN --ret return.json
```

It prints `{dod{covered,total,gaps}, final, overridden, unfixed, notDone, proofcheck}` and writes `$RUN/dod-matrix.md`. **Not done while** any DoD gap, `final: false`, an `overridden` entry (a navigator said PASS against its own gate), an `unfixed` finding or a `notDone` group (a failed integration test included) remains; say so with the numbers. Then run the project's full suite once (background) and lint on the changed files only. Report: DoD matrix, blocked groups with their reason, findings by proof status, assumed DoD items.

**Record every real run** (one line, no baseline): `node $SK/record.mjs --run $RUN --ret return.json --transcript <the transcript dir the Workflow result prints> --note "<job>" --append $SK/runs.md`. It reads the cost units, calls and wall-clock from the transcript and the DoD closure, reworks, mutants, coverage and findings from `$RUN`; run `verify` first.

## The graph

<!-- GENERATED:graph -->

```mermaid
graph TD
  graph-planner["graph-planner<br/>opus/high · gated"]
  plan["plan<br/>code"]
  red-driver["red-driver<br/>sonnet/medium · per group"]
  red-gate["red-gate<br/>code · per group"]
  red-navigator["red-navigator<br/>sonnet/high · per group"]
  green-driver["green-driver<br/>sonnet/medium · per group"]
  green-gate["green-gate<br/>code · per group"]
  green-navigator["green-navigator<br/>sonnet/high · per group"]
  integration-tester["integration-tester<br/>sonnet/high · gated"]
  final-gate["final-gate<br/>code"]
  reviewer["reviewer<br/>opus/high"]
  fixer["fixer<br/>sonnet/medium · per group · gated"]
  verify["verify<br/>code"]
  graph-planner --> plan
  plan --> red-driver
  red-driver --> red-gate
  red-gate --> red-navigator
  red-navigator --> green-driver
  green-driver --> green-gate
  green-gate --> green-navigator
  green-navigator --> integration-tester
  green-navigator --> final-gate
  integration-tester --> final-gate
  final-gate --> reviewer
  reviewer --> fixer
  fixer --> verify
```

<!-- /GENERATED:graph -->

`node graph.mjs --check` prints layers and the critical path and fails on drift; `--write` regenerates this diagram, the tiers table and the node table in `workflow.js`. Protect: every group starts RED at once; a gate follows its driver in the same pipeline; `after` delays only GREEN; the reviewer reads the whole diff **once**.

## What the gates check (T0, [`probes.md`](./probes.md))

| Gate | Run by | Facts |
|---|---|---|
| `red` | red-navigator, first command | each new test file **fails now**, and how: assertion, load error, passes already, missing |
| `green` | green-navigator, first command | tests pass and **fail once the group's code is reverted** (they pin it), no flake, **tests unchanged since RED**, **mutants of the new lines** (a survivor is a test gap with a citable run), changed-line coverage |
| `final` | reviewer, first command | all group tests together, existing tests that mention the changed modules (new regression or already failing), stray files (a note at `green`, a blocker here), the whole-diff patch |
| `verify` | lead | DoD closure from the gate files, fixes still present, reviewer proofs re-checked |

Each group is judged in a snapshot of the base plus **only its own files** (and the finished groups it waits for), so another group's half-written edit never fails it, and the groups' gates run side by side.

## Rules

- **Lead-only.** The lead plans, launches, reads, verifies. It never writes test or code (a one-line fix it fully understands is the only exception) and never re-verifies what a gate already proved. Teammates cannot spawn teammates: reworks are scheduled by the script.
- **A verifier is always a separate node.** A navigator did not write the work, runs the gate first and judges the output; a claim it did not see in a gate or a file it read is not a fact. The judges cannot edit.
- **DoD closure.** Every DoD id needs a test per required kind, its name carrying the id set apart (`test_ac1_happy`), one test per (id, kind). The script checks the matrix in code before a navigator is paid for; `verify` re-derives coverage from gate files: a pair counts only if its test file failed at RED and passes at GREEN.
- **Bounded rework (R4).** A navigator FAIL (or any defect) gets ONE rework and ONE re-check (plus one rework before the navigator when the code-checked matrix has a gap), then the group is `blocked` and so is everything that waits for it. A surviving mutant is a test gap: it goes to a test-strengthening pass (tests only, never weakened) beside any code fix; the re-check gate runs with `--retest`. A reported defect is never shipped unaddressed: it is fixed or listed under `notDone`.
- **Frozen tests.** GREEN never edits a test; a wrong test is reported (`testDefects`), not patched.
- **Hard scope fence.** Every driver and fixer prompt names the only files it may edit and what to report instead; `final` lists any other changed file.
- **One task, one deliverable.** A driver that needs work beyond its brief stops and reports; split at capability boundaries only.
- **Precedent and research first** (in every driver prompt): grep sibling tests for the same flag before asserting a fail or edge behavior (a contradiction means the new test is probably wrong), and look for an existing helper, then the installed library docs, before writing new code. Genuine ambiguity: stop and use `wayfinder` or `grill-with-docs`, naming the decision.
- **Tool discipline.** Read/Edit/Write/Grep/Glob for files; Bash only for the test command, git and linters; never `sed` or a heredoc to edit.
- **Ponytail per node:** drivers `ultra`, navigators and fixer `full`, integration tester `lite`, reviewer `off`. Never compress validation at trust boundaries, data-loss handling, security or accessibility.

## Tiering

Aligned to the global subagent routing: T0 code for anything deterministic, T2 sonnet for analysis and implementation, T3 opus only for once-per-run judges (planner, reviewer). Rules R1-R6 and the measured agent-type costs: [`tiering.md`](./tiering.md).

<!-- GENERATED:tiers -->

| node | tier | model | effort | agent type | ponytail | calls | gate/fanout |
|---|---|---|---|---|---|---|---|
| graph-planner | T3 | opus | high | planner | full | - | only when the import structure is unknown |
| red-driver | T2 | sonnet | medium | tdd-guide | ultra | 40 | per group |
| red-navigator | T2 | sonnet | high | code-reviewer | full | 25 | per group |
| green-driver | T2 | sonnet | medium | tdd-guide | ultra | 45 | per group |
| green-navigator | T2 | sonnet | high | code-reviewer | full | 25 | per group |
| integration-tester | T2 | sonnet | high | tdd-guide | lite | 35 | only when the change crosses a process, DB or network boundary |
| reviewer | T3 | opus | high | code-reviewer | off | 40 | - |
| fixer | T2 | sonnet | medium | tdd-guide | full | 35 | per group, only for groups with findings |

<!-- /GENERATED:tiers -->

`node graph.mjs --check` fails on: a missing effort, tier/model mismatch, opus outside planner and reviewer, a navigator weaker than its driver, a judge with edit tools, a cleanup or auditor agent coming back, a per-dimension reviewer.

## Iterate from measurements

Each real run is recorded by `record.mjs` in [`runs.md`](./runs.md) (per-node detail: `node ../zero-trust-review/measure.mjs <transcriptDir>`); move one node's model, effort or agent type only from those numbers. The critical path is the wall-clock floor of one group: shorten it by removing an edge. Evals: [`evals.json`](./evals.json).

## Terminology

Graph vocabulary (nodes, edges, "the verifier is always a separate node", "plain code for anything deterministic") comes from practitioner writing on multi-agent control graphs, not from Andrew Ng; do not attribute it to him. An **execution** graph (this file) is not a **knowledge** graph (codebase indexes); never schedule work with a knowledge-graph tool.

## Links out

`tdd` (RED/GREEN/REFACTOR mechanics), `zero-trust-review` (its probes run here; use it for the review of the finished diff in a fresh session), `ai-code-delivery` (flag, proof and rollout gates), `superpowers:verification-before-completion` (evidence before claims), `e2e-runner` for a frontend integration test, `wayfinder` / `grill-with-docs` (ambiguity), `prototype` (when the RED shape is unclear).
