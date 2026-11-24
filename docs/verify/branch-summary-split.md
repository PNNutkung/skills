# Verify: branch-summary split (issue #20, ADR 0006)

Run 2026-11-24 in the cloud container (Linux, Node 22.23.5) on branch `claude/project-thread-dln1kb` at 13d2ad4.

## Split
env: cloud container
run: node --test --test-name-pattern="Split" skills/branch-summary/*.test.mjs
result: pass
```
ok 3 - should point the fast path and the breaking-change rule at report-format.md when Sections 0-2 name a moved part (Split)
ok 4 - should start report-format.md with a header and then Section 3 when the file is read (Split)
# pass 4
# fail 0
```

## Cap
env: cloud container
run: wc -c skills/branch-summary/SKILL.md (before: git show origin/main:skills/branch-summary/SKILL.md | wc -c)
result: pass
```
15678 skills/branch-summary/SKILL.md
26620 (origin/main)
```

## CapTest
env: cloud container
run: node --test --test-name-pattern="CapTest" skills/branch-summary/*.test.mjs
result: pass
```
ok 3 - should fail with a message naming report-format.md when SKILL.md is over 16,000 bytes (CapTest)
ok 4 - should count bytes, not characters, and pass at exactly 16,000 bytes when the text is at the cap (CapTest)
# fail 0
```

## Issue
env: github.com
run: gh api repos/PNNutkung/skills/issues --method POST (title "Enforce SKILL.md size caps for every skill in CI")
result: pass
```
28
https://github.com/PNNutkung/skills/issues/28
```

## Gate
env: cloud container
run: node --test --test-name-pattern="Gate" skills/branch-summary/*.test.mjs
result: pass
```
ok 21 - should exit 2 naming the valid values and write nothing when the flag is not true or false (Gate)
ok 22 - should find each heading the gate requires in report-format.md when the gate and the doc are compared (Gate)
# pass 22
# fail 0
```

## Evals
env: cloud container
run: node --test --test-name-pattern="Evals" skills/branch-summary/*.test.mjs
result: pass
```
ok 2 - should parse with two or more cases that expect the required sections, the read and the fast path when evals.json is read (Evals)
# fail 0
```

## NoLoss
env: cloud container
run: node --test --test-name-pattern="NoLoss" skills/branch-summary/*.test.mjs
result: pass
```
ok 3 - should report the line when a moved line is dropped or reworded (NoLoss)
ok 4 - should report a line when two moved lines swap places (NoLoss)
# pass 4
# fail 0
```

## RealRun
env: cloud container, claude -p (Claude Code CLI), the skill copied into each clone's .claude/skills/branch-summary
run: claude -p "Use the branch-summary skill to summarize the current branch (retro-letter-answers) against base branch main. Follow the skill exactly." on branch 223edbf vs main 18cfe66 (PR #26), 4 runs with origin/main's skill and 4 with this branch's skill
result: pass
```
run      turns  cost USD  cache-read tokens  sections (## ...)
before1  13     0.612     879,110            Summary|Breaking|Dependencies|Config|Diagrams|Test Coverage
before2  13     0.651     983,377            Summary|Breaking|Dependencies|Config|Diagrams|Test Coverage
before3  15     0.507     814,766            Summary|Breaking|Dependencies|Config|Diagrams|Test Coverage
before4  12     0.483     895,537            Summary|Breaking|Config|Diagrams|Test Coverage
after1   10     0.519     535,074            Summary|Breaking|Config|Diagrams|Test Coverage
after2    9     0.545     450,124            Summary|Breaking|Dependencies|Config|Diagrams|Test Coverage
after3   14     0.539     922,931            Summary|Breaking|Dependencies|Config|Diagrams|Test Coverage
after4   13     0.500   1,020,220            Summary|Breaking|Dependencies|Config|Diagrams|Test Coverage
```
Every run wrote a full report (no fast path), with a title, Summary and Test Coverage, and built the HTML. The heading sets match: 3 of 4 runs on each side add Dependencies, and the fourth files the plugin.json bump under Configuration instead. That is model variance that was already there before the change (before4). Averages: before 0.563 USD and 13.3 turns; after 0.526 USD (-7%) and 11.5 turns.
