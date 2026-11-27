---
touches:
  - "rules/**"
  - "skills/retro/**"
  - "docs/retro/rule-hits.json"
  - "README.md"
  - ".claude-plugin/*.json"
  - "docs/adr/**"
  - "docs/verify/rule-enforcers.md"
dod: rule-enforcers
---
# 13. Rule enforcers

Date: 2026-11-27
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

A rule that lives only in text does not stop an agent, so the same mistake comes back (issue #44). `rules/paths.md` records four repeats of one mistake, each found by hand in a retro. Nothing showed which rule has a check behind it and which is text only, and no code noticed when a text-only rule was broken again.

## Decision

In short:

- Every top-level bullet in `rules/*.md` ends with `<!-- rule: <file stem>/<slug> -->` (A2, A10, A11, A12).
- `rules/enforcers.json` gives each id a status (`enforced`, `partial`, `judgment`), its enforcers (a path, `path#symbol` or `ratchet:<id>`) and a reason. `rules/README.md` holds only a pointer to it (A1, A13).
- `rules/checks/rule-enforcers.mjs` keeps the ids and the JSON in sync in CI, always on (A3, A6, A7).
- `retro` reads a finding's `rule`, appends hits to `docs/retro/rule-hits.json` and fails `retro.mjs check` when a repeat of an unenforced rule has no proposal with `level` or `noLevel` (A4, A5). `RETRO_UNENFORCED_RULE_CHECK_ENABLED` (default `true`) turns the repeat gate off.
- One reader, `skills/retro/rules.mjs`, parses rule ids, `enforcers.json` and `rule-hits.json`. The CI check imports it, so no parser is duplicated, and retro still works when installed alone (A16).

How the free-text answers were read:

- A1: the code and CI read the mapping far more often than people do, so the answer is B without a README table (confirmed in the thread before Q10).
- A16: A, with the duplicate parser removed: `rules/checks/` may import from `skills/retro/`, because it runs only in this repo, where both exist.

### A1: Where does the rule-to-enforcer table live?

Context: rules/README.md has a Guidelines table (File, What it covers, Used by; lines 14-23) and a Guardrails table (Constraint, Enforced by, Flag; lines 25-64). Docs tests match single lines of both (skills/retro/docs.test.mjs:49-54). flag-defaults-e2e.md has no Guidelines row.
Options considered (the agent's analysis when the question was asked):
- (A) add an "Enforced by" column (and status) to the Guidelines table, one row per rule file; add the missing flag-defaults-e2e row; keep the Guardrails table as is
  - pro: one place to look, small diff, old tables and docs tests keep working
  - con: a markdown table is harder to parse than JSON
- (B) a new machine-readable file rules/enforcers.json, and the README shows a generated table
  - pro: easy to parse, no markdown parsing
  - con: two sources; a generator and a sync check are extra work
- (C) front matter in each rule file (enforced-by: [...])
  - pro: the mapping sits next to the rule text
  - con: all 9 files change; harder to see all rules at once
Recommended: A
Answer: ใครอ่าน file นี้บ่อยกว่ากันระหว่าง user หรือ computer? ถ้า computer อ่านบ่อยกว่ามาก ๆ (80+%)ก็ B แบบไม่ต้องทำ readme
Trade-off accepted: none recorded (the answer picks no single option)

### A2: One row per rule file, or per rule inside a file?

Context: rule files have no per-rule headings, only bullets (rules/performance.md has 7 bullets; some are enforced by ratchet, test-time and dod.mjs check, the rest by nothing).
Options considered (the agent's analysis when the question was asked):
- (A) one row per file with a status: enforced, partial or judgment; partial must say in words what is not enforced
  - pro: 9 rows, honest about gaps, fits a size-S change
  - con: retro cannot tell which bullet of a partial file a mistake broke
- (B) one row per bullet, each bullet gets an id (perf-1, perf-2...)
  - pro: exact mapping
  - con: about 40 rows; every rule file gets ids; much bigger change
- (C) one row per file, enforced or judgment only (no partial)
  - pro: simplest
  - con: performance.md would read "enforced" while most bullets are not
Recommended: A
Answer: B (one row per bullet, each bullet gets an id (perf-1, perf-2...))
Trade-off accepted: about 40 rows; every rule file gets ids; much bigger change

### A3: What does the CI check refuse?

Context: rules/checks/*.mjs run in CI through their .test.mjs (.github/workflows/test.yml:48-52). Enforcers today are files (rules/checks/x.mjs, hooks/x.mjs) or .ratchet.json rule ids.
Options considered (the agent's analysis when the question was asked):
- (A) a rule file with no row; a row for a file that does not exist; an enforcer path that does not exist; a ratchet id not in .ratchet.json; a status not in {enforced, partial, judgment}; a judgment or partial row with no reason text
  - pro: catches stale and empty rows
  - con: authors must write a reason for every judgment row
- (B) A plus a back-link: each enforcer file must mention its rule file name
  - pro: catches a mapping to the wrong file
  - con: edits every enforcer file; ratchet ids cannot hold a back-link
- (C) only a missing row
  - pro: smallest
  - con: a renamed or deleted enforcer goes unnoticed
Recommended: A
Answer: A (a rule file with no row; a row for a file that does not exist; an enforcer path that does not exist; a ratchet id not in .ratchet.json; a status not in {enforced, partial, judgment}; a judgment or partial row with no reason text)
Trade-off accepted: authors must write a reason for every judgment row

### A4: How does retro know a mistake is "seen again"?

Context: retro findings are written by the agent; no code detects a repeat across retros (facts.md); rule files record repeats by hand ("Found again by the retro of ...", rules/paths.md:12-14).
Options considered (the agent's analysis when the question was asked):
- (A) a finding may name a rule (rule: "rules/x.md"); it is a repeat when it cites at least 2 evidence items in this retro, or the rule file already says "Found by the retro of"; retro.mjs check computes it
  - pro: code decides, no new history file
  - con: a past hit counts only if someone wrote it into the rule file
- (B) A plus a new file docs/retro/rule-hits.json that retro.mjs log appends to (rule, date, branch); a repeat = also seen in an earlier retro
  - pro: real history, no hand-written lines needed
  - con: one more file in every repo that uses retro
- (C) the agent decides alone, no code check
  - pro: no code
  - con: not enforced, which is the point of this issue
Recommended: B
Answer: B (A plus a new file docs/retro/rule-hits.json that retro.mjs log appends to (rule, date, branch); a repeat = also seen in an earlier retro)
Trade-off accepted: one more file in every repo that uses retro

### A5: What must retro do with a repeat of an unenforced rule?

Context: the issue: "The proposal must name a higher level (check, ratchet, type) or say why none works."
Options considered (the agent's analysis when the question was asked):
- (A) retro.mjs check fails unless the repeat finding has a proposal with level: check | ratchet | hook | type | test, or noLevel: "<why>"
  - pro: matches the issue; the agent cannot skip it silently
  - con: one more field the agent must fill
- (B) only a warning in report.md, never a failed check
  - pro: softer
  - con: the agent can ignore it
Recommended: A
Answer: A (retro.mjs check fails unless the repeat finding has a proposal with level: check | ratchet | hook | type | test, or noLevel: "<why>")
Trade-off accepted: one more field the agent must fill

### A6: Flags

Context: the issue names RETRO_UNENFORCED_RULE_CHECK_ENABLED (default true, owned by retro) and says the CI table check lives in rules/checks like the others, which have no on/off flag (rules/README.md:62-64).
Options considered (the agent's analysis when the question was asked):
- (A) RETRO_UNENFORCED_RULE_CHECK_ENABLED default true turns off Q4 and Q5 in retro; the CI table check is always on, no flag
  - pro: same as the other rules/checks
  - con: no way to turn the CI check off
- (B) A plus CHECKS_RULE_ENFORCERS_ENABLED default true for the CI check
  - pro: an off switch
  - con: a flag nobody needs; CHECKS_ flags today are numbers only
Recommended: A
Answer: A (RETRO_UNENFORCED_RULE_CHECK_ENABLED default true turns off Q4 and Q5 in retro; the CI table check is always on, no flag)
Trade-off accepted: no way to turn the CI check off

### A7: Which rules are in scope?

Context: rules also live in each SKILL.md "Rules:" line (links to rules/) and in standards files of user repos.
Options considered (the agent's analysis when the question was asked):
- (A) only rules/*.md of this repo (README excluded) for the table check; retro accepts a rule field that points at any file
  - pro: clear, small
  - con: user repos get the retro part but not the table check
- (B) A plus the table check runs in any repo that has a rules/README.md
  - pro: reusable
  - con: user repos have other table shapes
Recommended: A
Answer: A (only rules/*.md of this repo (README excluded) for the table check; retro accepts a rule field that points at any file)
Trade-off accepted: user repos get the retro part but not the table check

### A8: Where do we verify, and which test tiers?

Context: earlier work verified in this cloud container plus CI (docs/verify/*.md).
Options considered (the agent's analysis when the question was asked):
- (A) [cloud] unit, integration and e2e (retro on a fixture repo with a repeat finding; the table check on this repo and on broken fixtures), fuzz the table parser; [ci] CI green on all jobs
  - pro: same as earlier issues, no machine needed
  - con: no run on Nut's WSL
- (B) A plus [nut-wsl] one real retro run on Nut's machine
  - pro: real environment
  - con: needs Nut's computer online
Recommended: A
Answer: A ([cloud] unit, integration and e2e (retro on a fixture repo with a repeat finding; the table check on this repo and on broken fixtures), fuzz the table parser; [ci] CI green on all jobs)
Trade-off accepted: no run on Nut's WSL

### A9: Backward compatibility and non-goals

Context: old findings.json have no rule field; existing README rows are matched by docs tests.
Options considered (the agent's analysis when the question was asked):
- (A) findings without rule work as today; the Guardrails table and docs-test lines stay; non-goals: no per-bullet ids, no new enforcer for ask-dont-assume, untrusted-input, flaky-tests or reply-style here (they get judgment or partial rows), no change to log.md columns
  - pro: small and safe; new enforcers become later issues
  - con: the 4 weak rules stay unenforced for now
- (B) A, but also write one new enforcer now (for example flaky-tests: a ratchet rule for fixed sleeps)
  - pro: one gap closed right away
  - con: grows the issue past size S
Recommended: A
Answer: A (findings without rule work as today; the Guardrails table and docs-test lines stay; non-goals: no per-bullet ids, no new enforcer for ask-dont-assume, untrusted-input, flaky-tests or reply-style here (they get judgment or partial rows), no change to log.md columns)
Trade-off accepted: the 4 weak rules stay unenforced for now

### A10: Where does each bullet's id live?

Context: A2 chose one row per bullet. The 9 rule files hold about 52 top-level bullets ("- " lines); some files also have a lead paragraph and "Found by the retro of" history lines (rules/paths.md:12-16). A1 chose rules/enforcers.json with no README table.
Options considered (the agent's analysis when the question was asked):
- (A) an HTML comment at the end of each bullet, <!-- rule: performance/spawn-timeout -->; hidden when rendered; the CI check reads ids from the files
  - pro: the id moves with the bullet when text is edited; invisible to readers
  - con: raw markdown gets a bit noisier
- (B) a visible tag at the start, [performance/spawn-timeout]
  - pro: easy to cite in a retro finding by eye
  - con: every bullet reads worse
- (C) no id in the file; enforcers.json matches the bullet's first words
  - pro: rule files do not change
  - con: an edit to the first words breaks the match
Recommended: A
Answer: A (an HTML comment at the end of each bullet, <!-- rule: performance/spawn-timeout -->; hidden when rendered; the CI check reads ids from the files)
Trade-off accepted: raw markdown gets a bit noisier

### A11: Id shape

Context: ids go into enforcers.json, findings (rule field) and docs/retro/rule-hits.json (A4), so they must not change when bullets move.
Options considered (the agent's analysis when the question was asked):
- (A) <file stem>/<short slug>, for example performance/spawn-timeout; the check refuses a duplicate or a slug that is not lowercase-kebab
  - pro: stable when bullets are reordered; readable
  - con: the author must invent a slug
- (B) <file stem>-<number>, for example performance-3
  - pro: no naming effort
  - con: inserting a bullet renumbers the rest and breaks old hits
Recommended: A
Answer: A (<file stem>/<short slug>, for example performance/spawn-timeout; the check refuses a duplicate or a slug that is not lowercase-kebab)
Trade-off accepted: the author must invent a slug

### A12: Which lines count as rules?

Context: lead paragraphs restate the rule ("A test name says what it expects and when", rules/test-naming.md:3); history lines ("Found by the retro of") and "Enforced by ..." paragraphs are not rules; flag-defaults-e2e.md and reply-style.md have headed sections.
Options considered (the agent's analysis when the question was asked):
- (A) every top-level "- " bullet in rules/*.md (README excluded), in any section; nested bullets belong to their parent; paragraphs are not rules
  - pro: one clear syntax rule the check can apply
  - con: a rule written as a paragraph is invisible until someone makes it a bullet
- (B) A plus each lead paragraph gets its own id
  - pro: nothing is missed
  - con: lead paragraphs only summarize the bullets; duplicate ids
Recommended: A
Answer: A (every top-level "- " bullet in rules/*.md (README excluded), in any section; nested bullets belong to their parent; paragraphs are not rules)
Trade-off accepted: a rule written as a paragraph is invisible until someone makes it a bullet

### A13: How can an enforcer be named in enforcers.json?

Context: some rules are enforced by a function inside a bigger file, for example the CPU-floor bullet by checkTimeFloors in skills/definition-of-done/dodcheck.mjs; others by a ratchet id or a whole check file.
Options considered (the agent's analysis when the question was asked):
- (A) a repo path (must exist), a path#symbol (the symbol must appear in that file), or ratchet:<id> (must be in .ratchet.json)
  - pro: precise for gates inside big files; still cheap to check
  - con: a symbol check is a text search, so a renamed function is caught but a gutted one is not
- (B) a repo path or ratchet:<id> only
  - pro: simplest
  - con: points at a 1,000-line file for a 10-line gate
Recommended: A
Answer: A (a repo path (must exist), a path#symbol (the symbol must appear in that file), or ratchet:<id> (must be in .ratchet.json))
Trade-off accepted: a symbol check is a text search, so a renamed function is caught but a gutted one is not

### A14: Seed the hit history now?

Context: rule files already record past repeats in prose (rules/paths.md: found 4 times; rules/flaky-tests.md and rules/performance.md once each). A4 chose docs/retro/rule-hits.json as the history.
Options considered (the agent's analysis when the question was asked):
- (A) seed rule-hits.json by hand in this PR from those "Found by" lines, mapped to the new ids, with date and the retro they name
  - pro: the first retro after merge already sees real repeats (paths would be one)
  - con: a hand mapping can be wrong; the PR reviewer checks it
- (B) start empty
  - pro: no hand work
  - con: known repeats count from zero again
Recommended: A
Answer: A (seed rule-hits.json by hand in this PR from those "Found by" lines, mapped to the new ids, with date and the retro they name)
Trade-off accepted: a hand mapping can be wrong; the PR reviewer checks it

### A15: Confirm the DoD and touches?

Context: dod.mjs check passes with 20 items; touches rules/**, skills/retro/**, docs/retro/rule-hits.json, README.md, .claude-plugin/*.json, docs/adr/**, docs/verify/rule-enforcers.md
Options considered (the agent's analysis when the question was asked):
- (A) confirm as written
  - pro: the concept board can start now
  - con: a gap found later means editing the DoD
- (B) change some items
  - pro: closer fit
  - con: one more round
Recommended: A
Answer: A (confirm as written)
Trade-off accepted: a gap found later means editing the DoD

### A16: Which design for the code layout?

Context: concept board; npx skills add copies only the skill folder (rules/README.md:10), so retro cannot import from rules/
Options considered (the agent's analysis when the question was asked):
- (A) retro owns a small reader skills/retro/rules.mjs; the CI check has its own parser
  - pro: retro works installed alone
  - con: two small readers of the same JSON
- (B) one shared module rules/lib/enforcers.mjs
  - pro: one parser
  - con: retro breaks when installed alone
- (C) retro runs the CI check CLI
  - pro: one source of truth
  - con: user repos have no such CLI
Recommended: A
Answer: A แก้เรื่อง duplicate code ด้วย
Trade-off accepted: none recorded (the answer picks no single option)

## Consequences

Trade-offs we accepted:

- A2: about 40 rows; every rule file gets ids; much bigger change
- A3: authors must write a reason for every judgment row
- A4: one more file in every repo that uses retro
- A5: one more field the agent must fill
- A6: no way to turn the CI check off
- A7: user repos get the retro part but not the table check
- A8: no run on Nut's WSL
- A9: the 4 weak rules stay unenforced for now
- A10: raw markdown gets a bit noisier
- A11: the author must invent a slug
- A12: a rule written as a paragraph is invisible until someone makes it a bullet
- A13: a symbol check is a text search, so a renamed function is caught but a gutted one is not
- A14: a hand mapping can be wrong; the PR reviewer checks it
- A15: a gap found later means editing the DoD

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:974c80487cf6a493 -->

- [ ] EnfFile (happy, fail, edge): rules/enforcers.json maps every rule id to a status (enforced, partial or judgment), a list of enforcers and a reason; there is no rule-to-enforcer table in rules/README.md (A1)
- [ ] ReadmePtr (happy, fail, edge): rules/README.md gets one line that points to rules/enforcers.json and says how to add a rule; its existing tables stay as they are (A1)
- [ ] PerBullet (happy, fail, edge): each rule bullet has its own entry in rules/enforcers.json, not one entry per file (A2)
- [ ] BulletIds (happy, fail, edge): every top-level '- ' bullet in rules/*.md (README excluded, any section) ends with <!-- rule: <id> -->; nested bullets belong to their parent; paragraphs are not rules (A10)
- [ ] IdShape (happy, fail, edge): an id is <file stem>/<slug>, the slug lowercase-kebab, and every id is unique (A11)
- [ ] EnfRef (happy, fail, edge): an enforcer is a repo path that exists, path#symbol whose symbol appears in that file, or ratchet:<id> present in .ratchet.json (A13)
- [ ] CheckRefuse (happy, fail, edge): rules/checks/rule-enforcers.mjs exits 1 with one JSON line listing each problem: a bullet with no id, a bad or duplicate id, an id with no entry, an entry with no bullet, a missing enforcer path, a missing symbol, an unknown ratchet id, a status outside enforced/partial/judgment, an enforced entry with no enforcer, a partial or judgment entry with no reason; exit 0 when clean, exit 2 on a usage error (A3)
- [ ] CheckCI (happy, fail, edge): the check runs in CI through rules/checks/rule-enforcers.test.mjs, which runs it on this repo; it is always on, with no flag (A6)
- [ ] CheckScope (happy, fail, edge): the table check covers only this repo's rules/*.md (A7)
- [ ] FindingRule (happy, fail, edge): a retro finding may carry rule: a rule id from rules/enforcers.json, or a file path when the repo has no ids (A7)
- [ ] RuleHits (happy, fail, edge): retro.mjs log appends one record per finding that names a rule to docs/retro/rule-hits.json: rule, date, branch, finding id (A4)
- [ ] Repeat (happy, fail, edge): retro.mjs check marks a finding that names a rule as a repeat when rule-hits.json already holds that rule from an earlier retro, or the finding cites at least 2 evidence items (A4)
- [ ] Unenforced (happy, fail, edge): a rule counts as unenforced when its status is judgment or partial, or it has no entry in rules/enforcers.json (A4)
- [ ] LevelGate (happy, fail, edge): retro.mjs check fails when a repeat finding of an unenforced rule has no proposal with level check, ratchet, hook, type or test, or noLevel with a non-empty reason (A5)
- [ ] Report (happy, fail, edge): report.md lists each repeat of an unenforced rule with its rule id, its earlier hits and the proposed level (A5)
- [ ] FlagOff (happy, fail, edge): RETRO_UNENFORCED_RULE_CHECK_ENABLED=false: retro.mjs check marks no repeats and skips the level gate (A6)
- [ ] FlagBad (happy, fail, edge): any RETRO_UNENFORCED_RULE_CHECK_ENABLED value other than true, false or unset stops retro with exit 2 and a message naming the flag, the value and the fix (A6)
- [ ] Seed (happy, fail, edge): this change seeds docs/retro/rule-hits.json from the 'Found by the retro of' lines in rules/*.md, mapped to the new ids (A14)
- [ ] Rows (happy, fail, edge): rules/enforcers.json covers every current rule bullet with an honest status; no new enforcer is written for weak rules in this change (A9)
- [ ] Compat (happy, fail, edge): a findings.json without any rule field passes retro.mjs check exactly as before (A9)

- feature flag: RETRO_UNENFORCED_RULE_CHECK_ENABLED=true|false, default true, owned by retro; the CI table check has no flag (A6)
- backward compat: findings without rule work as today; the existing rules/README.md tables and docs-test lines stay; docs/retro/log.md columns do not change (A9)
- non-goals: new enforcers for ask-dont-assume, untrusted-input, flaky-tests or reply-style, lead paragraphs as rules, a table check in other repos, a README table of enforcers (A9)
- verify env: [cloud] unit, integration, e2e and fuzz in the cloud container (retro on a fixture repo with a repeat finding; the table check on this repo and broken fixtures); [ci] CI green on all jobs of the PR (A8)
- test tiers: unit, integration, e2e, fuzz (A8)
