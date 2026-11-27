---
touches:
  - "skills/ticket-writer/**"
  - "skills/definition-of-done/**"
  - "skills/dev-workflow/**"
  - "skills/verify/**"
  - "skills/retro/SKILL.md"
  - "hooks/ticket-why-guard.mjs"
  - "hooks/ticket-why-guard.test.mjs"
  - "hooks/hooks.json"
  - "README.md"
  - "rules/README.md"
  - "rules/checks/flag-defaults-e2e.mjs"
  - ".claude-plugin/**"
  - "docs/adr/**"
  - "docs/verify/**"
dod: ticket-why
---
# 12. Ticket why

Date: 2026-11-27
Status: Accepted

## Context

### Why

Nut read the tickets and issues our skills wrote (#33, #36, #44, #45, #46) and could not tell why each task exists or what result we expect from it (thread message, 2026-11-27 02:47 UTC). `dod.mjs render` puts the reason for the work in "Previous notes" at the bottom, under the DoD checklist. New follow-up issues (retro proposals, split-outs, survey ideas) have no template and no check: `#44`'s "Why" says where the idea came from, not the problem today.

### Expected outcome

| Metric | Today | Target | Proven by |
|---|---|---|---|
| Tickets rendered by `dod.mjs` with Why, Expected outcome, If we do nothing and How we know at the top | 0 | every ticket from a DoD session opened by this version | Render, TicketCheck |
| New issues and PRs created through `gh`/`glab`/MCP without the 4 sections | not checked | 0 (the hook denies them) | Guard, GuardMcp |
| Open issues in the new format | 0 of 9 | 9 of 9 | Issues |

### If we do nothing

Every new ticket repeats the problem: the reader must guess the reason and the hoped-for result, and nobody can check later whether the work paid off.

### How we know

`docs/verify/ticket-why.md`: e2e on a fixture repo ([cloud]), CI green ([ci]), and the 9 rewritten issues read back from GitHub pass `issue-check` ([gh]).

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

## Decision

### A1: Which tickets must state why, expected outcome and how we know?

Context: facts.md 1 and 3: dod.mjs render rewrites the linked ticket; new follow-up issues have no template at all
Options considered (the agent's analysis when the question was asked):
- (A) both: the ticket that dod.mjs render rewrites + every new issue a skill writes (follow-up, split-out, retro proposal)
  - pro: covers every ticket Nut reads
  - con: needs a new template and a new check for new issues
- (B) only the ticket that dod.mjs render rewrites
  - pro: small change
  - con: follow-up issues like #36, #38, #44 stay as today
- (C) A + the PR body
  - pro: one story from ticket to PR
  - con: PR body already has its own format (branch-summary); more files to change
Recommended: A
Answer: C (A + the PR body)
Trade-off accepted: PR body already has its own format (branch-summary); more files to change

### A2: Which sections go at the top of a ticket?

Options considered (the agent's analysis when the question was asked):
- (A) 3 sections: Why (problem today, with evidence), Expected outcome (what we get), How we know (the check that proves it)
  - pro: short, answers Nut's two questions plus proof
  - con: does not say what happens if we do nothing
- (B) 4 sections: A + "If we do nothing" (cost of not doing it)
  - pro: helps to rank work
  - con: longer; cost is often a guess
- (C) one "Goal" paragraph
  - pro: shortest
  - con: easy to write vaguely, hard to check in code
Recommended: A
Answer: A แต่เพิ่มว่าถ้าไม่ทำจะเสียอะไร
Trade-off accepted: none recorded (the answer picks no single option)

### A3: How strict is "Expected outcome"?

Options considered (the agent's analysis when the question was asked):
- (A) each outcome has metric + baseline (today) + target, or "not measurable: <reason>" that the user accepts
  - pro: forces a number when one exists; still allows qualitative work
  - con: the grill gets 1-2 more questions
- (B) free text, check only that it is not empty
  - pro: easy
  - con: "faster", "better" still passes
- (C) always a number
  - pro: most precise
  - con: docs or UX work cannot pass
Recommended: A
Answer: A (each outcome has metric + baseline (today) + target, or "not measurable: <reason>" that the user accepts)
Trade-off accepted: the grill gets 1-2 more questions

### A4: How does "How we know" link to the DoD?

Options considered (the agent's analysis when the question was asked):
- (A) each outcome names the DoD item ids that prove it; check fails if an outcome has none; verify reports each outcome met / not met
  - pro: outcome is proven by the real verify run
  - con: verify output changes (new section)
- (B) free text
  - pro: no code in verify
  - con: the proof can drift from the DoD
Recommended: A
Answer: A (each outcome names the DoD item ids that prove it; check fails if an outcome has none; verify reports each outcome met / not met)
Trade-off accepted: verify output changes (new section)

### A5: Where does why/outcome live?

Options considered (the agent's analysis when the question was asked):
- (A) new fields in dod.json (why, outcomes[]) with a quoted source like every DoD item; dod.mjs check gates them
  - pro: same source-quote rule as today; ADR and ticket render from one place
  - con: schema change
- (B) only in the ticket text
  - pro: no schema change
  - con: no gate, no ADR link
Recommended: A
Answer: A (new fields in dod.json (why, outcomes[]) with a quoted source like every DoD item; dod.mjs check gates them)
Trade-off accepted: schema change

### A6: Order inside the rewritten ticket?

Options considered (the agent's analysis when the question was asked):
- (A) Why, Expected outcome, How we know, then DoD checklist, flag, compat, non-goals, env, tiers, previous notes
  - pro: reader sees the reason first
  - con: the ticket layout changes for old readers
- (B) keep the order, add the 3 sections after the checklist
  - pro: smaller diff
  - con: reason still below a long checklist
Recommended: A
Answer: A (Why, Expected outcome, How we know, then DoD checklist, flag, compat, non-goals, env, tiers, previous notes)
Trade-off accepted: the ticket layout changes for old readers

### A7: How do we enforce the format for NEW issues?

Options considered (the agent's analysis when the question was asked):
- (A) a template file + a check command that refuses a body without the 3 sections (agent runs it before gh issue create)
  - pro: simple, testable
  - con: agent can skip the command
- (B) template + prose rule only
  - pro: smallest
  - con: nothing stops a bad issue
- (C) A + a hook that blocks gh issue create / glab issue create when the body fails the check
  - pro: cannot be skipped
  - con: one more hook to keep; parses Bash commands
Recommended: C
Answer: C (A + a hook that blocks gh issue create / glab issue create when the body fails the check)
Trade-off accepted: one more hook to keep; parses Bash commands

### A8: Feature flags?

Options considered (the agent's analysis when the question was asked):
- (A) DOD_TICKET_WHY_ENABLED (definition-of-done: dod.json fields + render + check) and ISSUE_WHY_GUARD_ENABLED (the new issue hook); both true|false, default true
  - pro: each part owns its flag (repo rule)
  - con: two flags
- (B) one flag TICKET_WHY_ENABLED for both
  - pro: one switch
  - con: breaks the repo rule "each skill owns its own flags"
Recommended: A
Answer: A (DOD_TICKET_WHY_ENABLED (definition-of-done: dod.json fields + render + check) and ISSUE_WHY_GUARD_ENABLED (the new issue hook); both true|false, default true)
Trade-off accepted: two flags

### A9: Backward compatibility for old dod.json files?

Options considered (the agent's analysis when the question was asked):
- (A) check requires why/outcomes only for DoD sessions opened after this version; render/export of an old dod.json works as today; flag false = old behavior everywhere
  - pro: nothing old breaks
  - con: two code paths for a while
- (B) every dod.json without the fields fails check
  - pro: one rule
  - con: old committed DoDs fail
- (C) only a warning, never a fail
  - pro: softest
  - con: Nut's problem stays for anyone who ignores warnings
Recommended: A
Answer: A (check requires why/outcomes only for DoD sessions opened after this version; render/export of an old dod.json works as today; flag false = old behavior everywhere)
Trade-off accepted: two code paths for a while

### A10: Rewrite the open issues (#44, #45, #46, #36, #38-#41, #43) in the new format?

Options considered (the agent's analysis when the question was asked):
- (A) yes, right after Nut approves the prototype; show each new text before posting
  - pro: Nut gets readable issues now, not after merge; real test of the format
  - con: posting is outside the repo (needs Nut's ok per issue batch)
- (B) after the PR merges, with the new check
  - pro: the check proves each one
  - con: Nut waits longer
- (C) no
  - pro: no extra work
  - con: old issues stay unclear
Recommended: A
Answer: A (yes, right after Nut approves the prototype; show each new text before posting)
Trade-off accepted: posting is outside the repo (needs Nut's ok per issue batch)

### A11: How does the PR body get why / outcome (A1 C)?

Context: dev-workflow step 4 opens the draft PR; today the agent writes the body freely; no PR template in .github
Options considered (the agent's analysis when the question was asked):
- (A) a render command writes the top of the PR body from dod.json (Why, Expected outcome, If we do nothing, How we know, ticket link); workflow next --pr checks the body; the new hook also checks gh pr create / glab mr create
  - pro: one source, ticket and PR never disagree; cannot be skipped
  - con: the hook covers more commands
- (B) PR body keeps a short Why + link to the ticket only
  - pro: short PR
  - con: reader must open the ticket
- (C) prose rule only
  - pro: smallest
  - con: nothing checks it
Recommended: A
Answer: A (a render command writes the top of the PR body from dod.json (Why, Expected outcome, If we do nothing, How we know, ticket link); workflow next --pr checks the body; the new hook also checks gh pr create / glab mr create)
Trade-off accepted: the hook covers more commands

### A12: How strict is "If we do nothing" (A2)?

Options considered (the agent's analysis when the question was asked):
- (A) required, quoted source; "no clear cost: <reason>" passes only when the user accepts it
  - pro: same rule as the other sections
  - con: one more grill question
- (B) optional
  - pro: less work
  - con: often left empty
- (C) must have a number (time, money, bugs)
  - pro: strongest
  - con: often a guess
Recommended: A
Answer: A (required, quoted source; "no clear cost: <reason>" passes only when the user accepts it)
Trade-off accepted: one more grill question

### A13: Section headings in Thai or English?

Options considered (the agent's analysis when the question was asked):
- (A) follow render --lang (th or en); the check accepts both fixed lists
  - pro: reader gets their language
  - con: two heading lists to keep
- (B) English only
  - pro: one list
  - con: Thai tickets have English headings
Recommended: A
Answer: A (follow render --lang (th or en); the check accepts both fixed lists)
Trade-off accepted: two heading lists to keep

### A14: Verify environment?

Options considered (the agent's analysis when the question was asked):
- (A) [cloud] e2e on a fixture repo (render, check, hook deny/allow); [ci] CI green; [gh] the real rewrite of open issues (A10) passes the new check
  - pro: real issues prove the format
  - con: [gh] posting needs Nut's ok
- (B) [cloud] + [ci] only
  - pro: no outside writes
  - con: no real-world proof
Recommended: A
Answer: A ([cloud] e2e on a fixture repo (render, check, hook deny/allow); [ci] CI green; [gh] the real rewrite of open issues (A10) passes the new check)
Trade-off accepted: [gh] posting needs Nut's ok

### A15: Name of the hook flag (the hook now covers issue AND PR create, A11)?

Options considered (the agent's analysis when the question was asked):
- (A) TICKET_WHY_GUARD_ENABLED
  - pro: says what it guards (tickets: issues and PRs)
  - con: differs from the name in Q8
- (B) keep ISSUE_WHY_GUARD_ENABLED
  - pro: matches Q8
  - con: name hides that PRs are checked too
Recommended: A
Answer: A (TICKET_WHY_GUARD_ENABLED)
Trade-off accepted: differs from the name in Q8

### A16: Does the hook also cover GitHub/GitLab MCP create tools (issue_write create, create_pull_request)?

Options considered (the agent's analysis when the question was asked):
- (A) yes: the same check on the MCP tool's body field
  - pro: agent cannot go around the hook via MCP
  - con: matches tool names that can change
- (B) CLI only
  - pro: simpler
  - con: MCP is a way around
Recommended: A
Answer: A (yes: the same check on the MCP tool's body field)
Trade-off accepted: matches tool names that can change

### A17: Flag for the PR-body check in workflow.mjs next --pr (each skill owns its flags)?

Options considered (the agent's analysis when the question was asked):
- (A) WORKFLOW_PR_WHY_CHECK_ENABLED (true|false, default true, owned by dev-workflow)
  - pro: follows the repo rule
  - con: a third flag
- (B) no flag: the check follows the DoD (runs only when the DoD has outcomes)
  - pro: no new flag
  - con: no switch if the check is wrong
Recommended: A
Answer: A (WORKFLOW_PR_WHY_CHECK_ENABLED (true|false, default true, owned by dev-workflow))
Trade-off accepted: a third flag

### A18: Approve the DoD draft (dod.md, 17 items) and the prototype?

Options considered (the agent's analysis when the question was asked):
- (A) approve both
  - pro: TDD can start
  - con: later changes need a new answer
- (B) approve with changes (say which)
  - pro: Nut fixes wording first
  - con: one more round
Recommended: A
Answer: A (approve both)
Trade-off accepted: later changes need a new answer

### A19: Where does the code live?

Context: dev-workflow already imports skills/definition-of-done/adr.mjs (cross-skill import is a pattern in this repo)
Options considered (the agent's analysis when the question was asked):
- (A) pure core why.mjs inside definition-of-done; dod.mjs issue-check and render --pr; hook and workflow import it
  - pro: one source, least work, follows the adr.mjs pattern
  - con: hook and dev-workflow depend on a definition-of-done file
- (B) new skill ticket-writer owns the template, why.mjs, issue-check and the hook flag
  - pro: agent can load a "write an issue" skill directly; clear owner
  - con: a 10th skill with its own docs and evals; definition-of-done depends on another skill
- (C) hook checks by itself + a text template in rules/, no shared module
  - pro: least coupling
  - con: two copies of the heading list can drift; needs a sync test
Recommended: A
Answer: B ทำให้ definition-of-done เป็น skill แยกอีกอันดีไหม?
Trade-off accepted: none recorded (the answer picks no single option)

### A20: Post the 9 drafted issue rewrites (issues/new-<n>.md)?

Options considered (the agent's analysis when the question was asked):
- (A) post all 9 as drafted
  - pro: readable issues now
  - con: outward write
- (B) change first
  - pro: Nut edits wording
  - con: slower
Recommended: A
Answer: A (post all 9 as drafted)
Trade-off accepted: outward write

## Consequences

Trade-offs we accepted:

- A1: PR body already has its own format (branch-summary); more files to change
- A3: the grill gets 1-2 more questions
- A4: verify output changes (new section)
- A5: schema change
- A6: the ticket layout changes for old readers
- A7: one more hook to keep; parses Bash commands
- A8: two flags
- A9: two code paths for a while
- A10: posting is outside the repo (needs Nut's ok per issue batch)
- A11: the hook covers more commands
- A12: one more grill question
- A13: two heading lists to keep
- A14: [gh] posting needs Nut's ok
- A15: differs from the name in Q8
- A16: matches tool names that can change
- A17: a third flag
- A18: later changes need a new answer
- A20: outward write

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:32382f6fc8ce9af3 -->

- [ ] Skill (happy, fail, edge): a new skill skills/ticket-writer owns the ticket sections: why.mjs (pure: Thai and English heading lists, section parser, body check, section renderer), a template for new issues and PRs, the issue-check command and the TICKET_WHY_GUARD_ENABLED flag; definition-of-done, dev-workflow and the hook import why.mjs from it (A19)
- [ ] Sections (happy, fail, edge): a ticket, new issue or PR body starts with 4 sections in this order: Why (the problem today, with evidence), Expected outcome (a table: metric, today, target, proven by), If we do nothing (the cost of not doing it), How we know (the DoD ids or checks that prove it and where the proof will be) (A2)
- [ ] DodFields (happy, fail, edge): dod.json gets why {text, source}, outcomes[] {id, metric, baseline, target, provenBy[], source} and costOfInaction {text, source}, each source quoted like a DoD item (A5)
- [ ] OutcomeCheck (happy, fail, edge): dod.mjs check fails, naming the fix, when an outcome has no metric, baseline and target and no notMeasurable reason with an accepted user answer (A3)
- [ ] ProvenBy (happy, fail, edge): dod.mjs check fails when an outcome has an empty provenBy or names a DoD id that does not exist (A4)
- [ ] CostCheck (happy, fail, edge): dod.mjs check fails when why or costOfInaction is missing or has no quoted source, or when costOfInaction says there is no clear cost without an accepted user answer (A12)
- [ ] NewOnly (happy, fail, edge): the why, outcome and cost checks apply only to DoD sessions opened by this version (dod.mjs open stamps the session); an old dod.json still checks, renders and exports as today (A9)
- [ ] DodFlag (happy, fail, edge): DOD_TICKET_WHY_ENABLED (true or false, default true, owned by definition-of-done): false gives today's behavior in every dod.mjs command; any other value stops the tool with the fix (A8)
- [ ] Render (happy, fail, edge): dod.mjs render puts the 4 sections first, then the DoD checklist and the other sections as today; headings follow --lang th or en (A6)
- [ ] TicketCheck (happy, fail, edge): dod.mjs ticket-check also fails when one of the 4 sections is missing or empty in the rewrite or the posted ticket; every original sentence must still survive as today (A6)
- [ ] Adr (happy, fail, edge): dod.mjs adr writes the same 4 sections into the ADR (A5)
- [ ] PrBody (happy, fail, edge): dod.mjs render --pr writes the top of the PR body (the 4 sections and the ticket link); when docs/verify/<slug>.md exists the outcome table gets a result column: met, not met or not run (A11)
- [ ] IssueCheck (happy, fail, edge): ticket-writer issue-check --body <file> fails when one of the 4 headings (Thai or English list) is missing or empty, or when Expected outcome has neither metric, today and target nor a "not measurable: <reason>" line; other sections below stay free text (A7)
- [ ] Guard (happy, fail, edge): hooks/ticket-why-guard.mjs denies gh issue create, glab issue create, gh pr create and glab mr create when the body fails issue-check; a body it cannot read (editor, --fill) is denied with the fix: use --body-file (A7)
- [ ] GuardMcp (happy, fail, edge): the same hook checks the body of GitHub and GitLab MCP tools that create an issue or a pull request (A16)
- [ ] GuardFlag (happy, fail, edge): TICKET_WHY_GUARD_ENABLED (true or false, default true, owned by ticket-writer): false lets every command through; any other value denies the guarded tools with the fix (A15)
- [ ] WorkflowPr (happy, fail, edge): workflow.mjs next --pr reads the PR body and refuses to move on when one of the 4 sections is missing or empty; WORKFLOW_PR_WHY_CHECK_ENABLED (true or false, default true, owned by dev-workflow) turns it off; any other value stops the tool with the fix (A17)
- [ ] VerifyOut (happy, fail, edge): verify writes an Outcomes section in docs/verify/<slug>.md with each outcome met or not met from its provenBy items, only when the DoD has outcomes; an old DoD gets no new section (A4)
- [ ] SkillDocs (happy, fail, edge): the SKILL.md files of definition-of-done, dev-workflow and retro tell the agent to use ticket-writer when it writes a new issue (follow-up, split-out, retro proposal) or a PR body; every SKILL.md stays under its size cap (A1)
- [ ] Docs (happy, fail, edge): README flags table rows for the 3 new flags, README skills list, rules/README.md guardrail row, hooks.json entry, flag-defaults-e2e OWNERS, an ADR and a plugin version bump (A8)
- [ ] Tests (happy, fail, edge): unit and fuzz tests (random bodies, random flag values, Thai and English headings), integration tests (render then ticket-check, render --pr then issue-check) and e2e tests on a fixture repo (DoD session to render to check; hook deny and allow for each command); no test skipped; CI green (A14)
- [ ] Issues (happy, fail, edge): the open issues #36, #38, #39, #40, #41, #43, #44, #45 and #46 are rewritten in the new format after Nut approves the text, and each passes issue-check when read back from GitHub (A10)

- feature flag: DOD_TICKET_WHY_ENABLED (definition-of-done), TICKET_WHY_GUARD_ENABLED (ticket-writer hook), WORKFLOW_PR_WHY_CHECK_ENABLED (dev-workflow); all true|false, default true (A17)
- backward compat: new checks apply only to DoD sessions opened by this version; old dod.json files check, render and export as today; each flag false gives the old behavior (A9)
- non-goals: changing Jira, Linear, Asana or Trello posting (render output is the same text for every system), letting dod.mjs create tickets (it still never creates one), rewriting closed issues (A9)
- verify env: [cloud] unit + e2e on a fixture repo in the cloud container; [ci] CI green; [gh] the 9 rewritten open issues pass issue-check when read back from GitHub (A14)
- test tiers: unit, fuzz, integration, e2e (A14)
