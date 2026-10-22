# test-name-guard

A Claude Code `PreToolUse` hook (Bash matcher) that denies `git commit` when the commit **adds** a test whose name does not say what it expects and when. The shape is fixed; the spelling follows the language:

| Language | Style | Example |
| --- | --- | --- |
| Python (pytest) | `test_should_<expected_behavior>_when_<state_under_test>`, snake_case | `test_should_return_empty_list_when_no_items_match` |
| TypeScript / JavaScript | `test('should <expected behavior> when <state under test>', ...)`, also `it(...)` | `test('should render the empty state when no items match', ...)` |

Both halves are required: a name without `when` is rejected, and so is one without `should`. Only added lines of the commit are checked, so legacy tests never block an edit, and the hook fails open on any internal error.

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

- **Scope.** Every git repo is guarded by default. `TEST_NAME_GUARD_SCOPE` takes colon-separated path prefixes and narrows it, for example `TEST_NAME_GUARD_SCOPE=~/work/app:~/work/lib`.
- **One commit.** `TEST_NAME_GUARD=off git commit ...` bypasses the hook once.
- **Per repo.** `<repo>/.claude/test-naming.json` is `{"enabled": true, "python": "<regex>" | null, "javascript": "<regex>" | null}`. `null` turns a language off; a string replaces its regex (Python matches the function name, JavaScript matches the test title).
- **Staged check from a script or an agent.** `python3 test-name-guard.py --staged` lists the staged tests that break the rule and exits 1 (0 when clean). It ignores the scope.

## Limits

- It looks at the text of the command, so it also fires on any command that mentions `git commit`, even inside quotes, but only while staged names are bad.
- Python and TypeScript/JavaScript are built in. Other languages need a regex and a file pattern added to the script.
