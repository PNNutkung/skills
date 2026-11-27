# Test naming

A test name says what it expects and when.

| Language | Shape | Example |
|---|---|---|
| Python (pytest) | `test_should_<expected>_when_<state>` | `test_should_return_empty_list_when_no_items_match` |
| TypeScript / JavaScript | `test('should <expected> when <state>', ...)`, also `it(...)` | `test('should render the empty state when no items match', ...)` |

- Both halves are needed: a name with no `when` breaks the rule, and so does one with no `should`. <!-- rule: test-naming/both-halves -->
- Only tests you add count. Legacy names are left alone unless you are already editing that test. <!-- rule: test-naming/added-only -->
- Moving a test to another file counts as adding it (`rules/checks/test-names.mjs` sees a new name there), so give a moved legacy test this shape when you move it. <!-- rule: test-naming/moved-test -->
- paired-agent-tdd names tests `test_ac1_happy` during a run, then renames them to this rule after `verify`. <!-- rule: test-naming/ptdd-rename -->
- `rules/checks/test-names.mjs` checks the tests a branch adds, committed or not, so run it before you commit. <!-- rule: test-naming/check-before-commit -->
- A branch may remove a test only when another test now holds every one of its assertions (ADR 0008 A8, for example two e2e tests that shared one scripted run merged into one). List each removed test in `rules/checks/test-merges.json` as `"<file>::<old name>": "<file>::<new name>"`. `rules/checks/test-names.mjs` fails on a removed test (a deleted `test(`/`it(`/`def test_` line whose name the branch adds nowhere) that the map does not list, or whose target test is not in that file. A renamed test counts as removed, so it needs an entry too; a moved test or an edited line with the same name does not. Prefer sharing one run across the old tests, keeping their names, over removing them. <!-- rule: test-naming/removed-test -->
- `hooks/test-name-guard` checks the tests a commit adds. A repo can change the patterns in `.claude/test-naming.json`. <!-- rule: test-naming/commit-guard -->
