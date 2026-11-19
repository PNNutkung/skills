# qa-sweep: design

Date: 2026-11-19. Status: approved.

Terms in bold are defined in [`GLOSSARY.md`](../../../GLOSSARY.md): **requirement**, **defect**, **weak test**, **test gap**, **test tier**, **rule**, **hook**.

## Intent

A QA skill that finds defects, weak tests and test gaps in an application, and writes the regression tests that close them, so that a project ends up with unit, integration and e2e tests that pin its real requirements.

It is a separate skill because putting testing detail into `zero-trust-review` would bloat that skill, and a bloated skill makes agents guess. The siblings are scoped to a branch diff (`branch-summary` coverage gaps, `zero-trust-review` test probes, `paired-agent-tdd` DoD tests); `qa-sweep` works on a whole repo or a whole feature, with no diff required.

## Goals

- Report, per module, which **test tiers** exist (repo inventory).
- For one feature (a path or a ticket), derive test cases from its requirements, map each case to the tests that check it, and report every defect, weak test and test gap with a proof.
- Write a regression test for each test gap and weak test, in the right tier, inside the project's existing test folders, so the existing CI runs it.
- Write a failing test that reproduces each defect, and report it.
- Work on any repo. App-specific knowledge comes from the app's own repo (its `GLOSSARY.md`, specs, ADRs, README, test layout).

## Non-goals

- No diff scope: `branch-summary` and `zero-trust-review` cover diffs.
- No fixing of product code. A defect goes to the user or to `paired-agent-tdd`, where the failing test is already its RED step.
- No separate regression suite. Tests go into the existing suites.
- No test-framework installation. A missing tier is reported as the top test gap with a proposed setup; nothing is installed until the user approves the tool.
- No commits. The skill writes and runs tests; the user reviews and commits.

## Anti-goals (failure even if it "works")

- A finding stated without a proof. A finding whose proof does not check out in plain code is not reported as a finding; it is listed as "unverified".
- A behavior pinned by a test when nobody stated it. Today's defect must never become tomorrow's regression test.
- Writing junk data into production while exploring a running app.
- Changing or removing a line of an existing test, or editing product code. The checker must not become the maker; it only adds.
- One large `SKILL.md` that the agent must hold in full to do any part of the job.

## Constraints

- **Rules guide, hooks enforce.** Anything that must hold is enforced by a hook or by a plain-code gate inside the skill's own scripts. Text in `SKILL.md` or the mode files is guidance only.
- **Never assume, ask.** A behavior with no written source becomes a numbered question to the user. The answer is quoted as the requirement. An unanswered question means no test is written; the report lists it as "unconfirmed". Unclear wording in a spec or ticket is also a question, never a guess.
- **Facts come from code.** Scripts produce every fact (tier inventory, mutants, test runs, proof checks); the agent reads and judges them.
- **Backward compatible** changes to sibling code: new flags and subcommands only, defaults unchanged.
- Node 18+ and Python 3, like the siblings. No new dependencies.
- The skill follows the model and effort tiering policy in `skills/zero-trust-review/tiering.md`, adapted to one session (author's call): judgment (requirements, questions to the user, judging survivors, writing tests) stays in the session; mechanical steps (running the inventory and the scripts, file reads, searches) may go to a low-tier subagent. With no workflow nodes there is no `graph.mjs --check`; this is guidance in `SKILL.md` only.
- The repo is public on skills.sh: no company-internal names, hosts or tools are built in.

## Approaches

- **A. Script-backed skill run in the user's session (chosen).** A short router `SKILL.md`, one file per mode, and plain-code scripts that produce the facts. The session is the one agent. Chosen because "ask the user" works best where the user already is, and because anti-hallucination comes from proofs checked in code, not from more agents. Costs: a big feature deep-dive fills one context; no second agent cross-checks (the proof checker does that job in code).
- **B. Workflow-orchestrated, like `zero-trust-review` and `paired-agent-tdd`.** Parallel per-mode finder agents, a writer per tier, an independent verifier, per-node model tiering. Not chosen: roughly 3 to 5 times the code, it needs the Workflow tool, and subagents cannot ask the user, so every question would mean stopping the run and resuming it.
- Dropped earlier: one large `SKILL.md` (the bloat this skill exists to avoid); three separate skills (shared steps copied three times); handing test writing to `paired-agent-tdd` (its RED gate expects a new test to fail first, but a regression test for correct existing code passes at once).
- **Split rule.** A mode moves into its own skill when it is used on its own, or when its file grows past about 300 lines. If feature deep-dives prove too big for one context, the deep-dive is the part that moves, and that is where approach B would go.

## Design

### Layout

```
skills/qa-sweep/
  SKILL.md          router: pick the scope and the modes, the proof rule, ask-don't-assume. Under ~100 lines.
  requirements.md   mode C: requirement sources, asking the user, case design, pairwise
  code.md           mode B: map cases to tests, find weak tests and test gaps with mutants, write tests
  running-app.md    mode A: start the app, the target guard, explore through the project's e2e runner
  run.mjs           + run.test.mjs: start / end a run (marker with session_id and repo root), refresh on each script call
  pairwise.mjs      + pairwise.test.mjs
  findings.mjs      + findings.test.mjs
hooks/pr-test-tiers/pr-test-tiers.py   + `inventory` subcommand, + removed-test check
hooks/qa-guard.mjs                     + qa-guard.test.mjs, entry in hooks/hooks.json
skills/zero-trust-review/mutate.mjs    + optional whole-file mode
```

The agent reads `SKILL.md`, then only the mode files the run needs.

### Scopes

1. **Repo inventory.** `pr-test-tiers.py inventory --root DIR` prints JSON: for each module, the tiers that have at least one test file, with counts. It reuses `is_test`, `tier_of` and the per-repo config (`load_cfg`), so the hook and the skill share one definition of a tier. A module is a top-level source directory by default (`--depth N` for monorepos). A test file whose module cannot be inferred from its path is listed as `unmapped`, never silently counted. No agent work beyond reading the JSON.
2. **Feature deep-dive.** Input is a path or a ticket. Ticket text comes from the host CLI (`gh issue view`, `glab issue view`) or is pasted by the user; it is quoted verbatim. Modes C, B and A run here, in that order, each optional.

### Mode C: requirements and case design (`requirements.md`)

- Sources, in order: spec files in the repo (docs, specs, ADRs, `GLOSSARY.md`), the ticket, the user's answers.
- Each requirement is recorded as `{id, text, source: {kind: spec|ticket|user, ref, quote}}`. `ref` is `file:line` for a repo file, the ticket URL for a ticket, or the answer number for the user.
- Behaviors found in the code or the ticket with no written source, and unclear wording, go to the user as one batch of numbered questions, each with the agent's reading of the current behavior, so the user can answer "yes" or correct it. Answers are saved verbatim, with the time, in the run folder (`answers.md`).
- From each requirement the agent derives cases: equivalence classes, boundaries, state transitions and error paths. Each case is `{id, requirement, inputs, expected, tier}`.
- When a requirement depends on several inputs or states, `pairwise.mjs` generates the input sets: every pair of values by default, every combination when the full product is 50 cases or fewer. The threshold is a named constant.

### Mode B: code and tests (`code.md`)

- For each case the agent names the implementing code (`file:line` range) and the tests that check it.
- **Mutation is the proof.** `mutate.mjs` mutates the implementing lines and runs tests against each mutant:
  - mapped tests exist and some mutant survives them: a **weak test**;
  - no test maps, and mutants survive the module's whole tier: a **test gap**;
  - an equivalent mutant (one that cannot change behavior) also survives, so the agent judges each survivor before filing it, as `zero-trust-review` already does.
- **Writing tests.** For each test gap and weak test, the agent adds a new test, either as a new case in an existing test file or as a new file in the project's existing test folder for the case's tier, following the project's naming rule and patterns. It only adds lines: it never changes or removes a line of an existing test (`qa-guard` enforces this). A new test must pass on HEAD and must kill the mutant that proved the gap; `findings.mjs` checks both from the run ledger. A new test that fails on HEAD is not a gap test: it is a candidate defect and goes through the defect check.
- **Defects.** A test that encodes a requirement and fails on HEAD with an assertion failure (not an import, collection or setup error) proves a defect. It is kept in the suite with the framework's strict expected-failure marker (`pytest.mark.xfail(strict=True)`, `test.fails` in Vitest, `test.fail` in Playwright) and a reason naming the defect, so CI stays green and the test flips to failing the day the defect is fixed. Frameworks with no strict expected-failure marker: the test is left in the run folder, not the suite, and the report gives its path.
- **Tier choice.** The lowest tier that can observe the behavior: unit for logic, integration when the behavior depends on a real dependency, e2e when it is only visible through the public interface. Integration and e2e tests follow the container-first rule that `pr-test-tiers` already checks.

### Mode A: running app (`running-app.md`)

- The app is started the way the project documents (README, Makefile, docker compose). If the project documents no way, the agent asks the user.
- Exploration goes through the project's own e2e runner, not a browser-automation tool. Exploratory specs live in the run folder or are deleted before the run ends; only regression tests stay in the repo.
- **Target guard (a gate in code).** The script that launches exploration refuses any base URL whose host is not local (`localhost`, `127.0.0.1`, `::1`, a docker compose service name) unless it is passed `--confirm-target <url>`, and the agent passes it only after the user says yes in this run. A production URL is never confirmed by default.
- **E2E proofs.** Restarting the app for every mutant is slow and flaky, so the e2e tier proves things differently:
  - **e2e test gap:** one run of the existing e2e suite with server-side coverage on. Implementing lines that never execute prove that no e2e test reaches the behavior. The coverage tool must already be in the project; if none is, the gap is listed as "unverified" with its requirement quote and a proposed tool, and nothing is installed without the user's yes.
  - **e2e weak test:** not hunted by default. The user can opt in per run, accepting an app restart for every mutant.
  - **e2e defect:** a failing e2e run. Its regression test is an e2e test, handled as in mode B.

### Proofs and the report (`findings.mjs`)

- Every finding carries `proof {mode, ref, quote, command?, exit?}`, the same shape as `zero-trust-review`.
  - Test gap: the requirement's source quote, plus the surviving-mutant ledger line (unit and integration tiers) or the coverage run showing the implementing lines never ran (e2e tier).
  - Weak test: the mapped test's `file:line`, plus the surviving-mutant ledger line.
  - Defect: the failing run's ledger entry and the assertion message, quoted.
  - A regression test written by the skill: its passing run, plus the killed-mutant ledger line.
- `findings.mjs` re-checks every proof in plain code: quotes against the file at HEAD, run entries against the run ledger, which it reads with `runctx.mjs`'s trusted-ledger checks. It accepts ledger entries from `direct-run.mjs` (`backend: 'direct'`). `proofcheck.mjs` rejects those by design (it guards untrusted change-request code), so `proofcheck.mjs` stays unchanged and `findings.mjs` does its own check, reusing helpers from `runctx.mjs` and `probelib.mjs`.
- The report is markdown in the OS temp directory, in sections: inventory, requirements (with their sources), defects, weak tests, test gaps, tests written, **unverified** (findings whose proof failed), **unconfirmed** (questions not answered). Nothing found is dropped without appearing in one of these sections.

### Running tests

- Directly by default, through `direct-run.mjs` (the user's own rights and network), the same as `paired-agent-tdd`. Sandbox opt-in through `zero-trust-review`'s `sandbox-run.mjs`. `mutate.mjs` already takes `--runner PATH`.
- Dependencies: the sibling `zero-trust-review` skill (mutation, sandbox, `runctx.mjs`), found through `ZT_DIR` like `paired-agent-tdd`. `direct-run.mjs` comes from `paired-agent-tdd`; see "Left to the builder".

### Change to `zero-trust-review/mutate.mjs`

An optional whole-file mode (for example `--files a.py:10-40,b.py`): mutate the named files or line ranges instead of the lines changed in `base...head`. `generateMutants(path, text, lines)` (`mutants.mjs:96`) already accepts any line list. Without the new flag, behavior is unchanged. Covered by new cases in `mutate.test.mjs`.

### Guardrail: removed-test check in `pr-test-tiers`

A change request that removes protection from an existing test is denied at `gh pr create` / `glab mr create` and gets a warning at `git commit`, through the hook's existing deny and context paths. It counts:

- a deleted test file (`is_test`), where renames are detected and not counted;
- a test function whose name is removed and not re-added anywhere in the diff: Python (`def test_…`, `async def test_…`) and TS/JS (`it(…)`, `test(…)`), the languages `test-name-guard` covers;
- an added skip: `.skip(`, `xit(`, `xdescribe(`, `xtest(`, `@pytest.mark.skip`, `pytest.skip(`, `@unittest.skip`, `t.Skip(`, `@Disabled`, `@Ignore`.

A reason clears it:

- for a skip, a `skip-reason: <reason>` comment on the same or the previous line, in any comment syntax, like the existing `no-container: <reason>` marker;
- for a deleted file or function, a commit trailer on the branch: `Test-Removed: <path>: <reason>`.

The escape hatch `PR_TEST_TIERS=off` still works. `self_test()` and the hook's README gain cases for all three, including a rename that must pass.

### Guardrail: `qa-guard` hook

The "adds tests only, never edits product code, never commits" behavior is the core of the checker-not-maker split, and rules only guide, so it gets a hook. `hooks/qa-guard.mjs`, PreToolUse on `Edit|Write|Bash`, listed in `hooks/hooks.json`. While a run is active it:

- denies Edit and Write to a file that is not a test file and is not in the run folder;
- denies a change to an existing test file that is not purely additive: for Edit, `new_string` must contain `old_string` unchanged; for a Write to an existing file, every old line must remain, in order;
- denies `git commit` and `git push`.

File writes through Bash (`sed -i`, `>` redirects) are caught on a best-effort basis. Like `zt-guard.mjs`, the hook catches agent mistakes, not a determined attacker.

Unlike `zt-guard.mjs`, which only restricts subagents, this hook restricts the main session, because approach A runs there. So it must never lock the user out:

- **Explicit start and end.** `run.mjs start` writes the run marker; `run.mjs end` removes it. The skill's last step (writing the report) always calls `end`, and so does any stop the user asks for.
- **The way out is always open.** The hook never denies `run.mjs end`, and every deny message names the run and prints the exact end command, so a user who wants out tells Claude "end the QA run" and it runs.
- **Scoped to one session and one repo.** The marker records the `session_id` from the hook input and the repo root. The hook is active only when both match, so another session, a new session after a crash, or work in another repo is never affected. A hook input with no `session_id` counts as no match.
- **Short idle expiry.** Every `qa-sweep` script call refreshes the marker. With no script call for 2 hours (a named constant), the marker is stale and the hook is inactive; `run.mjs start` replaces a stale marker.
- **Only Claude's tool calls.** A hook sees only actions Claude takes. The user's own editor and terminal are never touched.
- **Fail-open.** Any internal error or an untrusted marker (wrong owner, symlink, group- or world-writable, the same checks as `runctx.mjs`) means the hook allows the action and logs the error, like `zt-guard.mjs`.

`self_test` cases: a matching run denies a product-code edit, a non-additive test edit and a commit; an additive test edit is allowed; `run.mjs end` is allowed during a run; no `session_id`, another `session_id`, another repo and a stale marker are all inactive; an internal error allows.

## Decided by the user

Separate skill; all three modes; generic; the three finding terms; rules guide and hooks enforce; one skill with a router and mode files, split when needed; proof required, "unverified" for the rest; pairwise by default, full product at 50 or fewer; ask, never assume; regression tests in the existing suites; defects reported, not fixed; two scopes; a missing tier is reported, not installed; direct runs, sandbox opt-in; the removed-test check in `pr-test-tiers` with both reason forms; non-local targets need the user's yes on each run; approach A; tests may be appended to existing test files, additions only, enforced by `qa-guard`; `qa-guard` ships in this build, scoped to the run's session and repo, with an end command that is never blocked; e2e test gaps are proven by one coverage run, and e2e weak tests are opt-in.

## Calls made by the author, for review

1. A weak test gets a new test that kills the surviving mutant; the weak test itself is left as it is.
2. It does not commit.
3. Unclear spec wording is a question, not a guess.
4. `pairwise.mjs` is a small plain-code generator with its own test; no dependency.
5. It follows `tiering.md`.
6. Mode A starts the app the way the project documents, else it asks.
7. A defect's failing test stays in the suite under a strict expected-failure marker, so CI stays green and the test flips when the defect is fixed.
8. Mutation is the proof of a unit or integration test gap; a text search alone is not enough.
9. `findings.mjs` checks proofs itself; `proofcheck.mjs` is unchanged.
10. `qa-guard`'s idle expiry is 2 hours, and its run is opened and closed by `run.mjs start` / `run.mjs end`.
11. Tiering in one session: judgment stays in the session; mechanical steps may go to a low-tier subagent.

## Left to the builder

- Where `direct-run.mjs` lives for `qa-sweep`: reference `paired-agent-tdd`'s copy through an env path like `ZT_DIR`, or move it into `zero-trust-review` and leave a re-export for `paired-agent-tdd`. No copy-paste.
- How `inventory` maps a test path to a module (stripping test-directory and tier tokens, matching source directory names), as long as unmapped tests are listed.
- The JSON shapes of the requirement, case and finding records, and the run-folder layout, following `zero-trust-review`'s run folder conventions.
- The exact pairwise algorithm (greedy is enough).
- Detecting a same-file test rename with an identical body, so it does not count as a removal.
- Evals (`evals.json`), like the siblings.
- Registration, like the siblings: the README skills table and requirements, the plugin manifest if it lists skills, and `hooks/hooks.json` for any new hook.
