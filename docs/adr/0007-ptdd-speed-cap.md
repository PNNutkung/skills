---
touches:
  - "skills/paired-agent-tdd/e2e.speed*.test.mjs"
  - "skills/paired-agent-tdd/test-e2e-speed.mjs"
  - "skills/paired-agent-tdd/test-e2e-run.mjs"
  - "rules/checks/test-time.mjs"
  - "rules/checks/test-time.test.mjs"
  - "rules/performance.md"
  - "README.md"
  - "docs/**"
dod: ptdd-speed-cap
---
# 7. Split the paired-agent-tdd e2e.speed tests under the CI time cap

Date: 2026-11-25
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

T1: Keep the cap and don't skip any test.

Issue #30 (from the PR #27 retro, finding F2): the node 24 ubuntu CI job caps each test file at 30 s and the suite at 120 s (`rules/checks/test-time.mjs`, added in PR #24). The three `skills/paired-agent-tdd/e2e.speed*.test.mjs` files took 24.6-31.5 s there and turned CI red on PRs #26, #27 and #29, files none of them touched; each passed on a rerun. Each file runs three whole scripted runs one after another, about 7 CPU-s each, nearly all of it in gate processes started with `spawnSync`. In a 4-core cloud container the same files take 15.5-17 s in the full suite, so CI runs them about 1.5-1.9 times slower.

## Decision

### A1: What per-file wall time on CI counts as "well under 30 s"?

Context: the ticket says "each file stays well under 30 s on CI" with no number. On node 24 ubuntu the e2e.speed* files took 24.6-31.5 s; locally (4-core cloud container) 15.5-17 s in the full suite, 11.6-12.8 s alone. One scripted run is ~7 CPU-s, 5-6.5 s wall under load. Measured CPU of the heaviest file alone: 21.3 CPU-s (user 16.1 + sys 5.2).
Options considered (the agent's analysis when the question was asked):
- (A) every e2e.speed* file at most 20 s on the node 24 ubuntu CI job (two thirds of the cap)
  - pro: 10 s headroom absorbs a busy runner (CI was ~2x local)
  - con: with 3 runs per file today it needs a split or real speed-up, not a tweak
- (B) at most 15 s on CI
  - pro: a lot of headroom, room to add tests later
  - con: likely forces one run per file or cutting gate work
- (C) at most 24 s on CI (80 % of the cap)
  - pro: easiest to meet
  - con: 25-31 s runs were seen on CI; 24 s leaves little room
Recommended: A, enough headroom against the 2x slow runner without cutting coverage
Answer: A (every e2e.speed* file at most 20 s on the node 24 ubuntu CI job (two thirds of the cap))
Trade-off accepted: with 3 runs per file today it needs a split or real speed-up, not a tweak

### A2: Is the 120 s suite cap in scope?

Context: the same failing CI runs also had the suite at 121.9-122 s (ticket). Splitting files does not lower the suite's total CPU (226 CPU-s here); the issue asks only about the e2e.speed files.
Options considered (the agent's analysis when the question was asked):
- (A) per-file only, as the ticket says; open a new issue for the suite time
  - pro: small, focused PR
  - con: the suite cap can still go red on a slow runner
- (B) also bring the suite under a target (e.g. 100 s on CI) in this PR
  - pro: both reds fixed at once
  - con: needs less total work across many files, a much bigger change
- (C) per-file target, plus record the suite time before/after as evidence only (no target)
  - pro: we see whether it moved, no scope creep
  - con: the suite risk stays open
Recommended: A, keep to the ticket; a new issue holds the suite risk
Answer: A (per-file only, as the ticket says; open a new issue for the suite time)
Trade-off accepted: the suite cap can still go red on a slow runner

### A3: Keep a guard so a file does not creep back to the cap?

Context: rules/checks/test-time.mjs fails over 30 s; nothing warns before that. The e2e.speed files crept from ~20 s (measured 2026-11-23) to 31 s.
Options considered (the agent's analysis when the question was asked):
- (A) test-time.mjs also prints a warning (does not fail) for files over a warn level, new flag CHECKS_TEST_FILE_WARN_SECONDS_MAX (default 20, unlimited turns it off)
  - pro: early signal in every CI log, cheap
  - con: a warning is easy to ignore
- (B) a structural unit test: no e2e.speed* file runs more than N scripted runs
  - pro: fails fast locally, no timing noise
  - con: only guards these files, a number to keep in sync
- (C) no new guard; the 30 s cap is enough
  - pro: nothing new to maintain
  - con: same creep can happen again
Recommended: A, a visible early signal for every file, not just these
Answer: A (test-time.mjs also prints a warning (does not fail) for files over a warn level, new flag CHECKS_TEST_FILE_WARN_SECONDS_MAX (default 20, unlimited turns it off))
Trade-off accepted: a warning is easy to ignore

### A4: May tests be merged, or must the 9 tests stay as they are?

Context: the 3 files hold 9 tests and 9 scripted runs (vmeasure already reuses the off run of the first test). The ticket: "don't skip any test".
Options considered (the agent's analysis when the question was asked):
- (A) the same 9 test names and the same assertions; only which file they live in and how they run changes
  - pro: coverage is provably unchanged (same names before and after)
  - con: limits speed-ups that would merge runs
- (B) tests may be merged when they run the same env (one run, several assertions), names kept as subtests
  - pro: fewer runs, less CPU
  - con: harder to prove nothing was lost
Recommended: A, the ticket asks to keep every test; same names make it checkable
Answer: A (the same 9 test names and the same assertions; only which file they live in and how they run changes)
Trade-off accepted: limits speed-ups that would merge runs

### A5: Feature flag?

Context: the change is in test files and test helpers only; no skill behavior changes for users.
Options considered (the agent's analysis when the question was asked):
- (A) not relevant: no flag (a flag only if Q3 A adds the warn level in test-time.mjs)
  - pro: no flag for test-only code
  - con: none
- (B) a flag to switch back to the old test layout
  - pro: can undo without a revert
  - con: a flag for test layout has no user; dead weight
Recommended: A, test-only change
Answer: A (not relevant: no flag (a flag only if Q3 A adds the warn level in test-time.mjs))
Trade-off accepted: none

### A6: Backward compatibility and version?

Context: runE2E (test-e2e-run.mjs) is shared by e2e.test, e2e.default*, e2e.fast, e2e.resume. Plugin is 2.6.0 on main; the test files ship inside skills/paired-agent-tdd.
Options considered (the agent's analysis when the question was asked):
- (A) runE2E keeps its signature and results for every other caller; no plugin version bump (tests only)
  - pro: no release for a test-only change
  - con: the shipped plugin folder changes without a version change
- (B) same compatibility, and bump to the next free minor (2.7.0)
  - pro: every change to the plugin folder has a version
  - con: a release with no user-visible change
Recommended: A, nothing a user runs changes
Answer: A (runE2E keeps its signature and results for every other caller; no plugin version bump (tests only))
Trade-off accepted: the shipped plugin folder changes without a version change

### A7: Where to verify?

Context: the failures were only on node 24 ubuntu CI; this cloud container (4 cores) runs them ~2x faster.
Options considered (the agent's analysis when the question was asked):
- (A) [cloud] full suite here, timings recorded; [ci] the PR's CI on node 24 ubuntu green, with the test-time.jsonl timings of every e2e.speed* file at or under the Q1 target, on the first run plus 2 reruns
  - pro: 3 CI samples show it holds on a busy runner
  - con: takes ~3 CI runs of time
- (B) [cloud] + [ci] one CI run only
  - pro: quick
  - con: one sample cannot show the flake is gone
- (C) (A) plus one run on your WSL machine
  - pro: a third environment
  - con: needs your machine; CI is where it failed
Recommended: A, the problem is CI variance, so CI needs more than one sample
Answer: A ([cloud] full suite here, timings recorded; [ci] the PR's CI on node 24 ubuntu green, with the test-time.jsonl timings of every e2e.speed* file at or under the Q1 target, on the first run plus 2 reruns)
Trade-off accepted: takes ~3 CI runs of time

### A8: Test tiers?

Context: the e2e.speed files are the e2e tier themselves. A split or a new helper may add small pure functions.
Options considered (the agent's analysis when the question was asked):
- (A) unit tests for any new helper (and the test-time warn logic if Q3 A, with fuzz input on the flag value like the existing caps); the e2e files are the e2e/regression tier; integration not relevant
  - pro: tests what changes, matches the size of the change
  - con: no separate integration tier
- (B) unit + integration + e2e + fuzz for everything
  - pro: full set
  - con: integration has nothing new to test here
Recommended: A
Answer: A (unit tests for any new helper (and the test-time warn logic if Q3 A, with fuzz input on the flag value like the existing caps); the e2e files are the e2e/regression tier; integration not relevant)
Trade-off accepted: no separate integration tier

### A9: Non-goals?

Context: other slow files in the full run: tdd.zproc 16.3 s, zero-trust-review mutate 15.6 s (both under 20 s here).
Options considered (the agent's analysis when the question was asked):
- (A) non-goals: no cap change, no test removed or skipped, no change to other slow files (tdd.zproc, mutate), no change to the node 22/26 or macOS jobs
  - pro: focused
  - con: other files may hit the cap later (Q3 A would warn)
- (B) also check every file and fix any over the Q1 target
  - pro: one sweep
  - con: scope grows past the ticket
Recommended: A
Answer: A (non-goals: no cap change, no test removed or skipped, no change to other slow files (tdd.zproc, mutate), no change to the node 22/26 or macOS jobs)
Trade-off accepted: other files may hit the cap later (Q3 A would warn)

### A10: Which paths may the change touch?

Context: the files involved are listed in facts.
Options considered (the agent's analysis when the question was asked):
- (A) skills/paired-agent-tdd/e2e.speed*.test.mjs, skills/paired-agent-tdd/test-e2e-speed.mjs, skills/paired-agent-tdd/test-e2e-run.mjs, rules/checks/test-time.mjs (+ its test, if Q3 A), rules/performance.md, README flags table, docs/
  - pro: covers every likely change
  - con: test-e2e-run.mjs is shared; a change there touches 5 other files' runs
- (B) only the e2e.speed* files and test-e2e-speed.mjs
  - pro: nothing shared changes
  - con: rules out making runE2E async, if the design needs it
Recommended: A, the design step decides; the list keeps it allowed
Answer: A (skills/paired-agent-tdd/e2e.speed*.test.mjs, skills/paired-agent-tdd/test-e2e-speed.mjs, skills/paired-agent-tdd/test-e2e-run.mjs, rules/checks/test-time.mjs (+ its test, if Q3 A), rules/performance.md, README flags table, docs/)
Trade-off accepted: test-e2e-run.mjs is shared; a change there touches 5 other files' runs

### A11: How to spread the e2e.speed runs (design board)?

Context: prototype in a scratch worktree: one file per test gives files 4.6-6.6 s and vmeasure (2 sequential runs) 10.1 s in the full suite here; vmeasure with off and on in 2 worker threads 3.9 s alone. Suite 71.1 s vs 74.4 s. CI ran ~1.5-1.9x this container.
Options considered (the agent's analysis when the question was asked):
- (A) one file per test (9 files); vmeasure runs off and on side by side in 2 worker threads
  - pro: every file about one run of wall time; suite a little faster
  - con: 9 files instead of 3, one small worker helper
- (B) keep 3 files; runs inside each file in worker threads
  - pro: file count unchanged
  - con: a test passes a closure that cannot cross into a worker; heavy threads compete on 4 cores
- (C) 5 files of at most 2 sequential runs
  - pro: no new helper
  - con: ~15-20 s on CI, at the 20 s target
Recommended: A, the only one with clear headroom under 20 s on CI
Answer: A (one file per test (9 files); vmeasure runs off and on side by side in 2 worker threads)
Trade-off accepted: 9 files instead of 3, one small worker helper

### A12: Is the DoD (6 items in ptdd-speed-cap.md) what you want?

Context: dod.mjs check passed with Under20, SameTests, NoSkip, WarnFlag, FlagDoc, SuiteIssue and the five required sections from A1-A10.
Options considered (the agent's analysis when the question was asked):
- (A) confirm as written
  - pro: go on to the ADR and TDD
  - con: a later change needs the ADR rewritten
- (B) change something
  - pro: matches exactly
  - con: one more round
Recommended: A
Answer: A (confirm as written)
Trade-off accepted: a later change needs the ADR rewritten

### A13: Post the new #30 description (ticket-new.md)?

Context: render wrote the DoD as a checklist and kept every original sentence under Previous notes; ticket-check passed.
Options considered (the agent's analysis when the question was asked):
- (A) post it as attached
  - pro: the issue matches the DoD and can be ticked at verify
  - con: the original text moves to the end
- (B) change it first
  - pro: exact wording
  - con: one more round
Recommended: A
Answer: A (post it as attached)
Trade-off accepted: the original text moves to the end

### A14: Keep the rules/checks/test-names.mjs change (outside the ADR touches)?

Context: moving the 9 legacy-named tests into new files made `test-names.mjs --base origin/main` flag all 9 as new names; the fix treats a name the same diff removes from a test file as moved (diff includes deleted files), with tests.
Options considered (the agent's analysis when the question was asked):
- (A) keep it in this PR and add the path to the ADR touches
  - pro: CI passes, and later test moves benefit
  - con: the PR grows a little
- (B) rename the 9 tests to the should ... when ... shape
  - pro: the check is not touched
  - con: goes against A4 (same names)
- (C) move the check fix to a separate PR first
  - pro: one topic per PR
  - con: this PR waits for that one
Recommended: A
Answer: B (rename the 9 tests to the should ... when ... shape)
Trade-off accepted: goes against A4 (same names)

## Consequences

The 9 e2e.speed tests move to one file each (`e2e.speed.<mode>.test.mjs`) with their assertions unchanged; the vmeasure test runs its all-off and all-on runs side by side in two worker threads (the worker entry lives in `test-e2e-speed.mjs`). `node --test` spreads the files over the cores, so each file holds about one run of wall time. Moving them made `rules/checks/test-names.mjs` see 9 added legacy names, so they are renamed to the `should ... when ...` shape (A14) and keep their old tag, such as `(pcourier)`, at the end; `test-e2e-speed.test.mjs` keeps the old name -> new name map. `rules/checks/test-time.mjs` also prints a warning for any file over `CHECKS_TEST_FILE_WARN_SECONDS_MAX` (default 20 s) so the next creep shows up before the cap fails. The 120 s suite cap is left to #33.

Trade-offs we accepted:

- A1: with 3 runs per file today it needs a split or real speed-up, not a tweak
- A2: the suite cap can still go red on a slow runner
- A3: a warning is easy to ignore
- A4: limits speed-ups that would merge runs
- A5: none
- A6: the shipped plugin folder changes without a version change
- A7: takes ~3 CI runs of time
- A8: no separate integration tier
- A9: other files may hit the cap later (Q3 A would warn)
- A10: test-e2e-run.mjs is shared; a change there touches 5 other files' runs
- A11: 9 files instead of 3, one small worker helper
- A12: a later change needs the ADR rewritten
- A13: the original text moves to the end
- A14: goes against A4 (same names)

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:5239515dff5b466a -->

- [ ] Under20 (happy, fail, edge): every skills/paired-agent-tdd/e2e.speed*.test.mjs file takes at most 20 s in test-time.jsonl on the node 24 ubuntu CI job, on the PR's first run and on 2 reruns (A1)
- [ ] SameTests (happy, fail): the same 9 e2e.speed tests with the same assertions run before and after, renamed to the should ... when ... shape (old name -> new name kept in test-e2e-speed.test.mjs); none is removed, skipped or merged (A14)
- [ ] NoSkip (happy): the per-file and suite caps stay 30 s and 120 s, and no test is skipped (T1)
- [ ] WarnFlag (happy, fail, edge): rules/checks/test-time.mjs prints a warning (exit code unchanged) for each file over CHECKS_TEST_FILE_WARN_SECONDS_MAX, default 20; unlimited turns it off; a value that is not a whole number above 0 or unlimited exits 2 with the fix (A3)
- [ ] FlagDoc (happy): the README flags table and rules/performance.md list CHECKS_TEST_FILE_WARN_SECONDS_MAX with its default (A3)
- [ ] SuiteIssue (happy): a new GitHub issue tracks the 120 s suite cap risk (suite 121.9-122 s on CI) (A2)

- feature flag: no flag for the test layout; the only new flag is CHECKS_TEST_FILE_WARN_SECONDS_MAX (default 20) (A5)
- backward compat: runE2E keeps its signature and results for every other caller (e2e.test, e2e.default*, e2e.fast, e2e.resume pass unchanged); no plugin version bump (A6)
- non-goals: no cap change, no test removed or skipped, no change to other slow files (tdd.zproc, zero-trust-review mutate), no change to the node 22/26 or macOS jobs, the suite time (new issue) (A9)
- verify env: [cloud] full suite in the cloud container with timings; [ci] node 24 ubuntu CI green with every e2e.speed* file at or under 20 s on the first run and 2 reruns (A7)
- test tiers: unit (new helpers, test-time warn logic with fuzzed flag values), e2e (the e2e.speed files are the regression tier) (A8)
