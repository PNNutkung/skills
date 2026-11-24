---
touches:
  - "skills/branch-summary/**"
  - "README.md"
  - ".claude-plugin/plugin.json"
dod: branch-summary-split
---
# 5. Branch summary split

Date: 2026-11-24
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

Issue #20 (from the 2026-11-22 performance survey): `skills/branch-summary/SKILL.md` was 26,620 bytes, the largest SKILL.md and the only one with no size cap. The whole file loads every time the skill runs, but Sections 3-5 (Mermaid rules, workaround detection, output template; 12,062 bytes) are only needed once the analysis is done. Moving Section 5 alone, as the issue first proposed, would leave 19,725 bytes. The existing caps for zero-trust-review (16,000) and paired-agent-tdd (14,000) run only through `graph.mjs --check`, which CI never calls, so no SKILL.md cap was enforced at all.

## Decision

### A1: What moves out of SKILL.md?

Context: SKILL.md is 26,620 bytes. Section 5 (output template, lines 253-416) is 6,895 bytes; Section 3 Mermaid (177-216) 2,393; Section 4 workaround detection (217-252) 2,774; Section 2 analysis (78-176) 8,567. Moving only Section 5 leaves 19,725 bytes, still over a 16,000 cap. Section 4 is used while analysing, not only at the write step.
Options considered (the agent's analysis when the question was asked):
- (A) Section 5 + the Mermaid example only, into report-format.md (issue as written)
  - pro: smallest change, only write-step text moves
  - con: SKILL.md stays ~19.4 KB, so a 16,000 cap cannot hold
- (B) Sections 3, 4 and 5 into report-format.md, read once before drafting diagrams and the report
  - pro: SKILL.md ~14.6 KB, fits a 16,000 cap, ~12 KB less per run
  - con: workaround rules are read later than today; the model must read the file before step 3
- (C) Two files: analysis-extras.md (Sections 3-4, read at analysis) and report-format.md (Section 5, read at write)
  - pro: each part read exactly when needed
  - con: two mandatory reads to enforce instead of one
Recommended: B, the only option that fits a 16,000 cap with one mandatory read
Answer: B (Sections 3, 4 and 5 into report-format.md, read once before drafting diagrams and the report)
Trade-off accepted: workaround rules are read later than today; the model must read the file before step 3

### A2: Size cap value for branch-summary SKILL.md?

Context: zero-trust-review caps at 16,000 (graph.mjs:140), paired-agent-tdd at 14,000 (graph.mjs:38). branch-summary has no cap.
Options considered (the agent's analysis when the question was asked):
- (A) 16,000 like zero-trust-review
  - pro: one number across skills, room to grow
  - con: needs Q1 B or C
- (B) 20,000
  - pro: works with Q1 A
  - con: saves only ~7 KB, leaves the largest SKILL.md still largest
- (C) the size after the split plus 500 bytes, ratchet style (only goes down)
  - pro: no growth at all
  - con: every small doc fix may need to raise the cap
Recommended: A, same rule as zero-trust-review
Answer: A (16,000 like zero-trust-review)
Trade-off accepted: needs Q1 B or C

### A3: Where does the size check run?

Context: fact found: the zero-trust-review and paired-agent-tdd caps run only in 'node graph.mjs --check', and CI never runs that (.github/workflows/test.yml runs *.test.mjs, test-time.mjs, ratchet). So today no cap is enforced in CI.
Options considered (the agent's analysis when the question was asked):
- (A) a branch-summary test (skills/branch-summary/docs.test.mjs) that CI already runs
  - pro: enforced in CI with no workflow change, follows the per-skill pattern
  - con: only branch-summary is covered; zt/ptdd caps stay manual
- (B) one generic check for every skill (rules/checks/skill-size.mjs + a test), caps per skill in one table, also covering zt 16,000 and ptdd 14,000
  - pro: fixes the unenforced caps found above, one place
  - con: touches zt/ptdd (scope grows); ptdd is 14,336 today so its cap would fail now
- (C) a graph.mjs-style --check script, like zero-trust-review
  - pro: same as existing skills
  - con: not run in CI, same gap as today
Recommended: A, now; open a new issue for B (ptdd is over its own cap)
Answer: A และเปิด issue ใหม่สำหรับ B
Trade-off accepted: none recorded (the answer picks no single option)

### A4: How do we make sure the model reads report-format.md before writing?

Context: issue risk: no evals.json for branch-summary, a skipped Read would go unnoticed. build-report.mjs turns the agent's markdown into HTML (build-report.mjs:9-40), so it sees every report.
Options considered (the agent's analysis when the question was asked):
- (A) a mandatory checklist step in SKILL.md naming the file and its sections, plus evals.json (report has required sections)
  - pro: prompt only, matches the issue
  - con: nothing stops a skipped read at run time
- (B) A plus build-report.mjs refuses a report missing the required parts (title '#', '## Summary', '## Test Coverage'; fast-path format accepted) and names report-format.md in the error
  - pro: a skipped read is caught in code every run, not only in evals
  - con: a code change in build-report; a hand-written report that drops a section now fails
- (C) report-format.md holds a marker the report must include
  - pro: simple to check
  - con: adds noise to every report, changes the output
Recommended: B, a code gate is the only check that runs every time
Answer: B (A plus build-report.mjs refuses a report missing the required parts (title '#', '## Summary', '## Test Coverage'; fast-path format accepted) and names report-format.md in the error)
Trade-off accepted: a code change in build-report; a hand-written report that drops a section now fails

### A5: How do we prove the output did not change?

Context: issue: run the skill on fixtures before and after and compare sections. fixtures/ holds only hostile-report.md (a build-report input), not a branch to summarise. LLM text differs run to run.
Options considered (the agent's analysis when the question was asked):
- (A) text proof: a test that every line moved out of SKILL.md is in report-format.md unchanged (nothing lost, nothing reworded)
  - pro: deterministic, runs in CI
  - con: does not show the model follows it
- (B) real runs: run the skill before and after (claude -p, same branch of this repo, e.g. PR #24's merge) 2 times each, compare section headings and fast-path use
  - pro: shows real behaviour
  - con: not deterministic, costs tokens, manual
- (C) both A and B
  - pro: covers wording and behaviour
  - con: most work
Recommended: C
Answer: C (both A and B)
Trade-off accepted: most work

### A6: Feature flag?

Context: issue: prompt-only change, no runtime flag. Project rule: on/off flags use true/false, ENABLED names, per skill.
Options considered (the agent's analysis when the question was asked):
- (A) no flag for the split; if Q4 B, the format check gets BRANCH_SUMMARY_FORMAT_CHECK_ENABLED (default true, false turns it off)
  - pro: a way out if the check blocks a valid report
  - con: one more flag in the README table
- (B) no flag at all
  - pro: simplest
  - con: no escape hatch if the check is wrong
Recommended: A
Answer: A (no flag for the split; if Q4 B, the format check gets BRANCH_SUMMARY_FORMAT_CHECK_ENABLED (default true, false turns it off))
Trade-off accepted: one more flag in the README table

### A7: Backward compatibility and version?

Context: plugin.json version 2.2.0. Report markdown and HTML must stay the same. Install copies the whole skill folder, so report-format.md ships with it.
Options considered (the agent's analysis when the question was asked):
- (A) output identical, no breaking change, minor bump 2.3.0 (new check in build-report)
  - pro: new behaviour is visible in the version
  - con: none notable
- (B) patch bump 2.2.1
  - pro: signals a docs-only change
  - con: understates the new build-report check
Recommended: A
Answer: A แต่น่าจะต้องเป็น 2.4.0
Trade-off accepted: none recorded (the answer picks no single option)

### A8: Non-goals?

Options considered (the agent's analysis when the question was asked):
- (A) not changed: report content and format, report-template.html and HTML security, Sections 0-2 wording, other skills' SKILL.md and caps (new issue for the generic check)
  - pro: keeps the change small and reviewable
  - con: zt/ptdd caps stay unenforced for now
- (B) A but include the generic check across skills
  - pro: closes the gap at once
  - con: bigger PR, must fix ptdd 14,336 > 14,000 too
Recommended: A
Answer: A (not changed: report content and format, report-template.html and HTML security, Sections 0-2 wording, other skills' SKILL.md and caps (new issue for the generic check))
Trade-off accepted: zt/ptdd caps stay unenforced for now

### A9: Where do we verify?

Options considered (the agent's analysis when the question was asked):
- (A) this cloud container: full suite + real claude -p runs on a branch of this repo, before/after token count of SKILL.md (bytes and an estimate)
  - pro: same place as earlier work, no setup for you
  - con: claude -p runs are on Linux only
- (B) your machine (D:\chat-ogc via WSL)
  - pro: your real setup
  - con: needs your computer on, WSL
Recommended: A
Answer: A (this cloud container: full suite + real claude -p runs on a branch of this repo, before/after token count of SKILL.md (bytes and an estimate))
Trade-off accepted: claude -p runs are on Linux only

### A10: Test tiers?

Options considered (the agent's analysis when the question was asked):
- (A) unit (size cap, moved text intact, format check), fuzz (format check on random markdown), integration (build-report with the check on the existing hostile fixture), E2E (fixture report -> HTML through the CLI; plus the real runs from Q5)
  - pro: all tiers of the workflow
  - con: more tests for a mostly docs change
- (B) unit + integration only
  - pro: quick
  - con: no fuzz, no E2E
Recommended: A
Answer: A (unit (size cap, moved text intact, format check), fuzz (format check on random markdown), integration (build-report with the check on the existing hostile fixture), E2E (fixture report -> HTML through the CLI; plus the real runs from Q5))
Trade-off accepted: more tests for a mostly docs change

### A11: Paths this change covers (touches)?

Options considered (the agent's analysis when the question was asked):
- (A) skills/branch-summary/**, README.md, .claude-plugin/plugin.json
  - pro: exact
  - con: none
- (B) A plus rules/checks/** (only if Q3 B)
  - pro: matches a generic check
  - con: wider
Recommended: A
Answer: A (skills/branch-summary/**, README.md, .claude-plugin/plugin.json)
Trade-off accepted: none

### A12: Ticket?

Options considered (the agent's analysis when the question was asked):
- (A) rewrite the issue #20 description with the DoD as a checklist (as in earlier work), you approve the text first
  - pro: issue matches what we build
  - con: one more approval step
- (B) no ticket change, ADR + PR only
  - pro: faster
  - con: issue text stays out of date (it says only Section 5 moves)
Recommended: A
Answer: A (rewrite the issue #20 description with the DoD as a checklist (as in earlier work), you approve the text first)
Trade-off accepted: one more approval step

### A13: Confirm the DoD (8 items + 5 required sections, dod.md)?

Context: dod.mjs check ok; built from A1-A12; version 2.4.0 per A7.
Options considered (the agent's analysis when the question was asked):
- (A) confirm, go to the concept board and design variants
  - pro: work starts now
  - con: a missed detail costs a DoD edit later
- (B) correct something first
  - pro: DoD exact before design
  - con: one more round
Recommended: A
Answer: A (confirm, go to the concept board and design variants)
Trade-off accepted: a missed detail costs a DoD edit later

### A14: Design of the split and format check (concept board)?

Context: board.json; build-report.mjs:16-30 buildReport is already a pure export, main at :33-43.
Options considered (the agent's analysis when the question was asked):
- (A) check inside build-report.mjs as a pure checkReport(md), required parts as a constant, test cross-checks report-format.md, NoLoss against a frozen copy of the original sections
  - pro: smallest change, pure function easy to fuzz
  - con: required list in code and doc, tied only by a test
- (B) separate report-check.mjs module + CLI imported by build-report
  - pro: usable alone
  - con: one more file and CLI to keep in sync
- (C) required parts declared in report-format.md and parsed at run time
  - pro: one source of truth
  - con: parsing prose: a stray edit can weaken the gate
Recommended: A
Answer: A (check inside build-report.mjs as a pure checkReport(md), required parts as a constant, test cross-checks report-format.md, NoLoss against a frozen copy of the original sections)
Trade-off accepted: required list in code and doc, tied only by a test

### A15: Plugin version, now that PR #26 took 2.4.0 (A7 said 2.4.0)?

Context: origin/main plugin.json is 2.4.0 (PR #26 merged); another open thread also wants a minor.
Options considered (the agent's analysis when the question was asked):
- (A) the next free minor on main at merge time (2.5.0 or later), checked just before the version commit
  - pro: never collides with parallel threads
  - con: the exact number is unknown until then
- (B) fix 2.5.0 now
  - pro: known number
  - con: may collide again with the other thread
Recommended: A
Answer: A (the next free minor on main at merge time (2.5.0 or later), checked just before the version commit)
Trade-off accepted: the exact number is unknown until then

## Consequences

SKILL.md keeps Sections 0-2 and a mandatory step to read `report-format.md` (Sections 3-5, moved word for word) before drafting diagrams and the report: about 12 KB less at the start of every run. A branch-summary test in CI caps SKILL.md at 16,000 bytes and proves the moved text is intact. `build-report.mjs` gains a pure `checkReport(md)` that refuses a report without its title, `## Summary` or `## Test Coverage` (the small-change fast path passes), so a skipped read shows up on every run; `BRANCH_SUMMARY_FORMAT_CHECK_ENABLED=false` turns it off. Report output does not change. A separate issue covers one size check for every skill.

Trade-offs we accepted:

- A1: workaround rules are read later than today; the model must read the file before step 3
- A2: needs Q1 B or C
- A4: a code change in build-report; a hand-written report that drops a section now fails
- A5: most work
- A6: one more flag in the README table
- A8: zt/ptdd caps stay unenforced for now
- A9: claude -p runs are on Linux only
- A10: more tests for a mostly docs change
- A11: none
- A12: one more approval step
- A13: a missed detail costs a DoD edit later
- A14: required list in code and doc, tied only by a test
- A15: the exact number is unknown until then

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:6fc5eda224755823 -->

- [ ] Split (happy, fail, edge): Sections 3 (Mermaid), 4 (workaround detection) and 5 (output template) of skills/branch-summary/SKILL.md move into skills/branch-summary/report-format.md; SKILL.md keeps a mandatory step that names report-format.md and the sections it holds, read once before drafting diagrams and the report (A1)
- [ ] Cap (happy, fail): skills/branch-summary/SKILL.md is at most 16,000 bytes (A2)
- [ ] CapTest (happy, fail, edge): a branch-summary test that CI already runs fails when SKILL.md is over 16,000 bytes, and its message says to move long text into report-format.md (A3)
- [ ] Issue (happy, fail, edge): a new GitHub issue proposes one generic SKILL.md size check for every skill run in CI (including the zero-trust-review 16,000 and paired-agent-tdd 14,000 caps; ptdd is 14,336 today) (A3)
- [ ] Gate (happy, fail, edge): build-report.mjs exports a pure checkReport(md) and refuses a report missing the required parts (a '#' title, '## Summary', '## Test Coverage'), accepts the small-change fast-path format, and its error names report-format.md; a test checks each required heading also appears in report-format.md (A4)
- [ ] Evals (happy, fail, edge): skills/branch-summary/evals.json exists and expects the report to have the required sections and that report-format.md is read (A4)
- [ ] NoLoss (happy, fail): a test proves every line moved out of SKILL.md is in report-format.md unchanged (nothing lost, nothing reworded) (A5)
- [ ] RealRun (happy): the skill runs with claude -p before and after the change, 2 times each on the same branch of this repo; the reports have the same section headings and the same fast-path choice (A5)

- feature flag: no flag for the split; the build-report format check has BRANCH_SUMMARY_FORMAT_CHECK_ENABLED, true|false, default true (false turns it off); invalid value is a hard error; README Flags row (A6)
- backward compat: report markdown and HTML output unchanged, no breaking change; plugin version: the next free minor on main at merge time (2.5.0 or later; PR #26 took 2.4.0) (A15)
- non-goals: report content and format, report-template.html and HTML security, Sections 0-2 wording, other skills' SKILL.md and caps (the new issue covers the generic check) (A8)
- verify env: this cloud container: full test suite, real claude -p runs, SKILL.md bytes and token estimate before/after; CI green (A9)
- test tiers: unit (cap, moved text intact, format check), fuzz (format check on random markdown), integration (build-report with the check on the hostile fixture), e2e (fixture report to HTML through the CLI, plus the real runs) (A10)
