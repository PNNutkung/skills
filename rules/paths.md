# Paths

Compare two paths only after resolving both to their real paths.

- On macOS, `/tmp` and `/var` are links to `/private/...`. `git rev-parse --show-toplevel` and `realpathSync` print the real path. A cwd recorded by a tool, such as a Claude Code transcript or `process.cwd()` in a child process, may keep the linked one.
- When code checks whether one path is the same as another, or lies inside it, resolve both sides first, for example with `realpathSync`. Wrap the call in try/catch, because the path may no longer exist.
- When a test checks such a comparison, make it run through a linked folder: create a symlink to the real folder in a temp directory. Then the test fails on Linux too, not only on the macOS CI job.
- An in-process entry, `main(argv, { cwd })`, resolves its cwd with `realpathSync`, as a started process sees it, and keeps a test marked `// cwd: linked` beside it that runs it through a linked folder. `rules/checks/inproc-cwd.mjs` checks both in CI.

Found by the retro of the retro skill (2026-11-22): sessions in temp folders matched on Linux but not on macOS. Fixed in `skills/retro/sessions.mjs`.

Found again by the retro of issue #19 (2026-11-23): the in-process `mutate.mjs` main printed `/var/...` where the CLI printed `/private/var/...`, and macOS CI failed twice (fixed in b31ba12).
