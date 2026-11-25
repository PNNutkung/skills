# Performance: use every core

Wall time is what people wait for. Use the CPU fully when that makes work finish sooner; using less CPU is not a goal in itself.

- Run test files in parallel (`node --test` does this by default). Do not make a suite run one file at a time with `--test-concurrency=1` or `concurrency: 1` unless a test truly needs it; then put the reason next to it and accept the ratchet count (`ratchet.mjs accept --rule test-serial ...`).
- Before you set a speed target, measure its floor: the user+sys CPU-seconds of one run (the shell's `time` prints them), divided by the cores. A wall-time target below that floor cannot be met by running more in parallel; only less work can meet it. `dod.mjs check` refuses a time target without that floor ([definition-of-done](../skills/definition-of-done/SKILL.md)).
- Do not use the `timeout` option of async `spawn` for a backstop timer: it keeps its timer after a spawn error, so a process that fails to start holds node open until the timer fires. Use your own `setTimeout` and clear it when the process ends. `spawnSync` is not affected.

Enforced by `.ratchet.json` (`spawn-async-timeout`, `test-serial`; one line at a time, so a call split over several lines is not seen) and by `rules/checks/test-time.mjs` in CI (time caps per test file and for the whole suite). It also warns, without failing, for each file over `CHECKS_TEST_FILE_WARN_SECONDS_MAX` (default 20 s), so a file creeping toward the 30 s cap shows up first.

Found by the retro of issue #19 (2026-11-23): `probelib.test` took 72 s because of the spawn timeout, and the 60 s target was set before the CPU floor (about 84 s) was measured.
