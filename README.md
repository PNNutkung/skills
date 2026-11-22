# skills

Personal agent skills, installable with the [skills CLI](https://github.com/vercel-labs/skills) and listed on [skills.sh](https://skills.sh).

## Install

```bash
# list what is in this repo
npx skills add PNNutkung/skills --list

# install everything for Claude Code, globally
npx skills add PNNutkung/skills --skill '*' -a claude-code -g

# or pick one
npx skills add PNNutkung/skills --skill zero-trust-review
npx skills add PNNutkung/skills --skill definition-of-done   # its ADR (or export) feeds paired-agent-tdd and qa-sweep
npx skills add PNNutkung/skills --skill paired-agent-tdd --skill zero-trust-review   # paired-agent-tdd borrows the probes (and optionally the sandbox runner) of zero-trust-review
npx skills add PNNutkung/skills --skill qa-sweep --skill zero-trust-review --skill paired-agent-tdd   # qa-sweep borrows the mutation probe of one and the direct runner of the other
mkdir -p ~/.claude/hooks && curl -fsSL -o ~/.claude/hooks/pr-test-tiers.py https://raw.githubusercontent.com/PNNutkung/skills/main/hooks/pr-test-tiers/pr-test-tiers.py   # qa-sweep reads test tiers through it ($TIERS_PY); registering it as a hook is optional
```

Claude Code only, to also get the `zero-trust-review` guard, the `qa-guard` hook, the telemetry-capture hook, the opt-in `paired-agent-tdd` file fence, the opt-in `definition-of-done` guard and its `dod-adr-sync` hook (skills alone do not include hooks; every switch is in [Flags](#flags)). While a `qa-sweep` run is open, `qa-guard` keeps that session to adding tests: it denies edits to product code, any change that removes or rewrites an existing test line, and `git commit` / `git push`, and every deny prints the command that ends the run.

```sh
/plugin marketplace add PNNutkung/skills
/plugin install pnnutkung-skills@pnnutkung-skills
```

Two standalone hooks that are not part of the plugin. Install steps are in each README.

- [`hooks/test-name-guard`](hooks/test-name-guard) keeps added tests named `should ... when ...` (Python and TypeScript/JavaScript): by default it warns at `git commit` and denies `gh pr create` / `glab mr create` until they are renamed.
- [`hooks/pr-test-tiers`](hooks/pr-test-tiers) denies `gh pr create` / `glab mr create` unless the branch ships unit, integration and e2e tests, with real dependencies in containers and a stated reason for any mock. It also denies a change request that deletes a test, or adds a skip or an expected-failure marker, without a stated reason. It only warns at `git commit` and reminds when a test file is created.

## Skills

| Skill | What it does |
| --- | --- |
| [`definition-of-done`](skills/definition-of-done) | Step 1, before any code: grills the user in rounds (every question has a recommended answer) until nothing is left to assume, and writes `docs/dod/<slug>.json` + `.md` where every item quotes its source (a spec, the ticket or the user's answer). `dod.mjs check` refuses an unquoted item, an unaccepted assumption or an open question. Rewrites the linked ticket's description with the DoD as a checklist (official CLI first, then MCP, else a file to paste), only after the user approves the exact text, and records it as an ADR in the repo's ADR folder (each decision with its options, pros, cons and the trade-off accepted; only the ADR is committed) that `paired-agent-tdd` and `qa-sweep` read directly through `"dodFile"` or find by its `touches`, or exports it for them as before. ADR `touches` follow file moves through a pre-commit hook (`DOD_ADR_PRECOMMIT_HOOK_ENABLED=false`) and the `dod-adr-sync` hook (`DOD_ADR_TOUCHES_SYNC_ENABLED=false`). The opt-in `dod-guard` hook (`DOD_GUARD_ENABLED=true`) keeps product code untouched during the session. |
| [`paired-agent-tdd`](skills/paired-agent-tdd) | TDD as driver/navigator pairs, one pipeline per file group on a Workflow script (`graph.mjs`, `workflow.js`). Plain-code gates (`tdd.mjs`) run the tests (directly by default, in the sandbox with `plan.sandbox: true`), mutate the new code and check that tests cover the definition of done, so agents judge facts instead of claims. Every stage is a repair loop, not one shot: makers edit and re-run the real gate, navigators re-check on fresh facts, and the loop ends on a pass, on no progress, or at a round cap. `plan` proves the runner runs the repo's tests before an agent is paid (a broken environment never passes for a valid RED). One run-wide repair budget caps the spend; a group still failing is paused, and `tdd.mjs resume` writes a continue file from the gate files (no agent, no tokens) that holds a stalled group, stops a broken environment and sets the next budget, so the next run restarts only what is left. |
| [`zero-trust-review`](skills/zero-trust-review) | Strict review of a branch diff against a 30-point production-hazard checklist, tiered and cost-capped (`quick` / `standard` / `deep`, plus an opt-in `fast` for diffs that are not security-critical). Cites findings as permalinks on the review host (GitLab, GitHub, or git-only). |
| [`ai-code-delivery`](skills/ai-code-delivery) | Delivery runbook for agent-written code: feature-flag gating, trunk/leaf review depth, PR proof template, fresh-context review, 80/20 readiness gate, canary rollout. Hands the diff review to `zero-trust-review`. |
| [`qa-sweep`](skills/qa-sweep) | QA of a whole repo or one feature, no diff needed: a per-module inventory of unit, integration and e2e tests, or a feature deep-dive that derives cases from quoted requirements, proves weak tests and test gaps with mutants (`mutate.mjs`), and adds the regression tests that close them to the project's own suites. A behavior nobody wrote down becomes a question to the user. Every finding carries a proof that `findings.mjs` re-checks in plain code; what fails is reported as unverified. It only adds tests, never edits product code and never commits (the `qa-guard` hook enforces this). |
| [`branch-summary`](skills/branch-summary) | Summarizes every change on the current branch against its base (auto-detected, or passed as the argument): per-file analysis scaled to the branch size, test coverage and gaps, breaking changes, workaround detection and mermaid diagrams. Writes a self-contained HTML report to the OS temp directory, never into the repo. |

`zero-trust-review` and `paired-agent-tdd` use the same model and effort tiering policy. See `skills/zero-trust-review/tiering.md` and the tiering section of `skills/paired-agent-tdd/SKILL.md`. `qa-sweep` follows it in one session: judgment stays in the session, mechanical steps may go to a low-tier subagent.

## Flags

Set flags in the shell or in `~/.claude/settings.json` under `env`. Each skill reads only its own flags. A flag means what it says, or nothing runs: a value outside the allowed list, or an old name that is still set, stops the tool with a message that names the fix. A hook denies every tool call it guards, a CLI exits 2 (the sandbox runner 64), and the pre-commit hook stops the commit. Unset or empty means the default.

| Flag | Values | Default | What it does |
|---|---|---|---|
| `DOD_GUARD_ENABLED` | `true` \| `false` | `false` | definition-of-done guard (`hooks/dod-guard.mjs`): no product code and no unapproved ticket write while a DoD session is open |
| `DOD_ADR_PRECOMMIT_HOOK_ENABLED` | `true` \| `false` | `true` | `dod.mjs adr` installs the git pre-commit hook, and the hook makes ADR `touches` follow committed file moves |
| `DOD_ADR_TOUCHES_SYNC_ENABLED` | `true` \| `false` | `true` | `hooks/dod-adr-sync.mjs`: ADR `touches` follow the agent's `mv` and `git mv` |
| `PTDD_GUARD_ENABLED` | `true` \| `false` | `false` | paired-agent-tdd file fence (`hooks/ptdd-guard.mjs`): each subagent edits only its group's files |
| `PTDD_ADR_AUTO_FIND_ENABLED` | `true` \| `false` | `true` | with neither `dod[]` nor `dodFile` in `plan.json`, use the ADR whose `touches` cover the groups' `src` |
| `PTDD_AGENT_MAX` | a whole number above 0 \| `unlimited` | `unlimited` | most agents one paired-agent-tdd run may start |
| `PTDD_PIPELINE_MODE` | `fast` \| `paired` | `fast` | `fast`: a group with no `after` gets one tdd-driver and one navigator; `paired`: separate RED and GREEN pairs (the v2.0.0 pipeline); `plan.mode` overrides it |
| `PTDD_QUICK_DRIVER_GATE_ENABLED` | `true` \| `false` | `true` | a driver's middle GREEN gate run skips mutation; its first and last runs and the navigator's run keep it |
| `PTDD_GATE_REUSE_ENABLED` | `true` \| `false` | `true` | a navigator, and `verify`, reuse a gate result when a sha256 of the snapshot, the group's files and the gate's arguments matches (the flake check still re-runs) |
| `PTDD_COURIER_SKIP_ENABLED` | `true` \| `false` | `true` | no final courier when every fixer reports its gate ok; `tdd.mjs verify` is the check |
| `PTDD_PARALLEL_REVIEW_ENABLED` | `true` \| `false` | `true` | the integration-tester and the reviewer run at the same time; the integration test is still gated but not read by the reviewer |
| `QA_ADR_AUTO_FIND_ENABLED` | `true` \| `false` | `true` | with neither `requirements` nor `dodFile` in `findings.json`, use the ADR whose `touches` cover the files the findings name |
| `ZT_POST_GUARD_ENABLED` | `true` \| `false` | `false` | zero-trust-review posts nothing to the review host until the user approves |
| `ZT_SELF_REVIEW_GUARD_ENABLED` | `true` \| `false` | `false` | the author of a change never posts its review verdict, and a defender answers each confirmed finding (blue/red) |
| `ZT_AGENT_MAX` | a whole number above 0 \| `unlimited` | `unlimited` | most agents one zero-trust-review run may start |
| `ZT_MUTATION_BASELINE_REUSE_ENABLED` | `true` \| `false` | `true` | `mutate.mjs --baseline-from` reuses the unmutated HEAD run that `testprobe.mjs --head-out` wrote, only when it is from the same tree, command and environment, instead of running its own baseline |
| `ZT_MUTATION_BUDGET_STRICT_ENABLED` | `true` \| `false` | `true` | when the `mutate.mjs` budget runs out, mutants already running are stopped too (process trees killed, reported `skipped`), not only those not yet started |
| `ZT_TEST_PROCESS_MAX` | a whole number above 0 \| `unlimited` | `unlimited` | most test commands one gate runs at once: a `testprobe.mjs` or `mutate.mjs` run, or one paired-agent-tdd gate as a whole (`red`, `green` with its test probe, mutation probe and coverage, `final`); `green` splits the cap between its probes, or runs them one after the other when it is too small to split |
| `ZT_SANDBOX_MODE` | `auto` \| `none` \| `seatbelt` \| `bwrap` \| `docker` | `auto` | which sandbox `sandbox-run.mjs` uses: `auto` takes the first that works, a name forces that one (or exit 86), `none` pretends there is none |

`true`, `false`, `unlimited` and mode names are read in any case. Old names stop the tool until they are unset: `DOD_GUARD`, `PTDD_GUARD`, `PTDD_AGENT_CAP`, `ZT_POST_GUARD`, `ZT_SELF_REVIEW_GUARD`, `ZT_AGENT_CAP`, `ZT_SANDBOX_FORCE`.

## Requirements

- macOS or Linux. On Windows, run the skills and hooks inside WSL; native Windows is not supported yet (the scripts call `tar`, `sh` and Unix process groups, and the sandbox has no Windows backend).
- Node 22+ (`graph.mjs`, workflow tests, `sandbox-run.mjs`, `testprobe.mjs`) and Python 3 (`triage.py`).
- `zero-trust-review` states no guess as a fact: findings quote real code, claims carry a proof (code `file:line`, a sandbox run, or real logs/metrics/traces), and `proofcheck.mjs` re-verifies them in plain code. It runs change-request code only inside a sandbox (macOS `sandbox-exec`, Linux `bwrap`, or docker via `ZT_SANDBOX_IMAGE`); with none, probes report `unverifiable` and never run bare.
- `zero-trust-review` works on any git repo. To read change-request metadata and post comments it uses the host CLI: [`glab`](https://gitlab.com/gitlab-org/cli) for GitLab or [`gh`](https://cli.github.com) for GitHub (per-host commands in `skills/zero-trust-review/hosts.md`); without one it runs git-only and writes the report only. Its Step 0 reads the skill location from `SK` (default `~/.claude/skills/zero-trust-review`); set `SK` if the CLI installed it elsewhere.
- `definition-of-done` needs Node 22+ and git. It writes the ticket with an official CLI (`gh`, `glab`, `acli`) when one is on PATH, a third-party one (`jira`, `linear`) only after you trust it on that machine (`dod.mjs trust`, kept in `~/.config/definition-of-done`), otherwise an MCP connector, otherwise it leaves `docs/dod/<slug>.ticket.md` for you to paste.
- `branch-summary` needs Node 22+ to build its HTML report (`build-report.mjs`); the report page loads `marked`, `DOMPurify` and `mermaid` from a CDN.
- `paired-agent-tdd` needs the Workflow tool (per-node model, effort and agent type), git, Node 22+ and the sibling `zero-trust-review` skill (its mutation probe, `proofcheck.mjs` and, only with `plan.sandbox: true`, its sandbox runner; `ZT_DIR` points elsewhere).
- `qa-sweep` needs Node 22+, Python 3, git and two sibling skills: `zero-trust-review` (its mutation probe, run folder and, only when asked, its sandbox runner; `ZT_DIR` points elsewhere) and `paired-agent-tdd` (its `direct-run.mjs`; `PTDD_DIR` points elsewhere). Its repo inventory, tier lists and test-file checks use `hooks/pr-test-tiers/pr-test-tiers.py` (`TIERS_PY` points at it; default `~/.claude/hooks/pr-test-tiers.py`). It runs tests directly, with your rights and network, and runs e2e tests only against a local app unless you confirm the exact URL in that run. The `qa-guard` hook comes with the plugin install.

## Tests

```bash
git ls-files -z '*.test.mjs' | xargs -0 node --test
```

CI runs the same command on every pull request: Node 22, 24 and 26 (the three newest LTS majors) on Ubuntu and macOS, Node 24 from asdf shims, and Node 24 in WSL on Windows. Sandbox tests run through sandbox-exec on macOS and bwrap on Linux, and skip where neither is installed.

## Telemetry

The skills CLI sends anonymous install telemetry, which is how skills.sh builds its leaderboard. Set `DISABLE_TELEMETRY=1` to opt out.
