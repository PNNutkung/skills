# pr-test-tiers

A Claude Code `PreToolUse` hook that makes every change request (GitHub pull request or GitLab merge request) ship unit, integration and e2e tests, with real dependencies in containers first and mocks only as a justified fallback.

| Event | What it does |
| --- | --- |
| `gh pr create`, `glab mr create` (Bash) | Denies when the branch diff against the base branch touches source but lacks a tier, or mocks a dependency in an integration or e2e test file without a reason. |
| `git commit` (Bash) | Warns, never blocks: lists the tiers the branch still lacks, so the gap shows before the change request. Quiet on the base branch. |
| Write of a new test file | Reminds, never blocks: states the policy and the tier the file falls in. |

## Tiers

| Tier | A test file counts when |
| --- | --- |
| unit | its path has a `unit` directory (`unit_tests`, `unit-test` too) or a `unit` filename token (`foo.unit.test.ts`) |
| integration | the same with `integration` |
| e2e | the same with `e2e` (or `end-to-end`), for example `e2e.test.mjs` or `e2e/login.ts` |

A file is a test file when it sits under `tests/`, `test/`, `__tests__/`, `spec/` or `e2e/`, or is named `test_*`, `*_test.*`, `*.test.*`, `*.spec.*`, `*_spec.*`, `*.cy.*` or `*Test.java`-style. A test file that matches no tier counts toward none. When both an `e2e` and an `integration` marker match, the broader one (`e2e`) wins.

Docs (`*.md`, `*.txt`, `docs/`), lockfiles, config (`*.json`, `*.yaml`, `*.yml`, `*.toml`) and dotfiles or dot-directories never count as source, so a diff made only of those needs no tests.

## Container-first

Integration and e2e tests run real dependencies in containers (Testcontainers, docker compose). The hook cannot prove a container was possible; it checks that a mock was a deliberate choice. A mocking-library pattern on an added line of an integration or e2e test file is denied unless that file carries a comment `no-container: <reason>`, in any comment syntax:

```python
# no-container: vendor has no UAT server
from unittest import mock
```

```ts
// no-container: vendor has no UAT server
jest.mock('./billing-client');
```

Unit tests may mock freely. The built-in patterns are heuristics for Python (`unittest.mock`, `MagicMock`, `pytest-mock`, `responses`) and JS/TS (`jest.mock`/`fn`/`spyOn`, `sinon`, `nock`, `msw`). Other languages and libraries are added per repo with `mockPatterns` (below).

## Install

```bash
mkdir -p ~/.claude/hooks
cp hooks/pr-test-tiers/pr-test-tiers.py ~/.claude/hooks/
python3 ~/.claude/hooks/pr-test-tiers.py --self-test
```

Register it in `~/.claude/settings.json`, once for Bash and once for Write:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/pr-test-tiers.py" }]
      },
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/pr-test-tiers.py" }]
      }
    ]
  }
}
```

## Options

- **Base branch.** `gh pr create --base X` / `-B X` and `glab mr create --target-branch X` / `-b X` name it. Without a flag the hook uses `origin/HEAD`, then `main`, then `master`, and prefers the `origin/` copy. If none resolves, it does nothing. The diff is `git diff <base>...HEAD`; the commit stage adds the staged changes (all tracked changes with `git commit -a`).
- **Scope.** Every git repo is guarded by default. `PR_TEST_TIERS_SCOPE` takes colon-separated path prefixes and narrows it, for example `PR_TEST_TIERS_SCOPE=~/work/app:~/work/lib`.
- **One command.** `PR_TEST_TIERS=off gh pr create ...` bypasses the hook once.
- **Per repo.** `<repo>/.claude/test-tiers.json`:

  ```json
  {
    "enabled": true,
    "tiers": { "integration": ["it/*"], "e2e": ["cypress/e2e/*"] },
    "mockPatterns": ["\\bvi\\.mock\\b", "\\bgomock\\b"]
  }
  ```

  `enabled: false` turns the repo off. A tier named in `tiers` is matched by these globs (`*` also matches `/`) and its built-in path rule is dropped; tiers you leave out keep theirs. `mockPatterns` regexes add to the built-in ones.
- **Untiered repos.** If neither the branch nor the repo has a single tiered test, `gh pr create` gets a note instead of a denial, so a repo with no tier layout yet is not locked out when it adopts the hook. Mapping any tier in `tiers` switches the rule on.
- **Check from a script or an agent.** `python3 pr-test-tiers.py --check [--base BRANCH]` prints what the change-request gate says about the branch plus the index, and exits 1 when it would deny.

## Limits

- It reads the command line, so it only sees `gh pr create` and `glab mr create` typed in the Bash tool. A change request opened in the web UI is not covered; use a CI check for that.
- `gh pr create --head OTHER` still diffs the current `HEAD`.
- It counts files, not coverage: a tier is present when a matching test file is in the diff.
- Mock detection is regex on added lines, so a mocking library imported under another name is missed.
- It fails open on any internal error.
