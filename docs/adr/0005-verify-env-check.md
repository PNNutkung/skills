---
touches:
  - "skills/dev-workflow/**"
  - "README.md"
  - ".claude-plugin/*.json"
  - "docs/**"
dod: verify-env-check
---
# 5. Verify env check

Date: 2026-11-24
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

ADR 0004 (A12, item Verify) says verify evidence must come "from the DoD's verify env", but `checkVerify` only checks that each section's `env:` is not empty. The booked verify env is free text that often names several places (cloud, CI, Nut's WSL), so a skipped or wrong environment passes the gate unnoticed. This follow-up of PR #25 makes the gate compare the two. No ticket: the ADR and the PR carry it (A10).

## Decision

### A1: How does the gate compare verify.md env: with the DoD's booked verify env (free text today)?

Context: checkVerify only checks env: is non-empty (skills/dev-workflow/check.mjs:117); booked envs are prose with several places (docs/adr/0002-ptdd-speed.md:450, docs/adr/0004-dev-workflow.md:449)
Options considered (the agent's analysis when the question was asked):
- (A) named envs: the grill books short names in brackets inside the verify env value, e.g. "[cloud] fixture e2e; [ci] CI green; [nut-wsl] one real run"; each verify.md env: must start with one of those names
  - pro: exact and testable, no guessing
  - pro: no change to definition-of-done code: the names live in the existing text value
  - con: a new writing convention to learn
  - con: ADRs written before this have no names
- (B) fuzzy word match: env: passes when it shares a meaningful word with the verify env line
  - pro: no new convention, works on old ADRs
  - con: false pass ("cloud" matches "cloud staging") and false fail on synonyms
- (C) a new DoD JSON field verifyEnv.envs: ["cloud","ci"], rendered into the ADR
  - pro: structured data
  - con: changes definition-of-done code and the ADR format (another skill), bigger change
Recommended: A, exact and stays inside dev-workflow
Answer: A (named envs: the grill books short names in brackets inside the verify env value, e.g. "[cloud] fixture e2e; [ci] CI green; [nut-wsl] one real run"; each verify.md env: must start with one of those names)
Trade-off accepted: a new writing convention to learn; ADRs written before this have no names

### A2: What happens on a mismatch?

Context: A12 says evidence must come from the DoD's verify env (docs/adr/0004-dev-workflow.md:442) but nothing enforces it
Options considered (the agent's analysis when the question was asked):
- (A) fail: the verify gate stays closed (exit 1) and names the item, its env and the booked names; the way out is the user's answer, result: accepted A<n>, or fixing the run
  - pro: A12 is really enforced
  - con: one more round when the env changed for a good reason
- (B) warn: next passes, the JSON lists warnings
  - pro: never blocks
  - con: easy to ignore, A12 still not enforced
- (C) a mode flag WORKFLOW_VERIFY_ENV_MODE=fail|warn|off
  - pro: each user picks
  - con: more flag surface and tests for three modes
Recommended: A, with an on/off flag to turn the check off
Answer: A (ปิดได้ด้วย flag ใน Q6)
Trade-off accepted: none recorded (the answer picks no single option)

### A3: Must every booked env be used by at least one passing item?

Context: docs/adr/0002-ptdd-speed.md:450 booked a run on Nut's WSL besides the cloud; nothing checks it happened
Options considered (the agent's analysis when the question was asked):
- (A) yes: a booked name that no passing item used fails the gate
  - pro: catches a skipped env (for example the WSL run)
  - con: an env that covers a small part still needs one item with that env
- (B) no: only check each item's env is in the booked list
  - pro: simpler
  - con: a booked env can be skipped silently
Recommended: A, the skipped-env case is the real risk
Answer: A (yes: a booked name that no passing item used fails the gate)
Trade-off accepted: an env that covers a small part still needs one item with that env

### A4: ADRs with no bracketed names (written before this change)?

Context: ADRs 0001-0004 have prose only (docs/adr/0004-dev-workflow.md:449)
Options considered (the agent's analysis when the question was asked):
- (A) skip the comparison and add a warning "no env names booked" to the JSON
  - pro: nothing in flight breaks (backward compatible)
  - con: old runs are not checked
- (B) fail until names are added to the ADR
  - pro: strict everywhere
  - con: breaks runs whose ADR is already committed
Recommended: A, backward compatible
Answer: A (skip the comparison and add a warning "no env names booked" to the JSON)
Trade-off accepted: old runs are not checked

### A5: Does the gate detect the machine it runs on, or trust the env: text?

Context: verify runs can happen on Nut's machine through Remote Control while workflow.mjs next runs in the cloud session
Options considered (the agent's analysis when the question was asked):
- (A) trust the env: text the agent writes; no host detection
  - pro: works when evidence comes from another machine
  - con: the text can be wrong
- (B) also detect the host (OS, WSL, CI, container) and compare with the name
  - pro: harder to write a wrong env
  - con: the gate's host is often not where the evidence ran, so false fails; needs a name-to-host map
Recommended: A, B as a non-goal
Answer: A (ให้ B เป็น non-goal)
Trade-off accepted: none recorded (the answer picks no single option)

### A6: Feature flag?

Context: dev-workflow owns its flags (skills/dev-workflow/flags.mjs:21-26); new flags default on (Nut's rule)
Options considered (the agent's analysis when the question was asked):
- (A) WORKFLOW_VERIFY_ENV_CHECK_ENABLED=true|false, default true; false = today's behavior
  - pro: follows the naming rule and default-on rule
  - con: new runs with named envs are checked right away
- (B) same name, default false
  - pro: zero change until turned on
  - con: breaks the default-on rule
Recommended: A
Answer: A (WORKFLOW_VERIFY_ENV_CHECK_ENABLED=true|false, default true; false = today's behavior)
Trade-off accepted: new runs with named envs are checked right away

### A7: Verify environment and test tiers for this work?

Context: the change is pure code in dev-workflow; no user machine needed
Options considered (the agent's analysis when the question was asked):
- (A) [cloud] cloud container: e2e on a fixture repo with the flag default/true/false plus this run's own verify doc (dogfood); [ci] CI green. Tiers: unit, fuzz, integration, e2e
  - pro: all reachable from here
  - con: not run on Nut's machine
- (B) A plus [nut-wsl] one run on Nut's WSL
  - pro: real machine
  - con: needs Nut's computer online
Recommended: A
Answer: A ([cloud] cloud container: e2e on a fixture repo with the flag default/true/false plus this run's own verify doc (dogfood); [ci] CI green. Tiers: unit, fuzz, integration, e2e)
Trade-off accepted: not run on Nut's machine

### A8: What does the change cover (touches) and what is out?

Context: step 1 text in skills/dev-workflow/SKILL.md:52 already says book the verify env
Options considered (the agent's analysis when the question was asked):
- (A) touches skills/dev-workflow/**, README.md (Flags row), docs/**, plugin version 2.4.0; the naming hint goes in dev-workflow SKILL.md step 1 and 5 only. Non-goals: per-item env booking, host detection, any definition-of-done code change
  - pro: one skill, additive
  - con: someone using definition-of-done alone will not learn the bracket names
- (B) A plus one line in skills/definition-of-done/SKILL.md about bracket names
  - pro: both skills say it
  - con: touches another skill's text
Recommended: A
Answer: A (touches skills/dev-workflow/**, README.md (Flags row), docs/**, plugin version 2.4.0; the naming hint goes in dev-workflow SKILL.md step 1 and 5 only. Non-goals: per-item env booking, host detection, any definition-of-done code change)
Trade-off accepted: someone using definition-of-done alone will not learn the bracket names

### A9: Is this DoD (8 items + 5 required sections) right?

Context: dod.mjs check passes (8 items); /mnt/project-files/verify-env-check/dod.md
Options considered (the agent's analysis when the question was asked):
- (A) approve as written
  - pro: next step is the concept board
  - con: none known
- (B) change something (say what)
  - pro: matches what you want
  - con: one more round
Recommended: A
Answer: A (approve as written)
Trade-off accepted: none known

### A10: Ticket for this work?

Context: no GitHub issue exists for this follow-up; PR #25 used ADR + PR only
Options considered (the agent's analysis when the question was asked):
- (A) no ticket: the ADR and the PR carry it
  - pro: no extra write outside the repo
  - con: nothing on the issue list
- (B) open a GitHub issue first
  - pro: tracked on the issue list
  - con: one more thing to keep in sync
Recommended: A
Answer: A (no ticket: the ADR and the PR carry it)
Trade-off accepted: nothing on the issue list

### A11: Which design for the env check?

Context: concept board; checkVerify is pure in check.mjs:102, io.mjs:132 calls it, steps.mjs gate/tick/inferStep read ev.verify
Options considered (the agent's analysis when the question was asked):
- (A) inside checkVerify: pure bookedEnvs(adr) + checkVerify(md, items, answers, {booked})
  - pro: one verify result: next, tick and resume all see env errors
  - pro: fits pure core + IO, tests stay pure
  - con: checkVerify gets a 4th argument and grows about 25 lines
- (B) separate gate checkVerifyEnv(md, booked) as evidence.verifyEnv
  - pro: small focused function, checkVerify untouched
  - con: three callers must combine two results; missing one resumes past a mismatch
Recommended: A
Answer: A (inside checkVerify: pure bookedEnvs(adr) + checkVerify(md, items, answers, {booked}))
Trade-off accepted: checkVerify gets a 4th argument and grows about 25 lines

## Consequences

Trade-offs we accepted:

- A1: a new writing convention to learn; ADRs written before this have no names
- A3: an env that covers a small part still needs one item with that env
- A4: old runs are not checked
- A6: new runs with named envs are checked right away
- A7: not run on Nut's machine
- A8: someone using definition-of-done alone will not learn the bracket names
- A9: none known
- A10: nothing on the issue list
- A11: checkVerify gets a 4th argument and grows about 25 lines

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:01c63a4a9a5504f2 -->

- [ ] EnvNames (happy, fail, edge): the verify env value in the DoD may book short env names in square brackets (e.g. "[cloud] fixture e2e; [ci] CI green"); the gate reads the names from the ADR's '- verify env:' line (A1)
- [ ] EnvMatch (happy, fail, edge): with names booked, every verify.md section with result: pass must have an env: that starts with one of the booked names (case-insensitive); otherwise that item fails the verify gate (A1)
- [ ] Mismatch (happy, fail, edge): a mismatch keeps the verify gate closed (workflow.mjs next exit 1) and the error names the item, its env: and the booked names; the item passes again only after a rerun in a booked env or the user's answer (result: accepted A<n>) (A2)
- [ ] EnvCoverage (happy, fail, edge): every booked name must be used by at least one item with result: pass; a booked name no passing item used fails the gate and is named in the error (A3)
- [ ] NoNames (happy, fail, edge): when the ADR's verify env books no bracketed names (or there is no verify env line), the comparison is skipped and the verify JSON carries the warning 'no env names booked'; the gate behaves as before (A4)
- [ ] TrustText (happy, fail, edge): the gate compares the env: text only; it does not detect the machine it runs on (A5)
- [ ] Flag (happy, fail, edge): WORKFLOW_VERIFY_ENV_CHECK_ENABLED=true|false, default true; false skips EnvMatch, EnvCoverage and NoNames (today's behavior); an invalid value is a hard error (exit 2) (A6)
- [ ] Docs (happy, fail, edge): dev-workflow SKILL.md step 1 says to book bracketed env names in the verify env, and step 5 says env: starts with a booked name; README Flags table has a WORKFLOW_VERIFY_ENV_CHECK_ENABLED row (A8)

- feature flag: WORKFLOW_VERIFY_ENV_CHECK_ENABLED, true|false, default true (README Flags row); false = today's behavior; invalid value is a hard error (A6)
- backward compat: additive: ADRs without bracketed names behave as before (warning only); flag false restores today's behavior; definition-of-done code unchanged; next free plugin minor at bump time (A4)
- non-goals: per-item env booking, host detection, definition-of-done code changes (A8)
- verify env: [cloud] cloud container: e2e on a fixture repo with WORKFLOW_VERIFY_ENV_CHECK_ENABLED unset/true/false, plus this run's own verify doc (dogfood); [ci] CI green (A7)
- test tiers: unit, fuzz, integration, e2e (A7)
