# Test naming

A test name says what it expects and when.

| Language | Shape | Example |
|---|---|---|
| Python (pytest) | `test_should_<expected>_when_<state>` | `test_should_return_empty_list_when_no_items_match` |
| TypeScript / JavaScript | `test('should <expected> when <state>', ...)`, also `it(...)` | `test('should render the empty state when no items match', ...)` |

- Both halves are needed: a name with no `when` breaks the rule, and so does one with no `should`.
- Only tests you add count. Legacy names are left alone unless you are already editing that test.
- paired-agent-tdd names tests `test_ac1_happy` during a run, then renames them to this rule after `verify`.
- `rules/checks/test-names.mjs` checks the tests a branch adds, committed or not, so run it before you commit.
- `hooks/test-name-guard` checks the tests a commit adds. A repo can change the patterns in `.claude/test-naming.json`.
