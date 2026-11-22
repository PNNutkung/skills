---
touches:
  - "skills/paired-agent-tdd/**"
  - "skills/zero-trust-review/mutate.mjs"
  - "skills/zero-trust-review/mutants.mjs"
  - "skills/zero-trust-review/testprobe.mjs"
  - "skills/zero-trust-review/flags.mjs"
  - "skills/zero-trust-review/*.test.mjs"
  - "README.md"
  - ".claude-plugin/*.json"
dod: ptdd-speed
---
# 1. Speed up paired-agent-tdd

Date: 2026-11-22
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

Nut asked (2026-11-22, thread "Speed up paired-agent-tdd"): "อยาก optimize ให้ paired tdd ทำงานเร็วขึ้นโดย run ทุกอย่าง parallel กัน ใช้เวลารอน้อยที่สุด และใช้ token น้อยที่สุด" (make paired TDD faster: run everything in parallel, wait as little as possible, use as few tokens as possible).

Measured before deciding (script counts and e2e timings; no real model run had been logged in runs.md): a 3-group run spawns 15 agents (9 in fast mode); each agent's fixed cost (~38-41k tokens) dwarfs the prompts the script writes (<2% of tokens); the GREEN gate is 71% of gate time and mutation is its long pole; a navigator re-runs a gate on byte-identical files, and verify re-runs final; the mutation budget can overrun to ~180 s; SKILL.md was over its own 14,000-byte cap, so graph.mjs --check failed.

## Decision

### A1: When speed and tokens conflict, which wins?

Context: Nut asked for both "least waiting" and "fewest tokens"; some changes (speculative GREEN) trade tokens for time (measure.md #5)
Options considered (the agent's analysis when the question was asked):
- (A) tokens win: only changes that cost no extra tokens
  - pro: never raises cost
  - con: leaves some wall-clock on the table
- (B) time wins: accept extra tokens to cut waiting
  - pro: shortest wall-clock
  - con: a failed RED wastes ~40k per speculative agent
- (C) per-change flag, tokens-first by default
  - pro: user picks per run
  - con: more flags to document
Recommended: C
Answer: C (per-change flag, tokens-first by default)
Trade-off accepted: more flags to document

### A2: Make fast mode (one tdd-driver + one navigator per group with no after) the default?

Context: 3 groups: 15 agents -> 9, about -238k tokens, -2 hops (graph.mjs --plan 3 0 1 fast); but the code's author also writes its tests (SKILL.md Fast mode)
Options considered (the agent's analysis when the question was asked):
- (A) new flag PTDD_PIPELINE_MODE=fast|paired, default fast; plan.mode still overrides
  - pro: biggest token and time cut
  - con: less independence by default
- (B) same flag, default paired (today)
  - pro: no change in safety
  - con: user must opt in for the speed
Recommended: A
Answer: A (new flag PTDD_PIPELINE_MODE=fast|paired, default fast; plan.mode still overrides)
Trade-off accepted: less independence by default

### A4: Let the navigator reuse the driver's last gate result when the files are byte-identical?

Context: navigator re-runs the same gate (workflow.js:233); mutant sampling is deterministic (zt/mutants.mjs:125) so only the flake sample is new
Options considered (the agent's analysis when the question was asked):
- (A) reuse when a hash of the group files and snapshot matches; the navigator still judges and re-runs only the flake check
  - pro: one GREEN gate less per stage on the critical path
  - con: navigator trusts a code-written file instead of its own run
- (B) always re-run (today)
  - pro: strictest zero-trust
  - con: slower
Recommended: A
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A5: Start the green-driver while the red-navigator is still checking (speculative)?

Context: saves one hop per group, but when RED fails the green work is thrown away (~40k tokens) (workflow.js:415-442)
Options considered (the agent's analysis when the question was asked):
- (A) yes, default on
  - pro: one hop less per group
  - con: ~40k wasted every time RED fails
- (B) yes behind a flag, default off
  - pro: no extra tokens unless asked
  - con: not faster by default
- (C) no
  - pro: no revert logic, no waste
  - con: the hop stays
Recommended: B (follows Q1 C, tokens-first)
Answer: B (yes behind a flag, default off)
Trade-off accepted: not faster by default

### A6: Skip the final courier (haiku) when every fixer reports its gate ok, and let tdd.mjs verify be the check?

Context: courier re-runs final --again; verify already re-runs final (tdd.mjs:427)
Options considered (the agent's analysis when the question was asked):
- (A) yes
  - pro: one hop and ~41k less
  - con: a fixer's regression is found in verify, not in the run (lead must resume)
- (B) no
  - pro: regression caught inside the run
  - con: one more agent and hop
Recommended: A
Answer: A (yes)
Trade-off accepted: a fixer's regression is found in verify, not in the run (lead must resume)

### A7: Run the integration-tester and the reviewer at the same time?

Context: they run one after the other (workflow.js:456, 461); only when the change crosses a process/DB/network boundary
Options considered (the agent's analysis when the question was asked):
- (A) yes; the reviewer reviews without the integration test file, which is still gated
  - pro: one hop less
  - con: the integration test file is not read by the opus reviewer
- (B) no
  - pro: the reviewer sees the integration test
  - con: one more hop
Recommended: A
Answer: A (yes; the reviewer reviews without the integration test file, which is still gated)
Trade-off accepted: the integration test file is not read by the opus reviewer

### A8: Speed up the code gates in the zero-trust-review scripts too?

Context: mutation repeats the probe's head run as baseline; its 60 s budget is checked only before a mutant starts so it can overrun to ~180 s; ~75 test processes can run at once with 3 groups; verify re-runs final even when nothing changed (zt/mutate.mjs:56,141; tdd.mjs:427)
Options considered (the agent's analysis when the question was asked):
- (A) yes: reuse the baseline, enforce the budget on running mutants, cap processes per run, verify reuses final.json when the snapshot hash matches
  - pro: less CPU and wall-clock, no tokens
  - con: touches another skill (zero-trust-review), its own flags
- (B) only the ptdd side (verify reuse)
  - pro: no change to another skill
  - con: mutation stays the slowest step
Recommended: A
Answer: A (yes: reuse the baseline, enforce the budget on running mutants, cap processes per run, verify reuses final.json when the snapshot hash matches)
Trade-off accepted: touches another skill (zero-trust-review), its own flags

### A9: Flag shape?

Context: Nut's rules: _ENABLED true/false, _MODE, _MAX; new flags default ON; each skill owns its flags (flag-naming)
Options considered (the agent's analysis when the question was asked):
- (A) one flag per change: PTDD_PIPELINE_MODE (Q2), PTDD_QUICK_DRIVER_GATE_ENABLED (Q3), PTDD_GATE_REUSE_ENABLED (Q4), PTDD_SPECULATIVE_GREEN_ENABLED (Q5, default false), PTDD_COURIER_SKIP_ENABLED (Q6), PTDD_PARALLEL_REVIEW_ENABLED (Q7); zero-trust-review: ZT_MUTATION_BASELINE_REUSE_ENABLED, ZT_TEST_PROCESS_MAX
  - pro: each change can be turned off alone
  - con: many flags
- (B) one PTDD_SPEED_MODE=fast|safe
  - pro: one switch
  - con: cannot turn off one change
Recommended: A
Answer: A (one flag per change: PTDD_PIPELINE_MODE (Q2), PTDD_QUICK_DRIVER_GATE_ENABLED (Q3), PTDD_GATE_REUSE_ENABLED (Q4), PTDD_SPECULATIVE_GREEN_ENABLED (Q5, default false), PTDD_COURIER_SKIP_ENABLED (Q6), PTDD_PARALLEL_REVIEW_ENABLED (Q7); zero-trust-review: ZT_MUTATION_BASELINE_REUSE_ENABLED, ZT_TEST_PROCESS_MAX)
Trade-off accepted: many flags

### A10: Backward compatibility?

Context: default prompts double as the resume cache key (workflow.js), so changing them breaks resume of an old run
Options considered (the agent's analysis when the question was asked):
- (A) with every new flag false, prompts and behavior are byte-identical to v2.0.0; a continue.json from v2.0.0 still resumes; plugin minor bump
  - pro: no break
  - con: two code paths to test
- (B) allow a break, major bump
  - pro: one code path
  - con: old continue.json files stop resuming
Recommended: A
Answer: A (with every new flag false, prompts and behavior are byte-identical to v2.0.0; a continue.json from v2.0.0 still resumes; plugin minor bump)
Trade-off accepted: two code paths to test

### A11: Where and how to verify?

Context: runs.md has no real model run yet; only script counts and e2e timings (e2e 8.4 s, fast 6.4 s)
Options considered (the agent's analysis when the question was asked):
- (A) e2e with real gates + scripted agents, comparing before/after: agent count, critical-path hops, gate wall-clock; plus CI 6/6 green
  - pro: reproducible, no model cost
  - con: no real token number
- (B) A plus one real model run on a real change, recorded in runs.md
  - pro: real tokens and time
  - con: needs a real change and costs tokens; which repo?
Recommended: B on this repo, a small multi-file change Nut picks
Answer: B (A plus one real model run on a real change, recorded in runs.md)
Trade-off accepted: needs a real change and costs tokens; which repo?

### A13: Non-goals?

Options considered (the agent's analysis when the question was asked):
- (A) no model/effort/agent-type change (R5 needs real runs); no change to DoD closure, frozen tests or scope fence; include fixing graph.mjs --check (SKILL.md is 14,713 bytes, over its 14,000 cap) since SKILL.md is read by the lead every run
  - pro: keeps the change about speed; fixes a failing check
  - con: model tuning waits for real runs
- (B) also tune model/effort per node now (alternative written down at ADR time; Nut asked for real options on 2026-11-22 08:25)
  - pro: possibly cheaper sooner
  - con: no measured run to justify it (R5)
Recommended: A
Answer: A (no model/effort/agent-type change (R5 needs real runs); no change to DoD closure, frozen tests or scope fence; include fixing graph.mjs --check (SKILL.md is 14,713 bytes, over its 14,000 cap) since SKILL.md is read by the lead every run)
Trade-off accepted: model tuning waits for real runs

### A14: Paths the change covers (touches)?

Options considered (the agent's analysis when the question was asked):
- (A) skills/paired-agent-tdd/**, skills/zero-trust-review/{mutate,mutants,testprobe,flags}.mjs and their tests, README Flags table, .claude-plugin/plugin.json; version after the retro skill's 2.1.0 (2.2.0 if retro merges first)
  - pro: covers every file the change needs
  - con: touches zero-trust-review too
- (B) skills/paired-agent-tdd/** only (alternative written down at ADR time)
  - pro: one skill
  - con: the zero-trust-review gate changes (A8) would have no home
Recommended: A
Answer: agree note: Q3 "ขอดูข้อดีข้อเสีย"; Q5 "B แต่จะมีข้อเสียอะไรไหม"; Q12 unanswered
Trade-off accepted: none recorded (the answer picks no single option)

### A15: Real model run for Q11 B: which change, and where?

Context: this cloud session has no Workflow tool, so a real ptdd run needs Claude Code with the plugin (Nut's machine, Windows via WSL, or a Remote Control session there)
Options considered (the agent's analysis when the question was asked):
- (A) Nut picks a small multi-file change in a repo of Nut's; Nut runs it (or I start Remote Control on that folder) and record.mjs logs it
  - pro: real tokens and time on real work
  - con: needs Nut's machine on
- (B) a synthetic 3-group change in a fixture repo, run before and after with the flags off and on
  - pro: a fair before/after comparison
  - con: costs two real runs of tokens
Recommended: B, it gives the before/after number Q11 asks for
Answer: B note: on Q5 Nut asked "แล้วเราจะเพิ่ม flag ตรงนี้ไว้ทำไมนะถ้าไม่มีโอกาสได้ใช้"
Trade-off accepted: none recorded (the answer picks no single option)

### A16: Quick in-between driver gate runs (Q3 re-asked with pros and cons)

Context: driver loops on the GREEN gate up to 3 runs; mutation is ~2x the probe and can take 60 s+ per run (tdd.mjs:214, workflow.js:218)
Options considered (the agent's analysis when the question was asked):
- (A) runs before the driver's last skip mutation; the last run and the navigator's run keep it
  - pro: saves up to ~2 x 60 s per GREEN stage per group, no extra tokens
  - pro: probe still checks pass, revert-fail, flake and frozen tests on every run
  - con: a weak test (surviving mutant) is seen later; if seen on the last run the driver has no run left, so the navigator FAILs and a repair round costs 2 agents (~80k)
- (B) no change
  - pro: survivors seen on the first run, fewest repair rounds
  - con: slowest
- (C) mutation on the first and last driver runs, quick only in the middle
  - pro: survivors seen early, still saves one mutation run
  - con: saves less (one run, not two)
Recommended: C
Answer: C (mutation on the first and last driver runs, quick only in the middle)
Trade-off accepted: saves less (one run, not two)

### A17: Test tiers (Q12 re-asked with options)

Options considered (the agent's analysis when the question was asked):
- (A) unit + fuzz, integration with real gates, E2E with every new flag on and off, and today's e2e kept unchanged as regression
  - pro: each flag proven both ways
  - con: more test time in CI
- (B) like A but E2E only with all flags on and all flags off
  - pro: faster CI
  - con: a bad interaction between two flags can slip
Recommended: A
Answer: A (unit + fuzz, integration with real gates, E2E with every new flag on and off, and today's e2e kept unchanged as regression)
Trade-off accepted: more test time in CI

### A18: Speculative GREEN: keep it at all?

Context: Nut asked why add a flag nobody will turn on; no real run yet says how often RED passes first time
Options considered (the agent's analysis when the question was asked):
- (A) drop it now; record.mjs logs how often RED passes first time, and a later change adds it only if the numbers show it pays
  - pro: no unused code or flag to maintain, no revert logic to get wrong
  - con: one hop per group stays on the critical path
- (B) build it, default off
  - pro: ready when numbers arrive
  - con: code and tests for a feature nobody uses
- (C) build it, default on
  - pro: fastest
  - con: ~40k wasted every time RED fails
Recommended: A
Answer: A (drop it now; record.mjs logs how often RED passes first time, and a later change adds it only if the numbers show it pays)
Trade-off accepted: one hop per group stays on the critical path

### A19: Strict mutation budget: flag or plain fix?

Context: the 60 s budget is checked only before a mutant starts, so a run can overrun to ~180 s (zt/mutate.mjs:141); A10 says all flags off = v2.0.0 byte for byte, and A9's list had no flag for this
Options considered (the agent's analysis when the question was asked):
- (A) new flag ZT_MUTATION_BUDGET_STRICT_ENABLED, default true; false = today
  - pro: keeps A10 (everything can go back to v2.0.0)
  - con: one more flag
- (B) plain bug fix, no flag
  - pro: fewer flags
  - con: breaks A10: with all flags off the budget still behaves differently
Recommended: A
Answer: A (new flag ZT_MUTATION_BUDGET_STRICT_ENABLED, default true; false = today)
Trade-off accepted: one more flag

### A20: Approve the DoD (dod.md, 15 items)?

Options considered (the agent's analysis when the question was asked):
- (A) Approve
  - pro: prototype starts now
  - con: later changes need a DoD edit and re-check
- (B) needs changes
  - pro: corrected before building
  - con: a round trip
Recommended: A
Answer: A (Approve)
Trade-off accepted: none recorded (the answer picks no single option)

### A21: Does the prototype match?

Options considered (the agent's analysis when the question was asked):
- (A) yes, go to architecture
  - pro: design starts now
  - con: none seen
- (B) needs changes
  - pro: the picture gets corrected first
  - con: a round trip
Recommended: A
Answer: A (yes, go to architecture)
Trade-off accepted: none seen

### A22: Architecture?

Options considered (the agent's analysis when the question was asked):
- (A) ifs inside workflow.js and new gate options in tdd.mjs
  - pro: smallest diff
  - con: decisions scattered in a 551-line file, hard to fuzz, flags can interact unseen
- (B) speed.mjs (pure policy: flags + state -> decisions) and gatecache.mjs (sha256 of snapshot + group files + gate args); workflow.js and tdd.mjs call them
  - pro: every decision fuzz-tested without agents or gates; one test proves all-off equals v2.0.0
  - con: two new files
- (C) graph-driven scheduler: new behavior as graph.mjs node attributes
  - pro: docs regenerate, --check guards
  - con: new scheduler, biggest risk to Q10, slowest
Recommended: B
Answer: B (speed.mjs (pure policy: flags + state -> decisions) and gatecache.mjs (sha256 of snapshot + group files + gate args); workflow.js and tdd.mjs call them)
Trade-off accepted: two new files

## Consequences

Trade-offs we accepted:

- A1: more flags to document
- A2: less independence by default
- A5: not faster by default
- A6: a fixer's regression is found in verify, not in the run (lead must resume)
- A7: the integration test file is not read by the opus reviewer
- A8: touches another skill (zero-trust-review), its own flags
- A9: many flags
- A10: two code paths to test
- A11: needs a real change and costs tokens; which repo?
- A13: model tuning waits for real runs
- A16: saves less (one run, not two)
- A17: more test time in CI
- A18: one hop per group stays on the critical path
- A19: one more flag
- A21: none seen
- A22: two new files

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:04ce78651e7d3764 -->

- [ ] PMode (happy, fail, edge): new flag PTDD_PIPELINE_MODE=fast|paired, default fast: a group with no after runs one tdd-driver and one navigator; paired is today's pipeline; plan.mode in plan.json overrides the flag (A2)
- [ ] PQuick (happy, fail, edge): new flag PTDD_QUICK_DRIVER_GATE_ENABLED (default true): inside a driver's own GREEN gate loop the first and last runs include mutation and the middle run skips it; the navigator's run always includes mutation (A16)
- [ ] PReuse (happy, fail, edge): new flag PTDD_GATE_REUSE_ENABLED (default true): a navigator reuses the driver's last gate result when a hash of the group's files and snapshot matches, re-runs only the flake check, and still judges; any mismatch runs the full gate (A4)
- [ ] PVReuse (happy, fail, edge): with PTDD_GATE_REUSE_ENABLED, tdd.mjs verify reuses final.json when the snapshot hash matches instead of re-running final (A8)
- [ ] PNoSpec (happy, fail, edge): no speculative GREEN: the green-driver still waits for the red-navigator; record.mjs logs how often RED passed on the first try so a later change can decide from numbers (A18)
- [ ] PCourier (happy, fail, edge): new flag PTDD_COURIER_SKIP_ENABLED (default true): when every fixer reports its gate ok the final courier is not spawned and tdd.mjs verify is the check; any fixer not ok still gets the courier (A6)
- [ ] PParRev (happy, fail, edge): new flag PTDD_PARALLEL_REVIEW_ENABLED (default true): the integration-tester and the reviewer run at the same time; the reviewer reviews without the integration test file, which is still gated (A7)
- [ ] ZBase (happy, fail, edge): new flag ZT_MUTATION_BASELINE_REUSE_ENABLED (default true): the mutation probe reuses the test probe's head run as its baseline instead of running it again (A8)
- [ ] ZProc (happy, fail, edge): new flag ZT_TEST_PROCESS_MAX (a whole number or unlimited, default unlimited): caps how many test-command processes the gates run at once (A8)
- [ ] FStrict (happy, fail, edge): every new flag follows the existing flags.mjs rules: an invalid value or an old name stops the tool with the fix; each skill reads only its own flags; the README Flags table lists each flag, its values and default (A9)
- [ ] FCompat (happy, fail, edge): with every new flag set off (PTDD_PIPELINE_MODE=paired, the rest false), prompts and behavior are byte-identical to v2.0.0 and a v2.0.0 continue.json still resumes; the plugin gets a minor bump (A10)
- [ ] FCap (happy, fail, edge): graph.mjs --check passes again: SKILL.md is back under its 14,000-byte cap (A13)
- [ ] VMeasure (happy, fail, edge): an e2e comparison with real gates and scripted agents reports agent count, critical-path hops and gate wall-clock with all new flags off and all on (A11)
- [ ] VReal (happy, fail, edge): one synthetic 3-group change in a fixture repo is run for real twice, flags off and on, and both runs are logged in runs.md by record.mjs (A15)
- [ ] ZBudget (happy, fail, edge): new flag ZT_MUTATION_BUDGET_STRICT_ENABLED (default true): the mutation budget also stops mutants already running when it runs out (A19)

- feature flag: PTDD_PIPELINE_MODE=fast, PTDD_QUICK_DRIVER_GATE_ENABLED=true, PTDD_GATE_REUSE_ENABLED=true, PTDD_COURIER_SKIP_ENABLED=true, PTDD_PARALLEL_REVIEW_ENABLED=true, ZT_MUTATION_BASELINE_REUSE_ENABLED=true, ZT_TEST_PROCESS_MAX=unlimited, ZT_MUTATION_BUDGET_STRICT_ENABLED=true (A9)
- backward compat: all flags off = v2.0.0 behavior byte for byte; v2.0.0 continue.json resumes; minor version bump (A10)
- non-goals: no model, effort or agent-type change, no change to DoD closure, frozen tests or the scope fence, no speculative GREEN (A13)
- verify env: cloud container e2e before/after + CI green; one real flags-off/flags-on run of a synthetic 3-group fixture change on Nut's machine (WSL) (A15)
- test tiers: unit + fuzz (flags, hashing, reuse decisions), integration (real gates, stub runner), E2E (real workflow.js + real gates, scripted agents, each new flag on and off), regression: today's e2e tests unchanged and green (A17)
