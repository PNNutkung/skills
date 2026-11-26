# Flaky tests: order and timing

A test must pass on every CI host, not only on the machine where it was written. Busy macOS runners show order and timing races that a fast Linux box hides.

- Output that reaches one log through two pipes (stdout and stderr of one command) can interleave in either order. Compare those lines as a set, or compare each stream on its own. Never compare the interleaved order.
- Do not wait a fixed time for a process to start. Poll until it has started (with an upper bound), then check what must or must not happen next. A node start can take more than 300 ms on a busy CI host.

Found by the retro of issue #33 (2026-11-26): the in-process runner parity test compared ledger output in order and failed on macOS CI (fixed in f5e856d); the probelib slot test waited a fixed 300 ms for a node runner and failed on macOS CI (fixed in 6d45faa).
