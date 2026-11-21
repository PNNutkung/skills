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
npx skills add PNNutkung/skills --skill paired-agent-tdd --skill zero-trust-review   # paired-agent-tdd borrows the probes (and optionally the sandbox runner) of zero-trust-review
npx skills add PNNutkung/skills --skill qa-sweep --skill zero-trust-review --skill paired-agent-tdd   # qa-sweep borrows the mutation probe of one and the direct runner of the other
mkdir -p ~/.claude/hooks && curl -fsSL -o ~/.claude/hooks/pr-test-tiers.py https://raw.githubusercontent.com/PNNutkung/skills/main/hooks/pr-test-tiers/pr-test-tiers.py   # qa-sweep reads test tiers through it ($TIERS_PY); registering it as a hook is optional
```

Claude Code only, to also get the `zero-trust-review` guard, the `qa-guard` hook, the telemetry-capture hook and the opt-in `paired-agent-tdd` file fence (`PTDD_GUARD=1`; skills alone do not include hooks). While a `qa-sweep` run is open, `qa-guard` keeps that session to adding tests: it denies edits to product code, any change that removes or rewrites an existing test line, and `git commit` / `git push`, and every deny prints the command that ends the run.

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
| [`paired-agent-tdd`](skills/paired-agent-tdd) | TDD as driver/navigator pairs, one pipeline per file group on a Workflow script (`graph.mjs`, `workflow.js`). Plain-code gates (`tdd.mjs`) run the tests (directly by default, in the sandbox with `plan.sandbox: true`), mutate the new code and check that tests cover the definition of done, so agents judge facts instead of claims. Every stage is a repair loop, not one shot: makers edit and re-run the real gate, navigators re-check on fresh facts, and the loop ends on a pass, on no progress, or at a round cap. `plan` proves the runner runs the repo's tests before an agent is paid (a broken environment never passes for a valid RED). One run-wide repair budget caps the spend; a group still failing is paused, and `tdd.mjs resume` writes a continue file from the gate files (no agent, no tokens) that holds a stalled group, stops a broken environment and sets the next budget, so the next run restarts only what is left. |
| [`zero-trust-review`](skills/zero-trust-review) | Strict review of a branch diff against a 30-point production-hazard checklist, tiered and cost-capped (`quick` / `standard` / `deep`, plus an opt-in `fast` for diffs that are not security-critical). Cites findings as permalinks on the review host (GitLab, GitHub, or git-only). |
| [`ai-code-delivery`](skills/ai-code-delivery) | Delivery runbook for agent-written code: feature-flag gating, trunk/leaf review depth, PR proof template, fresh-context review, 80/20 readiness gate, canary rollout. Hands the diff review to `zero-trust-review`. |
| [`qa-sweep`](skills/qa-sweep) | QA of a whole repo or one feature, no diff needed: a per-module inventory of unit, integration and e2e tests, or a feature deep-dive that derives cases from quoted requirements, proves weak tests and test gaps with mutants (`mutate.mjs`), and adds the regression tests that close them to the project's own suites. A behavior nobody wrote down becomes a question to the user. Every finding carries a proof that `findings.mjs` re-checks in plain code; what fails is reported as unverified. It only adds tests, never edits product code and never commits (the `qa-guard` hook enforces this). |
| [`branch-summary`](skills/branch-summary) | Summarizes every change on the current branch against its base (auto-detected, or passed as the argument): per-file analysis scaled to the branch size, test coverage and gaps, breaking changes, workaround detection and mermaid diagrams. Writes a self-contained HTML report to the OS temp directory, never into the repo. |

`zero-trust-review` and `paired-agent-tdd` use the same model and effort tiering policy. See `skills/zero-trust-review/tiering.md` and the tiering section of `skills/paired-agent-tdd/SKILL.md`. `qa-sweep` follows it in one session: judgment stays in the session, mechanical steps may go to a low-tier subagent.

## Requirements

- macOS or Linux. On Windows, run the skills and hooks inside WSL; native Windows is not supported yet (the scripts call `tar`, `sh` and Unix process groups, and the sandbox has no Windows backend).
- Node 22+ (`graph.mjs`, workflow tests, `sandbox-run.mjs`, `testprobe.mjs`) and Python 3 (`triage.py`).
- `zero-trust-review` states no guess as a fact: findings quote real code, claims carry a proof (code `file:line`, a sandbox run, or real logs/metrics/traces), and `proofcheck.mjs` re-verifies them in plain code. It runs change-request code only inside a sandbox (macOS `sandbox-exec`, Linux `bwrap`, or docker via `ZT_SANDBOX_IMAGE`); with none, probes report `unverifiable` and never run bare.
- `zero-trust-review` works on any git repo. To read change-request metadata and post comments it uses the host CLI: [`glab`](https://gitlab.com/gitlab-org/cli) for GitLab or [`gh`](https://cli.github.com) for GitHub (per-host commands in `skills/zero-trust-review/hosts.md`); without one it runs git-only and writes the report only. Its Step 0 reads the skill location from `SK` (default `~/.claude/skills/zero-trust-review`); set `SK` if the CLI installed it elsewhere.
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
