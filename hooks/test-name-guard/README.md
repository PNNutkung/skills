# test-name-guard

A Claude Code `PreToolUse` hook (Bash matcher) for tests whose names do not say what they expect and when. By default it warns at `git commit`, telling the agent which **added** tests to rename, and denies `gh pr create` / `glab mr create` while the branch still adds one. The naming is a convention ([`rules/test-naming.md`](../../rules/test-naming.md)), so day-to-day commits go through and only the change request is blocked. The shape is fixed; the spelling follows the language:

| Language | Style | Example |
| --- | --- | --- |
| Python (pytest) | `test_should_<expected_behavior>_when_<state_under_test>`, snake_case | `test_should_return_empty_list_when_no_items_match` |
| TypeScript / JavaScript | `test('should <expected behavior> when <state under test>', ...)`, also `it(...)` | `test('should render the empty state when no items match', ...)` |

Both halves are required: a name without `when` is rejected, and so is one without `should`. Only added lines are checked (the commit's, or the branch's against its base for a change request), so legacy tests never block an edit, and the hook fails open on any internal error.

## Install

```bash
mkdir -p ~/.claude/hooks
cp hooks/test-name-guard/test-name-guard.py ~/.claude/hooks/
python3 ~/.claude/hooks/test-name-guard.py --self-test
```

Register it in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/test-name-guard.py" }]
      }
    ]
  }
}
```

## Options

- **Mode.** `TEST_NAME_GUARD_MODE` is `warn` (default: warn at commit, deny at change request), `deny` (deny both, the behavior before modes existed) or `off`. An unknown value counts as `warn`.
- **Scope.** Every git repo is guarded by default. `TEST_NAME_GUARD_SCOPE` takes colon-separated path prefixes and narrows it, for example `TEST_NAME_GUARD_SCOPE=~/work/app:~/work/lib`.
- **Once.** `TEST_NAME_GUARD=off git commit ...` (or `... gh pr create`) bypasses the hook once.
- **Per repo.** `<repo>/.claude/test-naming.json` is `{"enabled": true, "python": "<regex>" | null, "javascript": "<regex>" | null}`. `null` turns a language off; a string replaces its regex (Python matches the function name, JavaScript matches the test title).
- **Staged check from a script or an agent.** `python3 test-name-guard.py --staged` lists the staged tests that break the rule and exits 1 (0 when clean). It ignores the scope.

## Limits

- It looks at the text of the command, so it also fires on any command that mentions `git commit`, even inside quotes, but only while staged names are bad.
- Python and TypeScript/JavaScript are built in. Other languages need a regex and a file pattern added to the script.
