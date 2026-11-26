---
touches:
  - "skills/verify/**"
  - "hooks/verify-guard.mjs"
  - "hooks/verify-guard.test.mjs"
  - "hooks/hooks.json"
  - "skills/dev-workflow/SKILL.md"
  - "README.md"
  - "docs/**"
  - ".claude-plugin/*.json"
  - "rules/checks/flag-defaults-e2e.mjs"
dod: verify-skill
---
# 9. Verify skill

Date: 2026-11-25
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

Step 5 of dev-workflow (ADR 0004) is a gate, not a tool. `checkVerify` reads `docs/verify/<slug>.md` and checks that each DoD item has env, run, result and output, and (ADR 0005) that env starts with a booked env name. Nothing runs the `run:` command. Nothing compares the output with a real run. Nothing proves that a new feature flag works when it is on, when it is off and when it has a bad value. Every verify file so far was typed by the agent. Nut asked for a skill that helps to verify new features and config. This ADR records the `verify` skill: the agent writes a plan, and code runs it and writes the evidence. The dev-workflow gate does not change. No ticket: the ADR and the PR carry the work (A17). The number is 0009 because ADR 0007 (PR #34) and ADR 0008 (PR #37) came first.

## Decision

### A1: What does the verify skill do, and where does code stop and the agent start?

Context: today step 5 is manual: the agent runs each DoD item and types docs/verify/<slug>.md by hand; dev-workflow only gates it (skills/dev-workflow/check.mjs:120 checkVerify). Every file in docs/verify/ was hand-written.
Options considered (the agent's analysis when the question was asked):
- (A) plan + run + write: the agent writes a plan (per DoD item: env name, command, expected text); code checks the plan covers every item and every booked env, runs each command, and writes the item's section (env, run, result, output block) from the real run
  - pro: the agent cannot type a pass or invent output: code writes the evidence
  - pro: the plan is reviewable before anything runs
  - con: a plan file to learn; checks that are not a command need another path (Q6)
- (B) template only: code writes a verify.md skeleton (one section per item, env names filled in); the agent runs and fills it as today
  - pro: small, quick to build
  - con: the main gap stays: output and pass are still typed by the agent
- (C) fully agent-driven: the agent decides, runs and writes; code only re-checks at the end
  - pro: most flexible
  - con: no stronger than today's gate
Recommended: A, the value is that code, not the agent, records the result
Answer: A (plan + run + write: the agent writes a plan (per DoD item: env name, command, expected text); code checks the plan covers every item and every booked env, runs each command, and writes the item's section (env, run, result, output block) from the real run)
Trade-off accepted: a plan file to learn; checks that are not a command need another path (Q6)

### A2: What does it verify when there is no DoD (standalone use, "verify the feature or config I just added")?

Context: dev-workflow always has an ADR (adrItems, skills/dev-workflow/check.mjs:62); qa-sweep takes requirements from an ADR via dodFile or from the user's answers (skills/qa-sweep/SKILL.md sections 3-4)
Options considered (the agent's analysis when the question was asked):
- (A) DoD first, else claims: read the ADR (dodFile, or found by touches); with no ADR, list candidates from the branch diff (new flags, config keys, CLI options) and ask the user to confirm each as a claim; only confirmed claims are verified
  - pro: works on any branch, no guessing (ask-dont-assume)
  - pro: new flags are never missed
  - con: one extra question round when there is no DoD
- (B) DoD required: with no ADR it stops and points to definition-of-done
  - pro: simplest, one source of truth
  - con: not usable for a quick "does this config work" check
- (C) diff only: verify whatever the diff adds, no DoD read
  - pro: zero setup
  - con: guesses what "works" means; breaks ask-dont-assume
Recommended: A
Answer: A (DoD first, else claims: read the ADR (dodFile, or found by touches); with no ADR, list candidates from the branch diff (new flags, config keys, CLI options) and ask the user to confirm each as a claim; only confirmed claims are verified)
Trade-off accepted: one extra question round when there is no DoD

### A3: How are new feature flags exercised?

Context: Nut's flag rules: true/false, default on, an invalid value or old name is a hard error (memory flag-naming); dev-workflow tests already run "flags: defaults" and "flags: on" variants (skills/dev-workflow/env.e2e.test.mjs)
Options considered (the agent's analysis when the question was asked):
- (A) three runs per new flag: the items that name the flag run with it unset (default), flipped, and once with an invalid value that must exit with the flag error
  - pro: proves both sides and Nut's hard-error rule for real
  - con: more runs (one more per flagged item, plus one)
- (B) two runs: default and flipped only
  - pro: fewer runs
  - con: the invalid-value rule is only covered by unit tests
- (C) pairwise over all new flags (qa-sweep's pairwise.mjs) when there are 3 or more
  - pro: catches flag interactions
  - con: more runs and harder to read; rare in this repo
Recommended: A, and pairwise only if you want it later
Answer: A (three runs per new flag: the items that name the flag run with it unset (default), flipped, and once with an invalid value that must exit with the flag error)
Trade-off accepted: more runs (one more per flagged item, plus one)

### A4: How is pass or fail decided for a run?

Context: checkVerify only reads the typed result: line (skills/dev-workflow/check.mjs:131-136)
Options considered (the agent's analysis when the question was asked):
- (A) exit code 0 and, when the plan gives expect: <text or /regex/>, the output must contain it; for a "must fail" check (invalid flag) the plan says exit: <n>
  - pro: mechanical, no agent judgment on pass
  - con: the agent must write a good expect line
- (B) exit code only
  - pro: simplest
  - con: a test runner that exits 0 with 0 tests counts as pass
- (C) the agent reads the output and decides
  - pro: handles anything
  - con: same trust problem as today
Recommended: A
Answer: A อยากให้ปรับการเขียน expect ของ agent ด้วย
Trade-off accepted: none recorded (the answer picks no single option)

### A5: How does it run in each booked env?

Context: envs booked so far: [cloud] (this container), [ci] (GitHub Actions on the PR), [nut-wsl] (Nut's machine) (docs/adr/0005-verify-env-check.md:217, docs/adr/0002-ptdd-speed.md)
Options considered (the agent's analysis when the question was asked):
- (A) built-in runners: local shell for the env the session is in; [ci]-type envs read the PR's check runs through gh REST (name, conclusion, URL as evidence); any other env: the agent runs it where it can (Remote Control, device shell) and records the output through a verify command, marked with how it got there
  - pro: covers all three envs used so far
  - con: output from another machine is relayed text, not run by the skill itself
- (B) local shell only; every other env is the agent's job as today
  - pro: small
  - con: CI and other machines stay manual
- (C) local + CI only; other machines need result: accepted A<n>
  - pro: only evidence the skill produced itself
  - con: a booked machine like [nut-wsl] can never pass on its own
Recommended: A
Answer: A (built-in runners: local shell for the env the session is in; [ci]-type envs read the PR's check runs through gh REST (name, conclusion, URL as evidence); any other env: the agent runs it where it can (Remote Control, device shell) and records the output through a verify command, marked with how it got there)
Trade-off accepted: output from another machine is relayed text, not run by the skill itself

### A6: Checks that are not one command (a UI flow, a screenshot, a doc reads right)?

Context: checkVerify accepts image: <path> instead of an output block (skills/dev-workflow/check.mjs:79); qa-sweep has running-app.md for app flows
Options considered (the agent's analysis when the question was asked):
- (A) the plan may give image: <path> produced by a command (e.g. a Playwright script that saves a screenshot); anything with no command needs the user's answer (result: accepted A<n>)
  - pro: every pass still comes from a real run
  - con: a doc or UI check needs a small script or a user answer
- (B) the agent may drive a browser and attach screenshots it took itself
  - pro: covers UI with no script
  - con: the agent again records the evidence
Recommended: A
Answer: A (the plan may give image: <path> produced by a command (e.g. a Playwright script that saves a screenshot); anything with no command needs the user's answer (result: accepted A<n>))
Trade-off accepted: a doc or UI check needs a small script or a user answer

### A7: When an item fails?

Context: none today; a typed fail just keeps the gate shut (skills/dev-workflow/check.mjs:136)
Options considered (the agent's analysis when the question was asked):
- (A) record result: fail with the output, run the rest, report every failure at the end; never edit product code to make it pass (a fix goes back to TDD)
  - pro: one run shows the whole picture
  - con: a broken env can produce many failures at once
- (B) stop at the first failure
  - pro: fast feedback
  - con: several reruns to see everything
Recommended: A
Answer: A (record result: fail with the output, run the rest, report every failure at the end; never edit product code to make it pass (a fix goes back to TDD))
Trade-off accepted: a broken env can produce many failures at once

### A8: Is the plan shown to you before it runs?

Context: commands may touch a non-prod system or your machine
Options considered (the agent's analysis when the question was asked):
- (A) show the plan; run [cloud]/[ci]-type envs right away; ask before running on your machine or any remote non-prod system
  - pro: no waiting for safe envs, a stop before anything outside the sandbox
  - con: one question when another machine is booked
- (B) always ask before running
  - pro: full control
  - con: a wait every time, even for local tests
- (C) never ask
  - pro: fastest
  - con: may run something on a shared system unseen
Recommended: A
Answer: A (show the plan; run [cloud]/[ci]-type envs right away; ask before running on your machine or any remote non-prod system)
Trade-off accepted: one question when another machine is booked

### A9: How does it relate to qa-sweep and dev-workflow?

Context: qa-sweep finds weak tests and gaps and only adds tests (skills/qa-sweep/SKILL.md); dev-workflow step 5 is the gate (skills/dev-workflow/SKILL.md section 5)
Options considered (the agent's analysis when the question was asked):
- (A) a new skill skills/verify; dev-workflow step 5 says "run the verify skill" and its gate is unchanged; qa-sweep untouched; verify never adds tests
  - pro: clear jobs: qa-sweep = are the tests good, verify = does it really work here
  - pro: without verify installed, step 5 works by hand as today
  - con: one more skill to install
- (B) a new mode inside qa-sweep
  - pro: reuses its run folder and ledger
  - con: qa-sweep's guard forbids things verify needs, and its scope is different
- (C) a new command inside dev-workflow (workflow.mjs verify)
  - pro: one less skill
  - con: not usable on its own
Recommended: A
Answer: A (a new skill skills/verify; dev-workflow step 5 says "run the verify skill" and its gate is unchanged; qa-sweep untouched; verify never adds tests)
Trade-off accepted: one more skill to install

### A10: Guard hook while a verify run is open?

Context: qa-sweep has qa-guard, dev-workflow has workflow-guard (blocks merge before verify, not edits after lock) (hooks/)
Options considered (the agent's analysis when the question was asked):
- (A) a verify-guard hook, VERIFY_GUARD_ENABLED default true: while a run is open, deny edits outside docs/verify/ and the run folder, and deny a hand edit of a section code wrote
  - pro: verify cannot "fix" code or evidence to pass
  - con: one more hook and its tests
- (B) no hook; the rule is in SKILL.md only
  - pro: less code
  - con: nothing enforces it
Recommended: A, the point of the skill is evidence nobody typed
Answer: A (a verify-guard hook, VERIFY_GUARD_ENABLED default true: while a run is open, deny edits outside docs/verify/ and the run folder, and deny a hand edit of a section code wrote)
Trade-off accepted: one more hook and its tests

### A11: Other flags?

Context: Nut's rules: true/false, skill-owned prefix, default on, _MAX with unlimited
Options considered (the agent's analysis when the question was asked):
- (A) VERIFY_FLAG_RUNS_ENABLED (default true: the flag runs of Q3) and VERIFY_RUN_TIMEOUT_MAX (seconds per command, default unlimited)
  - pro: each behavior can be turned off alone
  - con: two more rows in the Flags table
- (B) no flags besides the guard
  - pro: least surface
  - con: no way to skip flag runs on a slow repo
Recommended: A
Answer: A แต่ว่าทำไมต้องมี VERIFY_FLAG_RUNS_ENABLED ด้วยนะ? มันไม่ซ้ำกับ VERIFY_GUARD_ENABLED เหรอ
Trade-off accepted: none recorded (the answer picks no single option)

### A12: verify.md written again on a rerun?

Context: docs/verify/verify-env-check.md has hand-written parts (the Booked line, the Dogfood section)
Options considered (the agent's analysis when the question was asked):
- (A) code replaces only the sections of the items it ran; anything else in the file stays
  - pro: rerun one item; hand-written notes survive
  - con: a stale section of an item that was not rerun can stay
- (B) code rewrites the whole file each run
  - pro: always consistent
  - con: hand-written notes are lost
Recommended: A
Answer: A (code replaces only the sections of the items it ran; anything else in the file stays)
Trade-off accepted: a stale section of an item that was not rerun can stay

### A13: Verify env, test tiers and touches for building this skill?

Context: the last three changes used [cloud] + [ci] (docs/adr/0005-verify-env-check.md:217)
Options considered (the agent's analysis when the question was asked):
- (A) [cloud] e2e on a fixture repo (flags unset/true/false/invalid) + dogfood: the verify skill writes this work's own docs/verify file; [ci] CI green; tiers unit, fuzz, integration, e2e; touches skills/verify/**, hooks/verify-guard.mjs, hooks/hooks.json, skills/dev-workflow/SKILL.md, README.md, docs/adr/**, docs/verify/**, .claude-plugin/*, rules/checks/flag-defaults-e2e.mjs; plugin next free minor at bump time
  - pro: same as the last changes, dogfood proves it for real
  - con: no run on your machine
- (B) as A plus [nut-wsl] one real run on your machine
  - pro: proves the other-machine path of Q5
  - con: needs your machine on
Recommended: A
Answer: A ([cloud] e2e on a fixture repo (flags unset/true/false/invalid) + dogfood: the verify skill writes this work's own docs/verify file; [ci] CI green; tiers unit, fuzz, integration, e2e; touches skills/verify/**, hooks/verify-guard.mjs, hooks/hooks.json, skills/dev-workflow/SKILL.md, README.md, docs/adr/**, docs/verify/**, .claude-plugin/*, rules/checks/flag-defaults-e2e.mjs; plugin next free minor at bump time)
Trade-off accepted: no run on your machine

### A14: How should the agent's expect lines be made better (A4 asks for it)?

Context: A4 chose exit 0 + expect, and Nut wants the agent's expect writing improved; a weak expect ("ok", "pass") matches almost any output, and a test runner can exit 0 with 0 tests
Options considered (the agent's analysis when the question was asked):
- (A) lint only: code refuses a weak expect (empty for a test command, a bare word like ok/pass/done, or a pattern that matches empty output) and says why
  - pro: catches the worst cases with no new data
  - con: the agent still writes every expect by hand
- (B) presets + lint: code knows the common runners (node --test, pytest, vitest/jest, go test) and fills the expect itself: failures 0, at least one test ran, and the DoD item id in a passing test name; the agent writes an expect only for other commands, and the lint of A checks those
  - pro: most items get a strong expect with no agent writing; ties the run to the item id
  - con: the runner list needs upkeep; an unknown runner falls back to the lint
- (C) guidance only: SKILL.md gives good and bad expect examples
  - pro: no code
  - con: nothing enforces it
Recommended: B, the item id in a passing test name proves the run covered that item
Answer: B (presets + lint: code knows the common runners (node --test, pytest, vitest/jest, go test) and fills the expect itself: failures 0, at least one test ran, and the DoD item id in a passing test name; the agent writes an expect only for other commands, and the lint of A checks those)
Trade-off accepted: the runner list needs upkeep; an unknown runner falls back to the lint

### A15: Keep VERIFY_FLAG_RUNS_ENABLED (A11 asks why it is needed besides VERIFY_GUARD_ENABLED)?

Context: the two flags do different jobs: VERIFY_GUARD_ENABLED blocks edits outside docs/verify/ while a run is open (A10); VERIFY_FLAG_RUNS_ENABLED only turns the extra flag runs of A3 (default, flipped, invalid value) on or off
Options considered (the agent's analysis when the question was asked):
- (A) keep it, default true: a repo where flipped runs are slow can turn them off
  - pro: an escape hatch for a slow repo
  - con: one more flag; turning it off silently drops the A3 proof
- (B) drop it: flag runs always happen when the change adds a flag; a run that cannot be done needs the user's answer like any other item (result: accepted A<n>)
  - pro: one less flag; A3 cannot be switched off by accident
  - con: no quick off switch for a slow repo
Recommended: B, flag runs are the core of the skill and Nut prefers full CPU use over skipping work
Answer: B (drop it: flag runs always happen when the change adds a flag; a run that cannot be done needs the user's answer like any other item (result: accepted A<n>))
Trade-off accepted: no quick off switch for a slow repo

### A16: Is this DoD (16 items + 5 required sections) right?

Context: dod.mjs check ok on /mnt/project-files/verify-skill/dod.md, built from A1-A15
Options considered (the agent's analysis when the question was asked):
- (A) yes, approve it; next is the concept board with 2-3 designs
  - pro: moves on to design
  - con: a later change needs a new answer and check
- (B) change something (say which item)
  - pro: fixes it before design
  - con: one more round
Recommended: A
Answer: A (yes, approve it; next is the concept board with 2-3 designs)
Trade-off accepted: a later change needs a new answer and check

### A17: Ticket for this work?

Context: there is no GitHub issue for the verify skill; the last follow-ups used the ADR and the PR only (docs/adr/0005-verify-env-check.md A10)
Options considered (the agent's analysis when the question was asked):
- (A) no ticket: the ADR and the PR carry it
  - pro: no extra step
  - con: nothing in Issues to track it
- (B) open a GitHub issue with the DoD as a checklist
  - pro: trackable in Issues
  - con: one more item to keep in sync
Recommended: A
Answer: A (no ticket: the ADR and the PR carry it)
Trade-off accepted: nothing in Issues to track it

### A18: Which design (architecture) for the verify skill?

Context: approved DoD (A16), 16 items; existing skills use pure core + IO (docs/adr/0004-dev-workflow.md A24, docs/adr/0001-retro-skill.md); paired-agent-tdd has a run ledger (skills/paired-agent-tdd/direct-run.mjs, exec.jsonl, output head+tail 4000 chars)
Options considered (the agent's analysis when the question was asked):
- (A) pure core + IO: one CLI verify.mjs (open, plan, run, record, ci, close); plan.json in the run folder; pure libraries for plan check + presets + expect lint, the expect match and the section writer (each section carries a hash marker so the guard sees a hand edit); a small own runner with timeout
  - pro: same shape as dev-workflow and retro, easy unit and fuzz tests
  - pro: works alone, no other skill needed
  - con: its own runner, not shared with the paired-agent-tdd ledger
- (B) reuse the ledger: every command runs through paired-agent-tdd direct-run.mjs; verify writes sections from exec.jsonl entries
  - pro: one runner for the whole plugin; proof can be re-checked like qa-sweep
  - con: needs paired-agent-tdd and zero-trust-review installed, so standalone use breaks
  - con: output is cut to head+tail 4000 chars
- (C) plan inside verify.md: the agent writes plan lines (run, expect) in each docs/verify section and code fills result and output under them
  - pro: no separate plan file; the plan is reviewed in the PR
  - con: agent text and code output mix in one section, so the guard check for hand edits is harder
  - con: adds new lines to the verify.md format that checkVerify reads
Recommended: A, standalone use (A9) and a clean guard check (A10)
Answer: A (pure core + IO: one CLI verify.mjs (open, plan, run, record, ci, close); plan.json in the run folder; pure libraries for plan check + presets + expect lint, the expect match and the section writer (each section carries a hash marker so the guard sees a hand edit); a small own runner with timeout)
Trade-off accepted: its own runner, not shared with the paired-agent-tdd ledger

## Consequences

A15 replaces part of A11: the skill has no `VERIFY_FLAG_RUNS_ENABLED`. The flags are `VERIFY_GUARD_ENABLED` (default true) and `VERIFY_RUN_TIMEOUT_MAX` (default unlimited). Flag runs always happen. A run that cannot be done needs the user's answer (`result: accepted A<n>`). The verify.md format does not change, so files written by hand still pass the gate. A new owner `VERIFY` goes into `rules/checks/flag-defaults-e2e.mjs`.

Trade-offs we accepted:

- A1: a plan file to learn; checks that are not a command need another path (Q6)
- A2: one extra question round when there is no DoD
- A3: more runs (one more per flagged item, plus one)
- A5: output from another machine is relayed text, not run by the skill itself
- A6: a doc or UI check needs a small script or a user answer
- A7: a broken env can produce many failures at once
- A8: one question when another machine is booked
- A9: one more skill to install
- A10: one more hook and its tests
- A12: a stale section of an item that was not rerun can stay
- A13: no run on your machine
- A14: the runner list needs upkeep; an unknown runner falls back to the lint
- A15: no quick off switch for a slow repo
- A16: a later change needs a new answer and check
- A17: nothing in Issues to track it
- A18: its own runner, not shared with the paired-agent-tdd ledger

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:c56d5f6396d48c57 -->

- [ ] Plan (happy, fail, edge): the agent writes a plan per DoD item (env name, run command, and expect, exit or image); code refuses a plan that misses a DoD item or a booked env name (A1) (A1)
- [ ] Run (happy, fail, edge): code runs each planned command and writes the item's section (env, run, result, output block) in docs/verify/<slug>.md from the real run; the agent never types a result or output (A1) (A1)
- [ ] Source (happy, fail, edge): the DoD comes from the ADR (dodFile, or found by touches); with no ADR, code lists candidates from the branch diff (new flags, config keys, CLI options), the user confirms each as a claim, and only confirmed claims are verified (A2) (A2)
- [ ] FlagRuns (happy, fail, edge): for each flag the change adds, the items that name it run with the flag unset (default), flipped, and once with an invalid value that must exit with the flag error; these runs always happen (no flag turns them off, A15) (A3) (A3)
- [ ] Expect (happy, fail, edge): a run passes only when it exits 0 (or the exit the plan names for a must-fail check) and, when the plan gives expect, the output contains that text or matches that /regex/ (A4) (A4)
- [ ] Presets (happy, fail, edge): for node --test, pytest, vitest/jest and go test, code fills the expect itself: failures 0, at least one test ran, and the DoD item id appears in a passing test name (A14) (A14)
- [ ] ExpectLint (happy, fail, edge): for any other command, code refuses a weak expect (none on a test command, a bare word such as ok, pass or done, or a pattern that matches empty output) and says why (A14) (A14)
- [ ] Envs (happy, fail, edge): the local shell runs commands for the env the session is in; a [ci]-type env reads the PR's check runs through gh REST (name, conclusion, URL as evidence); any other env is run by the agent where it can and recorded through a verify command that marks where the output came from (A5) (A5)
- [ ] Image (happy, fail, edge): a plan entry may give image: <path> made by a command; a check with no command needs the user's answer (result: accepted A<n>) (A6) (A6)
- [ ] Fail (happy, fail, edge): a failing item is written as result: fail with its output, the remaining items still run, every failure is reported at the end, and the skill never edits product code to make an item pass (A7) (A7)
- [ ] Ask (happy, fail, edge): the plan is shown before running; local and CI envs run at once; the skill asks before running anything on the user's machine or a remote non-prod system (A8) (A8)
- [ ] Standalone (happy, fail, edge): verify is its own skill (skills/verify), usable alone; dev-workflow step 5 says to run it, its gate code is unchanged, qa-sweep is untouched, and verify adds no tests (A9) (A9)
- [ ] Guard (happy, fail, edge): the verify-guard hook (VERIFY_GUARD_ENABLED, default true) denies, while a verify run is open, edits outside docs/verify/ and the run folder and hand edits of a section code wrote; false turns it off; an invalid value is a hard error (A10) (A10)
- [ ] Timeout (happy, fail, edge): VERIFY_RUN_TIMEOUT_MAX=<seconds>|unlimited (default unlimited) stops a planned command that runs longer and records it as fail with timeout; an invalid value is a hard error (A11) (A11)
- [ ] Rerun (happy, fail, edge): a rerun replaces only the sections of the items it ran; every other part of the verify file stays as it was (A12) (A12)
- [ ] Docs (happy, fail, edge): README has a verify row in Skills and rows for VERIFY_GUARD_ENABLED and VERIFY_RUN_TIMEOUT_MAX in Flags; dev-workflow SKILL.md step 5 points to the verify skill; rules/checks/flag-defaults-e2e.mjs OWNERS has VERIFY; the plugin takes the next free minor (A13) (A13)

- feature flag: VERIFY_GUARD_ENABLED=true|false, default true (A10); VERIFY_RUN_TIMEOUT_MAX=<seconds>|unlimited, default unlimited (A11); no VERIFY_FLAG_RUNS_ENABLED (A15); invalid values are hard errors; README Flags rows (A15)
- backward compat: additive: a new skill; dev-workflow gate code and verify.md format unchanged, so hand-written verify files still pass; without the verify skill step 5 works by hand as today; next free plugin minor (A9)
- non-goals: adding tests (qa-sweep's job), fixing product code to make an item pass, pairwise flag combinations, agent-driven browser screenshots, changes to checkVerify or qa-sweep (A9)
- verify env: [cloud] cloud container: e2e on a fixture repo with VERIFY_ flags unset/true/false/invalid, plus dogfood: the verify skill writes this work's own docs/verify/verify-skill.md; [ci] CI green (A13)
- test tiers: unit, fuzz, integration, e2e (A13)
