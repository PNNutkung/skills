# Verify: verify-skill (ADR 0008)

## Plan
<!-- verify: written by verify.mjs; sha256:54424be40c7fc6b5 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Plan
```
TAP version 13
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 1 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 4.700076
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 2 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.334397
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 3 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.608587
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 4 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.222495
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 5 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.316838
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 6 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 7.65697
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 7 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.341574
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 8 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.291144
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 9 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.387857
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 10 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.25176
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 11 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.151158
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 12 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.134297
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 13 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.077142
  type: 'test'
  ...
# Subtest: should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
ok 14 - should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
  ---
  duration_ms: 9.14548
  type: 'test'
  ...
# Subtest: should print the run dir, items, boo
... [cut: the output was 14924 chars; the first and last 4000 are kept] ...
  ---
  duration_ms: 129.481441
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 40 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 75.11688
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 41 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 189.514051
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 42 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 359.033891
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 43 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 348.989414
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 44 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 96.95662
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 45 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 287.372376
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 46 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 165.162683
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 47 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 268.558251
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 48 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 188.156893
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 49 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 226.745805
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 50 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 261.755095
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 51 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 249.29276
  type: 'test'
  ...
1..51
# tests 51
# suites 0
# pass 51
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7726.491403
```

## Run
<!-- verify: written by verify.mjs; sha256:bbafc2dcb64fed56 -->
env: cloud (local shell)
run: node --test skills/verify/runner.test.mjs skills/verify/section.test.mjs skills/verify/verify.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Run
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 737.272527
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 439.762678
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 661.174883
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1349.296665
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 367.678048
  type: 'test'
  ...
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 6 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 13.563219
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 7 - should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
  ---
  duration_ms: 1040.949763
  type: 'test'
  ...
# Subtest: should finish without a timeout when the command ends before the limit (Timeout happy)
ok 8 - should finish without a timeout when the command ends before the limit (Timeout happy)
  ---
  duration_ms: 8.27185
  type: 'test'
  ...
# Subtest: should report the error and not hang when the command cannot start (Run fail)
ok 9 - should report the error and not hang when the command cannot start (Run fail)
  ---
  duration_ms: 8.634597
  type: 'test'
  ...
# Subtest: should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
ok 10 - should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
  ---
  duration_ms: 14.311353
  type: 'test'
  ...
# Subtest: should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
ok 11 - should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
  ---
  duration_ms: 2.7097
  type: 'test'
  ...
# Subtest: should keep output that holds fences or headings inside its block when the command printed them (Run edge)
ok 12 - should keep output that holds fences or headings inside its block when the command printed them (Run edge)
  ---
  duration_ms: 0.529161
  type: 'test'
  ...
# Subtest: should cut long output to head and tail and say so when it is over the cap (Run edge)
ok 13 - should cut long output to head and tail and say so when it is over the cap (Run edge)
  ---
  duration_ms: 0.32889
  type: 'test'
  ...
# Subtest: should start a new file with the title and the sections when the verify file does not exist (Rerun)
ok 14 - should start a new file with the title and the sections when the verify file does not exist (Rerun)
  ---
  duration_ms: 0.359733
  type: 'test'
  ...
# Subtest: should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)
ok 15 - sh
... [cut: the output was 16791 chars; the first and last 4000 are kept] ...
---
  duration_ms: 160.134613
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 47 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 76.464046
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 48 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 183.023645
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 49 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 378.231271
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 50 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 371.237321
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 51 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 79.954675
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 52 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 299.456612
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 53 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 117.292101
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 54 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 268.971264
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 55 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 163.804256
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 56 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 228.210288
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 57 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 263.71735
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 58 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 249.142078
  type: 'test'
  ...
1..58
# tests 58
# suites 0
# pass 58
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7917.577114
```

## Source
<!-- verify: written by verify.mjs; sha256:42b946a1ec1f82cb -->
env: cloud (local shell)
run: node --test skills/verify/adr.test.mjs skills/verify/claims.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Source
```
TAP version 13
# Subtest: should list each DoD item id with its text when the ADR has a Definition of done (Source)
ok 1 - should list each DoD item id with its text when the ADR has a Definition of done (Source)
  ---
  duration_ms: 3.464793
  type: 'test'
  ...
# Subtest: should list no items when the ADR has no Definition of done heading (Source fail)
ok 2 - should list no items when the ADR has no Definition of done heading (Source fail)
  ---
  duration_ms: 0.195195
  type: 'test'
  ...
# Subtest: should book each bracketed env name once, lowercased, when the verify env line names them (Envs)
ok 3 - should book each bracketed env name once, lowercased, when the verify env line names them (Envs)
  ---
  duration_ms: 4.465693
  type: 'test'
  ...
# Subtest: should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)
ok 4 - should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)
  ---
  duration_ms: 0.694133
  type: 'test'
  ...
# Subtest: should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)
ok 5 - should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)
  ---
  duration_ms: 0.438666
  type: 'test'
  ...
# Subtest: should take the four-digit number from the ADR file name when it has one (Run edge)
ok 6 - should take the four-digit number from the ADR file name when it has one (Run edge)
  ---
  duration_ms: 0.228038
  type: 'test'
  ...
# Subtest: should list a flag once with its digits when the text names it twice and it has digits 2 to 9 (FlagRuns edge)
ok 7 - should list a flag once with its digits when the text names it twice and it has digits 2 to 9 (FlagRuns edge)
  ---
  duration_ms: 0.287327
  type: 'test'
  ...
# Subtest: should read items right below the heading and a flag removed at the start when the ADR is that short (Source edge)
ok 8 - should read items right below the heading and a flag removed at the start when the ADR is that short (Source edge)
  ---
  duration_ms: 0.208595
  type: 'test'
  ...
# Subtest: should list added flags, CLI options and config keys with their files when the branch diff adds them (Source)
ok 9 - should list added flags, CLI options and config keys with their files when the branch diff adds them (Source)
  ---
  duration_ms: 4.119952
  type: 'test'
  ...
# Subtest: should list nothing when the diff only removes or keeps lines (Source edge)
ok 10 - should list nothing when the diff only removes or keeps lines (Source edge)
  ---
  duration_ms: 0.143924
  type: 'test'
  ...
# Subtest: should make confirmed claims the items when each answer is in answers.md (Source)
ok 11 - should make confirmed claims the items when each answer is in answers.md (Source)
  ---
  duration_ms: 8.751957
  type: 'test'
  ...
# Subtest: should refuse a claim with no answer, a missing answer, a bad id or a duplicate when claims.json is wrong (Source fail)
ok 12 - should refuse a claim with no answer, a missing answer, a bad id or a duplicate when claims.json is wrong (Source fail)
  ---
  duration_ms: 0.320934
  type: 'test'
  ...
# Subtest: should list an option with digits 2 to 9 when the diff adds one (Source edge)
ok 13 - should list an option with digits 2 to 9 when the diff adds one (Source edge)
  ---
  duration_ms: 0.123854
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 14 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 132.65505
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 15 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 74.367035
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag 
... [cut: the output was 14380 chars; the first and last 4000 are kept] ...

  ---
  duration_ms: 115.232787
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 39 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 74.246141
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 40 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 187.392447
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 41 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 315.136935
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 42 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 382.641346
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 43 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 88.21664
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 44 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 305.677203
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 45 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 98.03894
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 46 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 286.492896
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 47 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 146.926577
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 48 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 224.308852
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 49 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 284.724612
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 50 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 287.018939
  type: 'test'
  ...
1..50
# tests 50
# suites 0
# pass 50
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7616.33313
```

## FlagRuns
<!-- verify: written by verify.mjs; sha256:85a57b87f3516888 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with FlagRuns
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 752.942979
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 525.587661
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 678.632922
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1436.814251
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 325.568517
  type: 'test'
  ...
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 6 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 10.03729
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 7 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.199687
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 8 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.462839
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 9 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.14065
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 10 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.179397
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 11 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.376772
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 12 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.253424
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 13 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 14.66615
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 14 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or
... [cut: the output was 16440 chars; the first and last 4000 are kept] ...
--
  duration_ms: 145.353975
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 45 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 83.548375
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 46 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 184.530551
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 47 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 432.346122
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 48 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 402.394802
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 49 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 75.735998
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 50 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 279.895275
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 51 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 121.366376
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 52 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 282.897533
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 53 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 151.756661
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 54 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 226.010499
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 55 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 250.114922
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 56 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 261.853308
  type: 'test'
  ...
1..56
# tests 56
# suites 0
# pass 56
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7911.707313
```

## Expect
<!-- verify: written by verify.mjs; sha256:170a7f4b10945c59 -->
env: cloud (local shell)
run: node --test skills/verify/expect.test.mjs skills/verify/fuzz.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Expect
```
TAP version 13
# Subtest: should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
ok 1 - should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
  ---
  duration_ms: 3.896115
  type: 'test'
  ...
# Subtest: should fail and say why when the exit code or the expected text is wrong (Expect fail)
ok 2 - should fail and say why when the exit code or the expected text is wrong (Expect fail)
  ---
  duration_ms: 0.293763
  type: 'test'
  ...
# Subtest: should pass a must-fail check only when it exits with the code the plan names (Expect edge)
ok 3 - should pass a must-fail check only when it exits with the code the plan names (Expect edge)
  ---
  duration_ms: 0.099734
  type: 'test'
  ...
# Subtest: should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
ok 4 - should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
  ---
  duration_ms: 0.149574
  type: 'test'
  ...
# Subtest: should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
ok 5 - should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
  ---
  duration_ms: 0.623028
  type: 'test'
  ...
# Subtest: should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
ok 6 - should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
  ---
  duration_ms: 0.861094
  type: 'test'
  ...
# Subtest: should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
ok 7 - should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
  ---
  duration_ms: 0.191686
  type: 'test'
  ...
# Subtest: should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
ok 8 - should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
  ---
  duration_ms: 4.805051
  type: 'test'
  ...
# Subtest: should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
ok 9 - should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
  ---
  duration_ms: 0.603373
  type: 'test'
  ...
# Subtest: should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
ok 10 - should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
  ---
  duration_ms: 0.3802
  type: 'test'
  ...
# Subtest: should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
ok 11 - should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
  ---
  duration_ms: 0.218309
  type: 'test'
  ...
# Subtest: should describe only the exit and the text when the expect is plain text or absent (Expect)
ok 12 - should describe only the exit and the text when the expect is plain text or absent (Expect)
  ---
  duration_ms: 0.079803
  type: 'test'
  ...
# Subtest: should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
ok 13 - should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
  ---
  duration_ms: 0.11152
  type: 'test'
  ...
# Subtest: should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
ok 14 - should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
  ---
  duration_ms: 0.048602
  type: 'test'
  ...
# Subtest: should find the flag error only on a line that names the flag and the bad value and is not a test result when the invalid run printed it (FlagRuns)
ok 15 - should find the flag error only on a line that names the flag and the bad value and is not a test result when the invalid run printed it (FlagRuns)
  ---
  duration_ms: 1.955507
  type: 'test'
  ...
# Subtest: should refuse a must-fail entry with no expect and accept one with an expect when the plan names an exit other than 0 (ExpectLint)
ok 16 - should refuse a must-fail entry with no expect and accept one with an expect when the plan names an exit other than 0 (ExpectLint)
  ---
  duration_ms: 0.278173
  type: 'test'
  ...
# Subtest: should never throw and never accept a plan that misses an item when plans are random (Plan)
ok 17 - should never throw and never accept a plan that misses an item when plans are random (Plan)
  ---
  duration_ms: 53.501491
  type: 'test'
  ...
# Subtest: should pass a node --test run only when the output really holds the preset lines when output is random (Presets, Expect)
ok 18 - should pass a node --test run only when the output really holds the preset lines when output is random (Presets, Expect)
  ---
  duration_ms: 4.007334
  type: 'test'
  ...
# Subtest: should never pass when a text expect is not in the random output or the exit is wrong (Expect)
ok 19 - should never pass when a text expect is not in the random output or the exit is wrong (Expect)
  ---
  duration_ms: 1.600404
  type: 'test'
  ...
# Subtest: should keep every hand-written byte and leave each new section intact when files and outputs are random (Rerun)
ok 20 - should keep every hand-written byte and leave each new section intact when files and outputs are random (Rerun)
  ---
  duration_ms: 40.576264
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 165.560536
```

## Presets
<!-- verify: written by verify.mjs; sha256:f4481013500ae675 -->
env: cloud (local shell)
run: node --test skills/verify/expect.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Presets
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 581.44093
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 299.846304
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 633.240985
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1334.137505
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 290.198207
  type: 'test'
  ...
# Subtest: should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
ok 6 - should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
  ---
  duration_ms: 2.05749
  type: 'test'
  ...
# Subtest: should fail and say why when the exit code or the expected text is wrong (Expect fail)
ok 7 - should fail and say why when the exit code or the expected text is wrong (Expect fail)
  ---
  duration_ms: 0.275245
  type: 'test'
  ...
# Subtest: should pass a must-fail check only when it exits with the code the plan names (Expect edge)
ok 8 - should pass a must-fail check only when it exits with the code the plan names (Expect edge)
  ---
  duration_ms: 0.102751
  type: 'test'
  ...
# Subtest: should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
ok 9 - should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
  ---
  duration_ms: 0.155604
  type: 'test'
  ...
# Subtest: should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
ok 10 - should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
  ---
  duration_ms: 0.614227
  type: 'test'
  ...
# Subtest: should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
ok 11 - should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
  ---
  duration_ms: 0.731106
  type: 'test'
  ...
# Subtest: should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
ok 12 - should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
  ---
  duration_ms: 0.170987
  type: 'test'
  ...
# Subtest: should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
ok 13 - should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
  ---
  duration_ms: 0.472812
  type: 'test'
  ...
# Subtest: should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
ok 14 - should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
  ---
  duration_ms: 0.694397
  type: 'test'
  ...
# Subtest: should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
ok 15 - should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
  ---
  duration_ms: 0.514444
  type: 'test'
  ...
# Subtest: should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
ok 16 - should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
  ---
  duration_ms: 0.242342
  type: 'test'
  ...
# Subtest: should describe only the exit and the text when the expect is plain text or absent (Expect)
ok 17 - should describe only the exit and the text when the expect is plain text or absent (Expect)
  ---
  duration_ms: 0.079972
  type: 'test'
  ...
# Subtest: should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
ok 18 - should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
  ---
  duration_ms: 0.115778
  type: 'test'
  ...
# Subtest: should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
ok 19 - should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
  ---
  duration_ms: 0.050476
  type: 'test'
  ...
# Subtest: should find the flag error only on a line that names the flag and the bad value and is not a test result when the invalid run printed it (FlagRuns)
ok 20 - should find the flag error only on a line that names the flag and the bad value and is not a test result when the invalid run printed it (FlagRuns)
  ---
  duration_ms: 0.453118
  type: 'test'
  ...
# Subtest: should refuse a must-fail entry with no expect and accept one with an expect when the plan names an exit other than 0 (ExpectLint)
ok 21 - should refuse a must-fail entry with no expect and accept one with an expect when the plan names an exit other than 0 (ExpectLint)
  ---
  duration_ms: 0.272368
  type: 'test'
  ...
1..21
# tests 21
# suites 0
# pass 21
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3205.729525
```

## ExpectLint
<!-- verify: written by verify.mjs; sha256:ced6513ac2ad262d -->
env: cloud (local shell)
run: node --test skills/verify/expect.test.mjs skills/verify/plan.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with ExpectLint
```
TAP version 13
# Subtest: should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
ok 1 - should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
  ---
  duration_ms: 2.091786
  type: 'test'
  ...
# Subtest: should fail and say why when the exit code or the expected text is wrong (Expect fail)
ok 2 - should fail and say why when the exit code or the expected text is wrong (Expect fail)
  ---
  duration_ms: 0.257408
  type: 'test'
  ...
# Subtest: should pass a must-fail check only when it exits with the code the plan names (Expect edge)
ok 3 - should pass a must-fail check only when it exits with the code the plan names (Expect edge)
  ---
  duration_ms: 0.147066
  type: 'test'
  ...
# Subtest: should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
ok 4 - should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
  ---
  duration_ms: 0.157711
  type: 'test'
  ...
# Subtest: should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
ok 5 - should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
  ---
  duration_ms: 0.548727
  type: 'test'
  ...
# Subtest: should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
ok 6 - should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
  ---
  duration_ms: 0.745949
  type: 'test'
  ...
# Subtest: should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
ok 7 - should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
  ---
  duration_ms: 0.166197
  type: 'test'
  ...
# Subtest: should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
ok 8 - should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
  ---
  duration_ms: 0.473485
  type: 'test'
  ...
# Subtest: should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
ok 9 - should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
  ---
  duration_ms: 0.714147
  type: 'test'
  ...
# Subtest: should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
ok 10 - should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
  ---
  duration_ms: 0.336142
  type: 'test'
  ...
# Subtest: should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
ok 11 - should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
  ---
  duration_ms: 0.202966
  type: 'test'
  ...
# Subtest: should describe only the exit and the text when the expect is plain text or absent (Expect)
ok 12 - should describe only the exit and the text when the expect is plain text or absent (Expect)
  ---
  duration_ms: 0.076429
  type: 'test'
  ...
# Subtest: should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
ok 13 - should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
  ---
  duration_ms: 0.102773
  type: 'test'
  ...
# Subtest: should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
ok 14 - should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
  ---
  duration_ms: 0.09397
  type: 'test'
  ...
# Subtest
... [cut: the output was 8745 chars; the first and last 4000 are kept] ...
nd booked env and fill the preset expect when it is complete (Plan)
ok 17 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 2.685574
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 18 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.169202
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 19 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.333517
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 20 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.121982
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 21 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.226751
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 22 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.275746
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 23 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.388061
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 24 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.250455
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 25 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.290278
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 26 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.222047
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 27 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.183044
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 28 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.134821
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 29 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.074978
  type: 'test'
  ...
# Subtest: should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
ok 30 - should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
  ---
  duration_ms: 1.051591
  type: 'test'
  ...
1..30
# tests 30
# suites 0
# pass 30
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 72.235339
```

## Envs
<!-- verify: written by verify.mjs; sha256:638747dd59f891a3 -->
env: cloud (local shell)
run: node --test skills/verify/ci.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Envs
```
TAP version 13
# Subtest: should pass with name, status, conclusion and URL as evidence when the check run of HEAD succeeded (Envs)
ok 1 - should pass with name, status, conclusion and URL as evidence when the check run of HEAD succeeded (Envs)
  ---
  duration_ms: 0.963284
  type: 'test'
  ...
# Subtest: should fail when the check run failed, is still running or is not there (Envs fail)
ok 2 - should fail when the check run failed, is still running or is not there (Envs fail)
  ---
  duration_ms: 0.171105
  type: 'test'
  ...
# Subtest: should fail with the gh error and not throw when gh fails or prints bad JSON (Envs edge)
ok 3 - should fail with the gh error and not throw when gh fails or prints bad JSON (Envs edge)
  ---
  duration_ms: 0.127681
  type: 'test'
  ...
# Subtest: should not pass when gh fails or the named check run is missing (Envs fail)
ok 4 - should not pass when gh fails or the named check run is missing (Envs fail)
  ---
  duration_ms: 0.115248
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 5 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 96.848053
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 6 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 63.428889
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
ok 7 - should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
  ---
  duration_ms: 68.427959
  type: 'test'
  ...
# Subtest: should open with no items and list them from claims.json when there is no ADR (Source edge)
ok 8 - should open with no items and list them from claims.json when there is no ADR (Source edge)
  ---
  duration_ms: 81.920121
  type: 'test'
  ...
# Subtest: should list flag, option and config candidates when claims reads the branch diff (Source)
ok 9 - should list flag, option and config candidates when claims reads the branch diff (Source)
  ---
  duration_ms: 161.230564
  type: 'test'
  ...
# Subtest: should show the normalized plan with preset expects when the plan is complete (Plan)
ok 10 - should show the normalized plan with preset expects when the plan is complete (Plan)
  ---
  duration_ms: 85.750918
  type: 'test'
  ...
# Subtest: should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
ok 11 - should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
  ---
  duration_ms: 76.730197
  type: 'test'
  ...
# Subtest: should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
ok 12 - should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
  ---
  duration_ms: 268.146453
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
ok 13 - should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
  ---
  duration_ms: 168.161522
  type: 'test'
  ...
# Subtest: should write result fail with the output, run the rest and report every failure when items fail (Fail)
ok 14 - should write result fail with the output, run the rest and report every failure when items fail (Fail)
  ---
  duration_ms: 135.684213
  type: 'test'
  ...
# Subtest: should stop a command past VERIFY_RUN_TIMEOUT_MAX and write it as a timeout fail when the limit is set (Timeout)
ok 15 - should stop a command past VERIFY_RUN_TIMEOUT_MAX and write it as a timeout fail when the limit is set (Timeout)
  ---
  duration_ms: 1101.088683
  type: 'test'
  ...
# Subtest: should replace only the sections that ran and keep hand-written 
... [cut: the output was 11965 chars; the first and last 4000 are kept] ...
---
  duration_ms: 144.494235
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 30 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 71.460513
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 31 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 178.509306
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 32 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 255.671711
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 33 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 275.786247
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 34 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 82.054141
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 35 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 253.272135
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 36 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 102.55479
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 37 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 269.110894
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 38 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 167.301949
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 39 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 203.378996
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 40 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 251.834573
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 41 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 272.541462
  type: 'test'
  ...
1..41
# tests 41
# suites 0
# pass 41
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6679.953753
```

## Image
<!-- verify: written by verify.mjs; sha256:1dc05e01a391c2d7 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Image
```
TAP version 13
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 1 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 11.451278
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 2 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.248839
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 3 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.424589
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 4 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.151954
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 5 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.17991
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 6 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.286318
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 7 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.280987
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 8 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.221592
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 9 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 3.07191
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 10 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.349378
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 11 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.221853
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 12 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.139526
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 13 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.079523
  type: 'test'
  ...
# Subtest: should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
ok 14 - should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
  ---
  duration_ms: 5.241916
  type: 'test'
  ...
# Subtest: should print the run dir, items, b
... [cut: the output was 14924 chars; the first and last 4000 are kept] ...
 ---
  duration_ms: 133.404513
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 40 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 60.511832
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 41 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 147.116876
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 42 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 356.618221
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 43 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 289.807598
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 44 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 67.874019
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 45 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 279.313792
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 46 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 96.657453
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 47 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 254.028603
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 48 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 140.417198
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 49 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 230.200726
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 50 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 452.77794
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 51 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 298.720838
  type: 'test'
  ...
1..51
# tests 51
# suites 0
# pass 51
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7200.562689
```

## Fail
<!-- verify: written by verify.mjs; sha256:346fa2fb18e73ef2 -->
env: cloud (local shell)
run: node --test skills/verify/verify.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Fail
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 570.651301
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 346.883518
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 532.866521
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1300.103188
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 243.8507
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 6 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 139.984044
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 7 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 66.722923
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
ok 8 - should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
  ---
  duration_ms: 72.085757
  type: 'test'
  ...
# Subtest: should open with no items and list them from claims.json when there is no ADR (Source edge)
ok 9 - should open with no items and list them from claims.json when there is no ADR (Source edge)
  ---
  duration_ms: 110.578401
  type: 'test'
  ...
# Subtest: should list flag, option and config candidates when claims reads the branch diff (Source)
ok 10 - should list flag, option and config candidates when claims reads the branch diff (Source)
  ---
  duration_ms: 130.434916
  type: 'test'
  ...
# Subtest: should show the normalized plan with preset expects when the plan is complete (Plan)
ok 11 - should show the normalized plan with preset expects when the plan is complete (Plan)
  ---
  duration_ms: 86.824063
  type: 'test'
  ...
# Subtest: should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
ok 12 - should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
  ---
  duration_ms: 118.014937
  type: 'test'
  ...
# Subtest: should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
ok 13 - should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
  ---
  duration_ms: 306.188402
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
ok 14 - should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
  ---
  duration_ms: 192.188039
  type: 'test'
  ...
# Subtest: should write result fail with the output, run the rest and report every failure when items fail (Fail)
ok 15 - should
... [cut: the output was 12487 chars; the first and last 4000 are kept] ...
  ---
  duration_ms: 119.402607
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 31 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 72.372133
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 32 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 145.688323
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 33 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 304.391889
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 34 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 346.153238
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 35 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 86.37465
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 36 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 280.193921
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 37 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 114.610735
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 38 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 302.701858
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 39 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 152.950371
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 40 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 216.152466
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 41 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 216.9105
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 42 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 327.289779
  type: 'test'
  ...
1..42
# tests 42
# suites 0
# pass 42
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6993.786378
```

## Ask
<!-- verify: written by verify.mjs; sha256:5203b190a8a4ddd9 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Ask
```
TAP version 13
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 1 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 9.511746
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 2 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.160918
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 3 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.321677
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 4 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.208324
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 5 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.692919
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 6 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.59021
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 7 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.438983
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 8 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 1.799768
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 9 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.746477
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 10 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.42486
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 11 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.336172
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 12 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.2589
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 13 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.170657
  type: 'test'
  ...
# Subtest: should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
ok 14 - should refuse a remote entry when its env is the env of a local run entry in the same plan (Envs, Ask)
  ---
  duration_ms: 1.406741
  type: 'test'
  ...
# Subtest: should print the run dir, items, book
... [cut: the output was 14924 chars; the first and last 4000 are kept] ...
  ---
  duration_ms: 147.269905
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 40 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 85.697395
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 41 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 165.286277
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 42 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 392.588513
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 43 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 330.755832
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 44 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 65.333186
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 45 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 158.503426
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 46 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 73.499657
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 47 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 170.27039
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 48 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 100.187535
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 49 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 144.122617
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 50 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 161.883992
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 51 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 167.589892
  type: 'test'
  ...
1..51
# tests 51
# suites 0
# pass 51
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6503.71897
```

## Guard
<!-- verify: written by verify.mjs; sha256:ee746154b7fbbd2c -->
env: cloud (local shell)
run: node skills/verify/verify.mjs status && node --test hooks/verify-guard.test.mjs skills/verify/flags.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Guard
```
--- 1/3 VERIFY_GUARD_ENABLED unset (default true): exit 0 ---
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":"pass","intact":true},{"id":"Run","result":"pass","intact":true},{"id":"Source","result":"pass","intact":true},{"id":"FlagRuns","result":"pass","intact":true},{"id":"Expect","result":"pass","intact":true},{"id":"Presets","result":"pass","intact":true},{"id":"ExpectLint","result":"pass","intact":true},{"id":"Envs","result":"pass","intact":true},{"id":"Image","result":"pass","intact":true},{"id":"Fail","result":"pass","intact":true},{"id":"Ask","result":"pass","intact":true},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":"pass","intact":true},{"id":"Timeout","result":"pass","intact":true},{"id":"Rerun","result":"pass","intact":true},{"id":"Docs","result":"pass","intact":true}],"errors":[]}
TAP version 13
# Subtest: should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
ok 1 - should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
  ---
  duration_ms: 6.777109
  type: 'test'
  ...
# Subtest: should allow edits under docs/verify, in the run folder and outside t
... [cut: the output was 13834 chars; the first and last 1283 are kept] ...
est: should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
ok 42 - should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
  ---
  duration_ms: 0.21854
  type: 'test'
  ...
# Subtest: should pass when the removed flag is unset or empty (FlagRuns)
ok 43 - should pass when the removed flag is unset or empty (FlagRuns)
  ---
  duration_ms: 0.170023
  type: 'test'
  ...
# Subtest: should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
ok 44 - should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
  ---
  duration_ms: 0.104272
  type: 'test'
  ...
# Subtest: should read process.env when no env is passed (Guard)
ok 45 - should read process.env when no env is passed (Guard)
  ---
  duration_ms: 0.703831
  type: 'test'
  ...
# Subtest: should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
ok 46 - should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
  ---
  duration_ms: 39.118606
  type: 'test'
  ...
1..46
# tests 46
# suites 0
# pass 46
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 925.814721
--- 2/3 VERIFY_GUARD_ENABLED=false: exit 0 ---
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":"pass","intact":true},{"id":"Run","result":"pass","intact":true},{"id":"Source","result":"pass","intact":true},{"id":"FlagRuns","result":"pass","intact":true},{"id":"Expect","result":"pass","intact":true},{"id":"Presets","result":"pass","intact":true},{"id":"ExpectLint","result":"pass","intact":true},{"id":"Envs","result":"pass","intact":true},{"id":"Image","result":"pass","intact":true},{"id":"Fail","result":"pass","intact":true},{"id":"Ask","result":"pass","intact":true},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":"pass","intact":true},{"id":"Timeout","result":"pass","intact":true},{"id":"Rerun","result":"pass","intact":true},{"id":"Docs","result":"pass","intact":true}],"errors":[]}
TAP version 13
# Subtest: should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
ok 1 - should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
  ---
  duration_ms: 8.194463
  type: 'test'
  ...
# Subtest: should allow edits under docs/verify, in the run folder and outside t
... [cut: the output was 13840 chars; the first and last 1283 are kept] ...
st: should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
ok 42 - should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
  ---
  duration_ms: 0.728225
  type: 'test'
  ...
# Subtest: should pass when the removed flag is unset or empty (FlagRuns)
ok 43 - should pass when the removed flag is unset or empty (FlagRuns)
  ---
  duration_ms: 0.601774
  type: 'test'
  ...
# Subtest: should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
ok 44 - should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
  ---
  duration_ms: 1.721509
  type: 'test'
  ...
# Subtest: should read process.env when no env is passed (Guard)
ok 45 - should read process.env when no env is passed (Guard)
  ---
  duration_ms: 2.271769
  type: 'test'
  ...
# Subtest: should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
ok 46 - should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
  ---
  duration_ms: 31.997558
  type: 'test'
  ...
1..46
# tests 46
# suites 0
# pass 46
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 829.097821
--- 3/3 VERIFY_GUARD_ENABLED=maybe (invalid): exit 2 ---
{"ok":false,"errors":["VERIFY_GUARD_ENABLED=maybe is not valid: use true or false"]}
```

## Timeout
<!-- verify: written by verify.mjs; sha256:fa62a5a392717ce0 -->
env: cloud (local shell)
run: node skills/verify/verify.mjs status && node --test skills/verify/runner.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Timeout
```
--- 1/3 VERIFY_RUN_TIMEOUT_MAX unset (default unlimited): exit 0 ---
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":"pass","intact":true},{"id":"Run","result":"pass","intact":true},{"id":"Source","result":"pass","intact":true},{"id":"FlagRuns","result":"pass","intact":true},{"id":"Expect","result":"pass","intact":true},{"id":"Presets","result":"pass","intact":true},{"id":"ExpectLint","result":"pass","intact":true},{"id":"Envs","result":"pass","intact":true},{"id":"Image","result":"pass","intact":true},{"id":"Fail","result":"pass","intact":true},{"id":"Ask","result":"pass","intact":true},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":"pass","intact":true},{"id":"Timeout","result":"pass","intact":true},{"id":"Rerun","result":"pass","intact":true},{"id":"Docs","result":"pass","intact":true}],"errors":[]}
TAP version 13
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 1 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 25.411583
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 2 -
... [cut: the output was 13152 chars; the first and last 1283 are kept] ...
on_ms: 209.201151
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 39 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 138.324847
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 40 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 196.973844
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 41 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 219.301572
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 42 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 221.640886
  type: 'test'
  ...
1..42
# tests 42
# suites 0
# pass 42
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6372.088387
--- 2/3 VERIFY_RUN_TIMEOUT_MAX=600: exit 0 ---
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":"pass","intact":true},{"id":"Run","result":"pass","intact":true},{"id":"Source","result":"pass","intact":true},{"id":"FlagRuns","result":"pass","intact":true},{"id":"Expect","result":"pass","intact":true},{"id":"Presets","result":"pass","intact":true},{"id":"ExpectLint","result":"pass","intact":true},{"id":"Envs","result":"pass","intact":true},{"id":"Image","result":"pass","intact":true},{"id":"Fail","result":"pass","intact":true},{"id":"Ask","result":"pass","intact":true},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":"pass","intact":true},{"id":"Timeout","result":"pass","intact":true},{"id":"Rerun","result":"pass","intact":true},{"id":"Docs","result":"pass","intact":true}],"errors":[]}
TAP version 13
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 1 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 29.500941
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 2 -
... [cut: the output was 13149 chars; the first and last 1283 are kept] ...
tion_ms: 232.214303
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 39 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 112.426429
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 40 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 197.909533
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 41 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 226.144646
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 42 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 214.788603
  type: 'test'
  ...
1..42
# tests 42
# suites 0
# pass 42
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6402.3408
--- 3/3 VERIFY_RUN_TIMEOUT_MAX=maybe (invalid): exit 2 ---
{"ok":false,"errors":["VERIFY_RUN_TIMEOUT_MAX=maybe is not valid: use a whole number of seconds above 0, or unlimited"]}
```

## Rerun
<!-- verify: written by verify.mjs; sha256:d6c3ff29318fcc8e -->
env: cloud (local shell)
run: node --test skills/verify/section.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Rerun
```
TAP version 13
# Subtest: should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
ok 1 - should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
  ---
  duration_ms: 1.849357
  type: 'test'
  ...
# Subtest: should keep output that holds fences or headings inside its block when the command printed them (Run edge)
ok 2 - should keep output that holds fences or headings inside its block when the command printed them (Run edge)
  ---
  duration_ms: 0.23304
  type: 'test'
  ...
# Subtest: should cut long output to head and tail and say so when it is over the cap (Run edge)
ok 3 - should cut long output to head and tail and say so when it is over the cap (Run edge)
  ---
  duration_ms: 0.117757
  type: 'test'
  ...
# Subtest: should start a new file with the title and the sections when the verify file does not exist (Rerun)
ok 4 - should start a new file with the title and the sections when the verify file does not exist (Rerun)
  ---
  duration_ms: 3.802667
  type: 'test'
  ...
# Subtest: should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)
ok 5 - should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)
  ---
  duration_ms: 1.069098
  type: 'test'
  ...
# Subtest: should replace a hand-written section of the same id and keep a file with no final newline readable when it reruns (Rerun edge)
ok 6 - should replace a hand-written section of the same id and keep a file with no final newline readable when it reruns (Rerun edge)
  ---
  duration_ms: 0.187327
  type: 'test'
  ...
# Subtest: should keep output of exactly the cap length whole when it is not over the cap (Run edge)
ok 7 - should keep output of exactly the cap length whole when it is not over the cap (Run edge)
  ---
  duration_ms: 0.109685
  type: 'test'
  ...
# Subtest: should replace the section in place when the file starts with that section (Rerun edge)
ok 8 - should replace the section in place when the file starts with that section (Rerun edge)
  ---
  duration_ms: 0.118797
  type: 'test'
  ...
# Subtest: should keep the blank lines after a replaced section and end it with one newline when the old one had none (Rerun edge)
ok 9 - should keep the blank lines after a replaced section and end it with one newline when the old one had none (Rerun edge)
  ---
  duration_ms: 0.213659
  type: 'test'
  ...
# Subtest: should cut output to the first and last half of the cap at 8000 chars when it is over the cap (Run edge)
ok 10 - should cut output to the first and last half of the cap at 8000 chars when it is over the cap (Run edge)
  ---
  duration_ms: 1.220027
  type: 'test'
  ...
# Subtest: should keep the marker hash valid when a failed section carries a why line (Fail, Run)
ok 11 - should keep the marker hash valid when a failed section carries a why line (Fail, Run)
  ---
  duration_ms: 0.351746
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 12 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 113.454316
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 13 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 92.779913
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
ok 14 - should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
  ---
  duration_ms: 72.590973
  type: 'test'
  ...
# Subtest: should open with no items and list them from claims.json when there is no ADR (Source edge)
ok 15 - should open with no items and list them from claims.json
... [cut: the output was 14002 chars; the first and last 4000 are kept] ...
 ---
  duration_ms: 130.771101
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 37 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 65.209551
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 38 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 152.404516
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 39 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 345.81064
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 40 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 299.098822
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 41 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 60.909488
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 42 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 221.589335
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 43 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 105.054724
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 44 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 224.530176
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 45 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 122.897146
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 46 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 203.387931
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 47 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 225.981866
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 48 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 206.293366
  type: 'test'
  ...
1..48
# tests 48
# suites 0
# pass 48
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6357.52734
```

## Docs
<!-- verify: written by verify.mjs; sha256:97e94170b17e2beb -->
env: cloud (local shell)
run: node --test skills/verify/docs.test.mjs rules/checks/flag-defaults-e2e.test.mjs && node rules/checks/flag-defaults-e2e.mjs && git diff --quiet origin/main -- skills/dev-workflow/check.mjs skills/qa-sweep && echo gate-and-qa-sweep-unchanged
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Docs; text "gate-and-qa-sweep-unchanged"
```
TAP version 13
# Subtest: should pass when a marked spawning file has one test block that sets none of the skill flags
ok 1 - should pass when a marked spawning file has one test block that sets none of the skill flags
  ---
  duration_ms: 12.168416
  type: 'test'
  ...
# Subtest: should report the missing marker when no test file carries flags: defaults
ok 2 - should report the missing marker when no test file carries flags: defaults
  ---
  duration_ms: 0.603015
  type: 'test'
  ...
# Subtest: should fail when the module prelude assigns an ON flag
ok 3 - should fail when the module prelude assigns an ON flag
  ---
  duration_ms: 0.54815
  type: 'test'
  ...
# Subtest: should fail when every top-level test block assigns an ON flag
ok 4 - should fail when every top-level test block assigns an ON flag
  ---
  duration_ms: 0.367718
  type: 'test'
  ...
# Subtest: should fail when the marked file spawns no process
ok 5 - should fail when the marked file spawns no process
  ---
  duration_ms: 0.285962
  type: 'test'
  ...
# Subtest: should report a violation when a README flag has an unknown prefix
ok 6 - should report a violation when a README flag has an unknown prefix
  ---
  duration_ms: 0.246083
  type: 'test'
  ...
# Subtest: should count a _MODE flag as ON when its default is not true
ok 7 - should count a _MODE flag as ON when its default is not true
  ---
  duration_ms: 0.289266
  type: 'test'
  ...
# Subtest: should allow the flag name when it only appears as a value, in a comment or in a test name
ok 8 - should allow the flag name when it only appears as a value, in a comment or in a test name
  ---
  duration_ms: 0.433452
  type: 'test'
  ...
# Subtest: should not count a test( inside a template string as a top-level block when a fixture holds test code
ok 9 - should not count a test( inside a template string as a top-level block when a fixture holds test code
  ---
  duration_ms: 0.502637
  type: 'test'
  ...
# Subtest: should read the escaped pipes of the Values column when parsing the Flags table
ok 10 - should read the escaped pipes of the Values column when parsing the Flags table
  ---
  duration_ms: 0.369155
  type: 'test'
  ...
# Subtest: should exit 2 with a usage line when the CLI gets an unknown argument
ok 11 - should exit 2 with a usage line when the CLI gets an unknown argument
  ---
  duration_ms: 44.311332
  type: 'test'
  ...
# Subtest: should keep a defaults e2e test for every skill with an ON flag when the check runs on this repo
ok 12 - should keep a defaults e2e test for every skill with an ON flag when the check runs on this repo
  ---
  duration_ms: 297.009593
  type: 'test'
  ...
# Subtest: should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)
ok 13 - should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)
  ---
  duration_ms: 1.071311
  type: 'test'
  ...
# Subtest: should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)
ok 14 - should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)
  ---
  duration_ms: 0.456166
  type: 'test'
  ...
# Subtest: should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)
ok 15 - should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)
  ---
  duration_ms: 0.176033
  type: 'test'
  ...
# Subtest: should link only files that exist when SKILL.md links a relative path (Docs edge)
ok 16 - should link only files that exist when SKILL.md links a relative path (Docs edge)
  ---
  duration_ms: 0.167206
  type: 'test'
  ...
# Subtest: should import nothing outside its own folder when the skill code loads (Standalone)
ok 17 - should import nothing outside its own folder when the skill code loads (Standalone)
  ---
  duration_ms: 0.592961
  type: 'test'
  ...
# Subtest: should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)
ok 18 - should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)
  ---
  duration_ms: 0.195079
  type: 'test'
  ...
# Subtest: should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)
ok 19 - should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)
  ---
  duration_ms: 0.107087
  type: 'test'
  ...
# Subtest: should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)
ok 20 - should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)
  ---
  duration_ms: 0.160434
  type: 'test'
  ...
# Subtest: should keep evals for the main paths when evals.json lists them (Docs)
ok 21 - should keep evals for the main paths when evals.json lists them (Docs)
  ---
  duration_ms: 6.115542
  type: 'test'
  ...
1..21
# tests 21
# suites 0
# pass 21
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 434.789248
{"ok":true,"skills":{"dev-workflow":{"flagsOn":["WORKFLOW_GUARD_ENABLED","WORKFLOW_VERIFY_ENV_CHECK_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"verify":{"flagsOn":["VERIFY_GUARD_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"definition-of-done":{"flagsOn":["DOD_ADR_PRECOMMIT_HOOK_ENABLED","DOD_ADR_TOUCHES_SYNC_ENABLED","DOD_QUESTIONS_CHECK_ENABLED","DOD_TIME_FLOOR_CHECK_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"paired-agent-tdd":{"flagsOn":["PTDD_ADR_AUTO_FIND_ENABLED","PTDD_PIPELINE_MODE","PTDD_QUICK_DRIVER_GATE_ENABLED","PTDD_GATE_REUSE_ENABLED","PTDD_COURIER_SKIP_ENABLED","PTDD_PARALLEL_REVIEW_ENABLED"],"ok":true,"file":"e2e.default.strays.test.mjs"},"qa-sweep":{"flagsOn":["QA_ADR_AUTO_FIND_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"retro":{"flagsOn":["RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED","RETRO_TRANSCRIPTS_ENABLED","RETRO_AUTO_COLLECT_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"branch-summary":{"flagsOn":["BRANCH_SUMMARY_FORMAT_CHECK_ENABLED"],"ok":true,"file":"build-report.test.mjs"},"zero-trust-review":{"flagsOn":["ZT_MUTATION_BASELINE_REUSE_ENABLED","ZT_MUTATION_BUDGET_STRICT_ENABLED","ZT_SANDBOX_MODE"],"ok":true,"file":"mutate.test.mjs"}},"violations":[]}
gate-and-qa-sweep-unchanged
```

## Dogfood
Hand-written. This file was written by the verify skill itself (`verify.mjs open`, `plan`, `run`) on its own ADR 0008: 16 items, booked `[cloud]` and `[ci]`, new flags VERIFY_GUARD_ENABLED and VERIFY_RUN_TIMEOUT_MAX (each run unset, flipped and invalid). The first run found two real bugs, fixed in bc04732:
- a failed section was never intact: the `why:` line was added after the hash, so `status` and the guard saw a code-written section as hand-edited;
- `hooks/verify-guard.test.mjs` failed when the caller's shell set `VERIFY_GUARD_ENABLED=false` (the flipped flag run): the spawned hook inherited it.
The flag commands were also reordered so the invalid run fails on the flag error itself (`verify.mjs status` first), not on a test that only happens to name the flag.
An independent zero-trust review then confirmed 1 blocker and 6 should-fix findings (forged duplicate section, weak invalid-flag check, must-fail entry with no expect, plan commands editing product code, a remote entry on the local env, guard Bash bypasses, stale evidence). They are fixed test-first in b9856f3..d038c7d. Every section above is from the rerun after those fixes, with the work-tree snapshot on.
CI then found one more bug on macOS: the run folder inside the repo was not left out of the change list, because macOS temp paths go through the `/var` -> `/private/var` symlink. It is fixed in 8e01a32 (real paths on both sides), with a symlink test that fails on Linux too. Main was merged in 90d5205 and the plugin version became 2.7.0. The 15 `[cloud]` sections are from a rerun on 90d5205. Standalone is the CI check on 90d5205; the node 24 ubuntu job needed one rerun because the whole suite took 120.8 s against the 120 s cap (issue #33).

## Standalone
<!-- verify: written by verify.mjs; sha256:32253bac8d80c24f -->
env: ci (gh check runs)
run: gh api repos/{owner}/{repo}/commits/90d5205a230bbdb10dd2c658a2fe554dd8a8655a/check-runs (check "node 24 on ubuntu-latest")
result: pass
expect: exit 0
```
name: node 24 on ubuntu-latest
status: completed
conclusion: success
html_url: https://github.com/PNNutkung/skills/actions/runs/45661550895/job/139385007332
```

