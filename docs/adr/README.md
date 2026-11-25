# Architecture decision records

<!-- adr-index: written by dod.mjs adrs; do not edit -->
| # | Title | Status | Touches |
|---|---|---|---|
| [1](0001-retro-skill.md) | Retro skill | Accepted | `skills/retro/**`, `hooks/retro-*.mjs`, `hooks/hooks.json`, `README.md`, `rules/README.md`, `.github/workflows/test.yml`, `.claude-plugin/*.json` |
| [2](0002-ptdd-speed.md) | Speed up paired-agent-tdd | Accepted | `skills/paired-agent-tdd/**`, `skills/zero-trust-review/mutate.mjs`, `skills/zero-trust-review/mutants.mjs`, `skills/zero-trust-review/testprobe.mjs`, `skills/zero-trust-review/flags.mjs`, `skills/zero-trust-review/*.test.mjs`, `README.md`, `.claude-plugin/*.json` |
| [3](0003-tdd-test-speed.md) | Speed up the test suite (issue #19) | Accepted | `skills/paired-agent-tdd/tdd.mjs`, `skills/paired-agent-tdd/*.test.mjs`, `skills/paired-agent-tdd/test-*.mjs`, `skills/zero-trust-review/probelib.mjs`, `skills/zero-trust-review/mutate.mjs`, `skills/zero-trust-review/note.mjs`, `skills/zero-trust-review/mutate.test.mjs`, `skills/zero-trust-review/note.test.mjs`, `skills/zero-trust-review/probelib.test.mjs` |
| [4](0004-dev-workflow.md) | Dev workflow | Accepted | `skills/dev-workflow/**`, `hooks/workflow-guard.mjs`, `hooks/workflow-guard.test.mjs`, `hooks/hooks.json`, `README.md`, `rules/README.md`, `.claude-plugin/*.json`, `docs/adr/**` |
| [5](0005-verify-env-check.md) | Verify env check | Accepted | `skills/dev-workflow/**`, `README.md`, `.claude-plugin/*.json`, `docs/**` |
| [6](0006-branch-summary-split.md) | Branch summary split | Accepted | `skills/branch-summary/**`, `README.md`, `.claude-plugin/plugin.json` |
| [7](0007-ptdd-speed-cap.md) | Ptdd speed cap | Accepted | `skills/paired-agent-tdd/e2e.speed*.test.mjs`, `skills/paired-agent-tdd/test-e2e-speed.mjs`, `skills/paired-agent-tdd/test-e2e-run.mjs`, `rules/checks/test-time.mjs`, `rules/checks/test-time.test.mjs`, `rules/performance.md`, `README.md`, `docs/**` |
| [8](0008-verify-skill.md) | Verify skill | Accepted | `skills/verify/**`, `hooks/verify-guard.mjs`, `hooks/verify-guard.test.mjs`, `hooks/hooks.json`, `skills/dev-workflow/SKILL.md`, `README.md`, `docs/**`, `.claude-plugin/*.json`, `rules/checks/flag-defaults-e2e.mjs` |
<!-- /adr-index -->
