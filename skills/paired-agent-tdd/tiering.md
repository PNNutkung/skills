# Tiering: which model, effort and agent type each node gets

Aligned to the global subagent routing: sonnet for analysis, implementation and review, opus for complex reasoning only, code for anything deterministic. `graph.mjs` is the source of truth for each node's `model`, `effort`, `agentType` and tool-call cap; `node graph.mjs --check` enforces the rules marked (check).

## Tiers

| Tier | Runs as | Use for |
|---|---|---|
| T0 | code, no agent | Everything deterministic: plan validation, snapshots, the red, green and final gates, DoD closure and scope. |
| T1 | haiku | The final verifier only: a courier that runs one gate and copies its lines. Its output is leads, not facts: the gate file is the fact, and the lead's `verify` re-runs the gate. Every other agent reads code and judges it. |
| T2 | sonnet | Drivers, navigators, fixer, integration tester. Effort medium for makers on routine work; high for checkers whose miss nothing downstream re-reads. |
| T3 | opus, effort high | Once-per-run judgement over cross-cutting context: the graph-planner (gated) and the single whole-diff reviewer. |

## Agent types (measured)

One trivial task (`echo ok`, 1 tool call) per type, all-in subagent tokens, 2026-10-08:

| Type | Tokens | Tools | Used for |
|---|---|---|---|
| general-purpose | 98,078 | all | nothing |
| code-reviewer | 41,261 | Read, Grep, Glob, Bash | red-navigator, green-navigator, reviewer, final-verifier: **no Edit, no Write** |
| tdd-guide | 38,189 | Read, Write, Edit, Bash, Grep | red-driver, green-driver, fixer, integration-tester |
| code-simplifier | 37,490 | Read, Write, Edit, Bash, Grep, Glob | not used (its prompt is about simplifying) |

Before an agent does any work it costs 38-41k tokens with a narrow type against 98k with the default: that fixed part, not the prompt words (a whole brief is ~1.5 KB), dominates a small agent, so the first levers are fewer agents and a narrow type. A narrow type is also a fence: a judge that has no Edit or Write cannot patch the work it is judging (check).

## Rules

- **R1** No tool-looping agent above effort `high` (check). The harness interrupts an agent silent for ~180 s and a retry restarts from zero, so the mutation budget per group is 60 s by default.
- **R2** Checker >= maker in model and effort for any node whose miss nothing downstream re-reads (check): red-navigator and green-navigator against their drivers, integration-tester against the green driver. The refactor navigator of the old graph was the declared exception; it is gone.
- **R3** Opus only on the graph-planner and the reviewer (check). One exception, never automatic: `tdd.mjs resume --escalate G` runs the repairs of one stalled group on an opus maker, because the lead asked.
- **R4** Repair loop, bounded (check: `LIM.rounds` is 1-4): a stage is a maker pass, then an independent check on fresh gate facts, repeated while the check finds defects. It stops on PASS, when the same defects come back (the repair changed nothing the check can see: no progress), or after `rounds` repairs (default 3, `plan.rounds` 1-4); then the group is blocked and so is everything that waits for it. Inside a pass the maker loops on the real gate (at most 3 runs), so most defects die before a navigator is paid for. A defect is fixed or listed under `notDone`, never shipped unaddressed. Cost: a group that always fails costs up to 5 + 5 x rounds build agents, and the whole run is capped by one repair budget (`maxRepairs`, default 2 per group: 3 groups cap at 30 build agents; `graph.mjs --plan` prints it). Each group is guaranteed its share of that budget; a group still failing is paused and `tdd.mjs resume` continues it from the gate files, so a failure never restarts from zero (and a paused run is not reviewed until it is whole); a group whose same defects stalled is held, and one that hit a broken sandbox is stopped on `env`, each at zero agents until the lead decides (`resume --hint`, `--escalate`, `--retry`, or a fixed sandbox); a failing round skips the navigator when the maker already admitted the failure. The reviewer, fixers and couriers come on top; the stall check and `rounds: 1` are further brakes. **No real run has measured how often a second round saves a group or how often the stall check fires wrongly** ([`runs.md`](./runs.md)).
- **R5** Move one node's model, effort or agent type at a time, only from measured runs, and log each run in [`runs.md`](./runs.md).
- **R6** Every tier value is a starting guess, not a finding.

## What was removed from the old graph, and why

| Removed | Replaced by | Evidence |
|---|---|---|
| `test-auditor` (sonnet, before RED) | the `final` gate: existing tests that mention a changed module run for real, and new failures are separated from already-failing ones | the auditor spent an agent to find and run the tests that mention the changed code; the gate finds them by name and runs them in code (a heuristic pick, capped at 12). Estimate: one agent less. |
| `refactor-driver` + `refactor-navigator` (2 agents per group) | one optional cleanup step in the green driver, for a named duplication only; "behavior unchanged" is the frozen tests staying green plus the whole-diff reviewer | no measured data on how often the old pair changed anything (the two logged runs never reached it): an assumption that it is rarely worth two agents per group. Estimate: 2 agents and 2 hops less per group. **Risk to measure:** the old refactor navigator may have caught premature abstraction the reviewer does not. |
| one reviewer per dimension (opus) | one reviewer over the whole diff once | every dimension re-reads the same diff; a dimension reviewer costs a full opus context. |
| one fixer per finding | one fixer per owning group, up to 8 findings | each fixer pays the fixed cost; one owner per file stays true. |
| lead-gathered facts typed into briefs (`git diff --stat`, suite, lint) | gates the navigator runs as its first command, and the briefs the script writes | the lead no longer re-derives or pastes anything per group. |
| agent team executor | Workflow script only | teams use ~7x the tokens of a session, give no per-node effort and no resume; the working tree and `$RUN/gates` are the checkpoint now. |

## Raising one node for one run

1. Edit the node's `effort`, `model` or `agentType` in `graph.mjs`.
2. `node graph.mjs --write`, then `node graph.mjs --check` and `node workflow.test.mjs`.
3. Run, log it in `runs.md`, and revert unless the numbers justify keeping it.

## Lessons carried over from the first measured runs

- A navigator's real defects that the driver never fixed were caught only by the final read of the working tree, which also found defects both navigators missed (an arithmetic error in an example, a stale code comment): the opus reviewer stays, and its brief says to check every number in an example and every comment the change made stale.
- A gap-hunting item ("legitimate future edits that the new check would wrongly reject") is in every navigator brief; it found a real false failure.
- Cost scales with tool calls times context: cut calls (gates, a mirror file named in the brief, a matrix checked in code before a navigator is paid for) before cutting model tier.

## Terminology

Graph vocabulary (nodes, edges, "the verifier is a separate node", "plain code for anything deterministic") comes from practitioner writing on multi-agent control graphs, not from Andrew Ng; do not attribute it to him. An **execution** graph (`graph.mjs`) is not a **knowledge** graph (a codebase index): never schedule work with one.
