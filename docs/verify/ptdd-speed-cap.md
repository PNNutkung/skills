# Verify: e2e.speed tests under the CI time cap (issue #30, ADR 0007)

Run 2026-11-25 on branch `claude/project-thread-g654an` at dea54ed: the cloud container (Linux, Node 22.23.5, 4 cores) and the PR's CI (run 45521065369, three attempts).

## Under20
env: ci, node 24 on ubuntu-latest (booked as [ci]), run 45521065369 attempts 1, 2 and 3
run: the CI "Run tests" step (node --test with the test-time reporter), then node rules/checks/test-time.mjs test-time.jsonl; the 9 e2e.speed durations read from the spec output
result: pass
```
attempt 1 (00:51 UTC): e2e.speed 7.6 6.1 6.1 5.6 5.7 5.7 8.5 7.3 7.5 s; suite 79.7 s; {"ok":true,"over":[],"warn":[]}
attempt 2 (00:58 UTC): e2e.speed 11.8 9.5 9.4 8.8 8.9 8.6 13.5 10.7 11.6 s; suite 118.7 s; {"ok":true,"over":[],"warn":[{"file":"skills/zero-trust-review/mutate.test.mjs","sec":20.1,"max":20}]}
attempt 3 (05:43 UTC): e2e.speed 8.8 7.1 7.1 6.9 6.9 6.9 10.5 8.8 9.1 s; suite 96.6 s; {"ok":true,"over":[],"warn":[]}
before (main 1e7c8a5, run 45350506332): e2e.speed.test.mjs 30.6 s, e2e.speed.flags.test.mjs 30.3 s (over the 30 s cap)
```

## SameTests
env: cloud container (booked as [cloud])
run: node --test skills/paired-agent-tdd/test-e2e-speed.test.mjs
result: pass
```
ok 1 - should hold one top-level test and at most one scripted run awaited in turn when an e2e.speed file is read
ok 2 - should run the same 9 test names as before the split when the names of every e2e.speed file are put together
ok 3 - should give the first message when the worker posts one, and reject when it throws or exits before it posts
ok 4 - should start no run when another worker imports the module without asking for one
ok 5 - should reject when the scripted run in the worker fails
# pass 5
# fail 0
```
Test 2 checks the 9 names against the old name -> new name map (renamed per A14); the assertions moved unchanged.

## NoSkip
env: cloud container (booked as [cloud])
run: grep -n "DEFAULT_SECONDS =" rules/checks/test-time.mjs; grep -nE "test\.skip|\{ ?skip|\.only\(|todo:" skills/paired-agent-tdd/e2e.speed.*.test.mjs; git diff origin/main --stat -- .github
result: pass
```
16:export const DEFAULT_SECONDS = { file: 30, suite: 120, fileWarn: 20 };
(no skip, only or todo in any e2e.speed file; no change under .github)
```

## WarnFlag
env: cloud container (booked as [cloud])
run: a timings file with a.test.mjs 20.0 s and b.test.mjs 20.1 s, then node rules/checks/test-time.mjs t.jsonl with the flag unset, unlimited and 1.5
result: pass
```
::warning file=b.test.mjs::b.test.mjs took 20.1 s, over the warn level of 20 s (cap 30 s)
{"ok":true,"over":[],"warn":[{"file":"b.test.mjs","sec":20.1,"max":20}],...,"caps":{"file":30,"suite":120,"fileWarn":20}}
exit 0
CHECKS_TEST_FILE_WARN_SECONDS_MAX=unlimited: {"ok":true,"over":[],"warn":[],...,"fileWarn":null}  exit 0
CHECKS_TEST_FILE_WARN_SECONDS_MAX=1.5: {"ok":false,"error":"CHECKS_TEST_FILE_WARN_SECONDS_MAX=1.5 is not valid: use a whole number of seconds above 0, or unlimited"}  exit 2
```
On CI attempt 2 the warning fired for real (mutate.test.mjs 20.1 s) and the job stayed green.

## FlagDoc
env: cloud container (booked as [cloud])
run: grep -n CHECKS_TEST_FILE_WARN_SECONDS_MAX README.md rules/performance.md rules/README.md
result: pass
```
README.md:121:| `CHECKS_TEST_FILE_WARN_SECONDS_MAX` | a whole number above 0 \| `unlimited` | `20` | `rules/checks/test-time.mjs`: a test file slower than this gets a warning ...
rules/performance.md:9: ... CHECKS_TEST_FILE_WARN_SECONDS_MAX ...
rules/README.md:57: ... CHECKS_TEST_FILE_WARN_SECONDS_MAX ...
```

## SuiteIssue
env: cloud container (booked as [cloud]), GitHub REST
run: gh api repos/PNNutkung/skills/issues/33 --jq '"#\(.number) \(.state) \(.title)"'
result: pass
```
#33 open test: the suite sits near the 120 s suite cap on node 24 ubuntu
```
