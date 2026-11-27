---
name: paired-agent-tdd
description: Use for a non-trivial, multi-file feature or bugfix that must be built test-first, with independent verification and a written definition of done (DoD) that the tests demonstrably cover; not for a single-file or one-line change.
---

# Paired Agent TDD

TDD (RED, GREEN) as **driver/navigator pairs**, one pipeline per file group, run by a Workflow script ([`workflow.js`](./workflow.js)) from an execution graph ([`graph.mjs`](./graph.mjs)). Plain-code **gates** ([`tdd.mjs`](./tdd.mjs), [`probes.md`](./probes.md)) produce the facts: tests run, new code is mutated, scope is diffed, the DoD is closed against real runs. Agents judge those facts and never grade their own work. **A stage is a loop, never one shot** (repair loop, Rules below).

**Requires:** Node 22+, git, the Workflow tool, the sibling skills `zero-trust-review` (probes, `proofcheck.mjs`, sandbox runner; `ZT_DIR`) and `mutation` (the engine; `MUTATION_DIR`). The gates run the test command **directly** (your rights, your network); `plan.sandbox: true` confines it. Agent types `tdd-guide` and `code-reviewer` (the judges have no Edit or Write).

**Reply style:** each technical term in English, then a short note in brackets in the user's language; ASD-STE100 sentences ([rule](../../rules/reply-style.md)).

## Progress checklist

```
- [ ] 0 Gate: skill needed? DoD written with source quotes; groups partitioned, one owner per file
- [ ] 1 tdd.mjs plan ok; agent count shown (confirm if > 25)
- [ ] 2 Workflow run; compact return read, saved as $RUN/return.json
- [ ] 3 tdd.mjs verify: DoD closure, unfixed, overridden, notDone, proofcheck
- [ ] 3b Rename test_ac* to the naming rule; guard passes
- [ ] 4 Full suite and lint on changed files, once; record the run; report
```

## When to use

- A multi-file change with tests, whose files split into groups owned independently (**one owner per file**: one shared working tree). Not for one-file changes (`tdd`), exploration, or work with no tests.

## Step 0 — Write plan.json (the lead, no agent)

| Field | Rule |
|---|---|
| `dod[]` | One observable behavior each: `{id, text, source, kinds?}`. `id` alphanumeric (`AC1`: it goes into test names). `source` = a **verbatim quote** from the request, else `"assumed"` (list those for the user). `kinds` default `happy, fail, edge`; narrow only with a stated reason. |
| `dodFile` | In place of `dod[]`: the committed ADR of the definition-of-done skill; needed by the test writer (its `## Interface`). With neither, the ADR whose `touches` cover the `src` (`PTDD_ADR_AUTO_FIND_ENABLED`). [`probes.md`](./probes.md#planjson). |
| `groups[]` | `{id, goal, tests[], src[], dod[], after[], mirror?}`: owned files, the DoD ids covered (each id in some group), `after` only when its code imports another group's new code (its GREEN waits), `mirror` = a sibling file to copy. |
| `cmd` | The one-test-file command with `{file}` (`pytest -q {file}`), run by agents and gates; `link`, `env`, `ro`: [`probes.md`](./probes.md). |
| options | `ticket` (DoD quotes are checked against it), `cover` + `coverMin` (lcov command, default 80% of changed lines), `integration {file, goal}` only across a process, DB or network boundary, `mutation {max, budget, off, accept}` (`off` and each `accept` value: a user answer id, `"A9"`), `rounds` (repair rounds per stage, 1-4, default 3), `maxRepairs` (first-run repairs, default 2 a group), `smoke` (1-3 tests that pass at the base), `sandbox` (true = confined gates), `mode` (`"fast"`/`"paired"`). `src` may hold config files; never a test-like path. |

Mutation covers only these source types (`skills/mutation/mutants.mjs`): `.py`, `.js` `.jsx` `.mjs` `.cjs` `.ts` `.tsx`, and the C-like `.go` `.java` `.c` `.h` `.cc` `.cpp` `.cs` `.rs` `.kt` `.swift` `.php` `.scala`. Any other source (`.sh`, `.txt`, ...) gets 0 mutants: a changed code file of that kind needs `mutation.accept` (data and config files are exempt).

Partition by file ownership, never by chore; the `graph-planner` (opus) only when imports make the groups unclear. A driver that needs another group's file means: merge the groups.

## Step 1 — Plan

```bash
SK=${SK:-$HOME/.claude/skills/paired-agent-tdd}
W=$(mktemp -d)   # not in the repo: a stray file fails final
node $SK/tdd.mjs plan --plan $W/plan.json   # validates, snapshots the base, makes RUN, prints the Workflow args ($RUN/args.json)
node $SK/graph.mjs --plan <groups> <integration 0|1> <groups expected to get findings> [fast]
```

`plan` refuses an invalid plan (every error at once) and a runner that cannot run the repo's tests (**preflight**; `--skip-preflight` goes on unproven). The base is HEAD, or a snapshot of a dirty tree; your index, refs and files are never touched. Show the user the groups, the DoD (assumed items marked), the agent count and the ceiling `--plan` prints. **Over 25: confirm first** ([cap](./probes.md#planjson)).

## Step 2 — Run

```
Workflow({ scriptPath: "$SK/workflow.js", args: <$RUN/args.json> })
```

`mode: "plan"`: a dry run (counts, ceiling, prompt sizes). Read the **compact return** only (`groups`, `clusters`, `fixes`, `verified`, `judge`, `notDone`, `stats`); save it as `$RUN/return.json`, write `boardMd` and `postmortemMd` into `$RUN`.

**Continue after a failure** (a group `failed`, `blocked` or `paused`, or the run died): `node $SK/tdd.mjs resume --run $RUN [--ret $RUN/return.json] [--max-repairs N]` reads the gate files (no agent) and writes `$RUN/continue.json`; run the Workflow again with `args: {...args, resume: <that file>}`. A group on `env` (fix the runner) or `hold` (the same defects stalled; [`probes.md`](./probes.md) "resume") spends nothing until you decide.

## Step 3 — Verify, then report

```bash
node $SK/tdd.mjs verify --run $RUN --ret $RUN/return.json
```

It prints `{dod{covered,total,gaps}, final, overridden, unfixed, notDone, proofcheck}` and writes `$RUN/dod-matrix.md`. **Not done while** a DoD gap, `final: false`, an `overridden` entry, an `unfixed` finding or a `notDone` entry remains; say so with the numbers. Then rename tests to the naming rule (probes.md), run the full suite once and lint the changed files. Report: DoD matrix, blocked groups, findings by proof status, assumed DoD items, and the judge's equivalent mutants (final report) for the PR body.

**Record every real run** after `verify`: `node $SK/record.mjs --run $RUN --ret $RUN/return.json --transcript <the Workflow transcript dir> --note "<job>" --append $SK/runs.md`.

## Speed flags (env, read once by `plan`)

`PTDD_PIPELINE_MODE=fast|paired`, default **fast**: a group that waits for no other gets one maker pass and ONE navigator over both gates (`plan.mode` overrides). Switches, default `true`: `PTDD_QUICK_DRIVER_GATE_ENABLED`, `PTDD_GATE_REUSE_ENABLED`, `PTDD_COURIER_SKIP_ENABLED`, `PTDD_PARALLEL_REVIEW_ENABLED`; all off is v2.0.0. `PTDD_INPROCESS_RUNNER_ENABLED` (default `true`, read by every gate) runs `direct-run.mjs` in the gate's process. An invalid value stops the command. [`probes.md`](./probes.md) "Speed flags".

**Mutation gate** (ADR 0011, read by every gate): `PTDD_MUTATION_SCORE_MIN` (0-100, default 100; a survivor always fails), `PTDD_MUTATION_MAX` (final gate count, default `unlimited`: every changed line, no time limit). **`PTDD_TEST_WRITER_ENABLED`** (default `true`): in fast mode a `test-writer` writes the tests from the DoD and the ADR `## Interface` (plan needs that `dodFile`), a `code-driver` the code (a wrong test: a `testWrong` note, never an edit), a `judge` marks final survivors equivalent; `false`: one `tdd-driver`. [`probes.md`](./probes.md) "Mutation gate".

## The graph

<!-- GENERATED:graph -->

```mermaid
graph TD
  graph-planner["graph-planner<br/>opus/high · gated"]
  plan["plan<br/>code"]
  red-driver["red-driver<br/>sonnet/medium · per group"]
  test-writer["test-writer<br/>sonnet/medium · per group · gated"]
  red-gate["red-gate<br/>code · per group"]
  red-navigator["red-navigator<br/>sonnet/high · per group"]
  green-driver["green-driver<br/>sonnet/medium · per group"]
  tdd-driver["tdd-driver<br/>sonnet/medium · per group · gated"]
  code-driver["code-driver<br/>sonnet/medium · per group · gated"]
  green-gate["green-gate<br/>code · per group"]
  green-navigator["green-navigator<br/>sonnet/high · per group"]
  integration-tester["integration-tester<br/>sonnet/high · gated"]
  final-gate["final-gate<br/>code"]
  reviewer["reviewer<br/>opus/high"]
  judge["judge<br/>sonnet/high · gated"]
  fixer["fixer<br/>sonnet/medium · per group · gated"]
  final-verifier["final-verifier<br/>haiku/low · gated"]
  verify["verify<br/>code"]
  graph-planner --> plan
  plan --> red-driver
  plan --> test-writer
  red-driver --> red-gate
  test-writer --> red-gate
  red-gate --> red-navigator
  red-navigator --> green-driver
  plan --> tdd-driver
  test-writer --> code-driver
  green-driver --> green-gate
  tdd-driver --> green-gate
  code-driver --> green-gate
  green-gate --> green-navigator
  green-navigator --> integration-tester
  green-navigator --> final-gate
  integration-tester --> final-gate
  final-gate --> reviewer
  reviewer --> judge
  reviewer --> fixer
  judge --> fixer
  fixer --> final-verifier
  final-verifier --> verify
```

<!-- /GENERATED:graph -->

`node graph.mjs --check` fails on drift (`--write` regenerates). Protect: every group starts RED at once; `after` delays only GREEN; the reviewer reads the whole diff **once**.

## What the gates check (T0, [`probes.md`](./probes.md))

| Gate | Run by | Facts |
|---|---|---|
| `red` | red-driver (its loop), red-navigator | each new test file **fails now**, and how: assertion, load error, passes already, missing |
| `green` | makers (their loop), green-navigator | tests pass and **fail once the group's code is reverted**, no flake, **tests unchanged since RED** (`red --rewrite` re-baselines), **mutants of the new lines** at the score min (a survivor is a test gap), code files no mutator covers, coverage |
| `dod` | makers and navigators | DoD pairs: each test **named in its file**, failed at RED, passes at GREEN, gate **not stale**; runs nothing |
| `final` | reviewer, judge, final courier | all group tests together, existing tests that mention the changed modules, stray files, the whole-diff patch, **every changed line mutated** (judge's marks applied); `--again` = the re-run after fixes |
| `verify` | lead | DoD closure from the gate files, fixes present, proofs re-checked |

A group is judged on the base plus **only its own files** (never another group's half-written edit).

## Rules

- **Lead-only.** The lead plans, launches, reads, verifies; it writes no test or code (a one-line fix it fully understands excepted).
- **A verifier is always a separate node**: it did not write the work, runs the gate first, and takes no claim it did not see in a gate or a file.
- **DoD closure.** One test per (id, kind), its name carrying the id (`test_ac1_happy`); a pair counts only if its test file failed at RED and passes at GREEN (`verify`, from gate files).
- **Repair loop (R4).** No stage is one shot: the maker runs the real gate and `dod` (3 runs at most); only a navigator on fresh gate facts ends a stage. Defects go back until PASS, no progress (`blocked`) or `rounds`; one run-wide budget pays every repair (spent: `paused` until `resume`). `unverifiable` is the environment. A survivor is a test gap (strengthen, never weaken). [`probes.md`](./probes.md) "The repair loop".
- **Frozen tests.** GREEN never edits a test; a wrong test is reported (`testDefects`, or a `testWrong` note to the test writer), not patched.
- **Hard scope fence.** Each maker prompt names the only files it may edit; `final` lists any other changed file.
- **Precedent and research first**; **tool discipline** (Bash only for tests, gates, read-only git, linters); **ponytail** per node never compresses validation, data-loss handling, security or accessibility.

## Tiering

T0 code when deterministic, T2 sonnet to analyse and implement, T3 opus for once-per-run judges ([`tiering.md`](./tiering.md)).

<!-- GENERATED:tiers -->

| node | tier | model | effort | agent type | ponytail | calls | gate/fanout |
|---|---|---|---|---|---|---|---|
| graph-planner | T3 | opus | high | planner | full | - | only when the import structure is unknown |
| red-driver | T2 | sonnet | medium | tdd-guide | ultra | 40 | per group |
| test-writer | T2 | sonnet | medium | tdd-guide | ultra | 40 | per group, test writer on, group with no after |
| red-navigator | T2 | sonnet | high | code-reviewer | full | 25 | per group |
| green-driver | T2 | sonnet | medium | tdd-guide | ultra | 45 | per group |
| tdd-driver | T2 | sonnet | medium | tdd-guide | ultra | 75 | per group, fast mode, group with no after |
| code-driver | T2 | sonnet | medium | tdd-guide | ultra | 45 | per group, test writer on, group with no after |
| green-navigator | T2 | sonnet | high | code-reviewer | full | 25 | per group |
| integration-tester | T2 | sonnet | high | tdd-guide | lite | 35 | only when the change crosses a process, DB or network boundary |
| reviewer | T3 | opus | high | code-reviewer | off | 40 | - |
| judge | T2 | sonnet | high | code-reviewer | full | 20 | test writer on, final survivors only |
| fixer | T2 | sonnet | medium | tdd-guide | full | 35 | per group, only for groups with findings |
| final-verifier | T1 | haiku | low | code-reviewer | off | 6 | only after fixers ran |

<!-- /GENERATED:tiers -->

`--check` also guards tiers, opus placement, checker >= maker and read-only judges.

## Iterate from measurements

Change a node's model, effort or agent type only from the numbers in [`runs.md`](./runs.md). Evals: [`evals.json`](./evals.json).

## Links out

`tdd`, `zero-trust-review` (review the finished diff in a fresh session), `mutation` (mutation-test a change alone), `ai-code-delivery`, `e2e-runner`, `wayfinder` / `grill-with-docs`, `prototype` (unclear RED shape).
