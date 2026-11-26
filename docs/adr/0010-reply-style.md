---
touches:
  - "rules/reply-style.md"
  - "rules/README.md"
  - "hooks/reply-style.mjs"
  - "hooks/reply-style.test.mjs"
  - "hooks/hooks.json"
  - "skills/*/SKILL.md"
  - "rules/checks/flag-defaults-e2e.mjs"
  - "README.md"
  - ".claude-plugin/*.json"
  - "docs/**"
dod: reply-style
---
# 10. Reply style

Date: 2026-11-26
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

Nut asked on 2026-11-26 to put this rule into the plugin: "เวลาตอบให้ใช้ technical term เป็นภาษาอังกฤษโดยวงเล็บคำอธิบายสั้น ๆ เป็นภาษาที่กำลังใช้คุยกันอยู่หรือคำที่เข้าใจง่าย ๆ ให้ด้วย และเขียนประโยคตามหลัก ASD-STE100". Until now the rule lived only in one project's memory, in a Thai-only form. The plugin has no SessionStart hook, and a rule in `rules/` reaches the agent only while a skill that links it is loaded. No ticket: the ADR and the PR carry it.

## Decision

### A1: How does the plugin deliver the reply-style rule?

Context: no SessionStart hook today (hooks/hooks.json); rules/ text reaches the agent only while a skill that links it is loaded
Options considered (the agent's analysis when the question was asked):
- (A) SessionStart hook injects rules/reply-style.md (at start, resume and after compact)
  - pro: every session gets it, also without a skill
  - con: only for the plugin install, not `npx skills add`
- (B) rules/reply-style.md + one line in every SKILL.md
  - pro: no new hook, works with `npx skills add`
  - con: plain chat with no skill loaded does not get it
- (C) both A and B
  - pro: covers both install ways
  - con: most files; the text in SKILL.md and the rule can drift (a test can guard it)
Recommended: C
Answer: C (both A and B)
Trade-off accepted: most files; the text in SKILL.md and the rule can drift (a test can guard it)

### A2: Flag and default?

Options considered (the agent's analysis when the question was asked):
- (A) REPLY_STYLE_ENABLED true|false, default true
  - pro: works right after update
  - con: changes reply style for every plugin user
- (B) same flag, default false (opt-in)
  - pro: nothing changes for others
  - con: Nut must set the env
Recommended: A
Answer: A (REPLY_STYLE_ENABLED true|false, default true)
Trade-off accepted: changes reply style for every plugin user

### A3: Which text does the rule cover?

Options considered (the agent's analysis when the question was asked):
- (A) replies to the user only
  - pro: small, what was asked
  - con: files and PR bodies the skills write do not follow it
- (B) replies + text for humans that skills write (questions, reports, ADR, PR body)
  - pro: one style everywhere
  - con: touches many formats and checks
- (C) also code comments and commit messages
  - pro: total
  - con: noise in code
Recommended: A
Answer: B (replies + text for humans that skills write (questions, reports, ADR, PR body))
Trade-off accepted: touches many formats and checks

### A4: How often does a term get its explanation?

Options considered (the agent's analysis when the question was asked):
- (A) first use in each reply
  - pro: reader always has it in the same message
  - con: repeats across replies
- (B) every use
  - pro: always clear
  - con: noisy
- (C) first use in the conversation
  - pro: shortest
  - con: lost after many replies or compact
Recommended: A
Answer: A (first use in each reply)
Trade-off accepted: repeats across replies

### A5: Which terms get an explanation?

Options considered (the agent's analysis when the question was asked):
- (A) every technical term; code names in backticks (file, flag, command) stay as they are
  - pro: clear and testable rule
  - con: common words like commit get explained too
- (B) only terms the reader may not know (agent judges)
  - pro: shorter
  - con: subjective
Recommended: A
Answer: A (every technical term; code names in backticks (file, flag, command) stay as they are)
Trade-off accepted: common words like commit get explained too

### A6: In an English conversation?

Options considered (the agent's analysis when the question was asked):
- (A) still add a plain-English explanation in brackets
  - pro: one rule for all languages
  - con: extra words for readers who know the term
- (B) no brackets in English, STE only
  - pro: shorter
  - con: rule differs by language
Recommended: A
Answer: A (still add a plain-English explanation in brackets)
Trade-off accepted: extra words for readers who know the term

### A7: How strict is ASD-STE100?

Options considered (the agent's analysis when the question was asked):
- (A) core writing rules: max 20 words per instruction sentence, 25 per description sentence, one idea per sentence, active voice, imperative for steps, simple words; same structure in other languages
  - pro: practical, small text
  - con: not full dictionary compliance
- (B) full spec with the approved dictionary
  - pro: strict
  - con: the dictionary is licensed and large; cannot ship it
Recommended: A
Answer: A (core writing rules: max 20 words per instruction sentence, 25 per description sentence, one idea per sentence, active voice, imperative for steps, simple words; same structure in other languages)
Trade-off accepted: not full dictionary compliance

### A8: Is the rule checked?

Options considered (the agent's analysis when the question was asked):
- (A) guideline only, no block (hooks = guardrails, rules = guidelines); tests check only that the hook injects the text
  - pro: matches the repo principle
  - con: no proof a reply follows it
- (B) a Stop hook warns on long sentences
  - pro: some feedback
  - con: Thai has no spaces, word count is wrong; false warnings
Recommended: A
Answer: A (guideline only, no block (hooks = guardrails, rules = guidelines); tests check only that the hook injects the text)
Trade-off accepted: no proof a reply follows it

### A9: What is "the language of the conversation"?

Options considered (the agent's analysis when the question was asked):
- (A) the language of the user's latest message; if unclear, the previous one
  - pro: follows a switch
  - con: a message with only code is unclear
- (B) a fixed flag REPLY_STYLE_LANGUAGE
  - pro: exact
  - con: one more flag, no switch
Recommended: A
Answer: A (the language of the user's latest message; if unclear, the previous one)
Trade-off accepted: a message with only code is unclear

### A10: Verify env?

Options considered (the agent's analysis when the question was asked):
- (A) [cloud] unit + e2e of the hook output; [ci] CI green; [nut] Nut runs one Claude Code session with the branch plugin and checks a reply
  - pro: real proof that the agent follows it
  - con: needs Nut's time
- (B) [cloud] + [ci] only
  - pro: no work for Nut
  - con: no proof on a real session
Recommended: A
Answer: A ([cloud] unit + e2e of the hook output; [ci] CI green; [nut] Nut runs one Claude Code session with the branch plugin and checks a reply)
Trade-off accepted: needs Nut's time

### A11: How does the hook put the rule into context?

Context: board.html variants; rules/ is the home of guidelines (rules/README.md:3)
Options considered (the agent's analysis when the question was asked):
- (A) hook reads rules/reply-style.md and injects the whole file
  - pro: one source of truth, no drift
  - con: about 300 tokens per session
- (B) hook injects a short summary kept in code; full rule in rules/
  - pro: smallest context cost
  - con: two texts to keep the same; less detail for the agent
- (C) new standalone skill reply-style; hook injects its SKILL.md
  - pro: npx skills add of this skill alone gives the rule
  - con: not a workflow step; guidelines live in rules/
Recommended: A
Answer: A (hook reads rules/reply-style.md and injects the whole file)
Trade-off accepted: about 300 tokens per session

### A12: Approve the DoD draft (dod.md)? Missing or unreadable rules/reply-style.md handling?

Context: SessionStart exit 2 does not block a session; the hook must not break session start
Options considered (the agent's analysis when the question was asked):
- (A) approve; missing rule file: warning on stderr, exit 0
  - pro: a partial install does not break the session
  - con: the rule can go missing quietly
- (B) approve; missing rule file: hard error, exit 2
  - pro: the problem is loud
  - con: SessionStart exit 2 does not block anyway; little difference
Recommended: A
Answer: A (approve; missing rule file: warning on stderr, exit 0)
Trade-off accepted: the rule can go missing quietly

## Consequences

Trade-offs we accepted:

- A1: most files; the text in SKILL.md and the rule can drift (a test can guard it)
- A2: changes reply style for every plugin user
- A3: touches many formats and checks
- A4: repeats across replies
- A5: common words like commit get explained too
- A6: extra words for readers who know the term
- A7: not full dictionary compliance
- A8: no proof a reply follows it
- A9: a message with only code is unclear
- A10: needs Nut's time
- A11: about 300 tokens per session
- A12: the rule can go missing quietly

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:f7bac7b44ee610e3 -->

- [ ] RuleFile (happy, fail, edge): rules/reply-style.md holds the rule: each technical term in English with a short explanation in brackets, in the language of the user's latest message (the previous one when unclear), or in plain English in an English conversation (A6)
- [ ] FirstUse (happy, fail, edge): the explanation comes at the first use of a term in each reply; code names in backticks (file, flag, command, function) get no explanation (A4)
- [ ] SteRules (happy, fail, edge): the rule lists the ASD-STE100 core writing rules: at most 20 words in an instruction sentence and 25 in a description sentence, one idea per sentence, active voice, imperative for steps, simple words; other languages use the same sentence structure (A7)
- [ ] Scope (happy, fail, edge): the rule covers replies to the user and text skills write for people (questions, reports, ADR, ticket, PR body); not code comments or commit messages (A3)
- [ ] Hook (happy, fail, edge): hooks/reply-style.mjs runs on SessionStart (startup, resume, clear, compact) and prints the whole rules/reply-style.md as additionalContext when REPLY_STYLE_ENABLED is unset, empty or true (A1)
- [ ] FlagOff (happy, fail, edge): REPLY_STYLE_ENABLED=false: the hook prints nothing and exits 0 (A2)
- [ ] FlagBad (happy, fail, edge): any other REPLY_STYLE_ENABLED value: the hook exits 2 and its message names the flag, the value and the fix (A2)
- [ ] Missing (happy, fail, edge): rules/reply-style.md missing or unreadable: the hook writes a warning to stderr and exits 0, so the session starts (A12)
- [ ] SkillLine (happy, fail, edge): every skills/*/SKILL.md has a reply-style line that links rules/reply-style.md; a test fails when a skill misses it (A1)
- [ ] Guideline (happy, fail, edge): nothing blocks or checks a reply; the rule is a guideline listed in rules/README.md (A8)
- [ ] Docs (happy, fail, edge): README Flags table has REPLY_STYLE_ENABLED; README hook list names the reply-style hook; plugin version 2.9.0 (A2)

- feature flag: REPLY_STYLE_ENABLED=true|false, default true; invalid value is a hard error (A2)
- backward compat: no existing flag, file or command changes; REPLY_STYLE_ENABLED=false gives today's session context (A2)
- non-goals: checking or blocking a reply (Q8), full ASD-STE100 dictionary (Q7), code comments and commit messages (Q3), a fixed language flag (Q9) (A8)
- verify env: [cloud] unit, fuzz and e2e of the hook in the cloud container; [ci] CI green on the PR; [nut] Nut runs one Claude Code session with the branch plugin and checks one reply (A10)
- test tiers: unit, fuzz, e2e (A10)
