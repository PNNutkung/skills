# Performance: use every core

Wall time is what people wait for. Use the CPU fully when that makes work finish sooner; using less CPU is not a goal in itself.

- Run test files in parallel. Do not make a suite run one file at a time with `--test-concurrency=1` or `concurrency: 1` unless a test truly needs it; then put the reason next to it and accept the ratchet count (`ratchet.mjs accept --rule test-serial ...`).
- Run this repo's suite with `node rules/checks/run-tests.mjs` (CI does too). `node --test` alone runs cores - 1 files at once, but most test files spend their time waiting on the processes they start, so the CPU sits idle. `run-tests.mjs` runs cores + 1 at once (`CHECKS_TEST_CONCURRENCY_MAX` overrides it) and starts the slowest files first, so a long file does not start last and stretch the run. Measured on 4 cores (2026-11-26, slowest first, 2 runs each, same CPU of about 230 CPU-s): 4 at once 68-69 s, 5 at once 62-65 s, 6 at once 64-65 s, 8 at once 66-70 s; `node --test` alone (3 at once) about 74 s. Past 5 the files only slow each other down (the slowest went from 17 s at 4 to 25 s at 8), so watch the 30 s file cap when you raise it.
- The order comes from `rules/checks/test-times.json` (repo path -> ms). A file that is not in it (a new or renamed test) runs first, because its time is unknown. Refresh the file when the slow files change (a file was added, split or got much faster or slower) or when `run-tests.test.mjs` says many files are missing: run the suite with the timings reporter and write the times back, then commit the diff:

  ```bash
  node rules/checks/run-tests.mjs --test-reporter=dot --test-reporter=./rules/checks/test-time.mjs --test-reporter-destination=stdout --test-reporter-destination=test-time.jsonl
  node rules/checks/run-tests.mjs --write-times test-time.jsonl
  ```

  The node 24 Ubuntu CI job uploads its `test-time.jsonl` as the `test-time` artifact; times from there match CI better than a laptop's.
- Before you set a speed target, measure its floor: the user+sys CPU-seconds of one run (the shell's `time` prints them), divided by the cores. A wall-time target below that floor cannot be met by running more in parallel; only less work can meet it. `dod.mjs check` refuses a time target without that floor ([definition-of-done](../skills/definition-of-done/SKILL.md)).
- Write the command next to every number you measure, and measure before and after the same way, in the same place. For process launches: `strace -f -e trace=execve -o t.trace <command>`, then count the calls that returned 0 (`grep -c 'execve(.*= 0$' t.trace`); failed PATH lookups are execve calls too. For CPU: user+sys from the shell's `time`. A number without its method cannot be compared, and the next person measures it again (retro of issue #33: a launch count of 71,414 had no method; the same method gave 38,528).
- Work started with `spawnSync` blocks the event loop, so two such runs inside `Promise.all` still run one after the other. To run them side by side, use worker threads or separate test files (`node --test` runs files in parallel).
- Do not use the `timeout` option of async `spawn` for a backstop timer: it keeps its timer after a spawn error, so a process that fails to start holds node open until the timer fires. Use your own `setTimeout` and clear it when the process ends. `spawnSync` is not affected.

Enforced by `.ratchet.json` (`spawn-async-timeout`, `test-serial`; one line at a time, so a call split over several lines is not seen) and by `rules/checks/test-time.mjs` in CI (time caps per test file and for the whole suite). It also warns, without failing, for each file over `CHECKS_TEST_FILE_WARN_SECONDS_MAX` (default 20 s) and for a suite over `CHECKS_TEST_SUITE_WARN_SECONDS_MAX` (default 100 s), so a file or the suite creeping toward its cap (30 s, 120 s) shows up first.

Found by the retro of issue #19 (2026-11-23): `probelib.test` took 72 s because of the spawn timeout, and the 60 s target was set before the CPU floor (about 84 s) was measured.
