# Verify: CI test suite well under its 120 s cap (issue #33, ADR 0008)

Run 2026-11-26 on branch `claude/project-thread-f7ewip` at f5e856d. Two places: the PR's CI (run 45745670631; 1 push plus 4 reruns of the node 24 ubuntu job) and the cloud container (Linux, 4 cores, Node 22). Before = main 88e2655.

## CiMedian
env: ci, node 24 on ubuntu-latest, run 45745670631 attempts 1-5 on f5e856d
run: the CI "Run tests" step (node rules/checks/run-tests.mjs with the test-time reporter), then node rules/checks/test-time.mjs test-time.jsonl; suiteSec read from its JSON line
result: pass
```
attempt 1 (02:56 UTC): suite 73.7 s; tests 3049, fail 0; over []; warn tdd.zproc.test.mjs 20.9
attempt 2 (03:00 UTC): suite 66.9 s; tests 3049, fail 0; over []; warn tdd.zproc.test.mjs 20.1
attempt 3 (05:21 UTC): suite 74.5 s; tests 3049, fail 0; over []; warn tdd.zproc.test.mjs 21.2
attempt 4 (05:23 UTC): suite 82.9 s; tests 3049, fail 0; over []; warn tdd.zproc.test.mjs 22.6, mutate.test.mjs 21.9
attempt 5 (05:25 UTC): suite 60.2 s; tests 3049, fail 0; over []; warn none
sorted 60.2 66.9 73.7 74.5 82.9 -> median 73.7 s (<= 90), max 82.9 s (<= 120)
before: main 88e2655 run 45655426228 suite 102 s; 00c32d9 (main code + ADR) 121.8 s, over the cap
```
All 8 jobs of attempt 1 were green (node 22/24/26 on ubuntu and macOS, node 24 via asdf, node 24 in WSL).

## Concurrency
env: cloud container (Linux, 4 cores) and ci
run: node --test rules/checks/run-tests.test.mjs; node rules/checks/run-tests.mjs --dry-run; grep run-tests .github/workflows/test.yml
result: pass
```
ok - should put files missing from the timings first and the rest slowest first when it orders test files (Concurrency)
ok - should derive the concurrency from the cores and read the override when it chooses how many files run at once (Concurrency)
ok - should throw a FlagError naming the fix when the concurrency override is not a whole number above 0 (Concurrency)
ok - should pass every option through and set the concurrency unless one is given when it builds the node command (Concurrency)
ok - should run every listed test file slowest first, pass reporters through and exit with the node exit code when it runs a real node --test (Concurrency, NoSkip)
ok - should run every CI test step through run-tests.mjs with no filter and keep the 30 s and 120 s caps when it reads the workflow (Concurrency, NoSkip)
ok - should stop the node child and exit with its code when only run-tests.mjs gets SIGINT or SIGTERM (Concurrency)
run-tests.mjs --dry-run on 4 cores: {"cores":4,"concurrency":5,"args":["--test","--test-concurrency=5","skills/paired-agent-tdd/tdd.zproc.test.mjs","skills/zero-trust-review/mutate.test.mjs","skills/paired-agent-tdd/tdd.gates.test.mjs",...]}
test.yml: every test step runs node rules/checks/run-tests.mjs (lines 51, 101, 128); README and rules/performance.md document the same command
slowest file on CI over the 5 attempts: tdd.zproc.test.mjs 19.0-22.6 s (< 30 s cap)
```

## LessWork
env: cloud container (Linux, 4 cores)
run: 3 timed full runs (bash time, user+sys) of node rules/checks/run-tests.mjs; one run of each side under strace -f -e trace=execve, counting the execve calls that returned 0
result: pass
```
after f5e856d: wall 54.0 / 53.1 / 54.8 s; CPU 183.3 / 182.4 / 189.0 s; 3020 pass, 0 fail each
before main 88e2655 (git ls-files | xargs node --test): wall 73.7 / 75.4 / 73.7 s; CPU 227.2 / 232.6 / 228.1 s
  (2954 pass, 2 fail each: two sandbox-run --rw tests that refuse a checkout under /tmp, where this before-worktree sat; they pass in the repo's own checkout)
-> wall -27 % (median 74.4 -> 54.0 s), CPU -19 % (median 228.1 -> 183.3 s)
process launches (execve that returned 0), one run each under strace:
  main 88e2655: 38,528 (git 17,133, node 3,594, sh 3,381, sed 2,196, rm 1,423)
  f5e856d:      30,777 (git 11,758, node 2,355, sh 3,076, sed 1,852, rm 1,512)   -> -20 %; git -31 %, node -34 %
ok - should start no git process when the same snapshot is asked again in one call (LessWork)
ok - should use a constant number of git processes when a snapshot holds many files (LessWork)
ok - should read a file at a rev with one git process, and nothing for a missing path, when asked for its text (LessWork)
```

## RunnerFlag
env: cloud container (Linux)
run: node --test on flags, direct-run.inproc, e2e.inproc, probelib, testprobe and mutate test files
result: pass
```
ok - should run the direct runner in-process by default and as its own process when PTDD_INPROCESS_RUNNER_ENABLED is false (RunnerFlag)
ok - should stop with the fix when PTDD_INPROCESS_RUNNER_ENABLED is neither true nor false (RunnerFlag)
ok - should stop plan and a gate with exit 2 and the fix when PTDD_INPROCESS_RUNNER_ENABLED is neither true nor false (RunnerFlag)
ok - should give the same gate JSON, ledger and exit codes for plan, RED and GREEN when PTDD_INPROCESS_RUNNER_ENABLED is true or false (RunnerFlag, Parity)
ok - should kill the command group and end by the signal when a process running commands in-process gets SIGINT, SIGTERM or SIGHUP (RunnerFlag, Parity)
ok - should accept --runner-inprocess only for the paired-agent-tdd direct-run.mjs beside this skill by real path, and name the fix, when --runner is another file named direct-run.mjs (RunnerFlag)
ok - should exit 2 naming the fix when --runner-inprocess is given with a runner that is not direct-run.mjs (RunnerFlag)
README.md:107: | `PTDD_INPROCESS_RUNNER_ENABLED` | `true` | `false` | `true` | ...
```
Snapshot batching has no flag (A4); rules/checks/flag-defaults-e2e.mjs covers the new flag in CI.

## Parity
env: cloud container (Linux) and ci (macOS and ubuntu, node 22/24/26)
run: node --test skills/paired-agent-tdd/direct-run.inproc.test.mjs skills/paired-agent-tdd/e2e.inproc.test.mjs skills/paired-agent-tdd/tdd.snapshot.test.mjs skills/zero-trust-review/testprobe.test.mjs skills/zero-trust-review/mutate.test.mjs
result: pass
```
ok - should give the same exit, output, ZT-RUN line and ledger entry when a passing command runs in-process or through the spawned runner (Parity)
ok - should give the same failing exit code and ledger entry when the command fails in-process or spawned (Parity)
ok - should exit 124 and kill the whole process group, a background child too, when a command runs over its timeout in-process or spawned (Parity)
ok - should exit 127 with the same message when the command cannot start in-process or spawned (Parity)
ok - should give the same gate JSON, ledger and exit codes for plan, RED and GREEN when PTDD_INPROCESS_RUNNER_ENABLED is true or false (RunnerFlag, Parity)
ok - should make the commit of the old per-file algorithm when files are added, changed, deleted, made executable and nested (Parity)
ok - should make the commit of the old algorithm when file names hold spaces, quotes, unicode, leading dashes, tabs and newlines (Parity)
ok - should match the old algorithm on random file sets, contents and modes when fuzzed with a fixed seed (Parity)
ok - should give the same verdicts with --runner-inprocess as with the spawned direct runner, and report it as direct, when --runner is direct-run.mjs (RunnerFlag, Parity)
ok - should give the same mutants and verdicts with --runner-inprocess as with the spawned direct runner when --runner is direct-run.mjs (RunnerFlag, Parity)
```
Timing fields (id, ts, sec) are left out of the compare. The ledger `out` field is compared as a set of lines: stdout and stderr reach it through two pipes, and macOS CI showed their lines in either order with both runners.

## MergedTests
env: cloud container (Linux)
run: node --test rules/checks/test-names.test.mjs; cat rules/checks/test-merges.json; node rules/checks/test-names.mjs --base origin/main
result: pass
```
ok - should accept a removed test when the merge map names the test that holds its assertions now (MergedTests)
ok - should report a removed test when the merge map has no entry for it (MergedTests)
ok - should count a renamed test as removed and need a map entry when only its name changes (MergedTests)
ok - should exit 1 on a removed test that is not in the merge map and 0 once it is mapped when run on a git repo (MergedTests)
ok - should count a map target only when a test declares that exact title when it checks the target exists (MergedTests)
ok - should report a removal when more tests of a title are removed than the diff adds back in any file (MergedTests)
rules/checks/test-merges.json: {}
node rules/checks/test-names.mjs --base origin/main: {"ok":true,"base":"origin/main","bad":[]}  exit 0
```
The map is empty because no test title was removed: e2e.speed.off moved into e2e.speed.vmeasure with its name, and the six mutate tests share one run with their names and assertions kept.

## SuiteWarn
env: cloud container (Linux)
run: node --test rules/checks/test-time.test.mjs; node rules/checks/test-time.mjs on a timings file with a 101 s suite, with the flag unset, unlimited and 1.5
result: pass
```
ok - should warn about the suite over 100 s by default, and read a number or unlimited when the suite warn level is set (SuiteWarn)
ok - should throw a FlagError naming the fix when the suite warn level is not a whole number above 0 or unlimited (SuiteWarn)
ok - should not warn when the suite is exactly at the warn level, has no run line, or the level is unlimited (SuiteWarn)
ok - should exit with the same code and print the suite warning on stderr when the CLI reads a suite over the warn level (SuiteWarn)
flag unset:
::warning::the test suite took 101 s, over the warn level of 100 s (cap 120 s)
{"ok":true,"over":[],"warn":[],"suiteWarn":{"sec":101,"max":100},"slowest":[{"file":"a.test.mjs","sec":5}],"suiteSec":101,"caps":{"file":30,"suite":120,"fileWarn":20,"suiteWarn":100}}
exit 0
CHECKS_TEST_SUITE_WARN_SECONDS_MAX=unlimited: {"ok":true,"over":[],"warn":[],"suiteWarn":null,...,"caps":{"file":30,"suite":120,"fileWarn":20,"suiteWarn":null}}
exit 0
CHECKS_TEST_SUITE_WARN_SECONDS_MAX=1.5: {"ok":false,"error":"CHECKS_TEST_SUITE_WARN_SECONDS_MAX=1.5 is not valid: use a whole number of seconds above 0, or unlimited"}
exit 2
README.md:125: | `CHECKS_TEST_SUITE_WARN_SECONDS_MAX` | a whole number above 0 | `unlimited` | `100` | ...
```

## NoSkip
env: ci, node 24 on ubuntu-latest, and cloud container (Linux)
run: grep "DEFAULT_SECONDS =" rules/checks/test-time.mjs; test counts from the CI log of main 88e2655 (run 45655426228) and of f5e856d (run 45745670631)
result: pass
```
17:export const DEFAULT_SECONDS = { file: 30, suite: 120, fileWarn: 20, suiteWarn: 100 };
main 88e2655: tests 2985, pass 2981, fail 0, skipped 4
f5e856d:     tests 3049, pass 3045, fail 0, skipped 4
```
The 4 skips are the same host checks as on main (no sandbox or no python3 on that runner). The one new test with `{ skip }` in mutate.test.mjs uses the file's existing `skip = !hasPython` guard, like its 34 neighbours.

## RetroIssue
env: ci, GitHub REST
run: gh api repos/PNNutkung/skills/issues/36 --jq '"#\(.number) \(.state) \(.title)"'
result: pass
```
#36 open retro: track test time over time in any project and propose the next speed-up
```
The node 24 ubuntu job uploads test-time.jsonl as an artifact, so #36 can read the timings of each run.
