# Verify: verify-skill (ADR 0008)

## Plan
<!-- verify: written by verify.mjs; sha256:79f6bc44f3e9b467 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Plan
```
TAP version 13
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 1 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 6.790796
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 2 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.205339
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 3 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.509949
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 4 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.148783
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 5 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.205595
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 6 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.3366
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 7 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.341236
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 8 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.24352
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 9 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.271739
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 10 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.280893
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 11 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.139601
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 12 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.12184
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 13 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.075191
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 14 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 82.564488
  type: 'test'
  ...
# Subtest: 
... [cut: the output was 11419 chars; the first and last 4000 are kept] ...
e (Envs, Ask)
  ---
  duration_ms: 127.532274
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 28 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 62.811057
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 29 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 80.351614
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 30 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 155.806575
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 31 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 235.153588
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 32 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 51.630235
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 33 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 59.640314
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 34 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 70.353696
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 35 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 63.988768
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 36 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 50.512941
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 37 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 61.28917
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 38 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 91.750144
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 39 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 78.950832
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 40 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 153.023048
  type: 'test'
  ...
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4285.781075
```

## Run
<!-- verify: written by verify.mjs; sha256:9800812f4d8ce3f8 -->
env: cloud (local shell)
run: node --test skills/verify/runner.test.mjs skills/verify/section.test.mjs skills/verify/verify.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Run
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 570.029951
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 367.573805
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 489.003799
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1289.657072
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 283.09553
  type: 'test'
  ...
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 6 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 10.524921
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 7 - should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
  ---
  duration_ms: 1014.588826
  type: 'test'
  ...
# Subtest: should finish without a timeout when the command ends before the limit (Timeout happy)
ok 8 - should finish without a timeout when the command ends before the limit (Timeout happy)
  ---
  duration_ms: 10.600631
  type: 'test'
  ...
# Subtest: should report the error and not hang when the command cannot start (Run fail)
ok 9 - should report the error and not hang when the command cannot start (Run fail)
  ---
  duration_ms: 2.436451
  type: 'test'
  ...
# Subtest: should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
ok 10 - should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
  ---
  duration_ms: 4.13065
  type: 'test'
  ...
# Subtest: should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
ok 11 - should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
  ---
  duration_ms: 1.915923
  type: 'test'
  ...
# Subtest: should keep output that holds fences or headings inside its block when the command printed them (Run edge)
ok 12 - should keep output that holds fences or headings inside its block when the command printed them (Run edge)
  ---
  duration_ms: 0.373805
  type: 'test'
  ...
# Subtest: should cut long output to head and tail and say so when it is over the cap (Run edge)
ok 13 - should cut long output to head and tail and say so when it is over the cap (Run edge)
  ---
  duration_ms: 0.142531
  type: 'test'
  ...
# Subtest: should start a new file with the title and the sections when the verify file does not exist (Rerun)
ok 14 - should start a new file with the title and the sections when the verify file does not exist (Rerun)
  ---
  duration_ms: 0.157187
  type: 'test'
  ...
# Subtest: should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)
ok 15 - 
... [cut: the output was 13321 chars; the first and last 4000 are kept] ...
(Envs, Ask)
  ---
  duration_ms: 108.930224
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 35 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 69.793328
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 36 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 53.905187
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 37 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 184.292662
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 38 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 167.022569
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 39 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 57.017429
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 40 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 62.351946
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 41 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 52.966861
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 42 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 58.607247
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 43 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 58.169639
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 44 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 48.499537
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 45 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 146.393969
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 46 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 57.794455
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 47 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 126.007959
  type: 'test'
  ...
1..47
# tests 47
# suites 0
# pass 47
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4432.950471
```

## Source
<!-- verify: written by verify.mjs; sha256:8a8ab591cdfeaaf2 -->
env: cloud (local shell)
run: node --test skills/verify/adr.test.mjs skills/verify/claims.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Source
```
TAP version 13
# Subtest: should list each DoD item id with its text when the ADR has a Definition of done (Source)
ok 1 - should list each DoD item id with its text when the ADR has a Definition of done (Source)
  ---
  duration_ms: 1.104823
  type: 'test'
  ...
# Subtest: should list no items when the ADR has no Definition of done heading (Source fail)
ok 2 - should list no items when the ADR has no Definition of done heading (Source fail)
  ---
  duration_ms: 0.190023
  type: 'test'
  ...
# Subtest: should book each bracketed env name once, lowercased, when the verify env line names them (Envs)
ok 3 - should book each bracketed env name once, lowercased, when the verify env line names them (Envs)
  ---
  duration_ms: 2.701663
  type: 'test'
  ...
# Subtest: should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)
ok 4 - should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)
  ---
  duration_ms: 0.474981
  type: 'test'
  ...
# Subtest: should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)
ok 5 - should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)
  ---
  duration_ms: 0.230345
  type: 'test'
  ...
# Subtest: should take the four-digit number from the ADR file name when it has one (Run edge)
ok 6 - should take the four-digit number from the ADR file name when it has one (Run edge)
  ---
  duration_ms: 0.131357
  type: 'test'
  ...
# Subtest: should list a flag once with its digits when the text names it twice and it has digits 2 to 9 (FlagRuns edge)
ok 7 - should list a flag once with its digits when the text names it twice and it has digits 2 to 9 (FlagRuns edge)
  ---
  duration_ms: 0.108904
  type: 'test'
  ...
# Subtest: should read items right below the heading and a flag removed at the start when the ADR is that short (Source edge)
ok 8 - should read items right below the heading and a flag removed at the start when the ADR is that short (Source edge)
  ---
  duration_ms: 0.143149
  type: 'test'
  ...
# Subtest: should list added flags, CLI options and config keys with their files when the branch diff adds them (Source)
ok 9 - should list added flags, CLI options and config keys with their files when the branch diff adds them (Source)
  ---
  duration_ms: 1.577986
  type: 'test'
  ...
# Subtest: should list nothing when the diff only removes or keeps lines (Source edge)
ok 10 - should list nothing when the diff only removes or keeps lines (Source edge)
  ---
  duration_ms: 0.138726
  type: 'test'
  ...
# Subtest: should make confirmed claims the items when each answer is in answers.md (Source)
ok 11 - should make confirmed claims the items when each answer is in answers.md (Source)
  ---
  duration_ms: 1.18061
  type: 'test'
  ...
# Subtest: should refuse a claim with no answer, a missing answer, a bad id or a duplicate when claims.json is wrong (Source fail)
ok 12 - should refuse a claim with no answer, a missing answer, a bad id or a duplicate when claims.json is wrong (Source fail)
  ---
  duration_ms: 0.220133
  type: 'test'
  ...
# Subtest: should list an option with digits 2 to 9 when the diff adds one (Source edge)
ok 13 - should list an option with digits 2 to 9 when the diff adds one (Source edge)
  ---
  duration_ms: 0.156568
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 14 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 67.822064
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 15 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 69.618857
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag v
... [cut: the output was 11158 chars; the first and last 4000 are kept] ...
 (Envs, Ask)
  ---
  duration_ms: 120.081651
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 28 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 81.341119
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 29 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 93.03285
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 30 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 162.064912
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 31 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 171.166369
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 32 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 60.261927
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 33 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 57.016962
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 34 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 57.269202
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 35 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 59.707828
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 36 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 66.326825
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 37 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 49.365185
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 38 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 118.485665
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 39 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 59.114047
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 40 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 143.835081
  type: 'test'
  ...
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4442.735412
```

## FlagRuns
<!-- verify: written by verify.mjs; sha256:edaafa4409d15f88 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with FlagRuns
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 496.249768
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 276.170265
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 567.597961
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1296.2591
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 307.451004
  type: 'test'
  ...
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 6 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 7.88052
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 7 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.308146
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 8 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.412842
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 9 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.14526
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 10 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.174195
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 11 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 7.168042
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 12 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.356807
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 13 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.267418
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 14 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an
... [cut: the output was 12932 chars; the first and last 4000 are kept] ...
e (Envs, Ask)
  ---
  duration_ms: 129.333741
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 33 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 57.753572
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 34 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 70.18051
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 35 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 139.843701
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 36 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 191.122438
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 37 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 70.025873
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 38 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 110.821411
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 39 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 53.804625
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 40 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 60.044358
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 41 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 66.035785
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 42 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 74.72054
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 43 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 100.98461
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 44 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 74.148416
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 45 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 153.484565
  type: 'test'
  ...
1..45
# tests 45
# suites 0
# pass 45
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4405.532258
```

## Expect
<!-- verify: written by verify.mjs; sha256:b0e5c1d3002dc3bb -->
env: cloud (local shell)
run: node --test skills/verify/expect.test.mjs skills/verify/fuzz.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Expect
```
TAP version 13
# Subtest: should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
ok 1 - should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
  ---
  duration_ms: 2.249576
  type: 'test'
  ...
# Subtest: should fail and say why when the exit code or the expected text is wrong (Expect fail)
ok 2 - should fail and say why when the exit code or the expected text is wrong (Expect fail)
  ---
  duration_ms: 0.311293
  type: 'test'
  ...
# Subtest: should pass a must-fail check only when it exits with the code the plan names (Expect edge)
ok 3 - should pass a must-fail check only when it exits with the code the plan names (Expect edge)
  ---
  duration_ms: 0.101326
  type: 'test'
  ...
# Subtest: should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
ok 4 - should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
  ---
  duration_ms: 0.19026
  type: 'test'
  ...
# Subtest: should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
ok 5 - should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
  ---
  duration_ms: 0.687348
  type: 'test'
  ...
# Subtest: should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
ok 6 - should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
  ---
  duration_ms: 0.783466
  type: 'test'
  ...
# Subtest: should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
ok 7 - should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
  ---
  duration_ms: 0.187978
  type: 'test'
  ...
# Subtest: should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
ok 8 - should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
  ---
  duration_ms: 0.428055
  type: 'test'
  ...
# Subtest: should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
ok 9 - should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
  ---
  duration_ms: 0.633819
  type: 'test'
  ...
# Subtest: should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
ok 10 - should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
  ---
  duration_ms: 0.518728
  type: 'test'
  ...
# Subtest: should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
ok 11 - should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
  ---
  duration_ms: 0.24969
  type: 'test'
  ...
# Subtest: should describe only the exit and the text when the expect is plain text or absent (Expect)
ok 12 - should describe only the exit and the text when the expect is plain text or absent (Expect)
  ---
  duration_ms: 0.080741
  type: 'test'
  ...
# Subtest: should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
ok 13 - should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
  ---
  duration_ms: 0.113473
  type: 'test'
  ...
# Subtest: should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
ok 14 - should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
  ---
  duration_ms: 0.048873
  type: 'test'
  ...
# Subtest: should never throw and never accept a plan that misses an item when plans are random (Plan)
ok 15 - should never throw and never accept a plan that misses an item when plans are random (Plan)
  ---
  duration_ms: 11.993485
  type: 'test'
  ...
# Subtest: should pass a node --test run only when the output really holds the preset lines when output is random (Presets, Expect)
ok 16 - should pass a node --test run only when the output really holds the preset lines when output is random (Presets, Expect)
  ---
  duration_ms: 5.575221
  type: 'test'
  ...
# Subtest: should never pass when a text expect is not in the random output or the exit is wrong (Expect)
ok 17 - should never pass when a text expect is not in the random output or the exit is wrong (Expect)
  ---
  duration_ms: 1.305193
  type: 'test'
  ...
# Subtest: should keep every hand-written byte and leave each new section intact when files and outputs are random (Rerun)
ok 18 - should keep every hand-written byte and leave each new section intact when files and outputs are random (Rerun)
  ---
  duration_ms: 37.944467
  type: 'test'
  ...
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 112.275746
```

## Presets
<!-- verify: written by verify.mjs; sha256:bce68b1a0cf4add1 -->
env: cloud (local shell)
run: node --test skills/verify/expect.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Presets
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 405.497506
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 263.028158
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 464.274697
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1267.567733
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 250.80444
  type: 'test'
  ...
# Subtest: should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
ok 6 - should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
  ---
  duration_ms: 1.909076
  type: 'test'
  ...
# Subtest: should fail and say why when the exit code or the expected text is wrong (Expect fail)
ok 7 - should fail and say why when the exit code or the expected text is wrong (Expect fail)
  ---
  duration_ms: 0.269581
  type: 'test'
  ...
# Subtest: should pass a must-fail check only when it exits with the code the plan names (Expect edge)
ok 8 - should pass a must-fail check only when it exits with the code the plan names (Expect edge)
  ---
  duration_ms: 0.155586
  type: 'test'
  ...
# Subtest: should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
ok 9 - should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
  ---
  duration_ms: 0.219076
  type: 'test'
  ...
# Subtest: should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
ok 10 - should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
  ---
  duration_ms: 0.555758
  type: 'test'
  ...
# Subtest: should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
ok 11 - should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
  ---
  duration_ms: 0.706293
  type: 'test'
  ...
# Subtest: should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
ok 12 - should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
  ---
  duration_ms: 0.170813
  type: 'test'
  ...
# Subtest: should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
ok 13 - should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
  ---
  duration_ms: 0.501103
  type: 'test'
  ...
# Subtest: should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
ok 14 - should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
  ---
  duration_ms: 0.542685
  type: 'test'
  ...
# Subtest: should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
ok 15 - should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
  ---
  duration_ms: 0.345744
  type: 'test'
  ...
# Subtest: should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
ok 16 - should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
  ---
  duration_ms: 0.217732
  type: 'test'
  ...
# Subtest: should describe only the exit and the text when the expect is plain text or absent (Expect)
ok 17 - should describe only the exit and the text when the expect is plain text or absent (Expect)
  ---
  duration_ms: 0.07616
  type: 'test'
  ...
# Subtest: should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
ok 18 - should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
  ---
  duration_ms: 0.105721
  type: 'test'
  ...
# Subtest: should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
ok 19 - should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
  ---
  duration_ms: 0.047129
  type: 'test'
  ...
1..19
# tests 19
# suites 0
# pass 19
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2773.863199
```

## ExpectLint
<!-- verify: written by verify.mjs; sha256:a64b8a21a8bcd3b9 -->
env: cloud (local shell)
run: node --test skills/verify/expect.test.mjs skills/verify/plan.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with ExpectLint
```
TAP version 13
# Subtest: should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
ok 1 - should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)
  ---
  duration_ms: 1.838284
  type: 'test'
  ...
# Subtest: should fail and say why when the exit code or the expected text is wrong (Expect fail)
ok 2 - should fail and say why when the exit code or the expected text is wrong (Expect fail)
  ---
  duration_ms: 0.297493
  type: 'test'
  ...
# Subtest: should pass a must-fail check only when it exits with the code the plan names (Expect edge)
ok 3 - should pass a must-fail check only when it exits with the code the plan names (Expect edge)
  ---
  duration_ms: 0.125747
  type: 'test'
  ...
# Subtest: should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
ok 4 - should know each preset runner when the command runs it directly or through npx or npm exec (Presets)
  ---
  duration_ms: 0.277734
  type: 'test'
  ...
# Subtest: should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
ok 5 - should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)
  ---
  duration_ms: 0.656957
  type: 'test'
  ...
# Subtest: should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
ok 6 - should check pytest, vitest, jest and go output the same way when those runners ran (Presets)
  ---
  duration_ms: 0.824995
  type: 'test'
  ...
# Subtest: should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
ok 7 - should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)
  ---
  duration_ms: 0.196261
  type: 'test'
  ...
# Subtest: should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
ok 8 - should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)
  ---
  duration_ms: 0.492406
  type: 'test'
  ...
# Subtest: should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
ok 9 - should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)
  ---
  duration_ms: 0.566622
  type: 'test'
  ...
# Subtest: should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
ok 10 - should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)
  ---
  duration_ms: 0.374282
  type: 'test'
  ...
# Subtest: should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
ok 11 - should parse text and /regex/flags and report a bad regex when the expect is given (Expect)
  ---
  duration_ms: 0.246327
  type: 'test'
  ...
# Subtest: should describe only the exit and the text when the expect is plain text or absent (Expect)
ok 12 - should describe only the exit and the text when the expect is plain text or absent (Expect)
  ---
  duration_ms: 0.115179
  type: 'test'
  ...
# Subtest: should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
ok 13 - should pass a run with exactly one passing test and fail one whose item line did not pass when pytest, vitest or jest ran (Presets edge)
  ---
  duration_ms: 0.224049
  type: 'test'
  ...
# Subtest: should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
ok 14 - should skip the preset checks when a preset command must fail with the exit code the plan names (Presets edge)
  ---
  duration_ms: 0.070178
  type: 'test'
  ...
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 15 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 3.316385
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 16 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.206033
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 17 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.336006
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 18 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.120716
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 19 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.219204
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 20 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.331425
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 21 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.208634
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 22 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.198959
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 23 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.352407
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 24 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.238824
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 25 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.131322
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 26 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.108437
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 27 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.068986
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
# duration_ms 74.68472
```

## Envs
<!-- verify: written by verify.mjs; sha256:e64b9fd6f844c29d -->
env: cloud (local shell)
run: node --test skills/verify/ci.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Envs
```
TAP version 13
# Subtest: should pass with name, status, conclusion and URL as evidence when the check run of HEAD succeeded (Envs)
ok 1 - should pass with name, status, conclusion and URL as evidence when the check run of HEAD succeeded (Envs)
  ---
  duration_ms: 1.148677
  type: 'test'
  ...
# Subtest: should fail when the check run failed, is still running or is not there (Envs fail)
ok 2 - should fail when the check run failed, is still running or is not there (Envs fail)
  ---
  duration_ms: 0.194939
  type: 'test'
  ...
# Subtest: should fail with the gh error and not throw when gh fails or prints bad JSON (Envs edge)
ok 3 - should fail with the gh error and not throw when gh fails or prints bad JSON (Envs edge)
  ---
  duration_ms: 0.196442
  type: 'test'
  ...
# Subtest: should not pass when gh fails or the named check run is missing (Envs fail)
ok 4 - should not pass when gh fails or the named check run is missing (Envs fail)
  ---
  duration_ms: 0.145366
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 5 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 68.480236
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 6 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 60.071317
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
ok 7 - should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
  ---
  duration_ms: 72.984847
  type: 'test'
  ...
# Subtest: should open with no items and list them from claims.json when there is no ADR (Source edge)
ok 8 - should open with no items and list them from claims.json when there is no ADR (Source edge)
  ---
  duration_ms: 142.508257
  type: 'test'
  ...
# Subtest: should list flag, option and config candidates when claims reads the branch diff (Source)
ok 9 - should list flag, option and config candidates when claims reads the branch diff (Source)
  ---
  duration_ms: 116.942185
  type: 'test'
  ...
# Subtest: should show the normalized plan with preset expects when the plan is complete (Plan)
ok 10 - should show the normalized plan with preset expects when the plan is complete (Plan)
  ---
  duration_ms: 64.902566
  type: 'test'
  ...
# Subtest: should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
ok 11 - should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
  ---
  duration_ms: 71.247975
  type: 'test'
  ...
# Subtest: should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
ok 12 - should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
  ---
  duration_ms: 264.133801
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
ok 13 - should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
  ---
  duration_ms: 111.613926
  type: 'test'
  ...
# Subtest: should write result fail with the output, run the rest and report every failure when items fail (Fail)
ok 14 - should write result fail with the output, run the rest and report every failure when items fail (Fail)
  ---
  duration_ms: 151.78761
  type: 'test'
  ...
# Subtest: should stop a command past VERIFY_RUN_TIMEOUT_MAX and write it as a timeout fail when the limit is set (Timeout)
ok 15 - should stop a command past VERIFY_RUN_TIMEOUT_MAX and write it as a timeout fail when the limit is set (Timeout)
  ---
  duration_ms: 1062.477922
  type: 'test'
  ...
# Subtest: should replace only the sections that ran and keep hand-written 
... [cut: the output was 8740 chars; the first and last 4000 are kept] ...
 (Envs, Ask)
  ---
  duration_ms: 150.447015
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 19 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 76.116245
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 20 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 64.173408
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 21 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 139.947929
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 22 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 201.112288
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 23 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 53.887781
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 24 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 60.540134
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 25 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 56.765284
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 26 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 68.632709
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 27 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 114.197021
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 28 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 57.76058
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 29 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 113.492136
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 30 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 54.844035
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 31 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 116.727077
  type: 'test'
  ...
1..31
# tests 31
# suites 0
# pass 31
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4067.55313
```

## Image
<!-- verify: written by verify.mjs; sha256:7fd0f2402fbd8af5 -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Image
```
TAP version 13
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 1 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 2.58038
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 2 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.176845
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 3 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.384941
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 4 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.135588
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 5 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.167198
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 6 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.526729
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 7 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.233937
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 8 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.212229
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 9 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.26231
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 10 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.246216
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 11 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.130455
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 12 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.115774
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 13 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.071813
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 14 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 71.169487
  type: 'test'
  ...
# Subtest
... [cut: the output was 11420 chars; the first and last 4000 are kept] ...
ote (Envs, Ask)
  ---
  duration_ms: 131.208557
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 28 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 70.745147
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 29 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 49.089753
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 30 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 149.3072
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 31 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 198.067411
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 32 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 57.180407
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 33 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 54.600454
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 34 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 70.69046
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 35 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 64.905554
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 36 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 73.373751
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 37 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 49.317373
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 38 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 114.704457
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 39 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 71.475314
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 40 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 121.17066
  type: 'test'
  ...
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4031.530351
```

## Fail
<!-- verify: written by verify.mjs; sha256:5175c1bda0a27c89 -->
env: cloud (local shell)
run: node --test skills/verify/verify.test.mjs skills/verify/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Fail
```
TAP version 13
# Subtest: should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
ok 1 - should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)
  ---
  duration_ms: 414.839533
  type: 'test'
  ...
# Subtest: should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
ok 2 - should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)
  ---
  duration_ms: 351.897913
  type: 'test'
  ...
# Subtest: should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
ok 3 - should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)
  ---
  duration_ms: 435.138877
  type: 'test'
  ...
# Subtest: should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
ok 4 - should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)
  ---
  duration_ms: 1248.442151
  type: 'test'
  ...
# Subtest: should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
ok 5 - should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)
  ---
  duration_ms: 324.088375
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 6 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 71.391264
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 7 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 95.487527
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
ok 8 - should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
  ---
  duration_ms: 81.255869
  type: 'test'
  ...
# Subtest: should open with no items and list them from claims.json when there is no ADR (Source edge)
ok 9 - should open with no items and list them from claims.json when there is no ADR (Source edge)
  ---
  duration_ms: 68.637382
  type: 'test'
  ...
# Subtest: should list flag, option and config candidates when claims reads the branch diff (Source)
ok 10 - should list flag, option and config candidates when claims reads the branch diff (Source)
  ---
  duration_ms: 122.56419
  type: 'test'
  ...
# Subtest: should show the normalized plan with preset expects when the plan is complete (Plan)
ok 11 - should show the normalized plan with preset expects when the plan is complete (Plan)
  ---
  duration_ms: 60.254829
  type: 'test'
  ...
# Subtest: should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
ok 12 - should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)
  ---
  duration_ms: 71.314505
  type: 'test'
  ...
# Subtest: should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
ok 13 - should run each item and write its section from the real run when the plan is good (Run, FlagRuns)
  ---
  duration_ms: 287.021678
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
ok 14 - should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)
  ---
  duration_ms: 149.773338
  type: 'test'
  ...
# Subtest: should write result fail with the output, run the rest and report every failure when items fail (Fail)
ok 15 - should w
... [cut: the output was 9262 chars; the first and last 4000 are kept] ...
e (Envs, Ask)
  ---
  duration_ms: 120.007374
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 20 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 63.161545
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 21 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 80.042238
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 22 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 146.238726
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 23 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 178.439361
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 24 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 70.492698
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 25 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 71.70047
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 26 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 49.221415
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 27 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 67.803765
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 28 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 76.013238
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 29 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 58.574279
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 30 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 78.274127
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 31 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 48.469986
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 32 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 216.874437
  type: 'test'
  ...
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4141.152578
```

## Ask
<!-- verify: written by verify.mjs; sha256:98d517fd4730fb9c -->
env: cloud (local shell)
run: node --test skills/verify/plan.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Ask
```
TAP version 13
# Subtest: should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
ok 1 - should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)
  ---
  duration_ms: 6.603157
  type: 'test'
  ...
# Subtest: should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
ok 2 - should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)
  ---
  duration_ms: 0.284776
  type: 'test'
  ...
# Subtest: should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
ok 3 - should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)
  ---
  duration_ms: 0.589928
  type: 'test'
  ...
# Subtest: should accept any env name when the ADR books none (Envs edge)
ok 4 - should accept any env name when the ADR books none (Envs edge)
  ---
  duration_ms: 0.2581
  type: 'test'
  ...
# Subtest: should refuse a weak expect with the reason when the plan has one (ExpectLint)
ok 5 - should refuse a weak expect with the reason when the plan has one (ExpectLint)
  ---
  duration_ms: 0.364733
  type: 'test'
  ...
# Subtest: should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
ok 6 - should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)
  ---
  duration_ms: 0.529272
  type: 'test'
  ...
# Subtest: should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
ok 7 - should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)
  ---
  duration_ms: 0.492794
  type: 'test'
  ...
# Subtest: should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
ok 8 - should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)
  ---
  duration_ms: 0.460532
  type: 'test'
  ...
# Subtest: should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
ok 9 - should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)
  ---
  duration_ms: 0.57348
  type: 'test'
  ...
# Subtest: should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
ok 10 - should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)
  ---
  duration_ms: 0.374541
  type: 'test'
  ...
# Subtest: should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
ok 11 - should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)
  ---
  duration_ms: 0.290678
  type: 'test'
  ...
# Subtest: should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
ok 12 - should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)
  ---
  duration_ms: 0.224788
  type: 'test'
  ...
# Subtest: should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
ok 13 - should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)
  ---
  duration_ms: 0.160417
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 14 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 79.418541
  type: 'test'
  ...
# Subtest:
... [cut: the output was 11420 chars; the first and last 4000 are kept] ...
e (Envs, Ask)
  ---
  duration_ms: 139.476581
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 28 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 63.711381
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 29 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 75.927546
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 30 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 113.824867
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 31 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 133.521916
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 32 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 57.579084
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 33 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 51.268407
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 34 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 44.494555
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 35 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 55.984394
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 36 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 46.076716
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 37 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 45.953221
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 38 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 72.088036
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 39 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 53.590432
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 40 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 94.819499
  type: 'test'
  ...
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3819.745223
```

## Guard
<!-- verify: written by verify.mjs; sha256:21d80c9d92ee35e2 -->
env: cloud (local shell)
run: node --test hooks/verify-guard.test.mjs skills/verify/flags.test.mjs && node skills/verify/verify.mjs status
result: fail
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Guard
why: 2/3 VERIFY_GUARD_ENABLED=false: exit 1, expected 0; 2/3 VERIFY_GUARD_ENABLED=false: no "fail 0" summary line
```
--- 1/3 VERIFY_GUARD_ENABLED unset (default true): exit 0 ---
TAP version 13
# Subtest: should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
ok 1 - should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
  ---
  duration_ms: 65.032906
  type: 'test'
  ...
# Subtest: should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)
ok 2 - should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)
  ---
  duration_ms: 8.138662
  type: 'test'
  ...
# Subtest: should allow an edit of the verify file when it touches only hand-written text (Guard)
ok 3 - should allow an edit of the verify file when it touches only hand-written text (Guard)
  ---
  duration_ms: 8.935899
  type: 'test'
  ...
# Subtest: should deny an edit of the verify file when it changes the body of a code-written section (Guard)
ok 4 - should deny an edit of the verify file when it changes the body of a code-written section (Guard)
  ---
  duration_ms: 14.411283
  type: 'test'
  ...
# Subtest: should deny an edit of the verify file when it removes a code-written section or its marker (Guard)
ok 5 - should deny an edit of the verify file when it removes a code-written section or i
... [cut: the output was 10497 chars; the first and last 1283 are kept] ...
ation_ms: 0.744432
  type: 'test'
  ...
# Subtest: should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
ok 36 - should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
  ---
  duration_ms: 70.861273
  type: 'test'
  ...
1..36
# tests 36
# suites 0
# pass 36
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 868.174259
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":null,"intact":null},{"id":"Run","result":null,"intact":null},{"id":"Source","result":null,"intact":null},{"id":"FlagRuns","result":null,"intact":null},{"id":"Expect","result":null,"intact":null},{"id":"Presets","result":null,"intact":null},{"id":"ExpectLint","result":null,"intact":null},{"id":"Envs","result":null,"intact":null},{"id":"Image","result":null,"intact":null},{"id":"Fail","result":null,"intact":null},{"id":"Ask","result":null,"intact":null},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":null,"intact":null},{"id":"Timeout","result":null,"intact":null},{"id":"Rerun","result":null,"intact":null},{"id":"Docs","result":null,"intact":null}],"errors":[]}
--- 2/3 VERIFY_GUARD_ENABLED=false: exit 1 ---
TAP version 13
# Subtest: should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
ok 1 - should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
  ---
  duration_ms: 37.612036
  type: 'test'
  ...
# Subtest: should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)
ok 2 - should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)
  ---
  duration_ms: 11.108068
  type: 'test'
  ...
# Subtest: should allow an edit of the verify file when it touches only hand-written text (Guard)
ok 3 - should allow an edit of the verify file when it touches only hand-written text (Guard)
  ---
  duration_ms: 11.731727
  type: 'test'
  ...
# Subtest: should deny an edit of the verify file when it changes the body of a code-written section (Guard)
ok 4 - should deny an edit of the verify file when it changes the body of a code-written section (Guard)
  ---
  duration_ms: 12.19352
  type: 'test'
  ...
# Subtest: should deny an edit of the verify file when it removes a code-written section or its marker (Guard)
ok 5 - should deny an edit of the verify file when it
... [cut: the output was 8094 chars; the first and last 4000 are kept] ...
283 are kept] ...
test: should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
ok 32 - should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
  ---
  duration_ms: 0.28501
  type: 'test'
  ...
# Subtest: should pass when the removed flag is unset or empty (FlagRuns)
ok 33 - should pass when the removed flag is unset or empty (FlagRuns)
  ---
  duration_ms: 0.29537
  type: 'test'
  ...
# Subtest: should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
ok 34 - should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
  ---
  duration_ms: 0.168536
  type: 'test'
  ...
# Subtest: should read process.env when no env is passed (Guard)
ok 35 - should read process.env when no env is passed (Guard)
  ---
  duration_ms: 0.974619
  type: 'test'
  ...
# Subtest: should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
ok 36 - should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
  ---
  duration_ms: 50.130078
  type: 'test'
  ...
1..36
# tests 36
# suites 0
# pass 35
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 804.768639
--- 3/3 VERIFY_GUARD_ENABLED=maybe (invalid): exit 1 ---
TAP version 13
# Subtest: should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
ok 1 - should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)
  ---
  duration_ms: 22.587945
  type: 'test'
  ...
# Subtest: should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)
ok 2 - should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)
  ---
  duration_ms: 12.785041
  type: 'test'
  ...
# Subtest: should allow an edit of the verify file when it touches only hand-written text (Guard)
ok 3 - should allow an edit of the verify file when it touches only hand-written text (Guard)
  ---
  duration_ms: 9.735456
  type: 'test'
  ...
# Subtest: should deny an edit of the verify file when it changes the body of a code-written section (Guard)
ok 4 - should deny an edit of the verify file when it changes the body of a code-written section (Guard)
  ---
  duration_ms: 31.733536
  type: 'test'
  ...
# Subtest: should deny an edit of the verify file when it removes a code-written section or its marker (Guard)
ok 5 - should deny an edit of the verify file when it removes a code-written section or 
... [cut: the output was 12512 chars; the first and last 1283 are kept] ...
est: should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
ok 32 - should throw a FlagError naming the fix when VERIFY_RUN_TIMEOUT_MAX is invalid (Timeout)
  ---
  duration_ms: 0.236807
  type: 'test'
  ...
# Subtest: should pass when the removed flag is unset or empty (FlagRuns)
ok 33 - should pass when the removed flag is unset or empty (FlagRuns)
  ---
  duration_ms: 0.260865
  type: 'test'
  ...
# Subtest: should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
ok 34 - should throw a FlagError saying it was removed and why when VERIFY_FLAG_RUNS_ENABLED is set to any value (FlagRuns)
  ---
  duration_ms: 0.134026
  type: 'test'
  ...
# Subtest: should read process.env when no env is passed (Guard)
ok 35 - should read process.env when no env is passed (Guard)
  ---
  duration_ms: 0.802323
  type: 'test'
  ...
# Subtest: should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
ok 36 - should never throw anything but a FlagError when the flag values are random (Guard) (Timeout)
  ---
  duration_ms: 41.582866
  type: 'test'
  ...
1..36
# tests 36
# suites 0
# pass 34
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 860.14423
```

## Timeout
<!-- verify: written by verify.mjs; sha256:26ed08b2b1fd33fc -->
env: cloud (local shell)
run: node --test skills/verify/runner.test.mjs skills/verify/verify.test.mjs && node skills/verify/verify.mjs status
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Timeout
```
--- 1/3 VERIFY_RUN_TIMEOUT_MAX unset (default unlimited): exit 0 ---
TAP version 13
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 1 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 25.683006
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 2 - should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
  ---
  duration_ms: 1006.754238
  type: 'test'
  ...
# Subtest: should finish without a timeout when the command ends before the limit (Timeout happy)
ok 3 - should finish without a timeout when the command ends before the limit (Timeout happy)
  ---
  duration_ms: 9.233632
  type: 'test'
  ...
# Subtest: should report the error and not hang when the command cannot start (Run fail)
ok 4 - should report the error and not hang when the command cannot start (Run fail)
  ---
  duration_ms: 1.991932
  type: 'test'
  ...
# Subtest: should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
ok 5 - should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
  ---
  duration_ms: 5.431416
  type: 'test'
  .
... [cut: the output was 9903 chars; the first and last 1283 are kept] ...
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 32 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 137.854318
  type: 'test'
  ...
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4337.43379
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":null,"intact":null},{"id":"Run","result":null,"intact":null},{"id":"Source","result":null,"intact":null},{"id":"FlagRuns","result":null,"intact":null},{"id":"Expect","result":null,"intact":null},{"id":"Presets","result":null,"intact":null},{"id":"ExpectLint","result":null,"intact":null},{"id":"Envs","result":null,"intact":null},{"id":"Image","result":null,"intact":null},{"id":"Fail","result":null,"intact":null},{"id":"Ask","result":null,"intact":null},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":null,"intact":null},{"id":"Timeout","result":null,"intact":null},{"id":"Rerun","result":null,"intact":null},{"id":"Docs","result":null,"intact":null}],"errors":[]}
--- 2/3 VERIFY_RUN_TIMEOUT_MAX=600: exit 0 ---
TAP version 13
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 1 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 15.496813
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 2 - should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
  ---
  duration_ms: 1022.271599
  type: 'test'
  ...
# Subtest: should finish without a timeout when the command ends before the limit (Timeout happy)
ok 3 - should finish without a timeout when the command ends before the limit (Timeout happy)
  ---
  duration_ms: 6.566944
  type: 'test'
  ...
# Subtest: should report the error and not hang when the command cannot start (Run fail)
ok 4 - should report the error and not hang when the command cannot start (Run fail)
  ---
  duration_ms: 7.251359
  type: 'test'
  ...
# Subtest: should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
ok 5 - should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
  ---
 
... [cut: the output was 8100 chars; the first and last 4000 are kept] ...
83 are kept] ...
 type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 32 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 124.563552
  type: 'test'
  ...
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4351.950576
{"ok":true,"run":"/root/.cache/verify/skills-d9f431e686d5/verify-skill","slug":"verify-skill","verifyFile":"/home/user/skills/docs/verify/verify-skill.md","items":[{"id":"Plan","result":null,"intact":null},{"id":"Run","result":null,"intact":null},{"id":"Source","result":null,"intact":null},{"id":"FlagRuns","result":null,"intact":null},{"id":"Expect","result":null,"intact":null},{"id":"Presets","result":null,"intact":null},{"id":"ExpectLint","result":null,"intact":null},{"id":"Envs","result":null,"intact":null},{"id":"Image","result":null,"intact":null},{"id":"Fail","result":null,"intact":null},{"id":"Ask","result":null,"intact":null},{"id":"Standalone","result":null,"intact":null},{"id":"Guard","result":null,"intact":null},{"id":"Timeout","result":null,"intact":null},{"id":"Rerun","result":null,"intact":null},{"id":"Docs","result":null,"intact":null}],"errors":[]}
--- 3/3 VERIFY_RUN_TIMEOUT_MAX=maybe (invalid): exit 2 ---
TAP version 13
# Subtest: should capture stdout and stderr with the exit code when a command runs in bash (Run)
ok 1 - should capture stdout and stderr with the exit code when a command runs in bash (Run)
  ---
  duration_ms: 32.066555
  type: 'test'
  ...
# Subtest: should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
ok 2 - should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)
  ---
  duration_ms: 1014.394969
  type: 'test'
  ...
# Subtest: should finish without a timeout when the command ends before the limit (Timeout happy)
ok 3 - should finish without a timeout when the command ends before the limit (Timeout happy)
  ---
  duration_ms: 5.451879
  type: 'test'
  ...
# Subtest: should report the error and not hang when the command cannot start (Run fail)
ok 4 - should report the error and not hang when the command cannot start (Run fail)
  ---
  duration_ms: 19.305906
  type: 'test'
  ...
# Subtest: should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
ok 5 - should drop the node test runner context from the env when the command runs a nested node --test (Run edge)
  ---
  duration_ms: 12.256108
  type: 'test'
 
... [cut: the output was 9153 chars; the first and last 1283 are kept] ...
fuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 74.322961
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 30 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 113.283942
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 31 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 61.873877
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 32 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 111.959101
  type: 'test'
  ...
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4368.812558
{"ok":false,"errors":["VERIFY_RUN_TIMEOUT_MAX=maybe is not valid: use a whole number of seconds above 0, or unlimited"]}
```

## Rerun
<!-- verify: written by verify.mjs; sha256:6bc8518a315a3330 -->
env: cloud (local shell)
run: node --test skills/verify/section.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Rerun
```
TAP version 13
# Subtest: should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
ok 1 - should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
  ---
  duration_ms: 1.965262
  type: 'test'
  ...
# Subtest: should keep output that holds fences or headings inside its block when the command printed them (Run edge)
ok 2 - should keep output that holds fences or headings inside its block when the command printed them (Run edge)
  ---
  duration_ms: 0.443172
  type: 'test'
  ...
# Subtest: should cut long output to head and tail and say so when it is over the cap (Run edge)
ok 3 - should cut long output to head and tail and say so when it is over the cap (Run edge)
  ---
  duration_ms: 0.143636
  type: 'test'
  ...
# Subtest: should start a new file with the title and the sections when the verify file does not exist (Rerun)
ok 4 - should start a new file with the title and the sections when the verify file does not exist (Rerun)
  ---
  duration_ms: 0.164667
  type: 'test'
  ...
# Subtest: should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)
ok 5 - should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)
  ---
  duration_ms: 0.401761
  type: 'test'
  ...
# Subtest: should replace a hand-written section of the same id and keep a file with no final newline readable when it reruns (Rerun edge)
ok 6 - should replace a hand-written section of the same id and keep a file with no final newline readable when it reruns (Rerun edge)
  ---
  duration_ms: 0.238461
  type: 'test'
  ...
# Subtest: should keep output of exactly the cap length whole when it is not over the cap (Run edge)
ok 7 - should keep output of exactly the cap length whole when it is not over the cap (Run edge)
  ---
  duration_ms: 0.082493
  type: 'test'
  ...
# Subtest: should replace the section in place when the file starts with that section (Rerun edge)
ok 8 - should replace the section in place when the file starts with that section (Rerun edge)
  ---
  duration_ms: 0.110449
  type: 'test'
  ...
# Subtest: should keep the blank lines after a replaced section and end it with one newline when the old one had none (Rerun edge)
ok 9 - should keep the blank lines after a replaced section and end it with one newline when the old one had none (Rerun edge)
  ---
  duration_ms: 0.225052
  type: 'test'
  ...
# Subtest: should cut output to the first and last half of the cap at 8000 chars when it is over the cap (Run edge)
ok 10 - should cut output to the first and last half of the cap at 8000 chars when it is over the cap (Run edge)
  ---
  duration_ms: 1.825973
  type: 'test'
  ...
# Subtest: should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
ok 11 - should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)
  ---
  duration_ms: 123.064552
  type: 'test'
  ...
# Subtest: should exit 2 with no session id when the session id is missing (Guard fail)
ok 12 - should exit 2 with no session id when the session id is missing (Guard fail)
  ---
  duration_ms: 95.739865
  type: 'test'
  ...
# Subtest: should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
ok 13 - should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)
  ---
  duration_ms: 92.658585
  type: 'test'
  ...
# Subtest: should open with no items and list them from claims.json when there is no ADR (Source edge)
ok 14 - should open with no items and list them from claims.json when there is no ADR (Source edge)
  ---
  duration_ms: 68.267756
  type: 'test'
  ...
# Subtest: should list flag, option and config candidates when claims reads the branch diff (Source)
ok 15 - should list flag, option and config candidates
... [cut: the output was 10534 chars; the first and last 4000 are kept] ...
e (Envs, Ask)
  ---
  duration_ms: 122.675202
  type: 'test'
  ...
# Subtest: should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
ok 25 - should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)
  ---
  duration_ms: 47.681219
  type: 'test'
  ...
# Subtest: should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
ok 26 - should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)
  ---
  duration_ms: 56.787283
  type: 'test'
  ...
# Subtest: should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
ok 27 - should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)
  ---
  duration_ms: 182.104114
  type: 'test'
  ...
# Subtest: should show each item with its written result and whether its section is intact when status is asked (Run edge)
ok 28 - should show each item with its written result and whether its section is intact when status is asked (Run edge)
  ---
  duration_ms: 180.183004
  type: 'test'
  ...
# Subtest: should delete the session marker when close ends the run and refuse later commands (Guard)
ok 29 - should delete the session marker when close ends the run and refuse later commands (Guard)
  ---
  duration_ms: 59.714176
  type: 'test'
  ...
# Subtest: should refuse a second open for another slug when a run is open in the session (Guard edge)
ok 30 - should refuse a second open for another slug when a run is open in the session (Guard edge)
  ---
  duration_ms: 54.79157
  type: 'test'
  ...
# Subtest: should see the repo by its real path when the cwd is a symlinked folder (Run edge)
ok 31 - should see the repo by its real path when the cwd is a symlinked folder (Run edge)
  ---
  duration_ms: 48.664188
  type: 'test'
  ...
# Subtest: should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
ok 32 - should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)
  ---
  duration_ms: 55.312058
  type: 'test'
  ...
# Subtest: should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
ok 33 - should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)
  ---
  duration_ms: 46.071859
  type: 'test'
  ...
# Subtest: should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
ok 34 - should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)
  ---
  duration_ms: 49.831663
  type: 'test'
  ...
# Subtest: should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
ok 35 - should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)
  ---
  duration_ms: 107.92301
  type: 'test'
  ...
# Subtest: should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
ok 36 - should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)
  ---
  duration_ms: 54.743292
  type: 'test'
  ...
# Subtest: should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
ok 37 - should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 150.297377
  type: 'test'
  ...
1..37
# tests 37
# suites 0
# pass 37
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4197.701374
```

## Docs
<!-- verify: written by verify.mjs; sha256:ab28aa36f19c1e78 -->
env: cloud (local shell)
run: node --test skills/verify/docs.test.mjs rules/checks/flag-defaults-e2e.test.mjs && node rules/checks/flag-defaults-e2e.mjs && git diff --quiet origin/main -- skills/dev-workflow/check.mjs skills/qa-sweep && echo gate-and-qa-sweep-unchanged
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Docs; text "gate-and-qa-sweep-unchanged"
```
TAP version 13
# Subtest: should pass when a marked spawning file has one test block that sets none of the skill flags
ok 1 - should pass when a marked spawning file has one test block that sets none of the skill flags
  ---
  duration_ms: 5.039381
  type: 'test'
  ...
# Subtest: should report the missing marker when no test file carries flags: defaults
ok 2 - should report the missing marker when no test file carries flags: defaults
  ---
  duration_ms: 0.43512
  type: 'test'
  ...
# Subtest: should fail when the module prelude assigns an ON flag
ok 3 - should fail when the module prelude assigns an ON flag
  ---
  duration_ms: 0.390971
  type: 'test'
  ...
# Subtest: should fail when every top-level test block assigns an ON flag
ok 4 - should fail when every top-level test block assigns an ON flag
  ---
  duration_ms: 0.196465
  type: 'test'
  ...
# Subtest: should fail when the marked file spawns no process
ok 5 - should fail when the marked file spawns no process
  ---
  duration_ms: 0.164967
  type: 'test'
  ...
# Subtest: should report a violation when a README flag has an unknown prefix
ok 6 - should report a violation when a README flag has an unknown prefix
  ---
  duration_ms: 0.147421
  type: 'test'
  ...
# Subtest: should count a _MODE flag as ON when its default is not true
ok 7 - should count a _MODE flag as ON when its default is not true
  ---
  duration_ms: 5.102239
  type: 'test'
  ...
# Subtest: should allow the flag name when it only appears as a value, in a comment or in a test name
ok 8 - should allow the flag name when it only appears as a value, in a comment or in a test name
  ---
  duration_ms: 0.257426
  type: 'test'
  ...
# Subtest: should not count a test( inside a template string as a top-level block when a fixture holds test code
ok 9 - should not count a test( inside a template string as a top-level block when a fixture holds test code
  ---
  duration_ms: 0.300206
  type: 'test'
  ...
# Subtest: should read the escaped pipes of the Values column when parsing the Flags table
ok 10 - should read the escaped pipes of the Values column when parsing the Flags table
  ---
  duration_ms: 0.336883
  type: 'test'
  ...
# Subtest: should exit 2 with a usage line when the CLI gets an unknown argument
ok 11 - should exit 2 with a usage line when the CLI gets an unknown argument
  ---
  duration_ms: 106.66
  type: 'test'
  ...
# Subtest: should keep a defaults e2e test for every skill with an ON flag when the check runs on this repo
ok 12 - should keep a defaults e2e test for every skill with an ON flag when the check runs on this repo
  ---
  duration_ms: 327.483116
  type: 'test'
  ...
# Subtest: should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)
ok 13 - should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)
  ---
  duration_ms: 0.769503
  type: 'test'
  ...
# Subtest: should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)
ok 14 - should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)
  ---
  duration_ms: 0.404824
  type: 'test'
  ...
# Subtest: should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)
ok 15 - should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)
  ---
  duration_ms: 0.170215
  type: 'test'
  ...
# Subtest: should link only files that exist when SKILL.md links a relative path (Docs edge)
ok 16 - should link only files that exist when SKILL.md links a relative path (Docs edge)
  ---
  duration_ms: 0.178286
  type: 'test'
  ...
# Subtest: should import nothing outside its own folder when the skill code loads (Standalone)
ok 17 - should import nothing outside its own folder when the skill code loads (Standalone)
  ---
  duration_ms: 0.595176
  type: 'test'
  ...
# Subtest: should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)
ok 18 - should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)
  ---
  duration_ms: 0.167145
  type: 'test'
  ...
# Subtest: should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)
ok 19 - should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)
  ---
  duration_ms: 1.571565
  type: 'test'
  ...
# Subtest: should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)
ok 20 - should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)
  ---
  duration_ms: 2.175396
  type: 'test'
  ...
# Subtest: should keep evals for the main paths when evals.json lists them (Docs)
ok 21 - should keep evals for the main paths when evals.json lists them (Docs)
  ---
  duration_ms: 8.202983
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
# duration_ms 601.619042
{"ok":true,"skills":{"dev-workflow":{"flagsOn":["WORKFLOW_GUARD_ENABLED","WORKFLOW_VERIFY_ENV_CHECK_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"verify":{"flagsOn":["VERIFY_GUARD_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"definition-of-done":{"flagsOn":["DOD_ADR_PRECOMMIT_HOOK_ENABLED","DOD_ADR_TOUCHES_SYNC_ENABLED","DOD_QUESTIONS_CHECK_ENABLED","DOD_TIME_FLOOR_CHECK_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"paired-agent-tdd":{"flagsOn":["PTDD_ADR_AUTO_FIND_ENABLED","PTDD_PIPELINE_MODE","PTDD_QUICK_DRIVER_GATE_ENABLED","PTDD_GATE_REUSE_ENABLED","PTDD_COURIER_SKIP_ENABLED","PTDD_PARALLEL_REVIEW_ENABLED"],"ok":true,"file":"e2e.default.strays.test.mjs"},"qa-sweep":{"flagsOn":["QA_ADR_AUTO_FIND_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"retro":{"flagsOn":["RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED","RETRO_TRANSCRIPTS_ENABLED","RETRO_AUTO_COLLECT_ENABLED"],"ok":true,"file":"e2e.test.mjs"},"branch-summary":{"flagsOn":["BRANCH_SUMMARY_FORMAT_CHECK_ENABLED"],"ok":true,"file":"build-report.test.mjs"},"zero-trust-review":{"flagsOn":["ZT_MUTATION_BASELINE_REUSE_ENABLED","ZT_MUTATION_BUDGET_STRICT_ENABLED","ZT_SANDBOX_MODE"],"ok":true,"file":"mutate.test.mjs"}},"violations":[]}
gate-and-qa-sweep-unchanged
```

