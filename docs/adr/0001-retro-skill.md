---
touches:
  - "skills/retro/**"
  - "hooks/retro-*.mjs"
  - "hooks/hooks.json"
  - "README.md"
  - "rules/README.md"
  - ".github/workflows/test.yml"
  - ".claude-plugin/*.json"
dod: retro-skill
---
# 1. Retro skill

Date: 2026-11-22
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

S1: A flag means what it says, or nothing runs (README.md:49)

## Decision

### A1: Which repos does the retro skill run on?

Context: other skills (qa-sweep, definition-of-done) work on any repo; the workflow topic is generic software development
Options considered (the agent's analysis when the question was asked):
- (A) any repo the user works on
  - pro: one skill for every project
  - con: must detect language and linter per repo
- (B) only PNNutkung/skills
  - pro: simple, one stack (Node .mjs)
  - con: useless for Nut's real projects
Recommended: A, the other skills are repo-agnostic
Answer: A (any repo the user works on)
Trade-off accepted: must detect language and linter per repo

### A2: What does a retro read?

Context: runs.md (ptdd, zt), retro.md/verify.md in project files, git log, PR comments and CI; token usage and repeated tool errors exist only in Claude Code transcripts (~/.claude/projects/*.jsonl)
Options considered (the agent's analysis when the question was asked):
- (A) repo + git/PR/CI only
  - pro: no private transcript data
  - con: no token usage, no repeated agent mistakes
- (B) A + Claude Code session transcripts
  - pro: token usage, retries, failed commands, user corrections
  - con: transcripts are large; must be read by a low-tier subagent
- (C) transcripts only
  - pro: cheapest
  - con: misses review comments and CI failures
Recommended: B
Answer: B (A + Claude Code session transcripts)
Trade-off accepted: transcripts are large; must be read by a low-tier subagent

### A3: Scope of one retro

Context: dod-direct-read retro covered one issue/PR
Options considered (the agent's analysis when the question was asked):
- (A) one finished work item (branch/PR + its ADR/DoD)
  - pro: evidence is bounded
  - con: misses patterns across PRs
- (B) a time window (last N days or sessions)
  - pro: finds repeated patterns
  - con: more to read
- (C) both, A by default
  - pro: flexible
  - con: two code paths
Recommended: C
Answer: C (both, A by default)
Trade-off accepted: two code paths

### A4: Output

Context: today's retro.md is a hand-written report
Options considered (the agent's analysis when the question was asked):
- (A) a report only
  - pro: safe
  - con: nothing changes unless someone acts
- (B) report + proposed changes (ratchet rules, rules/*.md, CLAUDE.md, memory) applied only after the user approves each one
  - pro: improvements actually land, user stays in control
  - con: more work per retro
- (C) apply changes directly
  - pro: fastest
  - con: changes the user did not see
Recommended: B
Answer: B (report + proposed changes (ratchet rules, rules/*.md, CLAUDE.md, memory) applied only after the user approves each one)
Trade-off accepted: more work per retro

### A5: What does "ratchet" mean?

Context: betterer / ESLint bulk suppressions keep a baseline of existing violations
Options considered (the agent's analysis when the question was asked):
- (A) baseline file of violation counts per rule per file; check fails when a count goes up; a count that goes down is lowered automatically and never goes back up
  - pro: old code is not blocked, new code cannot get worse
  - con: a baseline file in the repo
- (B) a rule starts as warn and becomes error when violations reach 0
  - pro: no baseline file
  - con: can warn forever
- (C) A and B
  - pro: both a hard baseline and a path to error
  - con: two mechanisms for one goal
Recommended: A
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A6: How are ratchet rules implemented?

Context: ESLint 9.24+ has bulk suppressions; ruff, golangci-lint differ; some checks (magic strings, comment density) have no lint rule
Options considered (the agent's analysis when the question was asked):
- (A) a generic pattern ratchet in the skill (ratchet.mjs, regex/glob based)
  - pro: works in any repo
  - con: regex is less precise than AST
- (B) only the repo's own linter config + its baseline
  - pro: precise
  - con: many linters, not every check exists
- (C) the repo's linter when it has the rule, else the generic ratchet
  - pro: precise where possible, still works everywhere
  - con: two mechanisms
Recommended: C
Answer: C (the repo's linter when it has the rule, else the generic ratchet)
Trade-off accepted: two mechanisms

### A7: Where does a ratchet run?

Context: dod.mjs adr installs a pre-commit hook; CI runs node --test
Options considered (the agent's analysis when the question was asked):
- (A) git pre-commit hook installed by the skill
  - pro: catches a regression before it is committed
  - con: can be skipped with --no-verify
- (B) a CLI check the user adds to CI
  - pro: cannot be skipped
  - con: feedback only after push
- (C) A + B, plus a Claude Code hook that warns the agent
  - pro: earliest feedback for the agent
  - con: a third mechanism to keep in sync
Recommended: A + B (the same CLI command), flag RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED default true
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A8: Check categories

Context: project topic lists lint, rules, token usage, test gaps, speed, bugs, flaky tests, too many comments, as casts, intersection types, magic strings, coding standards, docs coverage
Options considered (the agent's analysis when the question was asked):
- (A) all of them; language-specific ones (as, intersection) only when that language is present
  - pro: nothing from the topic list is dropped
  - con: more checks to build and test
- (B) a subset
  - pro: ships sooner
  - con: gaps the user asked to cover
Recommended: A
Answer: A (all of them; language-specific ones (as, intersection) only when that language is present)
Trade-off accepted: more checks to build and test

### A9: Evidence gate

Context: zero-trust-review and qa-sweep refuse findings without proof
Options considered (the agent's analysis when the question was asked):
- (A) every finding must cite evidence (file:line, transcript line, PR comment, CI run) checked in code, else it is dropped as unverified
  - pro: no invented findings reach a proposal
  - con: findings need a precise citation
- (B) free-form findings
  - pro: less work per finding
  - con: a guess can turn into a repo change
Recommended: A
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A10: Report language

Options considered (the agent's analysis when the question was asked):
- (A) the user's language, keys and rule ids in English (same as definition-of-done)
  - pro: Nut reads Thai, ids stay greppable
  - con: two languages to render
- (B) English only
  - pro: one template
  - con: not the user's language
Recommended: A
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A11: Secrets in transcript quotes

Options considered (the agent's analysis when the question was asked):
- (A) redact token-like strings in every quote; transcript excerpts never land in the repo
  - pro: no leaked keys
  - con: a redacted quote is harder to check
- (B) quote as is
  - pro: exact quote is easy to check
  - con: a key in a transcript can leak into the report
Recommended: A
Answer: A (redact token-like strings in every quote; transcript excerpts never land in the repo)
Trade-off accepted: a redacted quote is harder to check

### A12: Which sessions belong to a work item

Options considered (the agent's analysis when the question was asked):
- (A) sessions whose cwd is the repo and whose time overlaps the branch's commits/PR, overridable with --session
  - pro: no manual work
  - con: may pick an unrelated session in the same repo
- (B) the user always passes session ids
  - pro: never picks a wrong session
  - con: manual work every retro
Recommended: A
Answer: A (sessions whose cwd is the repo and whose time overlaps the branch's commits/PR, overridable with --session)
Trade-off accepted: may pick an unrelated session in the same repo

### A13: Where the report lives

Options considered (the agent's analysis when the question was asked):
- (A) temp run folder only
  - pro: nothing committed
  - con: no trend over time
- (B) report in the run folder + one metrics line per retro appended to a committed log (docs/retro/log.md) for trends
  - pro: trend over time (tokens, bugs found late, flaky)
  - con: one more committed file
- (C) whole report committed
  - pro: full history in the repo
  - con: noise in the repo, transcript text could land there
Recommended: B
Answer: B (report in the run folder + one metrics line per retro appended to a committed log (docs/retro/log.md) for trends)
Trade-off accepted: one more committed file

### A14: Ratchet baseline file

Options considered (the agent's analysis when the question was asked):
- (A) .ratchet.json at repo root
  - pro: easy to find, like other tool configs
  - con: one more file at the root
- (B) docs/retro/ratchet.json
  - pro: grouped with the retro log
  - con: hidden from tools that look at the root
Recommended: A
Answer: A (.ratchet.json at repo root)
Trade-off accepted: one more file at the root

### A15: When a count goes down

Options considered (the agent's analysis when the question was asked):
- (A) pre-commit rewrites the baseline and stages it, printing what dropped
  - pro: zero friction
  - con: a hook that edits the commit
- (B) check fails until the user runs ratchet update
  - pro: the hook never edits a commit
  - con: friction for an improvement
Recommended: A
Answer: A (pre-commit rewrites the baseline and stages it, printing what dropped)
Trade-off accepted: a hook that edits the commit

### A16: Granularity

Options considered (the agent's analysis when the question was asked):
- (A) per rule per file
  - pro: a new file cannot add violations
  - con: moving old code to a new file trips it (rename followed by git)
- (B) per rule, repo total
  - pro: moving code never trips it
  - con: a fix in one file hides a regression in another
Recommended: A
Answer: อธิบายเพิ่มเติมให้หน่อย
Trade-off accepted: none recorded (the answer picks no single option)

### A17: Existing pre-commit hooks

Options considered (the agent's analysis when the question was asked):
- (A) same rule as dod.mjs adr: never over a hook it did not write, chain with its own; husky/lefthook get the line to add
  - pro: never breaks a user's hook, same behavior as dod
  - con: husky/lefthook users add one line themselves
- (B) overwrite .git/hooks/pre-commit
  - pro: always installed
  - con: destroys a hook the user wrote
Recommended: A
Answer: A (same rule as dod.mjs adr: never over a hook it did not write, chain with its own; husky/lefthook get the line to add)
Trade-off accepted: husky/lefthook users add one line themselves

### A18: Approving proposals

Options considered (the agent's analysis when the question was asked):
- (A) user answers per proposal in chat, saved word for word in answers.md; agent applies only approved ids; code checks every applied change has an approval
  - pro: no extra command for the user, code still checks
  - con: the agent writes answers.md
- (B) user-only CLI approve like dod.mjs approve
  - pro: the agent cannot fake an approval
  - con: the user must run a command per retro
Recommended: A, repo edits are reversible and reviewed in the PR
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A19: Flags

Options considered (the agent's analysis when the question was asked):
- (A) RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED (true) + RETRO_TRANSCRIPTS_ENABLED (true) to turn off transcript reading
  - pro: the two risky behaviors can be turned off
  - con: two more flags in the README table
- (B) no flags
  - pro: simpler
  - con: breaks the project rule that new behavior is behind a flag
Recommended: A
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A20: Linters in v1

Options considered (the agent's analysis when the question was asked):
- (A) ESLint (bulk suppressions) + generic ratchet
  - pro: less to build
  - con: Python repos get only regex rules
- (B) ESLint + ruff + generic
  - pro: JS/TS and Python get real lint rules
  - con: CI needs Python for ruff
Recommended: A
Answer: B (ESLint + ruff + generic)
Trade-off accepted: CI needs Python for ruff

### A21: Required sections

Options considered (the agent's analysis when the question was asked):
- (A) accept all four sections as written
  - pro: scope and tests are fixed before code
  - con: none
- (B) change one of them
  - pro: room to adjust
  - con: delays the DoD
Recommended: accept all
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A22: Real linters in tests

Context: CI has Node only today; ruff needs Python (pip), ESLint needs npm
Options considered (the agent's analysis when the question was asked):
- (A) CI installs ESLint and ruff; locally the integration test skips with a message when one is missing, but with CI=true a missing linter fails the test
  - pro: CI always proves both, local runs still work
  - con: CI a bit slower
- (B) always skip when missing
  - pro: simplest test code
  - con: CI could pass without ever running them
Recommended: A
Answer: A (CI installs ESLint and ruff; locally the integration test skips with a message when one is missing, but with CI=true a missing linter fails the test)
Trade-off accepted: CI a bit slower

### A23: Categories from mattpocock/skills retro (reference: skills/engineering/retro/SKILL.md)

Context: navigation, automated checks (missing guardrail is a finding), coding standards (mechanical -> deterministic check; judgment -> standards file), steering file size, tool economy, no-ops, information access
Options considered (the agent's analysis when the question was asked):
- (A) merge them with Q8 categories, and turn each one a script can measure into a script; judgment ones stay with the agent with evidence
  - pro: covers both lists, hooks/scripts where possible
  - con: more checks to build
- (B) keep Q8 only
  - pro: less to build
  - con: misses navigation, steering size and tool economy
Recommended: A
Answer: A (merge them with Q8 categories, and turn each one a script can measure into a script; judgment ones stay with the agent with evidence)
Trade-off accepted: more checks to build

### A24: Where judgment-call standards go

Options considered (the agent's analysis when the question was asked):
- (A) the repo's existing standards file (CODING_STANDARDS.md, rules/, CONTRIBUTING.md); create CODING_STANDARDS.md when none
  - pro: fits each repo's own convention
  - con: must detect the file
- (B) always rules/
  - pro: one place
  - con: not every repo has or wants rules/
Recommended: A
Answer: A (the repo's existing standards file (CODING_STANDARDS.md, rules/, CONTRIBUTING.md); create CODING_STANDARDS.md when none)
Trade-off accepted: must detect the file

### A25: Steering file size (CLAUDE.md / AGENTS.md, repo and global)

Options considered (the agent's analysis when the question was asked):
- (A) a finding above 8 KB, fixed in code
  - pro: no flag
  - con: cannot be tuned per repo
- (B) flag RETRO_STEERING_BYTES_MAX, default unlimited (flag rule)
  - pro: follows the flag rule exactly
  - con: off by default, so it never fires
- (C) flag RETRO_STEERING_BYTES_MAX, default 8000 (exception to the unlimited default)
  - pro: useful out of the box and tunable
  - con: an exception to the _MAX default
Recommended: C
Answer: C (flag RETRO_STEERING_BYTES_MAX, default 8000 (exception to the unlimited default))
Trade-off accepted: an exception to the _MAX default

### A26: Invocation and automatic collection

Options considered (the agent's analysis when the question was asked):
- (A) user-invoked only (/retro), like mattpocock
  - pro: no hook
  - con: the user forgets to run it
- (B) user-invoked + a code-only Claude Code hook (no agent, no tokens) that, when a PR merges or a session ends, collects the metrics into the run folder and reminds to run /retro; flag RETRO_AUTO_COLLECT_ENABLED default true
  - pro: facts are saved at the right time, at no token cost
  - con: one more hook
Recommended: B
Answer: B (user-invoked + a code-only Claude Code hook (no agent, no tokens) that, when a PR merges or a session ends, collects the metrics into the run folder and reminds to run /retro; flag RETRO_AUTO_COLLECT_ENABLED default true)
Trade-off accepted: one more hook

### A27: Paths the change covers (touches)

Context: new skill folder, new hooks, hooks.json, README Flags table, rules/README guardrail table, CI workflow (ESLint + ruff), plugin.json version
Options considered (the agent's analysis when the question was asked):
- (A) skills/retro/**, hooks/retro-*.mjs, hooks/hooks.json, README.md, rules/README.md, .github/workflows/test.yml, .claude-plugin/*.json; plugin version 2.0.0 -> 2.1.0 (additive, nothing breaks)
  - pro: covers everything this PR touches
  - con: none
- (B) only skills/retro/**
  - pro: small ADR scope
  - con: hooks, docs and CI are left out of the ADR
Recommended: A
Answer: A (skills/retro/**, hooks/retro-*.mjs, hooks/hooks.json, README.md, rules/README.md, .github/workflows/test.yml, .claude-plugin/*.json; plugin version 2.0.0 -> 2.1.0 (additive, nothing breaks))
Trade-off accepted: none

### A28: Granularity, explained with an example (re-ask)

Context: baseline {"no-as-cast": {"src/a.ts": 5, "src/b.ts": 0}}
Options considered (the agent's analysis when the question was asked):
- (A) per rule per file: a new cast in b.ts fails even if a.ts dropped one; git rename a.ts -> c.ts carries its 5; moving 2 casts from a.ts into a new d.ts fails (a.ts 3, d.ts 2 > 0) and needs ratchet accept with a reason
  - pro: new code stays clean, a fix in one file cannot hide a regression in another
  - con: moving old code between files needs an explicit accept
- (B) per rule, repo total 5
  - pro: moving code never trips it
  - con: fixing one cast in a.ts allows a new one in b.ts
Recommended: A
Answer: Q16 อันนี้หมายถึงเราจะแค่ retro skill ที่ทำอยู่นี้อย่างเดียวเหรอ ฉันคิดว่าเราน่าจะทำให้มัน retro ได้ทุก project นะ ลองไปดู retro ของ https://github.com/mattpocock/skills/tree/main/skills/engineering/retro เป็นตัวอย่าง แต่ฉันอยากปรับให้มันเป็น hook/script มากกว่าแค่ guidelines
Trade-off accepted: none recorded (the answer picks no single option)

### A30: Granularity still unanswered (Q29 asked 06:08, answers 06:19 skipped it)

Options considered (the agent's analysis when the question was asked):
- (A) per rule per file
  - pro: a fix in one file cannot hide a regression in another
  - con: moving old code between files needs ratchet accept
- (B) per rule repo total
  - pro: moving code never trips it
  - con: a fix in one file allows a new violation in another
Recommended: A
Answer: A (per rule per file)
Trade-off accepted: moving old code between files needs ratchet accept

### A31: What to call a finding whose evidence fails the code check (Nut raised it unprompted)

Context: the draft DoD said "dropped as unverified"
Options considered (the agent's analysis when the question was asked):
- (A) keep "unverified"
  - pro: already in the DoD draft
  - con: reads like "not verified yet"
- (B) rename it
  - pro: clearer status
  - con: DoD text changes
Recommended: B
Answer: เปลี่ยนคำว่า unverified เป็นอย่างอื่นดีกว่า มันทำให้ชวนสับสนว่า verify หรือยัง
Trade-off accepted: none recorded (the answer picks no single option)

### A32: Label for a finding whose evidence fails the code check (Nut, A31: "unverified" reads like "not verified yet")

Options considered (the agent's analysis when the question was asked):
- (A) no-proof
  - pro: says exactly why; matches "proof" in zero-trust-review
  - con: none
- (B) dropped
  - pro: says it leaves the report's proposals
  - con: hides why
- (C) evidence-missing
  - pro: explicit
  - con: long, and also used when evidence exists but does not match
Recommended: A
Answer: Q32 ควรเป็น verify แล้ว not passed อะไรแบบนี้ไหม? ส่วนไม่มีหลักฐานก็เป็น no evidence
Trade-off accepted: none recorded (the answer picks no single option)

### A33: Approve the DoD (dod.md, 27 items)?

Options considered (the agent's analysis when the question was asked):
- (A) Approve
  - pro: start the prototype
  - con: none
- (B) change items first
  - pro: fix scope before code
  - con: delays the prototype
Recommended: A
Answer: Approve
Trade-off accepted: none recorded (the answer picks no single option)

### A34: Approve the prototype (collect -> findings -> report -> approve -> ratchet)?

Options considered (the agent's analysis when the question was asked):
- (A) Approve
  - pro: move on to architecture variants
  - con: none
- (B) change the flow first
  - pro: cheaper to change now
  - con: delays architecture
Recommended: A
Answer: Approve
Trade-off accepted: none recorded (the answer picks no single option)

## Consequences

Trade-offs we accepted:

- A1: must detect language and linter per repo
- A2: transcripts are large; must be read by a low-tier subagent
- A3: two code paths
- A4: more work per retro
- A6: two mechanisms
- A8: more checks to build and test
- A11: a redacted quote is harder to check
- A12: may pick an unrelated session in the same repo
- A13: one more committed file
- A14: one more file at the root
- A15: a hook that edits the commit
- A17: husky/lefthook users add one line themselves
- A20: CI needs Python for ruff
- A22: CI a bit slower
- A23: more checks to build
- A24: must detect the file
- A25: an exception to the _MAX default
- A26: one more hook
- A27: none
- A30: moving old code between files needs ratchet accept

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:d121a1e99e815bdc -->

- [ ] RAny (happy, fail, edge): retro runs on any repo the user works on, not only PNNutkung/skills (A1)
- [ ] RSrc (happy, fail, edge): retro reads the repo, git history, PR comments and CI results, plus the Claude Code session transcripts; transcripts are read by a low-tier subagent so the main session stays small (A2)
- [ ] RScope (happy, fail, edge): one retro covers one finished work item (branch or PR and its ADR/DoD) by default; a time window (--since) is the alternative (A3)
- [ ] RProp (happy, fail, edge): retro writes a report and proposed changes (ratchet rules, standards file, CLAUDE.md, memory); a proposal is applied only after the user approves it (A4)
- [ ] RAppr (happy, fail, edge): each approval is saved word for word in answers.md; only approved proposal ids are applied, and a code check fails when an applied change has no approval (A18)
- [ ] RtBase (happy, fail, edge): the ratchet keeps a baseline of violation counts per rule per file; the check fails when any count goes up (A5)
- [ ] RtFile (happy, fail, edge): the baseline lives in .ratchet.json at the repo root (A14)
- [ ] RtLower (happy, fail, edge): when a count goes down, the pre-commit hook rewrites .ratchet.json, stages it and prints what dropped (A15)
- [ ] RtGran (happy, fail, edge): counts are per rule per file: a fix in one file cannot hide a new violation in another; a git rename keeps the file's counts; moving old violations into another file fails until `ratchet accept` is run with a reason (A30)
- [ ] RtLint (happy, fail, edge): a rule the repo's linter has is counted from that linter's JSON output; a rule no linter has uses the skill's generic pattern counter (A6)
- [ ] RtTools (happy, fail, edge): v1 reads ESLint and ruff, plus the generic counter (A20)
- [ ] RtRun (happy, fail, edge): the ratchet runs as a git pre-commit hook the skill installs and as the same CLI command for CI (A7)
- [ ] RtHook (happy, fail, edge): the installer never overwrites a pre-commit hook it did not write; with husky or lefthook it prints the line to add (A17)
- [ ] CCats (happy, fail, edge): retro checks every category: lint, rules, token usage, test gaps, speed, bugs, flaky tests, too many comments, as casts, intersection types, magic strings, coding standards, docs coverage; language-specific checks (as, intersection) only when the repo has that language (A8)
- [ ] CMatt (happy, fail, edge): retro also checks navigation, automated checks, coding standards (mechanical violation becomes a deterministic check), steering file size, tool economy, no-ops and information access; what a script can measure is a script, judgment stays with the agent and needs evidence (A23)
- [ ] CGuard (happy, fail, edge): a repo with no pre-commit hook and no CI job that runs its lint/typecheck/test command is reported as a finding by code (A23)
- [ ] CSteer (happy, fail, edge): CLAUDE.md / AGENTS.md (repo and global) larger than RETRO_STEERING_BYTES_MAX (a whole number above 0 or unlimited, default 8000) is a finding (A25)
- [ ] CStd (happy, fail, edge): judgment-call standards go into the repo's existing standards file (CODING_STANDARDS.md, rules/, CONTRIBUTING.md), else a new CODING_STANDARDS.md (A24)
- [ ] EProof (happy, fail, edge): every finding cites evidence (file:line, a transcript line, a PR comment, a CI run) that code re-checks; each finding gets verify: passed (evidence checks out), not-passed (evidence cited but it does not match) or no-evidence (nothing cited); only passed findings get proposals (A32)
- [ ] ERedact (happy, fail, edge): token-like strings are redacted in every transcript quote, and no transcript excerpt is written into the repo (A11)
- [ ] SMatch (happy, fail, edge): the sessions of a work item are found automatically (cwd is the repo, time overlaps the branch's commits or PR) and --session overrides (A12)
- [ ] OLog (happy, fail, edge): the report stays in the temp run folder; each retro appends one metrics line to the committed docs/retro/log.md (A13)
- [ ] OLang (happy, fail, edge): the report is in the user's language; JSON keys and rule ids are in English (A10)
- [ ] HAuto (happy, fail, edge): a code-only Claude Code hook (no agent, no tokens) collects the metrics into a run folder when a session ends or a PR merges and reminds the user to run /retro; RETRO_AUTO_COLLECT_ENABLED, default true (A26)
- [ ] FFlags (happy, fail, edge): flags RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED and RETRO_TRANSCRIPTS_ENABLED take true or false, default true (A19)
- [ ] FStrict (happy, fail, edge): a retro flag value outside its allowed list stops the tool with the fix (hook denies / blocks, CLI exits 2, pre-commit stops the commit), like every other skill's flags (S1)
- [ ] TLint (happy, fail, edge): CI installs ESLint and ruff; locally the real-linter integration test skips with a message when one is missing, and with CI=true a missing linter fails it (A22)

- feature flag: RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED=true, RETRO_TRANSCRIPTS_ENABLED=true, RETRO_AUTO_COLLECT_ENABLED=true, RETRO_STEERING_BYTES_MAX=8000; the skill itself is opt-in by invocation (A19)
- backward compat: no existing skill, hook or flag changes; retro only reads runs.md and retro files; plugin 2.0.0 -> 2.1.0 (additive) (A21)
- non-goals: auto-fixing old violations, native Windows, posting to tickets (A21)
- verify env: dogfood on PNNutkung/skills over PR #17 in the cloud container, plus CI 8/8 green (A21)
- test tiers: unit + fuzz (ratchet counter, baseline merge, evidence check, redaction), integration (real git fixture repo, real ESLint and ruff), E2E (fixture repo + fixture transcript -> report, approval, applied change, pre-commit blocks a regression and lowers a count) (A21)
