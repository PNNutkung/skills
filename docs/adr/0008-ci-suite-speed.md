---
touches:
  - ".github/workflows/test.yml"
  - "rules/checks/**"
  - "rules/performance.md"
  - "README.md"
  - "skills/paired-agent-tdd/**"
  - "skills/zero-trust-review/probelib.mjs"
  - "skills/zero-trust-review/*.test.mjs"
  - "**/*.test.mjs"
  - "docs/adr/**"
  - "docs/verify/**"
dod: ci-suite-speed
---
# 8. Cut the CI test suite well under its 120 s cap

Date: 2026-11-26
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

T1: Keep the cap and don't skip any test.

Issue #33 (split out of #30): the node 24 ubuntu CI job caps the suite at 120 s (`rules/checks/test-time.mjs`). The suite took 99.5-150 s there on recent PRs and main, and turned PR #34 red twice at 120.4 and 120.9 s with no test failing. Measured in a 4-core cloud container on main 88e2655: 73.7 s wall and 228 CPU-s per run. Nearly all of that CPU is process launches: 71,414 per run, of them 38,714 git calls (28,887 from `tdd.mjs` snapshots) and 3,969 node starts (775 `direct-run.mjs` wrappers, 270 `direct-run.mjs --check` probes). `node --test` runs only 3 files at a time on 4 cores; at concurrency 6 with the slowest files first the suite takes 62.9 s with the same CPU.

The plan has two parts. Scheduling: one command orders the files by known times and raises the concurrency (A3, A19). Less work: merge e2e scenarios that check the same thing (A6, A8), run the built-in direct runner inside the calling process behind a flag (A4, A18), batch the snapshot git calls, skip the `--check` spawn for the built-in runner, and build fixture repos once. A suite warn level gives an early signal (A7), and issue #36 tracks a retro loop for test time over time in any project (A9).

## Decision

### A1: What does "well under 120 s" mean for the node 24 ubuntu suite?

Context: CI time for the same code varies a lot (79.7-150 s). Locally the suite is 76 s wall, 228 CPU-s; CPU floor on 4 cores 57 s; CI is about 1.3-1.6x local.
Options considered (the agent's analysis when the question was asked):
- (A) median of 5 CI runs <= 90 s, and every one of the 5 runs <= 120 s
  - pro: 30 s headroom on a typical run; one slow runner does not fail the target
  - con: needs about 25-30 % less wall time; needs both less CPU and better packing
- (B) median of 5 CI runs <= 100 s, every run <= 120 s
  - pro: easier to meet
  - con: only 20 s headroom; a busy runner can still go red
- (C) local suite <= 60 s (4-core cloud container), CI not measured
  - pro: stable to measure
  - con: does not prove the CI cap is safe
Recommended: A
Answer: A (median of 5 CI runs <= 90 s, and every one of the 5 runs <= 120 s)
Trade-off accepted: needs about 25-30 % less wall time; needs both less CPU and better packing

### A2: Which kinds of change are in scope?

Context: almost all CPU is process launches (71,414 per run: git 38,714, node 3,969). tdd.mjs makes 28,887 git calls (snapshots); every test command goes tdd.mjs -> node direct-run.mjs -> sh -> test (775 direct-run starts, 270 direct-run --check). Test fixtures also run git init/add/commit about 2,000 times.
Options considered (the agent's analysis when the question was asked):
- (A) test side + test scheduling + product fast paths (batch snapshot git calls, run the built-in direct runner in-process, skip direct-run --check for the built-in runner)
  - pro: biggest cut; real users get faster gates too
  - con: touches tdd.mjs / probelib behavior; needs careful parity tests
- (B) test side + scheduling only (fixture repos built once and copied, concurrency, slow files first); no product code change
  - pro: no risk for skill users
  - con: may not reach Q1 A
- (C) split the suite into 2 CI shards (2 jobs on node 24 ubuntu), each with its own cap
  - pro: fast to do, little code
  - con: more parallelism, not less work (issue says less work); cap meaning changes
Recommended: A
Answer: A (test side + test scheduling + product fast paths (batch snapshot git calls, run the built-in direct runner in-process, skip direct-run --check for the built-in runner))
Trade-off accepted: touches tdd.mjs / probelib behavior; needs careful parity tests

### A3: Change how many test files run at the same time?

Context: node --test runs cores-1 = 3 files at once. Many files wait on child processes. Measured locally: concurrency 3 = 76 s, 8 = 64-66 s, 12 = 66.5 s; CPU the same.
Options considered (the agent's analysis when the question was asked):
- (A) set --test-concurrency (for example 8) in the CI test step and in the documented local command, and start the slowest files first
  - pro: about 15 % less wall time for no code change
  - con: each file gets slower; e2e.speed.flags goes to 36-38 s (> 30 s file cap) until it is split (#34) or cheaper
- (B) keep the default concurrency; only cut work
  - pro: per-file times stay as now
  - con: leaves the easy gain unused
Recommended: A
Answer: A (set --test-concurrency (for example 8) in the CI test step and in the documented local command, and start the slowest files first)
Trade-off accepted: each file gets slower; e2e.speed.flags goes to 36-38 s (> 30 s file cap) until it is split (#34) or cheaper

### A4: Feature flags for the product fast paths (if Q2 A)?

Context: Nut's rule: backward compatible, flags true/false, each skill owns its flags. The snapshot batching gives the same commits (pure refactor). The in-process direct runner changes how a test command starts (no extra node process); ledger line and exit codes must stay the same.
Options considered (the agent's analysis when the question was asked):
- (A) no flag; outputs byte-identical, proven by parity tests
  - pro: nothing new to document
  - con: no quick off-switch if the in-process runner misbehaves on some machine
- (B) one flag for the in-process runner only, e.g. PTDD_INPROCESS_RUNNER_ENABLED (default true); snapshot batching without a flag
  - pro: off-switch where the risk is
  - con: one more flag and README row
- (C) one flag per fast path
  - pro: full control
  - con: more flags than value
Recommended: B
Answer: B (one flag for the in-process runner only, e.g. PTDD_INPROCESS_RUNNER_ENABLED (default true); snapshot batching without a flag)
Trade-off accepted: one more flag and README row

### A5: How does this work relate to PR #34 (e2e.speed split)?

Context: Nut chose: fix #33 first, then #34 rebases. #34 splits the 3 e2e.speed files into 9. Higher concurrency (Q3 A) pushes the unsplit e2e.speed.flags over the 30 s file cap.
Options considered (the agent's analysis when the question was asked):
- (A) branch from main; do not edit e2e.speed*.test.mjs; pick a concurrency that keeps every file < 30 s on main; #34 rebases later and can raise it
  - pro: no conflict with #34; keeps Nut's order
  - con: smaller concurrency gain now
- (B) branch from #34's branch (stacked PR); merge #34 first
  - pro: full concurrency gain at once
  - con: changes the order Nut chose
Recommended: A
Answer: ต่อจาก main ได้เลย เพราะ #34 merged
Trade-off accepted: none recorded (the answer picks no single option)

### A6: Keep every test?

Context: earlier threads kept every test (NoLoss: names and count >= before).
Options considered (the agent's analysis when the question was asked):
- (A) keep every test; names and count >= before; e2e tests still spawn real tdd.mjs processes
  - pro: same coverage, same rule as #19
  - con: limits how much e2e work can be cut
- (B) allow merging e2e scenarios that check the same thing (fewer tests, same assertions)
  - pro: more CPU saved
  - con: coverage review needed per merge
Recommended: A
Answer: B (allow merging e2e scenarios that check the same thing (fewer tests, same assertions))
Trade-off accepted: coverage review needed per merge

### A7: Guard against creep after this?

Context: test-time.mjs fails the suite over 120 s; there is no early warning for the suite (#34 adds a per-file warn flag).
Options considered (the agent's analysis when the question was asked):
- (A) add a suite warn level: CHECKS_TEST_SUITE_WARN_SECONDS_MAX (default 100, unlimited turns it off); prints a ::warning, never fails
  - pro: early signal in every CI log
  - con: a warning is easy to ignore
- (B) no new guard; the 120 s cap is enough
  - pro: nothing new
  - con: creep shows only when CI goes red
Recommended: A
Answer: A ถ้าทำ retro หรือ imorove/optimize overtime ได้ก็จะดีมาก
Trade-off accepted: none recorded (the answer picks no single option)

### A8: When two e2e scenarios merge into one test (A6 B), what must stay true?

Context: A6 allows merging e2e scenarios that check the same thing. Today the e2e files spawn real tdd.mjs gates per scenario; each scripted run costs about 7 CPU-s.
Options considered (the agent's analysis when the question was asked):
- (A) every assertion of the old tests stays in the new test; a map file lists old name -> new name; the test-names check accepts only mapped removals
  - pro: no check is lost and the reviewer sees each merge
  - con: one more file to keep
- (B) merge freely; the reviewer reads the diff
  - pro: least work
  - con: a lost assertion can slip through
Recommended: A, coverage stays provable
Answer: A (every assertion of the old tests stays in the new test; a map file lists old name -> new name; the test-names check accepts only mapped removals)
Trade-off accepted: one more file to keep

### A9: How do we keep improving test time over time (A7 note)?

Context: test-time.mjs writes test-time.jsonl in CI but nothing keeps it. The retro skill already reads CI logs and proposes ratchet rules.
Options considered (the agent's analysis when the question was asked):
- (A) CI uploads test-time.jsonl as an artifact; the retro skill's collect step reads it, reports the slowest files and files that grew against main, and may propose to lower a cap (caps only go down, ratchet style)
  - pro: a loop that finds the next speed-up after each PR
  - con: touches the retro skill too; a bigger PR
- (B) lower the suite cap now (for example 120 -> 100 s) after this work, and open a follow-up issue for the retro loop
  - pro: small PR; the gain is locked in now
  - con: the loop waits for later work
- (C) only the warn flag from A7
  - pro: nothing more to build
  - con: nobody looks at the trend
Recommended: A
Answer: จริง ๆ อยากให้ retro overtime ใช้ได้กับทุก project ด้วย จะแยกเป็น issue กับ PR ใหม่ก็ได้
Trade-off accepted: none recorded (the answer picks no single option)

### A10: Backward compatibility of the product fast paths?

Context: snapshot batching and the in-process direct runner change how tdd.mjs starts git and test commands. Users read gate JSON, the ledger (RUN/exec.jsonl, ZT-RUN line) and exit codes.
Options considered (the agent's analysis when the question was asked):
- (A) gate JSON, ledger lines, ZT-RUN line, exit codes and snapshot commit ids stay byte-identical (except timing fields); a parity test runs each path with the flag on and off
  - pro: users and old run folders see no change
  - con: parity tests cost some CPU
- (B) same as A, but snapshot commit ids may change (for example a different commit message)
  - pro: more freedom to batch
  - con: old gate caches miss once
Recommended: A
Answer: A (gate JSON, ledger lines, ZT-RUN line, exit codes and snapshot commit ids stay byte-identical (except timing fields); a parity test runs each path with the flag on and off)
Trade-off accepted: parity tests cost some CPU

### A11: Non-goals?

Context: the CI matrix also has node 22/26, macOS, asdf and WSL jobs; only node 24 ubuntu has caps.
Options considered (the agent's analysis when the question was asked):
- (A) non-goals: caps on other jobs, sharding (A2), Windows native, changing the 30 s file cap; other jobs must stay green
  - pro: tight scope
  - con: other jobs may stay slow
- (B) also bring every other job under 120 s
  - pro: whole matrix fast
  - con: macOS runners are slower; bigger scope
Recommended: A
Answer: A (non-goals: caps on other jobs, sharding (A2), Windows native, changing the 30 s file cap; other jobs must stay green)
Trade-off accepted: other jobs may stay slow

### A12: Where do we verify?

Context: A1 says median of 5 CI runs. Local 4-core container gives stable numbers; CI varies 79-150 s.
Options considered (the agent's analysis when the question was asked):
- (A) local: 3 runs in this cloud container (before/after, wall and CPU-s); CI: 5 runs of the node 24 ubuntu job on the final commit (1 push + 4 reruns), median and max in docs/verify
  - pro: both stable numbers and the real target
  - con: 4 reruns take about 40 min
- (B) CI only, 5 runs
  - pro: the real target only
  - con: no stable before/after CPU number
Recommended: A
Answer: A (local: 3 runs in this cloud container (before/after, wall and CPU-s); CI: 5 runs of the node 24 ubuntu job on the final commit (1 push + 4 reruns), median and max in docs/verify)
Trade-off accepted: 4 reruns take about 40 min

### A13: Test tiers for the new code?

Context: earlier threads used unit + integration + e2e + fuzz where it fits.
Options considered (the agent's analysis when the question was asked):
- (A) unit (concurrency/order helper, snapshot batching, suite warn), integration (in-process runner vs spawned runner parity: same ledger, same exit codes, timeout, kill of the process group), e2e (a real tdd.mjs gate with the flag on and off), fuzz (file names with spaces/unicode in snapshot batching)
  - pro: covers each risky path
  - con: more tests (we cut CPU elsewhere)
- (B) unit + integration only
  - pro: less test time
  - con: no full-gate proof of the flag
Recommended: A
Answer: A (unit (concurrency/order helper, snapshot batching, suite warn), integration (in-process runner vs spawned runner parity: same ledger, same exit codes, timeout, kill of the process group), e2e (a real tdd.mjs gate with the flag on and off), fuzz (file names with spaces/unicode in snapshot batching))
Trade-off accepted: more tests (we cut CPU elsewhere)

### A14: Which paths may this change touch?

Context: the DoD records touches globs so later work finds this ADR.
Options considered (the agent's analysis when the question was asked):
- (A) .github/workflows/test.yml, rules/checks/test-time.mjs(+test), rules/performance.md, README.md, skills/paired-agent-tdd/** (tdd.mjs, direct-run.mjs, flags, tests), skills/zero-trust-review/probelib.mjs(+tests), skills/retro/** (if Q9 A), rules/checks/flag-defaults-e2e.mjs, any *.test.mjs that gets cheaper fixtures, docs/adr/**, docs/verify/**
  - pro: matches the levers in A2
  - con: wide
- (B) A without skills/zero-trust-review/** (no probe change)
  - pro: zero-trust-review untouched
  - con: the direct-run --check skip (270 node starts) cannot land
Recommended: A
Answer: A (.github/workflows/test.yml, rules/checks/test-time.mjs(+test), rules/performance.md, README.md, skills/paired-agent-tdd/** (tdd.mjs, direct-run.mjs, flags, tests), skills/zero-trust-review/probelib.mjs(+tests), skills/retro/** (if Q9 A), rules/checks/flag-defaults-e2e.mjs, any *.test.mjs that gets cheaper fixtures, docs/adr/**, docs/verify/**)
Trade-off accepted: wide

### A15: Is this DoD right?

Context: ci-suite-speed.md lists 9 items and the 5 required sections from A1-A14.
Options considered (the agent's analysis when the question was asked):
- (A) yes, the DoD is complete
  - pro: design and prototype can start
  - con: none
- (B) change something (say what)
  - pro: the DoD matches what Nut wants
  - con: one more round
Recommended: A
Answer: A (yes, the DoD is complete)
Trade-off accepted: none

### A16: Open the retro-over-time issue with this text?

Context: A9 asks for a retro loop for any project as its own issue and PR. Draft in retro-issue.md.
Options considered (the agent's analysis when the question was asked):
- (A) open it now with this text
  - pro: tracked at once
  - con: none
- (B) change the text first
  - pro: exact wording
  - con: waits for a round
Recommended: A
Answer: A (open it now with this text)
Trade-off accepted: none

### A17: Is the prototype right?

Context: https://claude.ai/artifact/PGATNRJQWCR5E6WV1Avved shows measured times, levers with estimated CPU-s cuts (total 55-70 of 228) and the target bars.
Options considered (the agent's analysis when the question was asked):
- (A) yes, go to design
  - pro: no wait
  - con: none
- (B) change something
  - pro: plan matches Nut
  - con: one more round
Recommended: A
Answer: A (yes, go to design)
Trade-off accepted: none

### A18: Design of the in-process runner?

Context: probelib.runIn spawns the runner for tdd.mjs, testprobe.mjs and mutate.mjs; the flag is PTDD_ (owned by paired-agent-tdd), probelib is zero-trust-review.
Options considered (the agent's analysis when the question was asked):
- (A) DI: direct-run.mjs exports runDirect(); tdd.mjs passes it to probelib (o.inproc); tdd.mjs passes --runner-inprocess to the probes it starts
  - pro: no cross-skill flag; ledger code shared with the CLI
  - con: direct-run.mjs splits into module + main
- (B) probelib imports the sibling direct-run.mjs itself when the runner is that file
  - pro: smallest change
  - con: zero-trust-review must read a PTDD flag (breaks flag ownership)
- (C) probelib spawns sh directly and copies the ledger code
  - pro: fastest
  - con: duplicated ledger code; highest parity risk
Recommended: A
Answer: A (DI: direct-run.mjs exports runDirect(); tdd.mjs passes it to probelib (o.inproc); tdd.mjs passes --runner-inprocess to the probes it starts)
Trade-off accepted: direct-run.mjs splits into module + main

### A19: How are test files ordered?

Context: concurrency 6 + slowest first: 62.9 s, max file 18.5 s; concurrency 8 without order: 63-64 s, tdd.gates 24 s.
Options considered (the agent's analysis when the question was asked):
- (A) rules/checks/run-tests.mjs orders files by a committed test-times.json (unknown files first) and sets the concurrency; CI and README use it
  - pro: one command for CI and local; issue #36 can reuse the timings file
  - con: the timings file must be refreshed
- (B) a fixed list of slow files in test.yml
  - pro: no new file
  - con: easy to forget; local order differs
- (C) concurrency only, no order
  - pro: simplest
  - con: a slow file can start last and stretch the run
Recommended: A
Answer: A (rules/checks/run-tests.mjs orders files by a committed test-times.json (unknown files first) and sets the concurrency; CI and README use it)
Trade-off accepted: the timings file must be refreshed

### A20: Post the new issue #33 description (ticket-new.md)?

Context: dod.mjs render wrote the DoD as a checklist plus every original sentence under Previous notes; ticket-check passes.
Options considered (the agent's analysis when the question was asked):
- (A) post it as it is
  - pro: the issue shows the DoD
  - con: none
- (B) change the text first
  - pro: exact wording
  - con: waits for a round
Recommended: A
Answer: A (post it as it is)
Trade-off accepted: none

## Consequences

Trade-offs we accepted:

- A1: needs about 25-30 % less wall time; needs both less CPU and better packing
- A2: touches tdd.mjs / probelib behavior; needs careful parity tests
- A3: each file gets slower; e2e.speed.flags goes to 36-38 s (> 30 s file cap) until it is split (#34) or cheaper
- A4: one more flag and README row
- A6: coverage review needed per merge
- A8: one more file to keep
- A10: parity tests cost some CPU
- A11: other jobs may stay slow
- A12: 4 reruns take about 40 min
- A13: more tests (we cut CPU elsewhere)
- A14: wide
- A15: none
- A16: none
- A17: none
- A18: direct-run.mjs splits into module + main
- A19: the timings file must be refreshed
- A20: none

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:3d9fcab39780b7f9 -->

- [ ] CiMedian (happy, fail, edge): on the node 24 ubuntu CI job the suite time in test-time.jsonl has a median <= 90 s over 5 runs of the final commit, and every one of the 5 runs is <= 120 s (A1)
- [ ] Concurrency (happy, edge): the CI test step and the documented local test command set --test-concurrency and start the slowest test files first; every file stays under the 30 s file cap (A3)
- [ ] LessWork (happy): the suite does less work: fewer process launches and fewer CPU-s per local run than main 88e2655 (228 CPU-s), from test-side changes and product fast paths (batched snapshot git calls, the built-in direct runner in-process, no direct-run --check spawn for the built-in runner) (A2)
- [ ] RunnerFlag (happy, fail, edge): PTDD_INPROCESS_RUNNER_ENABLED (default true) runs the built-in direct runner in-process; false spawns direct-run.mjs as before; a value that is not true or false stops the tool with the fix; snapshot batching has no flag (A4)
- [ ] Parity (happy, fail, edge): gate JSON, ledger lines (RUN/exec.jsonl), the ZT-RUN line, exit codes and snapshot commit ids are byte-identical (except timing fields) with the flag on and off and against main; a parity test proves it (A10)
- [ ] MergedTests (happy, fail, edge): when e2e scenarios merge into one test, every assertion of the old tests stays in the new test; a map file lists old name -> new name; the test-names check accepts only mapped removals (A8)
- [ ] SuiteWarn (happy, fail, edge): rules/checks/test-time.mjs prints a ::warning (exit code unchanged) when the suite is over CHECKS_TEST_SUITE_WARN_SECONDS_MAX, default 100; unlimited turns it off; a value that is not a whole number above 0 or unlimited exits 2 with the fix; README flags table and rules/performance.md list it (A7)
- [ ] NoSkip (happy): the caps stay 30 s per file and 120 s for the suite, and no test is skipped (T1)
- [ ] RetroIssue (happy): a new GitHub issue tracks a retro loop for test time over time that works for any project (separate PR) (A9)

- feature flag: PTDD_INPROCESS_RUNNER_ENABLED, default true; CHECKS_TEST_SUITE_WARN_SECONDS_MAX, default 100 (A4)
- backward compat: byte-identical gate JSON, ledger, ZT-RUN line, exit codes and snapshot commit ids; flag false = the old spawned runner (A10)
- non-goals: caps on other CI jobs (they must stay green), sharding, Windows native, changing the 30 s file cap, the retro-over-time loop (own issue and PR) (A11)
- verify env: local: 3 runs in the 4-core cloud container, before/after wall and CPU-s; CI: 5 runs of the node 24 ubuntu job on the final commit (1 push + 4 reruns), median and max in docs/verify (A12)
- test tiers: unit, integration, e2e, fuzz (A13)
