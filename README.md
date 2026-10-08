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
npx skills add PNNutkung/skills --skill paired-agent-tdd
```

Claude Code only, to also get the `zero-trust-review` guard and telemetry-capture hooks (skills alone do not include hooks):

```sh
/plugin marketplace add PNNutkung/skills
/plugin install pnnutkung-skills@pnnutkung-skills
```

## Skills

| Skill | What it does |
| --- | --- |
| [`paired-agent-tdd`](skills/paired-agent-tdd) | TDD as driver/navigator pairs scheduled from an explicit execution graph (`graph.mjs`), with per-node model and effort tiering. Runs on a Claude Code agent team or a Workflow script. |
| [`zero-trust-review`](skills/zero-trust-review) | Strict review of a branch diff against a 30-point production-hazard checklist, tiered and cost-capped (`quick` / `standard` / `deep`). Cites findings as permalinks on the review host (GitLab, GitHub, or git-only). |
| [`ai-code-delivery`](skills/ai-code-delivery) | Delivery runbook for agent-written code: feature-flag gating, trunk/leaf review depth, PR proof template, fresh-context review, 80/20 readiness gate, canary rollout. Hands the diff review to `zero-trust-review`. |

Both skills use the same model and effort tiering policy. See `skills/zero-trust-review/tiering.md` and the tiering section of `skills/paired-agent-tdd/SKILL.md`.

## Requirements

- Node 18+ (`graph.mjs`, workflow tests, `sandbox-run.mjs`, `testprobe.mjs`) and Python 3 (`triage.py`).
- `zero-trust-review` states no guess as a fact: findings quote real code, claims carry a proof (code `file:line`, a sandbox run, or real logs/metrics/traces), and `proofcheck.mjs` re-verifies them in plain code. It runs change-request code only inside a sandbox (macOS `sandbox-exec`, Linux `bwrap`, or docker via `ZT_SANDBOX_IMAGE`); with none, probes report `unverifiable` and never run bare.
- `zero-trust-review` works on any git repo. To read change-request metadata and post comments it uses the host CLI: [`glab`](https://gitlab.com/gitlab-org/cli) for GitLab or [`gh`](https://cli.github.com) for GitHub (per-host commands in `skills/zero-trust-review/hosts.md`); without one it runs git-only and writes the report only. Its Step 0 reads the skill location from `SK` (default `~/.claude/skills/zero-trust-review`); set `SK` if the CLI installed it elsewhere.
- `paired-agent-tdd` needs either Claude Code agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) or the Workflow tool for per-node effort.

## Telemetry

The skills CLI sends anonymous install telemetry, which is how skills.sh builds its leaderboard. Set `DISABLE_TELEMETRY=1` to opt out.
