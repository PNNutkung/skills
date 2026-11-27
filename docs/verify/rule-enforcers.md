# Verify: rule-enforcers (ADR 0013)

## EnfFile
<!-- verify: written by verify.mjs; sha256:b9a87a1757fffc4f -->
env: cloud (local shell)
run: node --test rules/checks/rule-enforcers.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with EnfFile
```
TAP version 13
# Subtest: should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
ok 1 - should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
  ---
  duration_ms: 2.761114
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer path does not exist
ok 2 - should give a reason when the enforcer path does not exist
  ---
  duration_ms: 1.627134
  type: 'test'
  ...
# Subtest: should give a reason when the symbol is not in the file or the file is missing
ok 3 - should give a reason when the symbol is not in the file or the file is missing
  ---
  duration_ms: 2.005473
  type: 'test'
  ...
# Subtest: should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
ok 4 - should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
  ---
  duration_ms: 2.328604
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer is not a string, is absolute or leaves the repo
ok 5 - should give a reason when the enforcer is not a string, is absolute or leaves the repo
  ---
  duration_ms: 1.622098
  type: 'test'
  ...
# Subtest: should find no violations when every bullet has an id and every entry is valid
ok 6 - should find no violations when every bullet has an id and every entry is valid
  ---
  duration_ms: 4.044328
  type: 'test'
  ...
# Subtest: should report the line when a rule bullet has no id
ok 7 - should report the line when a rule bullet has no id
  ---
  duration_ms: 3.358815
  type: 'test'
  ...
# Subtest: should report the line when an id is not lowercase kebab or has another stem
ok 8 - should report the line when an id is not lowercase kebab or has another stem
  ---
  duration_ms: 3.077712
  type: 'test'
  ...
# Subtest: should report the line when one id is used twice in a file
ok 9 - should report the line when one id is used twice in a file
  ---
  duration_ms: 2.314573
  type: 'test'
  ...
# Subtest: should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
ok 10 - should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
  ---
  duration_ms: 1.293175
  type: 'test'
  ...
# Subtest: should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
ok 11 - should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
  ---
  duration_ms: 0.770143
  type: 'test'
  ...
# Subtest: should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
ok 12 - should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.722621
  type: 'test'
  ...
# Subtest: should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
ok 13 - should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.534225
  type: 'test'
  ...
# Subtest: should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
ok 14 - should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
  ---
  duration_ms: 2.208316
  type: 'test'
  ...
# Subtest: should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
ok 15 - should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
  ---
  duration_ms: 1.024944
  type: 'test'
  ...
# Subtest: should report a missing rules/enforcers.json when a rule file exists
ok 16 - should report a missing rules/enforcers.json when a rule file exists
  ---
  duration_ms: 0.504336
  type: 'test'
  ...
# Subtest: should return the violations sorted when there are several
ok 17 - should return the violations sorted when there are several
  ---
  duration_ms: 0.849165
  type: 'test'
  ...
# Subtest: should find the same violations when the repo root is reached through a symlinked folder
ok 18 - should find the same violations when the repo root is reached through a symlinked folder
  ---
  duration_ms: 2.457111
  type: 'test'
  ...
# Subtest: should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
ok 19 - should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
  ---
  duration_ms: 61.274766
  type: 'test'
  ...
# Subtest: should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
ok 20 - should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
  ---
  duration_ms: 29.626334
  type: 'test'
  ...
# Subtest: should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
ok 21 - should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
  ---
  duration_ms: 71.003676
  type: 'test'
  ...
# Subtest: should still run the CLI when the script is started through a symlinked folder
ok 22 - should still run the CLI when the script is started through a symlinked folder
  ---
  duration_ms: 28.377893
  type: 'test'
  ...
# Subtest: should check the current folder when the CLI runs with no arguments
ok 23 - should check the current folder when the CLI runs with no arguments
  ---
  duration_ms: 26.273945
  type: 'test'
  ...
# Subtest: should print nothing when the module is imported instead of started
ok 24 - should print nothing when the module is imported instead of started
  ---
  duration_ms: 52.39137
  type: 'test'
  ...
# Subtest: should give a reason when a ../ path leaves the repo even though the file exists there
ok 25 - should give a reason when a ../ path leaves the repo even though the file exists there
  ---
  duration_ms: 0.772238
  type: 'test'
  ...
# Subtest: should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
ok 26 - should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
  ---
  duration_ms: 0.829901
  type: 'test'
  ...
# Subtest: should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
ok 27 - should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
  ---
  duration_ms: 34.784598
  type: 'test'
  ...
1..27
# tests 27
# suites 0
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 407.44532
```

## ReadmePtr
<!-- verify: written by verify.mjs; sha256:b5f6bb7f57717b11 -->
env: cloud (local shell)
run: grep -n 'enforcers.json' rules/README.md
result: pass
expect: exit 0; regex /^12:Each rule is a top-level bullet .*To add a rule, add the bullet with a new id and its entry/m
```
12:Each rule is a top-level bullet in a `rules/*.md` file and ends with `<!-- rule: <file stem>/<slug> -->`. [`enforcers.json`](./enforcers.json) says what enforces each id: `enforced` (a path, `path#symbol` or `ratchet:<id>`), `partial` or `judgment` (each with a reason). To add a rule, add the bullet with a new id and its entry; `rules/checks/rule-enforcers.mjs` fails CI when the two disagree (ADR 0013). The retro skill records which rule a finding broke in `docs/retro/rule-hits.json`, and a repeat of a `partial` or `judgment` rule needs a proposal that names a higher level.
55:| Every top-level bullet in `rules/*.md` ends with a unique `<!-- rule: <stem>/<slug> -->` id, and `rules/enforcers.json` has one valid entry per id (status, reason, enforcers that exist) | `rules/checks/rule-enforcers.mjs`, run by `rules/checks/rule-enforcers.test.mjs` in CI (parser: `skills/retro/rules.mjs`) | always (CI) |
```

## PerBullet
<!-- verify: written by verify.mjs; sha256:d27a3a54da57e5ab -->
env: cloud (local shell)
run: node --test rules/checks/rule-enforcers.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with PerBullet
```
TAP version 13
# Subtest: should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
ok 1 - should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
  ---
  duration_ms: 2.291222
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer path does not exist
ok 2 - should give a reason when the enforcer path does not exist
  ---
  duration_ms: 1.680876
  type: 'test'
  ...
# Subtest: should give a reason when the symbol is not in the file or the file is missing
ok 3 - should give a reason when the symbol is not in the file or the file is missing
  ---
  duration_ms: 2.49383
  type: 'test'
  ...
# Subtest: should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
ok 4 - should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
  ---
  duration_ms: 4.301754
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer is not a string, is absolute or leaves the repo
ok 5 - should give a reason when the enforcer is not a string, is absolute or leaves the repo
  ---
  duration_ms: 0.771766
  type: 'test'
  ...
# Subtest: should find no violations when every bullet has an id and every entry is valid
ok 6 - should find no violations when every bullet has an id and every entry is valid
  ---
  duration_ms: 3.45403
  type: 'test'
  ...
# Subtest: should report the line when a rule bullet has no id
ok 7 - should report the line when a rule bullet has no id
  ---
  duration_ms: 1.696992
  type: 'test'
  ...
# Subtest: should report the line when an id is not lowercase kebab or has another stem
ok 8 - should report the line when an id is not lowercase kebab or has another stem
  ---
  duration_ms: 0.959432
  type: 'test'
  ...
# Subtest: should report the line when one id is used twice in a file
ok 9 - should report the line when one id is used twice in a file
  ---
  duration_ms: 0.756935
  type: 'test'
  ...
# Subtest: should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
ok 10 - should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
  ---
  duration_ms: 0.922815
  type: 'test'
  ...
# Subtest: should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
ok 11 - should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
  ---
  duration_ms: 3.295023
  type: 'test'
  ...
# Subtest: should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
ok 12 - should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.559348
  type: 'test'
  ...
# Subtest: should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
ok 13 - should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.379622
  type: 'test'
  ...
# Subtest: should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
ok 14 - should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
  ---
  duration_ms: 1.074032
  type: 'test'
  ...
# Subtest: should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
ok 15 - should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
  ---
  duration_ms: 0.663162
  type: 'test'
  ...
# Subtest: should report a missing rules/enforcers.json when a rule file exists
ok 16 - should report a missing rules/enforcers.json when a rule file exists
  ---
  duration_ms: 0.482197
  type: 'test'
  ...
# Subtest: should return the violations sorted when there are several
ok 17 - should return the violations sorted when there are several
  ---
  duration_ms: 0.43276
  type: 'test'
  ...
# Subtest: should find the same violations when the repo root is reached through a symlinked folder
ok 18 - should find the same violations when the repo root is reached through a symlinked folder
  ---
  duration_ms: 17.86817
  type: 'test'
  ...
# Subtest: should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
ok 19 - should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
  ---
  duration_ms: 46.972808
  type: 'test'
  ...
# Subtest: should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
ok 20 - should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
  ---
  duration_ms: 24.040226
  type: 'test'
  ...
# Subtest: should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
ok 21 - should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
  ---
  duration_ms: 50.545411
  type: 'test'
  ...
# Subtest: should still run the CLI when the script is started through a symlinked folder
ok 22 - should still run the CLI when the script is started through a symlinked folder
  ---
  duration_ms: 26.549254
  type: 'test'
  ...
# Subtest: should check the current folder when the CLI runs with no arguments
ok 23 - should check the current folder when the CLI runs with no arguments
  ---
  duration_ms: 27.13586
  type: 'test'
  ...
# Subtest: should print nothing when the module is imported instead of started
ok 24 - should print nothing when the module is imported instead of started
  ---
  duration_ms: 67.705464
  type: 'test'
  ...
# Subtest: should give a reason when a ../ path leaves the repo even though the file exists there
ok 25 - should give a reason when a ../ path leaves the repo even though the file exists there
  ---
  duration_ms: 0.914637
  type: 'test'
  ...
# Subtest: should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
ok 26 - should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
  ---
  duration_ms: 1.324311
  type: 'test'
  ...
# Subtest: should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
ok 27 - should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
  ---
  duration_ms: 30.708862
  type: 'test'
  ...
1..27
# tests 27
# suites 0
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 391.19425
```

## BulletIds
<!-- verify: written by verify.mjs; sha256:08c9745eb536c452 -->
env: cloud (local shell)
run: node --test skills/retro/rules.test.mjs rules/checks/rule-enforcers.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with BulletIds
```
TAP version 13
# Subtest: should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
ok 1 - should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
  ---
  duration_ms: 4.564704
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer path does not exist
ok 2 - should give a reason when the enforcer path does not exist
  ---
  duration_ms: 1.386975
  type: 'test'
  ...
# Subtest: should give a reason when the symbol is not in the file or the file is missing
ok 3 - should give a reason when the symbol is not in the file or the file is missing
  ---
  duration_ms: 3.061818
  type: 'test'
  ...
# Subtest: should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
ok 4 - should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
  ---
  duration_ms: 1.028182
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer is not a string, is absolute or leaves the repo
ok 5 - should give a reason when the enforcer is not a string, is absolute or leaves the repo
  ---
  duration_ms: 0.527545
  type: 'test'
  ...
# Subtest: should find no violations when every bullet has an id and every entry is valid
ok 6 - should find no violations when every bullet has an id and every entry is valid
  ---
  duration_ms: 2.677234
  type: 'test'
  ...
# Subtest: should report the line when a rule bullet has no id
ok 7 - should report the line when a rule bullet has no id
  ---
  duration_ms: 0.918601
  type: 'test'
  ...
# Subtest: should report the line when an id is not lowercase kebab or has another stem
ok 8 - should report the line when an id is not lowercase kebab or has another stem
  ---
  duration_ms: 1.090233
  type: 'test'
  ...
# Subtest: should report the line when one id is used twice in a file
ok 9 - should report the line when one id is used twice in a file
  ---
  duration_ms: 0.851972
  type: 'test'
  ...
# Subtest: should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
ok 10 - should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
  ---
  duration_ms: 0.829904
  type: 'test'
  ...
# Subtest: should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
ok 11 - should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
  ---
  duration_ms: 0.667021
  type: 'test'
  ...
# Subtest: should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
ok 12 - should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.792058
  type: 'test'
  ...
# Subtest: should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
ok 13 - should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.560731
  type: 'test'
  ...
# Subtest: should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
ok 14 - should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
  ---
  duration_ms: 1.24935
  type: 'test'
  ...
# Subtest: should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
ok 15 - should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
  ---
  duration_ms: 2.695903
  type: 'test'
  ...
# Subtest: should report a missing rules/enforcers.json when a rule file exists
ok 16 - should report a missing rules/enforcers.json when a rule file exists
  ---
  duration_ms: 0.400204
  type: 'test'
  ...
# Subtest: should return the violations sorted when there are several
ok 17 - should return the violations sorted when there are several
  ---
  duration_ms: 0.54718
  type: 'test'
  ...
# Su
... [cut: the output was 16619 chars; the first and last 4000 are kept] ...
pass and hits already in the file when addHits runs again (RuleHits)
  ---
  duration_ms: 0.087914
  type: 'test'
  ...
# Subtest: should return a copy equal to the old hits when no finding names a rule
ok 55 - should return a copy equal to the old hits when no finding names a rule
  ---
  duration_ms: 0.042722
  type: 'test'
  ...
# Subtest: should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)
ok 56 - should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)
  ---
  duration_ms: 0.126194
  type: 'test'
  ...
# Subtest: should not mark a repeat when the only hit of the rule is from the same branch
ok 57 - should not mark a repeat when the only hit of the rule is from the same branch
  ---
  duration_ms: 0.045978
  type: 'test'
  ...
# Subtest: should not mark a repeat when there are no hits and one evidence item
ok 58 - should not mark a repeat when there are no hits and one evidence item
  ---
  duration_ms: 0.037654
  type: 'test'
  ...
# Subtest: should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items
ok 59 - should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items
  ---
  duration_ms: 0.035685
  type: 'test'
  ...
# Subtest: should return a finding unchanged with no repeat key when it names no rule
ok 60 - should return a finding unchanged with no repeat key when it names no rule
  ---
  duration_ms: 0.047674
  type: 'test'
  ...
# Subtest: should not mutate the findings or hits when markRepeats runs
ok 61 - should not mutate the findings or hits when markRepeats runs
  ---
  duration_ms: 0.079751
  type: 'test'
  ...
# Subtest: should pass when a repeat of an unenforced rule has a proposal with a known level
ok 62 - should pass when a repeat of an unenforced rule has a proposal with a known level
  ---
  duration_ms: 0.134737
  type: 'test'
  ...
# Subtest: should pass when a repeat of an unenforced rule has a proposal with a noLevel reason
ok 63 - should pass when a repeat of an unenforced rule has a proposal with a noLevel reason
  ---
  duration_ms: 0.044793
  type: 'test'
  ...
# Subtest: should name the finding when a repeat of an unenforced rule has no proposal
ok 64 - should name the finding when a repeat of an unenforced rule has no proposal
  ---
  duration_ms: 0.035233
  type: 'test'
  ...
# Subtest: should name the finding when its proposal has an empty noLevel
ok 65 - should name the finding when its proposal has an empty noLevel
  ---
  duration_ms: 0.033068
  type: 'test'
  ...
# Subtest: should name the finding when the only proposal with a level is for another finding
ok 66 - should name the finding when the only proposal with a level is for another finding
  ---
  duration_ms: 0.02752
  type: 'test'
  ...
# Subtest: should name the proposal when its level is not a known level
ok 67 - should name the proposal when its level is not a known level
  ---
  duration_ms: 0.112525
  type: 'test'
  ...
# Subtest: should need a level when the rule has no entry or there are no entries
ok 68 - should need a level when the rule has no entry or there are no entries
  ---
  duration_ms: 0.05368
  type: 'test'
  ...
# Subtest: should need nothing when the repeated rule is enforced
ok 69 - should need nothing when the repeated rule is enforced
  ---
  duration_ms: 0.031048
  type: 'test'
  ...
# Subtest: should need nothing when the finding is not a repeat or names no rule
ok 70 - should need nothing when the finding is not a repeat or names no rule
  ---
  duration_ms: 0.031957
  type: 'test'
  ...
# Subtest: should never throw and return well-formed ids and errors when it parses 300 random markdown documents
ok 71 - should never throw and return well-formed ids and errors when it parses 300 random markdown documents
  ---
  duration_ms: 17.308888
  type: 'test'
  ...
1..71
# tests 71
# suites 0
# pass 71
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 393.020265
```

## IdShape
<!-- verify: written by verify.mjs; sha256:94a6ac9c63ad90fa -->
env: cloud (local shell)
run: node --test skills/retro/rules.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with IdShape
```
TAP version 13
# Subtest: should export the statuses, levels and file names when the module loads
ok 1 - should export the statuses, levels and file names when the module loads
  ---
  duration_ms: 1.120046
  type: 'test'
  ...
# Subtest: should return each id with its line when every top-level bullet ends with a rule comment
ok 2 - should return each id with its line when every top-level bullet ends with a rule comment
  ---
  duration_ms: 0.452219
  type: 'test'
  ...
# Subtest: should return no ids and no errors when the file has no bullets
ok 3 - should return no ids and no errors when the file has no bullets
  ---
  duration_ms: 0.138446
  type: 'test'
  ...
# Subtest: should report the path and line when a bullet has no id (BulletIds)
ok 4 - should report the path and line when a bullet has no id (BulletIds)
  ---
  duration_ms: 0.138483
  type: 'test'
  ...
# Subtest: should report the line when the id sits on a continuation line instead of the first line
ok 5 - should report the line when the id sits on a continuation line instead of the first line
  ---
  duration_ms: 0.11146
  type: 'test'
  ...
# Subtest: should report the line when the rule comment is followed by more text
ok 6 - should report the line when the rule comment is followed by more text
  ---
  duration_ms: 0.064927
  type: 'test'
  ...
# Subtest: should report the line when the id has another file stem (IdShape)
ok 7 - should report the line when the id has another file stem (IdShape)
  ---
  duration_ms: 0.098994
  type: 'test'
  ...
# Subtest: should report the line when the slug is not lowercase kebab (IdShape)
ok 8 - should report the line when the slug is not lowercase kebab (IdShape)
  ---
  duration_ms: 0.22888
  type: 'test'
  ...
# Subtest: should report the second line when one id is used twice in the file (IdShape)
ok 9 - should report the second line when one id is used twice in the file (IdShape)
  ---
  duration_ms: 0.248281
  type: 'test'
  ...
# Subtest: should ignore bullets inside a fenced code block when the fence is plain or indented
ok 10 - should ignore bullets inside a fenced code block when the fence is plain or indented
  ---
  duration_ms: 0.286086
  type: 'test'
  ...
# Subtest: should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
ok 11 - should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
  ---
  duration_ms: 0.10132
  type: 'test'
  ...
# Subtest: should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
ok 12 - should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
  ---
  duration_ms: 0.053046
  type: 'test'
  ...
# Subtest: should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
ok 13 - should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
  ---
  duration_ms: 0.037849
  type: 'test'
  ...
# Subtest: should count lines the same way when the file has CRLF line ends
ok 14 - should count lines the same way when the file has CRLF line ends
  ---
  duration_ms: 0.047192
  type: 'test'
  ...
# Subtest: should use the file name without .md as the stem when the path is nested
ok 15 - should use the file name without .md as the stem when the path is nested
  ---
  duration_ms: 0.059366
  type: 'test'
  ...
# Subtest: should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
ok 16 - should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
  ---
  duration_ms: 0.655391
  type: 'test'
  ...
# Subtest: should return null entries when rules/enforcers.json is missing
ok 17 - should return null entries when rules/enforcers.json is missing
  ---
  duration_ms: 0.183132
  type: 'test'
  ...
# Subtest: should ret
... [cut: the output was 10186 chars; the first and last 4000 are kept] ...
 pass and hits already in the file when addHits runs again (RuleHits)
  ---
  duration_ms: 0.084869
  type: 'test'
  ...
# Subtest: should return a copy equal to the old hits when no finding names a rule
ok 28 - should return a copy equal to the old hits when no finding names a rule
  ---
  duration_ms: 0.04484
  type: 'test'
  ...
# Subtest: should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)
ok 29 - should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)
  ---
  duration_ms: 0.126451
  type: 'test'
  ...
# Subtest: should not mark a repeat when the only hit of the rule is from the same branch
ok 30 - should not mark a repeat when the only hit of the rule is from the same branch
  ---
  duration_ms: 0.050225
  type: 'test'
  ...
# Subtest: should not mark a repeat when there are no hits and one evidence item
ok 31 - should not mark a repeat when there are no hits and one evidence item
  ---
  duration_ms: 0.035724
  type: 'test'
  ...
# Subtest: should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items
ok 32 - should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items
  ---
  duration_ms: 0.037051
  type: 'test'
  ...
# Subtest: should return a finding unchanged with no repeat key when it names no rule
ok 33 - should return a finding unchanged with no repeat key when it names no rule
  ---
  duration_ms: 0.047336
  type: 'test'
  ...
# Subtest: should not mutate the findings or hits when markRepeats runs
ok 34 - should not mutate the findings or hits when markRepeats runs
  ---
  duration_ms: 0.08169
  type: 'test'
  ...
# Subtest: should pass when a repeat of an unenforced rule has a proposal with a known level
ok 35 - should pass when a repeat of an unenforced rule has a proposal with a known level
  ---
  duration_ms: 0.136121
  type: 'test'
  ...
# Subtest: should pass when a repeat of an unenforced rule has a proposal with a noLevel reason
ok 36 - should pass when a repeat of an unenforced rule has a proposal with a noLevel reason
  ---
  duration_ms: 0.047466
  type: 'test'
  ...
# Subtest: should name the finding when a repeat of an unenforced rule has no proposal
ok 37 - should name the finding when a repeat of an unenforced rule has no proposal
  ---
  duration_ms: 0.082781
  type: 'test'
  ...
# Subtest: should name the finding when its proposal has an empty noLevel
ok 38 - should name the finding when its proposal has an empty noLevel
  ---
  duration_ms: 0.043446
  type: 'test'
  ...
# Subtest: should name the finding when the only proposal with a level is for another finding
ok 39 - should name the finding when the only proposal with a level is for another finding
  ---
  duration_ms: 0.094047
  type: 'test'
  ...
# Subtest: should name the proposal when its level is not a known level
ok 40 - should name the proposal when its level is not a known level
  ---
  duration_ms: 0.066749
  type: 'test'
  ...
# Subtest: should need a level when the rule has no entry or there are no entries
ok 41 - should need a level when the rule has no entry or there are no entries
  ---
  duration_ms: 0.05076
  type: 'test'
  ...
# Subtest: should need nothing when the repeated rule is enforced
ok 42 - should need nothing when the repeated rule is enforced
  ---
  duration_ms: 0.031528
  type: 'test'
  ...
# Subtest: should need nothing when the finding is not a repeat or names no rule
ok 43 - should need nothing when the finding is not a repeat or names no rule
  ---
  duration_ms: 0.032079
  type: 'test'
  ...
# Subtest: should never throw and return well-formed ids and errors when it parses 300 random markdown documents
ok 44 - should never throw and return well-formed ids and errors when it parses 300 random markdown documents
  ---
  duration_ms: 11.582701
  type: 'test'
  ...
1..44
# tests 44
# suites 0
# pass 44
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 112.008935
```

## EnfRef
<!-- verify: written by verify.mjs; sha256:44b18a72bdeaaab8 -->
env: cloud (local shell)
run: node --test rules/checks/rule-enforcers.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with EnfRef
```
TAP version 13
# Subtest: should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
ok 1 - should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
  ---
  duration_ms: 1.918679
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer path does not exist
ok 2 - should give a reason when the enforcer path does not exist
  ---
  duration_ms: 0.750017
  type: 'test'
  ...
# Subtest: should give a reason when the symbol is not in the file or the file is missing
ok 3 - should give a reason when the symbol is not in the file or the file is missing
  ---
  duration_ms: 0.869379
  type: 'test'
  ...
# Subtest: should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
ok 4 - should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
  ---
  duration_ms: 0.975437
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer is not a string, is absolute or leaves the repo
ok 5 - should give a reason when the enforcer is not a string, is absolute or leaves the repo
  ---
  duration_ms: 0.815047
  type: 'test'
  ...
# Subtest: should find no violations when every bullet has an id and every entry is valid
ok 6 - should find no violations when every bullet has an id and every entry is valid
  ---
  duration_ms: 3.622564
  type: 'test'
  ...
# Subtest: should report the line when a rule bullet has no id
ok 7 - should report the line when a rule bullet has no id
  ---
  duration_ms: 1.394708
  type: 'test'
  ...
# Subtest: should report the line when an id is not lowercase kebab or has another stem
ok 8 - should report the line when an id is not lowercase kebab or has another stem
  ---
  duration_ms: 1.253203
  type: 'test'
  ...
# Subtest: should report the line when one id is used twice in a file
ok 9 - should report the line when one id is used twice in a file
  ---
  duration_ms: 1.368296
  type: 'test'
  ...
# Subtest: should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
ok 10 - should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
  ---
  duration_ms: 1.748306
  type: 'test'
  ...
# Subtest: should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
ok 11 - should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
  ---
  duration_ms: 1.255743
  type: 'test'
  ...
# Subtest: should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
ok 12 - should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
  ---
  duration_ms: 1.00509
  type: 'test'
  ...
# Subtest: should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
ok 13 - should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.682067
  type: 'test'
  ...
# Subtest: should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
ok 14 - should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
  ---
  duration_ms: 1.347767
  type: 'test'
  ...
# Subtest: should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
ok 15 - should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
  ---
  duration_ms: 0.887832
  type: 'test'
  ...
# Subtest: should report a missing rules/enforcers.json when a rule file exists
ok 16 - should report a missing rules/enforcers.json when a rule file exists
  ---
  duration_ms: 1.065749
  type: 'test'
  ...
# Subtest: should return the violations sorted when there are several
ok 17 - should return the violations sorted when there are several
  ---
  duration_ms: 0.813167
  type: 'test'
  ...
# Subtest: should find the same violations when the repo root is reached through a symlinked folder
ok 18 - should find the same violations when the repo root is reached through a symlinked folder
  ---
  duration_ms: 3.467789
  type: 'test'
  ...
# Subtest: should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
ok 19 - should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
  ---
  duration_ms: 36.007343
  type: 'test'
  ...
# Subtest: should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
ok 20 - should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
  ---
  duration_ms: 32.792681
  type: 'test'
  ...
# Subtest: should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
ok 21 - should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
  ---
  duration_ms: 67.096509
  type: 'test'
  ...
# Subtest: should still run the CLI when the script is started through a symlinked folder
ok 22 - should still run the CLI when the script is started through a symlinked folder
  ---
  duration_ms: 30.783421
  type: 'test'
  ...
# Subtest: should check the current folder when the CLI runs with no arguments
ok 23 - should check the current folder when the CLI runs with no arguments
  ---
  duration_ms: 23.291686
  type: 'test'
  ...
# Subtest: should print nothing when the module is imported instead of started
ok 24 - should print nothing when the module is imported instead of started
  ---
  duration_ms: 48.242245
  type: 'test'
  ...
# Subtest: should give a reason when a ../ path leaves the repo even though the file exists there
ok 25 - should give a reason when a ../ path leaves the repo even though the file exists there
  ---
  duration_ms: 1.281242
  type: 'test'
  ...
# Subtest: should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
ok 26 - should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
  ---
  duration_ms: 1.462718
  type: 'test'
  ...
# Subtest: should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
ok 27 - should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
  ---
  duration_ms: 28.845999
  type: 'test'
  ...
1..27
# tests 27
# suites 0
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 350.891842
```

## CheckRefuse
<!-- verify: written by verify.mjs; sha256:450c1dabe03146aa -->
env: cloud (local shell)
run: node --test rules/checks/rule-enforcers.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with CheckRefuse
```
TAP version 13
# Subtest: should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
ok 1 - should accept a path, a folder, a path\#symbol and a ratchet id when each exists (EnfRef)
  ---
  duration_ms: 1.563072
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer path does not exist
ok 2 - should give a reason when the enforcer path does not exist
  ---
  duration_ms: 0.669809
  type: 'test'
  ...
# Subtest: should give a reason when the symbol is not in the file or the file is missing
ok 3 - should give a reason when the symbol is not in the file or the file is missing
  ---
  duration_ms: 0.804155
  type: 'test'
  ...
# Subtest: should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
ok 4 - should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)
  ---
  duration_ms: 1.562732
  type: 'test'
  ...
# Subtest: should give a reason when the enforcer is not a string, is absolute or leaves the repo
ok 5 - should give a reason when the enforcer is not a string, is absolute or leaves the repo
  ---
  duration_ms: 0.991458
  type: 'test'
  ...
# Subtest: should find no violations when every bullet has an id and every entry is valid
ok 6 - should find no violations when every bullet has an id and every entry is valid
  ---
  duration_ms: 2.443406
  type: 'test'
  ...
# Subtest: should report the line when a rule bullet has no id
ok 7 - should report the line when a rule bullet has no id
  ---
  duration_ms: 0.880093
  type: 'test'
  ...
# Subtest: should report the line when an id is not lowercase kebab or has another stem
ok 8 - should report the line when an id is not lowercase kebab or has another stem
  ---
  duration_ms: 0.907581
  type: 'test'
  ...
# Subtest: should report the line when one id is used twice in a file
ok 9 - should report the line when one id is used twice in a file
  ---
  duration_ms: 0.859124
  type: 'test'
  ...
# Subtest: should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
ok 10 - should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)
  ---
  duration_ms: 0.972725
  type: 'test'
  ...
# Subtest: should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
ok 11 - should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)
  ---
  duration_ms: 0.871672
  type: 'test'
  ...
# Subtest: should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
ok 12 - should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.674832
  type: 'test'
  ...
# Subtest: should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
ok 13 - should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)
  ---
  duration_ms: 0.598089
  type: 'test'
  ...
# Subtest: should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
ok 14 - should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)
  ---
  duration_ms: 1.337025
  type: 'test'
  ...
# Subtest: should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
ok 15 - should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)
  ---
  duration_ms: 0.870581
  type: 'test'
  ...
# Subtest: should report a missing rules/enforcers.json when a rule file exists
ok 16 - should report a missing rules/enforcers.json when a rule file exists
  ---
  duration_ms: 0.575087
  type: 'test'
  ...
# Subtest: should return the violations sorted when there are several
ok 17 - should return the violations sorted when there are several
  ---
  duration_ms: 0.684136
  type: 'test'
  ...
# Subtest: should find the same violations when the repo root is reached through a symlinked folder
ok 18 - should find the same violations when the repo root is reached through a symlinked folder
  ---
  duration_ms: 2.014673
  type: 'test'
  ...
# Subtest: should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
ok 19 - should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture
  ---
  duration_ms: 28.986275
  type: 'test'
  ...
# Subtest: should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
ok 20 - should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)
  ---
  duration_ms: 21.982347
  type: 'test'
  ...
# Subtest: should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
ok 21 - should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)
  ---
  duration_ms: 50.549808
  type: 'test'
  ...
# Subtest: should still run the CLI when the script is started through a symlinked folder
ok 22 - should still run the CLI when the script is started through a symlinked folder
  ---
  duration_ms: 22.9717
  type: 'test'
  ...
# Subtest: should check the current folder when the CLI runs with no arguments
ok 23 - should check the current folder when the CLI runs with no arguments
  ---
  duration_ms: 22.865815
  type: 'test'
  ...
# Subtest: should print nothing when the module is imported instead of started
ok 24 - should print nothing when the module is imported instead of started
  ---
  duration_ms: 41.021628
  type: 'test'
  ...
# Subtest: should give a reason when a ../ path leaves the repo even though the file exists there
ok 25 - should give a reason when a ../ path leaves the repo even though the file exists there
  ---
  duration_ms: 0.759176
  type: 'test'
  ...
# Subtest: should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
ok 26 - should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)
  ---
  duration_ms: 0.963086
  type: 'test'
  ...
# Subtest: should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
ok 27 - should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)
  ---
  duration_ms: 24.678097
  type: 'test'
  ...
1..27
# tests 27
# suites 0
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 286.529844
```

## CheckCI
<!-- verify: written by verify.mjs; sha256:bbdaf68d8907f5a8 -->
env: ci (gh check runs)
run: gh api repos/{owner}/{repo}/commits/809e4dafb208da8206e8b82c0a4d4023cbfb0b8b/check-runs (check "node 24 on ubuntu-latest")
result: pass
expect: exit 0
```
name: node 24 on ubuntu-latest
status: completed
conclusion: success
html_url: https://github.com/PNNutkung/skills/actions/runs/45961923136/job/140381510782
```

## CheckScope
<!-- verify: written by verify.mjs; sha256:cd8f949a5fd2bb82 -->
env: cloud (local shell)
run: node --test skills/retro/rules.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with CheckScope
```
TAP version 13
# Subtest: should export the statuses, levels and file names when the module loads
ok 1 - should export the statuses, levels and file names when the module loads
  ---
  duration_ms: 1.055969
  type: 'test'
  ...
# Subtest: should return each id with its line when every top-level bullet ends with a rule comment
ok 2 - should return each id with its line when every top-level bullet ends with a rule comment
  ---
  duration_ms: 0.469807
  type: 'test'
  ...
# Subtest: should return no ids and no errors when the file has no bullets
ok 3 - should return no ids and no errors when the file has no bullets
  ---
  duration_ms: 0.129592
  type: 'test'
  ...
# Subtest: should report the path and line when a bullet has no id (BulletIds)
ok 4 - should report the path and line when a bullet has no id (BulletIds)
  ---
  duration_ms: 0.135433
  type: 'test'
  ...
# Subtest: should report the line when the id sits on a continuation line instead of the first line
ok 5 - should report the line when the id sits on a continuation line instead of the first line
  ---
  duration_ms: 0.109941
  type: 'test'
  ...
# Subtest: should report the line when the rule comment is followed by more text
ok 6 - should report the line when the rule comment is followed by more text
  ---
  duration_ms: 0.064185
  type: 'test'
  ...
# Subtest: should report the line when the id has another file stem (IdShape)
ok 7 - should report the line when the id has another file stem (IdShape)
  ---
  duration_ms: 0.101633
  type: 'test'
  ...
# Subtest: should report the line when the slug is not lowercase kebab (IdShape)
ok 8 - should report the line when the slug is not lowercase kebab (IdShape)
  ---
  duration_ms: 0.202289
  type: 'test'
  ...
# Subtest: should report the second line when one id is used twice in the file (IdShape)
ok 9 - should report the second line when one id is used twice in the file (IdShape)
  ---
  duration_ms: 0.26802
  type: 'test'
  ...
# Subtest: should ignore bullets inside a fenced code block when the fence is plain or indented
ok 10 - should ignore bullets inside a fenced code block when the fence is plain or indented
  ---
  duration_ms: 0.275248
  type: 'test'
  ...
# Subtest: should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
ok 11 - should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
  ---
  duration_ms: 0.098231
  type: 'test'
  ...
# Subtest: should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
ok 12 - should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
  ---
  duration_ms: 0.051848
  type: 'test'
  ...
# Subtest: should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
ok 13 - should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
  ---
  duration_ms: 0.038473
  type: 'test'
  ...
# Subtest: should count lines the same way when the file has CRLF line ends
ok 14 - should count lines the same way when the file has CRLF line ends
  ---
  duration_ms: 0.042464
  type: 'test'
  ...
# Subtest: should use the file name without .md as the stem when the path is nested
ok 15 - should use the file name without .md as the stem when the path is nested
  ---
  duration_ms: 0.061656
  type: 'test'
  ...
# Subtest: should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
ok 16 - should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
  ---
  duration_ms: 0.967023
  type: 'test'
  ...
# Subtest: should return null entries when rules/enforcers.json is missing
ok 17 - should return null entries when rules/enforcers.json is missing
  ---
  duration_ms: 0.208477
  type: 'test'
  ...
# Subtest: should r
... [cut: the output was 10189 chars; the first and last 4000 are kept] ...
 pass and hits already in the file when addHits runs again (RuleHits)
  ---
  duration_ms: 0.079408
  type: 'test'
  ...
# Subtest: should return a copy equal to the old hits when no finding names a rule
ok 28 - should return a copy equal to the old hits when no finding names a rule
  ---
  duration_ms: 0.043296
  type: 'test'
  ...
# Subtest: should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)
ok 29 - should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)
  ---
  duration_ms: 0.12729
  type: 'test'
  ...
# Subtest: should not mark a repeat when the only hit of the rule is from the same branch
ok 30 - should not mark a repeat when the only hit of the rule is from the same branch
  ---
  duration_ms: 0.104874
  type: 'test'
  ...
# Subtest: should not mark a repeat when there are no hits and one evidence item
ok 31 - should not mark a repeat when there are no hits and one evidence item
  ---
  duration_ms: 0.049855
  type: 'test'
  ...
# Subtest: should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items
ok 32 - should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items
  ---
  duration_ms: 0.042518
  type: 'test'
  ...
# Subtest: should return a finding unchanged with no repeat key when it names no rule
ok 33 - should return a finding unchanged with no repeat key when it names no rule
  ---
  duration_ms: 0.054159
  type: 'test'
  ...
# Subtest: should not mutate the findings or hits when markRepeats runs
ok 34 - should not mutate the findings or hits when markRepeats runs
  ---
  duration_ms: 0.081749
  type: 'test'
  ...
# Subtest: should pass when a repeat of an unenforced rule has a proposal with a known level
ok 35 - should pass when a repeat of an unenforced rule has a proposal with a known level
  ---
  duration_ms: 0.138085
  type: 'test'
  ...
# Subtest: should pass when a repeat of an unenforced rule has a proposal with a noLevel reason
ok 36 - should pass when a repeat of an unenforced rule has a proposal with a noLevel reason
  ---
  duration_ms: 0.046208
  type: 'test'
  ...
# Subtest: should name the finding when a repeat of an unenforced rule has no proposal
ok 37 - should name the finding when a repeat of an unenforced rule has no proposal
  ---
  duration_ms: 0.03636
  type: 'test'
  ...
# Subtest: should name the finding when its proposal has an empty noLevel
ok 38 - should name the finding when its proposal has an empty noLevel
  ---
  duration_ms: 0.598206
  type: 'test'
  ...
# Subtest: should name the finding when the only proposal with a level is for another finding
ok 39 - should name the finding when the only proposal with a level is for another finding
  ---
  duration_ms: 0.075333
  type: 'test'
  ...
# Subtest: should name the proposal when its level is not a known level
ok 40 - should name the proposal when its level is not a known level
  ---
  duration_ms: 0.062894
  type: 'test'
  ...
# Subtest: should need a level when the rule has no entry or there are no entries
ok 41 - should need a level when the rule has no entry or there are no entries
  ---
  duration_ms: 0.050431
  type: 'test'
  ...
# Subtest: should need nothing when the repeated rule is enforced
ok 42 - should need nothing when the repeated rule is enforced
  ---
  duration_ms: 0.031767
  type: 'test'
  ...
# Subtest: should need nothing when the finding is not a repeat or names no rule
ok 43 - should need nothing when the finding is not a repeat or names no rule
  ---
  duration_ms: 0.032063
  type: 'test'
  ...
# Subtest: should never throw and return well-formed ids and errors when it parses 300 random markdown documents
ok 44 - should never throw and return well-formed ids and errors when it parses 300 random markdown documents
  ---
  duration_ms: 9.443189
  type: 'test'
  ...
1..44
# tests 44
# suites 0
# pass 44
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 110.289334
```

## FindingRule
<!-- verify: written by verify.mjs; sha256:caa0535326aae642 -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with FindingRule
```
TAP version 13
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 1 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 268.02678
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 2 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 241.152261
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 3 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 204.671528
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 4 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 188.956947
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 5 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 203.555927
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 6 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 230.366888
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 7 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 292.385554
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 8 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 301.153114
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1987.862702
```

## RuleHits
<!-- verify: written by verify.mjs; sha256:f926a57df2f04a13 -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs skills/retro/rules.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with RuleHits
```
TAP version 13
# Subtest: should export the statuses, levels and file names when the module loads
ok 1 - should export the statuses, levels and file names when the module loads
  ---
  duration_ms: 1.333649
  type: 'test'
  ...
# Subtest: should return each id with its line when every top-level bullet ends with a rule comment
ok 2 - should return each id with its line when every top-level bullet ends with a rule comment
  ---
  duration_ms: 0.649228
  type: 'test'
  ...
# Subtest: should return no ids and no errors when the file has no bullets
ok 3 - should return no ids and no errors when the file has no bullets
  ---
  duration_ms: 0.16849
  type: 'test'
  ...
# Subtest: should report the path and line when a bullet has no id (BulletIds)
ok 4 - should report the path and line when a bullet has no id (BulletIds)
  ---
  duration_ms: 0.161295
  type: 'test'
  ...
# Subtest: should report the line when the id sits on a continuation line instead of the first line
ok 5 - should report the line when the id sits on a continuation line instead of the first line
  ---
  duration_ms: 0.129476
  type: 'test'
  ...
# Subtest: should report the line when the rule comment is followed by more text
ok 6 - should report the line when the rule comment is followed by more text
  ---
  duration_ms: 0.131518
  type: 'test'
  ...
# Subtest: should report the line when the id has another file stem (IdShape)
ok 7 - should report the line when the id has another file stem (IdShape)
  ---
  duration_ms: 0.138942
  type: 'test'
  ...
# Subtest: should report the line when the slug is not lowercase kebab (IdShape)
ok 8 - should report the line when the slug is not lowercase kebab (IdShape)
  ---
  duration_ms: 0.303936
  type: 'test'
  ...
# Subtest: should report the second line when one id is used twice in the file (IdShape)
ok 9 - should report the second line when one id is used twice in the file (IdShape)
  ---
  duration_ms: 0.248721
  type: 'test'
  ...
# Subtest: should ignore bullets inside a fenced code block when the fence is plain or indented
ok 10 - should ignore bullets inside a fenced code block when the fence is plain or indented
  ---
  duration_ms: 0.320956
  type: 'test'
  ...
# Subtest: should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
ok 11 - should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
  ---
  duration_ms: 0.109551
  type: 'test'
  ...
# Subtest: should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
ok 12 - should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
  ---
  duration_ms: 0.059661
  type: 'test'
  ...
# Subtest: should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
ok 13 - should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
  ---
  duration_ms: 0.039574
  type: 'test'
  ...
# Subtest: should count lines the same way when the file has CRLF line ends
ok 14 - should count lines the same way when the file has CRLF line ends
  ---
  duration_ms: 0.043973
  type: 'test'
  ...
# Subtest: should use the file name without .md as the stem when the path is nested
ok 15 - should use the file name without .md as the stem when the path is nested
  ---
  duration_ms: 0.065789
  type: 'test'
  ...
# Subtest: should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
ok 16 - should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
  ---
  duration_ms: 0.638934
  type: 'test'
  ...
# Subtest: should return null entries when rules/enforcers.json is missing
ok 17 - should return null entries when rules/enforcers.json is missing
  ---
  duration_ms: 0.194219
  type: 'test'
  ...
# Subtest: should r
... [cut: the output was 12516 chars; the first and last 4000 are kept] ...
 has no proposal
  ---
  duration_ms: 0.042613
  type: 'test'
  ...
# Subtest: should name the finding when its proposal has an empty noLevel
ok 38 - should name the finding when its proposal has an empty noLevel
  ---
  duration_ms: 0.751245
  type: 'test'
  ...
# Subtest: should name the finding when the only proposal with a level is for another finding
ok 39 - should name the finding when the only proposal with a level is for another finding
  ---
  duration_ms: 0.114202
  type: 'test'
  ...
# Subtest: should name the proposal when its level is not a known level
ok 40 - should name the proposal when its level is not a known level
  ---
  duration_ms: 0.077232
  type: 'test'
  ...
# Subtest: should need a level when the rule has no entry or there are no entries
ok 41 - should need a level when the rule has no entry or there are no entries
  ---
  duration_ms: 0.051612
  type: 'test'
  ...
# Subtest: should need nothing when the repeated rule is enforced
ok 42 - should need nothing when the repeated rule is enforced
  ---
  duration_ms: 0.035487
  type: 'test'
  ...
# Subtest: should need nothing when the finding is not a repeat or names no rule
ok 43 - should need nothing when the finding is not a repeat or names no rule
  ---
  duration_ms: 0.036276
  type: 'test'
  ...
# Subtest: should never throw and return well-formed ids and errors when it parses 300 random markdown documents
ok 44 - should never throw and return well-formed ids and errors when it parses 300 random markdown documents
  ---
  duration_ms: 8.395912
  type: 'test'
  ...
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 45 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 273.433828
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 46 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 250.088409
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 47 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 224.534832
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 48 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 204.301102
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 49 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 195.370818
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 50 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 222.168426
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 51 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 260.599993
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 52 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 306.733106
  type: 'test'
  ...
1..52
# tests 52
# suites 0
# pass 52
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2010.140869
```

## Repeat
<!-- verify: written by verify.mjs; sha256:01efd5d4bfaa9a37 -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs skills/retro/rules.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Repeat
```
TAP version 13
# Subtest: should export the statuses, levels and file names when the module loads
ok 1 - should export the statuses, levels and file names when the module loads
  ---
  duration_ms: 1.11631
  type: 'test'
  ...
# Subtest: should return each id with its line when every top-level bullet ends with a rule comment
ok 2 - should return each id with its line when every top-level bullet ends with a rule comment
  ---
  duration_ms: 0.407207
  type: 'test'
  ...
# Subtest: should return no ids and no errors when the file has no bullets
ok 3 - should return no ids and no errors when the file has no bullets
  ---
  duration_ms: 0.12903
  type: 'test'
  ...
# Subtest: should report the path and line when a bullet has no id (BulletIds)
ok 4 - should report the path and line when a bullet has no id (BulletIds)
  ---
  duration_ms: 0.131427
  type: 'test'
  ...
# Subtest: should report the line when the id sits on a continuation line instead of the first line
ok 5 - should report the line when the id sits on a continuation line instead of the first line
  ---
  duration_ms: 0.166782
  type: 'test'
  ...
# Subtest: should report the line when the rule comment is followed by more text
ok 6 - should report the line when the rule comment is followed by more text
  ---
  duration_ms: 0.06838
  type: 'test'
  ...
# Subtest: should report the line when the id has another file stem (IdShape)
ok 7 - should report the line when the id has another file stem (IdShape)
  ---
  duration_ms: 0.101704
  type: 'test'
  ...
# Subtest: should report the line when the slug is not lowercase kebab (IdShape)
ok 8 - should report the line when the slug is not lowercase kebab (IdShape)
  ---
  duration_ms: 0.210821
  type: 'test'
  ...
# Subtest: should report the second line when one id is used twice in the file (IdShape)
ok 9 - should report the second line when one id is used twice in the file (IdShape)
  ---
  duration_ms: 0.285521
  type: 'test'
  ...
# Subtest: should ignore bullets inside a fenced code block when the fence is plain or indented
ok 10 - should ignore bullets inside a fenced code block when the fence is plain or indented
  ---
  duration_ms: 0.303879
  type: 'test'
  ...
# Subtest: should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
ok 11 - should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
  ---
  duration_ms: 0.108949
  type: 'test'
  ...
# Subtest: should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
ok 12 - should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
  ---
  duration_ms: 0.053006
  type: 'test'
  ...
# Subtest: should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
ok 13 - should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
  ---
  duration_ms: 0.038273
  type: 'test'
  ...
# Subtest: should count lines the same way when the file has CRLF line ends
ok 14 - should count lines the same way when the file has CRLF line ends
  ---
  duration_ms: 0.044896
  type: 'test'
  ...
# Subtest: should use the file name without .md as the stem when the path is nested
ok 15 - should use the file name without .md as the stem when the path is nested
  ---
  duration_ms: 0.086553
  type: 'test'
  ...
# Subtest: should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
ok 16 - should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
  ---
  duration_ms: 0.999129
  type: 'test'
  ...
# Subtest: should return null entries when rules/enforcers.json is missing
ok 17 - should return null entries when rules/enforcers.json is missing
  ---
  duration_ms: 0.272965
  type: 'test'
  ...
# Subtest: should ret
... [cut: the output was 12512 chars; the first and last 4000 are kept] ...
 has no proposal
  ---
  duration_ms: 0.036693
  type: 'test'
  ...
# Subtest: should name the finding when its proposal has an empty noLevel
ok 38 - should name the finding when its proposal has an empty noLevel
  ---
  duration_ms: 0.710103
  type: 'test'
  ...
# Subtest: should name the finding when the only proposal with a level is for another finding
ok 39 - should name the finding when the only proposal with a level is for another finding
  ---
  duration_ms: 0.080772
  type: 'test'
  ...
# Subtest: should name the proposal when its level is not a known level
ok 40 - should name the proposal when its level is not a known level
  ---
  duration_ms: 0.068007
  type: 'test'
  ...
# Subtest: should need a level when the rule has no entry or there are no entries
ok 41 - should need a level when the rule has no entry or there are no entries
  ---
  duration_ms: 0.048398
  type: 'test'
  ...
# Subtest: should need nothing when the repeated rule is enforced
ok 42 - should need nothing when the repeated rule is enforced
  ---
  duration_ms: 0.031858
  type: 'test'
  ...
# Subtest: should need nothing when the finding is not a repeat or names no rule
ok 43 - should need nothing when the finding is not a repeat or names no rule
  ---
  duration_ms: 0.032241
  type: 'test'
  ...
# Subtest: should never throw and return well-formed ids and errors when it parses 300 random markdown documents
ok 44 - should never throw and return well-formed ids and errors when it parses 300 random markdown documents
  ---
  duration_ms: 10.376656
  type: 'test'
  ...
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 45 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 249.87873
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 46 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 204.138287
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 47 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 200.327179
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 48 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 196.772946
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 49 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 191.858384
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 50 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 235.478088
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 51 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 293.836595
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 52 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 308.869958
  type: 'test'
  ...
1..52
# tests 52
# suites 0
# pass 52
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1960.445148
```

## Unenforced
<!-- verify: written by verify.mjs; sha256:d8d147d7b0070cbe -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs skills/retro/rules.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Unenforced
```
TAP version 13
# Subtest: should export the statuses, levels and file names when the module loads
ok 1 - should export the statuses, levels and file names when the module loads
  ---
  duration_ms: 1.107432
  type: 'test'
  ...
# Subtest: should return each id with its line when every top-level bullet ends with a rule comment
ok 2 - should return each id with its line when every top-level bullet ends with a rule comment
  ---
  duration_ms: 0.476455
  type: 'test'
  ...
# Subtest: should return no ids and no errors when the file has no bullets
ok 3 - should return no ids and no errors when the file has no bullets
  ---
  duration_ms: 0.132228
  type: 'test'
  ...
# Subtest: should report the path and line when a bullet has no id (BulletIds)
ok 4 - should report the path and line when a bullet has no id (BulletIds)
  ---
  duration_ms: 0.138504
  type: 'test'
  ...
# Subtest: should report the line when the id sits on a continuation line instead of the first line
ok 5 - should report the line when the id sits on a continuation line instead of the first line
  ---
  duration_ms: 0.110437
  type: 'test'
  ...
# Subtest: should report the line when the rule comment is followed by more text
ok 6 - should report the line when the rule comment is followed by more text
  ---
  duration_ms: 0.065012
  type: 'test'
  ...
# Subtest: should report the line when the id has another file stem (IdShape)
ok 7 - should report the line when the id has another file stem (IdShape)
  ---
  duration_ms: 0.103727
  type: 'test'
  ...
# Subtest: should report the line when the slug is not lowercase kebab (IdShape)
ok 8 - should report the line when the slug is not lowercase kebab (IdShape)
  ---
  duration_ms: 0.209275
  type: 'test'
  ...
# Subtest: should report the second line when one id is used twice in the file (IdShape)
ok 9 - should report the second line when one id is used twice in the file (IdShape)
  ---
  duration_ms: 0.263207
  type: 'test'
  ...
# Subtest: should ignore bullets inside a fenced code block when the fence is plain or indented
ok 10 - should ignore bullets inside a fenced code block when the fence is plain or indented
  ---
  duration_ms: 0.273992
  type: 'test'
  ...
# Subtest: should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
ok 11 - should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)
  ---
  duration_ms: 0.100697
  type: 'test'
  ...
# Subtest: should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
ok 12 - should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)
  ---
  duration_ms: 0.051824
  type: 'test'
  ...
# Subtest: should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
ok 13 - should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)
  ---
  duration_ms: 0.037646
  type: 'test'
  ...
# Subtest: should count lines the same way when the file has CRLF line ends
ok 14 - should count lines the same way when the file has CRLF line ends
  ---
  duration_ms: 0.043682
  type: 'test'
  ...
# Subtest: should use the file name without .md as the stem when the path is nested
ok 15 - should use the file name without .md as the stem when the path is nested
  ---
  duration_ms: 0.059873
  type: 'test'
  ...
# Subtest: should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
ok 16 - should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)
  ---
  duration_ms: 0.504658
  type: 'test'
  ...
# Subtest: should return null entries when rules/enforcers.json is missing
ok 17 - should return null entries when rules/enforcers.json is missing
  ---
  duration_ms: 0.148646
  type: 'test'
  ...
# Subtest: should 
... [cut: the output was 12511 chars; the first and last 4000 are kept] ...
rule has no proposal
  ---
  duration_ms: 0.03681
  type: 'test'
  ...
# Subtest: should name the finding when its proposal has an empty noLevel
ok 38 - should name the finding when its proposal has an empty noLevel
  ---
  duration_ms: 0.536439
  type: 'test'
  ...
# Subtest: should name the finding when the only proposal with a level is for another finding
ok 39 - should name the finding when the only proposal with a level is for another finding
  ---
  duration_ms: 0.07412
  type: 'test'
  ...
# Subtest: should name the proposal when its level is not a known level
ok 40 - should name the proposal when its level is not a known level
  ---
  duration_ms: 0.104824
  type: 'test'
  ...
# Subtest: should need a level when the rule has no entry or there are no entries
ok 41 - should need a level when the rule has no entry or there are no entries
  ---
  duration_ms: 0.056735
  type: 'test'
  ...
# Subtest: should need nothing when the repeated rule is enforced
ok 42 - should need nothing when the repeated rule is enforced
  ---
  duration_ms: 0.03283
  type: 'test'
  ...
# Subtest: should need nothing when the finding is not a repeat or names no rule
ok 43 - should need nothing when the finding is not a repeat or names no rule
  ---
  duration_ms: 0.032182
  type: 'test'
  ...
# Subtest: should never throw and return well-formed ids and errors when it parses 300 random markdown documents
ok 44 - should never throw and return well-formed ids and errors when it parses 300 random markdown documents
  ---
  duration_ms: 7.86282
  type: 'test'
  ...
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 45 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 228.737365
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 46 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 227.301173
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 47 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 206.438179
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 48 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 186.205345
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 49 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 197.239837
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 50 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 246.109079
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 51 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 263.704731
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 52 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 337.424176
  type: 'test'
  ...
1..52
# tests 52
# suites 0
# pass 52
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1967.204172
```

## LevelGate
<!-- verify: written by verify.mjs; sha256:0c12dea567d3de99 -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with LevelGate
```
TAP version 13
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 1 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 236.149762
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 2 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 221.33752
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 3 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 207.653422
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 4 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 215.631795
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 5 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 183.434289
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 6 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 251.469113
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 7 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 275.808352
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 8 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 275.122175
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1920.085457
```

## Report
<!-- verify: written by verify.mjs; sha256:eb64ce75225d9cc6 -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs skills/retro/report.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Report
```
TAP version 13
# Subtest: should write headings in the user's language and ids in English when the report is rendered (OLang)
ok 1 - should write headings in the user's language and ids in English when the report is rendered (OLang)
  ---
  duration_ms: 1.297756
  type: 'test'
  ...
# Subtest: should create the log with a header and append one line when a retro is logged (OLog)
ok 2 - should create the log with a header and append one line when a retro is logged (OLog)
  ---
  duration_ms: 0.272238
  type: 'test'
  ...
# Subtest: should count one finding as 1 and give reasons only for findings that did not pass when the report is rendered
ok 3 - should count one finding as 1 and give reasons only for findings that did not pass when the report is rendered
  ---
  duration_ms: 0.087275
  type: 'test'
  ...
# Subtest: should print none under the proposals heading only when there are no proposals
ok 4 - should print none under the proposals heading only when there are no proposals
  ---
  duration_ms: 0.131408
  type: 'test'
  ...
# Subtest: should list only repeats of unenforced rules when some repeats are of enforced rules (Report)
ok 5 - should list only repeats of unenforced rules when some repeats are of enforced rules (Report)
  ---
  duration_ms: 0.591253
  type: 'test'
  ...
# Subtest: should list the answer letters when a proposal offers options (RLetter)
ok 6 - should list the answer letters when a proposal offers options (RLetter)
  ---
  duration_ms: 0.135212
  type: 'test'
  ...
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 7 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 199.705281
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 8 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 200.451675
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 9 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 182.43368
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 10 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 213.867804
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 11 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 199.077899
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 12 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 212.364923
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 13 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 265.266933
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 14 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 272.910685
  type: 'test'
  ...
1..14
# tests 14
# suites 0
# pass 14
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1838.331484
```

## FlagOff
<!-- verify: written by verify.mjs; sha256:457933a30dbe6c8e -->
env: cloud (local shell)
run: cd /tmp/claude-0/-home-user/95cba5ed-457f-5e77-8ec1-a67ae7df8a86/scratchpad/flagfix && node /home/user/skills/skills/retro/retro.mjs check --run /tmp/retro-0/feat-2026-11-27T07-49-50-311Z
result: pass
expect: exit 0; regex /^\{"ok":true,"counts":\{"passed":1,/m
```
--- 1/3 RETRO_UNENFORCED_RULE_CHECK_ENABLED unset (default true): exit 0 ---
{"ok":true,"counts":{"passed":1,"not-passed":0,"no-evidence":0},"errors":[],"report":"/tmp/retro-0/feat-2026-11-27T07-49-50-311Z/report.md"}
--- 2/3 RETRO_UNENFORCED_RULE_CHECK_ENABLED=false: exit 0 ---
{"ok":true,"counts":{"passed":1,"not-passed":0,"no-evidence":0},"errors":[],"report":"/tmp/retro-0/feat-2026-11-27T07-49-50-311Z/report.md"}
--- 3/3 RETRO_UNENFORCED_RULE_CHECK_ENABLED=maybe (invalid): exit 2 ---
{"ok":false,"errors":["RETRO_UNENFORCED_RULE_CHECK_ENABLED=maybe is not valid: use true or false"]}
RETRO_UNENFORCED_RULE_CHECK_ENABLED=maybe is not valid: use true or false
```

## FlagBad
<!-- verify: written by verify.mjs; sha256:b3ac52db9d88cf3f -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with FlagBad
```
TAP version 13
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 1 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 223.860897
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 2 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 217.250144
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 3 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 199.210808
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 4 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 213.480042
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 5 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 217.127483
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 6 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 227.418697
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 7 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 255.406849
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 8 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 262.992126
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1870.083607
```

## Seed
<!-- verify: written by verify.mjs; sha256:cddd59205b426bdb -->
env: cloud (local shell)
run: node -e "const h=require('./docs/retro/rule-hits.json'),e=require('./rules/enforcers.json');console.log('seed hits: '+h.filter(x=>x.branch.startsWith('seed:')).length+', unknown rules: '+h.filter(x=>!(x.rule in e)).length)"
result: pass
expect: exit 0; regex /^seed hits: 10, unknown rules: 0$/m
```
seed hits: 10, unknown rules: 0
```

## Rows
<!-- verify: written by verify.mjs; sha256:c10c67c9a360b76d -->
env: cloud (local shell)
run: node rules/checks/rule-enforcers.mjs
result: pass
expect: exit 0; text "{"ok":true,"violations":[]}"
```
{"ok":true,"violations":[]}
```

## Compat
<!-- verify: written by verify.mjs; sha256:5c64fa9aaf1e4b7a -->
env: cloud (local shell)
run: node --test skills/retro/unenforced.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Compat
```
TAP version 13
# Subtest: should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
ok 1 - should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat, FindingRule)
  ---
  duration_ms: 214.543251
  type: 'test'
  ...
# Subtest: should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
ok 2 - should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)
  ---
  duration_ms: 219.471759
  type: 'test'
  ...
# Subtest: should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
ok 3 - should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)
  ---
  duration_ms: 197.927236
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
ok 4 - should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)
  ---
  duration_ms: 207.372295
  type: 'test'
  ...
# Subtest: should check findings with no rule field exactly as before when the hits file names the rule (Compat)
ok 5 - should check findings with no rule field exactly as before when the hits file names the rule (Compat)
  ---
  duration_ms: 186.801362
  type: 'test'
  ...
# Subtest: should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
ok 6 - should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)
  ---
  duration_ms: 227.228463
  type: 'test'
  ...
# Subtest: should add no hit when log runs a second time on the same run (RuleHits)
ok 7 - should add no hit when log runs a second time on the same run (RuleHits)
  ---
  duration_ms: 255.524857
  type: 'test'
  ...
# Subtest: should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
ok 8 - should stop with exit 2 naming the file and write no log line when rule-hits.json or enforcers.json is not JSON (RuleHits)
  ---
  duration_ms: 326.94882
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1881.205306
```

