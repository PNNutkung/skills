---
name: paired-agent-tdd
description: Runs TDD (RED/GREEN/REFACTOR) as driver/navigator teammate pairs on a Claude Code agent team, scheduled from an explicit execution graph with a review-and-fix fan-out. Use for non-trivial, multi-file features or bugfixes that need tests; not for single-file or one-line changes.
---

# Paired Agent TDD

This skill runs TDD (RED/GREEN/REFACTOR) as an **execution graph** of driver-writes-it / navigator-verifies-it nodes, bracketed by a pre-implementation existing-test audit and a post-implementation review-and-fix fan-out. A Claude Code **agent team** executes it: one lead coordinates, teammates do every piece of work, and the lead never edits code itself.

The graph is not prose. It lives in [`graph.mjs`](./graph.mjs) as data — nodes, their models, efforts, and their `needs` edges — and the diagram below is generated from it. Change the graph by editing `NODES`, then run `node graph.mjs --write`.

## Prerequisites

1. **Agent teams must be enabled.** They are experimental and off by default. Without this, no team is created and this skill cannot run:

   ```json
   { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   ```

2. **Pick an executor.** `graph.mjs` is the source for both:
   - **Workflow-script executor** (preferred when tiering matters): per-node model AND effort. Call shape: `agent(prompt, { label, phase, model, effort, schema })`, with `model` and `effort` read from the node.
   - **Native agent team** (default): model per teammate; effort is inherited from the lead and not settable per teammate. Tier by model only, and set the lead's effort (`/effort`) to that of the heaviest node you intend to run, or use the Workflow executor.

3. **Node 18+** to run `graph.mjs`.

## Progress checklist

Copy and tick off:

```
- [ ] Gate: use the skill? (see When to use) / run graph-planner? (see gate)
- [ ] File groups partitioned, one owner per file
- [ ] test-auditor (parallel with RED): stale tests fixed
- [ ] RED per group: red-driver -> red-navigator PASS
- [ ] GREEN per group: green-driver -> green-navigator PASS
- [ ] REFACTOR per group: refactor-driver -> refactor-navigator PASS
- [ ] integration-tester (alongside REFACTOR): real-dependency run
- [ ] reviewer(s): findings collected
- [ ] fixer per finding, then re-check (no defect left unaddressed)
```

## When to use

Agent teams use roughly **7x the tokens of a standard session** (every teammate has its own context window), and this pipeline also fans out per file group, review dimension and finding. Do not use it reflexively; it earns its cost only on a multi-file change with real invariants to protect.

- Non-trivial, multi-file change where tests are appropriate and the request implies implement-or-fix-with-tests.
- The file set partitions into groups that can be owned independently. Teams do not isolate teammates in worktrees, so **each teammate must own a different set of files** — if two teammates would edit the same file, they belong in one sequential chain, not in parallel.

## When NOT to use

- Single-file or single-line changes, exploratory research, or tasks where no tests are expected. Use the `tdd` skill or a lone subagent.
- **Know what you are trading away.** Anthropic's own guidance is that "for sequential tasks, same-file edits, or work with many dependencies, a single session or subagents are more effective" — and RED→GREEN→REFACTOR on one file group is exactly that shape. This skill accepts that cost deliberately, to buy independent verification and cross-group parallelism. If your change is one group with no fan-out, the team buys you nothing over a subagent pipeline.

## The graph

<!-- GENERATED:graph -->

```mermaid
graph TD
  graph-planner["graph-planner<br/><i>opus/high · gated</i>"]
  test-auditor["test-auditor<br/><i>sonnet/medium</i>"]
  red-driver["red-driver<br/><i>sonnet/medium · per group</i>"]
  red-navigator["red-navigator<br/><i>sonnet/high · per group</i>"]
  green-driver["green-driver<br/><i>sonnet/medium · per group</i>"]
  green-navigator["green-navigator<br/><i>sonnet/high · per group</i>"]
  refactor-driver["refactor-driver<br/><i>sonnet/medium · per group</i>"]
  refactor-navigator["refactor-navigator<br/><i>haiku/medium · per group</i>"]
  integration-tester["integration-tester<br/><i>sonnet/high</i>"]
  reviewer["reviewer<br/><i>opus/high · per dimension</i>"]
  fixer["fixer<br/><i>sonnet/medium · per finding</i>"]
  red-driver --> red-navigator
  red-navigator --> green-driver
  green-driver --> green-navigator
  green-navigator --> refactor-driver
  refactor-driver --> refactor-navigator
  green-navigator --> integration-tester
  refactor-navigator --> reviewer
  integration-tester --> reviewer
  reviewer --> fixer
```

<!-- /GENERATED:graph -->

Run `node graph.mjs --check` to print the dependency layers and the critical path, and to verify the diagram above is current. Everything in one layer runs at once.

Two edges carry most of the parallelism, and both are easy to lose in a well-meaning edit:

- **`integration-tester` needs only `green-navigator`**, not the refactor chain. It runs *alongside* refactoring. Prose that disagrees with the graph is the drift `graph.mjs --check` fails on.
- **Every `fanout: 'group'` node is per file group.** Groups do not wait for each other. Group B's RED can run while group A is already in GREEN. There is no barrier between groups at any stage.

## The graph-planner node is gated

Do not run `graph-planner` on every change. Reach for it when there is a real graph to discover:

- **Run it** when any two touched files import one another, so the groups have a genuine ordering. Fall back to running it when more than three files are touched and the import structure is unknown.
- **Skip it** when the file set is flat and independent. Six unrelated files need no planner; the groups are obvious and the planner is pure serial overhead in front of everything else.

When skipped, the lead partitions the files itself and uses the static graph as-is.

## Lead-only rule

Once this skill is invoked, the lead acts purely as coordinator. It never writes test, implementation, refactor, or integration-test code, never patches a file directly, and never runs the review itself. Every node's work is a teammate's.

The lead's only direct actions are: spawn teammates, create and sequence tasks on the shared task list, read teammate reports, gather the deterministic facts listed below, and hand those facts to teammates.

**Teammates cannot spawn teammates.** There are no nested teams. So when a navigator finds a problem, it does not delegate a fix — it reports the problem, and **the lead creates a `fixer` task** for it. Any instruction telling a navigator to "delegate the fix to another subagent" is stale and does not work on a team.

## The lead gathers deterministic facts; teammates judge them

Use plain code, not an agent, for anything deterministic. Three facts are a single command each, and a teammate re-deriving them is waste:

| Fact | Command |
|---|---|
| Scope fence check | `git diff --stat` |
| Full suite result | the project's test command |
| Lint result | `pre-commit run` (staged files only — never `--all-files`) |

The lead runs these and **injects the real output verbatim** into the relevant teammate's brief. The navigator then *judges* that output rather than re-running it — and cannot "verify" a claim by trusting a driver's pasted summary, because the ground truth comes from the lead, not the driver.

What stays with the navigator is the part that is not deterministic: did this test fail for the *right* reason, is this abstraction premature, does this assertion encode the correct invariant.

## Driver/navigator contract

A verifier is always a separate node, because a model cannot reliably grade its own work. That is the whole reason the pairs exist.

**Driver brief contains**: full background (why, which files, the existing sibling pattern to mirror, expected diff shape), the hard scope fence below, its ponytail level from the graph, an explicit instruction not to touch out-of-scope files, and exactly what to report (diff + test output). For `red-driver`, state explicitly that all three test categories are required — happy path, fail path, and edge/collision case — even when the originating bug report names only one.

**Navigator brief contains**: the *same* background (it was not present for the driver's run), the driver's claims, the lead-gathered command output, and a checklist of properties to re-verify independently. A navigator that only restates the driver's report has done nothing. Every navigator checklist includes a gap-hunting item: "legitimate future edits that the new check would wrongly reject" (see [`runs.md`](./runs.md)).

**Bounded rework (R4).** A navigator FAIL or non-empty defects list triggers ONE rework pass by the maker's tier and one re-check; still failing, escalate to the T3 gate (the final `reviewer`) or the lead. A reported defect is never shipped unaddressed. Evidence: [`runs.md`](./runs.md).

Example `red-driver` brief (abridged):

> Background: `parse_dates()` in `src/dates.py` must reject ISO strings with a trailing Z; mirror the setup in `tests/test_times.py`. Scope: `tests/test_dates.py` only. Write failing tests: happy path, fail path (trailing Z raises), edge case (empty string). Ponytail: ultra. Report: the diff and the failing test output.

## Hard scope fence

"Do not touch files outside {scope}" as bare prose is not enough — a teammate that believes a fix requires another file will sometimes edit it anyway. State the fence with a consequence, in every driver and fixer brief:

> HARD SCOPE FENCE: you may ONLY edit or create the file(s) named above. If you believe a file outside that list needs a change, DO NOT EDIT IT — stop and report it under "OUT OF SCOPE — NEEDS SEPARATE FIX" with file, line, and what is wrong. Touching an out-of-scope file is task failure regardless of whether your in-scope work succeeded; it will be reverted and the task re-run.

This matters more on a team than it did with subagents: teammates are not isolated in worktrees, so an out-of-scope edit lands in the same working tree another teammate is editing.

Every navigator checklist includes confirming the diff touches only the named scope, against the lead-supplied `git diff --stat`.

## One task, one deliverable

Every task names exactly one file to create or edit (or one tightly-scoped set that cannot be split) and one deliverable. Do not bundle "implement the fix AND write the CLI tests AND check the config wiring" into one task.

Symptoms that a task was not single-purpose: the report contains an "also I noticed X" aside about a different file, or the teammate needs more than one line to say what it did.

If a driver discovers mid-task that it needs work beyond its brief — research into why an existing test asserts something, a choice between two library APIs, a second file that needs changing — that is a signal to **stop and report**, not to keep going. Report it as a finding; the lead creates a separate narrowly-scoped task. This also keeps retries cheap: a bundled task that stalls forces re-derivation of everything bundled into it.

Split at capability boundaries, not for tidiness. Over-decomposition is a real failure mode — a five-node graph for what one node and a verifier would handle is overhead, not rigor.

## Tool discipline

Every brief states: use the dedicated tool for the job — Read/Edit/Write for file contents, Grep/Glob for search — and reach for Bash only where no dedicated tool exists (test suite, git, compiler, linter, docker, package manager).

Editing file content with `sed` or a `cat <<EOF` heredoc when Edit is available is a tool-choice regression, not a style preference. Dedicated tools give exact-match safety and a reviewable diff.

## Ponytail level is per node, not per session

Each node carries its own `ponytail` intensity in the graph, stated in that teammate's brief:

- **Drivers run `ultra`.** Their job is the minimum change that passes the tests. Deletion over addition, stdlib over dependency, one line over fifty.
- **Navigators run `full`.** They need the ladder's judgment, not its brevity.
- **`integration-tester` runs `lite` and `reviewer` runs `off`.** These nodes are paid to be thorough. Compressing them is how a real finding gets dropped.

Never compress away input validation at trust boundaries, error handling that prevents data loss, security measures, or accessibility basics — at any level.

## Check existing precedent before asserting a new invariant

A RED test can be *wrong*, not merely missing. It is easy to invent an edge case that sounds like it should hold without checking whether the codebase's existing tests already establish the opposite invariant for an analogous case.

Concretely: a mode or flag that makes one thing "sticky" — surviving even when no longer derivable — almost certainly makes the analogous thing sticky the same way. A new fail-path test asserting de-escalation for the second thing, written without checking how the first thing's existing tests behave, encodes a plausible-sounding but incorrect expectation.

So before finalizing any RED test that asserts fail-path or edge-case behavior, the driver must grep for existing tests exercising the same mode or flag on a sibling code path, and reconcile the new test against them — not only against the bug report's literal wording. The navigator's checklist includes this same precedent check as an independent pass.

**If a new test's assertion contradicts an existing passing test's established behavior for the same flag, the new test is probably wrong — that is not a second bug.** Resolve the contradiction before marking RED complete.

If genuine ambiguity survives the precedent check — existing tests do not settle it, or the feature's invariants are underspecified — stop and invoke `wayfinder` (open-ended direction-finding) or `grill-with-docs` (stress-test a specific decision against project documents). Name the unresolved decision when doing so. Do not guess and proceed.

## Research before implementing

Before a `green-driver` writes new implementation code, and before a `red-driver` invents a new testing pattern, it searches for something to reuse, in this order:

1. **An existing pattern in this codebase** — grep for the analogous case: a sibling function, a sibling test file's setup, a helper already solving this sub-problem.
2. **The library's own documentation** for a built-in facility — for the exact installed version per the lockfile, not from general knowledge.
3. **Only then** a broader open-source search for a proven implementation to adapt.

Report which of the three applied and why. "I looked and there was nothing to reuse" is a valid, reportable finding — not a step to skip silently. A driver that writes a novel abstraction, retry pattern, or test-harness shape without checking for an existing one nearby is very likely duplicating something that already exists under another name.

## Resuming after an interruption

**This is worse on a team than with subagents, and you should plan for it.** Agent teams have no session resumption for in-process teammates: a killed or interrupted teammate's context is gone, and task status can lag behind reality. There is no equivalent of a workflow's cached-prefix resume.

So before relaunching anything:

1. **Check ground truth yourself first.** Run `git status`, `git diff --stat`, and the test command directly. An interrupted attempt may have already landed the real work — "interrupted" does not mean "nothing happened."
2. **If real work landed and passes, treat it as fact, not a claim to re-verify.** Paste the actual `git diff` and actual test output into every subsequent brief, labeled already-verified, with: "This is done and confirmed passing — do not re-derive or re-implement it; only build on top of it." That turns a grep-heavy re-derivation into a one-line confirmation.
3. **Re-create only the genuinely incomplete tasks**, not the whole graph. Mark the landed ones completed on the shared task list so dependents unblock.
4. **A one-line correction the lead already fully understands is the lead's to make.** If a test's assertion encodes the wrong invariant and the fix is two lines you have complete context for, fixing it directly beats a teammate round-trip. The lead-only rule exists to stop the lead from doing the *skill's work* inline — skipping RED, GREEN, or navigator review — not to mandate a teammate for a typo.

## Model and effort tiering

Aligned to the global subagent routing (Haiku = gathering and simple edits; Sonnet = analysis, review, TDD, implementation; Opus = complex reasoning only).

- **T0** code, no agent: deterministic facts (`git diff --stat`, scoped test and lint output, triage, dedupe, report assembly).
- **T1** haiku, effort low or medium: data gathering and mechanical work. Output is LEADS, not facts: whoever consumes it re-checks the quoted evidence.
- **T2** sonnet: analysis and implementation with real runs. Effort medium for makers on routine work; high for checkers whose miss nothing downstream catches (red/green navigators, integration tester, gap hunting).
- **T3** opus, effort high: judgement over cross-cutting context (graph planning, adjudicating a split, completeness critic, final cross-file consistency review).

Rules:

- **R1** No tool-looping agent above effort high by default. The harness interrupts an agent silent for about 180 s and a retry restarts from zero; higher effort lengthens silent thinking. Raise a node above high only from a measurement, never on a long tool loop. (--check rejects above high; widen EFFORT_RANK in the same commit)
- **R2** Checker (navigator) >= maker (driver) in model and effort, for any node whose miss nothing downstream re-reads. The one declared exception is `refactor-navigator` (haiku), because the T3 reviewer re-reads the whole diff afterwards.
- **R3** Opus only on once-per-run or gated judge nodes.
- **R4** Bounded rework pass on navigator FAIL (see Driver/navigator contract).
- **R5** Move one node's model or effort at a time, only from measured runs, and log each run in [`runs.md`](./runs.md).
- **R6** Every tier value is a starting guess, not a finding.

<!-- GENERATED:tiers -->

| node | tier | model | effort | ponytail | gate/fanout |
|---|---|---|---|---|---|
| graph-planner | T3 | opus | high | full | gated |
| test-auditor | T2 | sonnet | medium | full | - |
| red-driver | T2 | sonnet | medium | ultra | per group |
| red-navigator | T2 | sonnet | high | full | per group |
| green-driver | T2 | sonnet | medium | ultra | per group |
| green-navigator | T2 | sonnet | high | full | per group |
| refactor-driver | T2 | sonnet | medium | ultra | per group |
| refactor-navigator | T1 | haiku | medium | full | per group |
| integration-tester | T2 | sonnet | high | lite | - |
| reviewer | T3 | opus | high | off | per dimension |
| fixer | T2 | sonnet | medium | full | per finding |

<!-- /GENERATED:tiers -->

`node graph.mjs --check` fails on: effort missing or outside low|medium|high, tier/model mismatch, opus outside `graph-planner` and `reviewer`, any navigator (except `refactor-navigator`) or `integration-tester` weaker than its maker.

## Iterate the graph from measurements, not from this file

The `model` and `effort` assignments in `graph.mjs` are a **starting guess**, not a finding. Tier assignment is something you observe and correct: after a run, look at which node actually dominated wall-clock and which actually consumed the tokens, then move that one node's model or effort (R5) and re-measure. Append each run to [`runs.md`](./runs.md).

The one assignment to resist downgrading is `green-navigator`. It is the node that catches a driver's scope creep, and cheapening the checker to save tokens is a false economy — it saves money by not finding things.

`node graph.mjs --check` prints the critical path. That chain is the run's wall-clock floor: shortening it requires removing a dependency edge, not a faster model.

Evaluation scenarios for this skill: [`evals.json`](./evals.json).

## Terminology

Graph vocabulary (nodes, edges, "the verifier is always a separate node", "plain code for anything deterministic") comes from practitioner writing on multi-agent control graphs. It is **not Andrew Ng's** and must not be attributed to him: the circulated "playbook" PDF has no primary source, and his letters use no such vocabulary. Evaluate the node, govern the edges, and default to no graph unless the work genuinely needs fan-out or per-step model differences.

An **execution** graph (nodes, edges, task state; this file) is not a **knowledge** graph (entities and relationships from codebase-indexing tools). Do not use a knowledge-graph tool to schedule work.

## Links out to — reference these, do not re-explain them

- **`tdd`** — the RED/GREEN/REFACTOR mechanics themselves. This skill only adds the pairing and the graph.
- **`superpowers:subagent-driven-development`** — general task-dispatch and briefing mechanics at the whole-plan level.
- **`superpowers:verification-before-completion`** — the evidence-before-claims discipline every navigator enforces.
- **`prototype`** — for a design spike when the RED stage's own shape is unclear, e.g. a state model that needs sanity-checking before tests can be written against it.
- **`e2e-runner`** — use this agent for `integration-tester` when the change is frontend-facing. Do not substitute a browser-automation library's own internal-development tooling.
- **`grill-with-docs`** / **`wayfinder`** — for the unresolved-ambiguity exit described above.
- Contrast with **`superpowers:dispatching-parallel-agents`** — that is fan-out across *different* problems. This skill pairs two agents on the *same* unit of work, then fans out across file groups.
