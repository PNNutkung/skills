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

## Skills

| Skill | What it does |
|---|---|
| [`paired-agent-tdd`](skills/paired-agent-tdd) | TDD as driver/navigator pairs scheduled from an explicit execution graph (`graph.mjs`), with per-node model and effort tiering. Runs on a Claude Code agent team or a Workflow script. |
| [`zero-trust-review`](skills/zero-trust-review) | Strict review of a branch diff against a 30-point production-hazard checklist, tiered and cost-capped (`quick` / `standard` / `deep`). Cites findings as GitLab permalinks. |

Both skills use the same model and effort tiering policy. See `skills/zero-trust-review/tiering.md` and the tiering section of `skills/paired-agent-tdd/SKILL.md`.

## Requirements

- Node 18+ (`graph.mjs`, workflow tests) and Python 3 (`triage.py`).
- `zero-trust-review` posts to GitLab merge requests through [`glab`](https://gitlab.com/gitlab-org/cli). Its Step 0 reads the skill location from `SK` (default `~/.claude/skills/zero-trust-review`); set `SK` if the CLI installed it elsewhere.
- `paired-agent-tdd` needs either Claude Code agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) or the Workflow tool for per-node effort.

## Telemetry

The skills CLI sends anonymous install telemetry, which is how skills.sh builds its leaderboard. Set `DISABLE_TELEMETRY=1` to opt out.
