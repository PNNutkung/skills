# Flag defaults have an e2e test

A skill whose flags default ON keeps at least one end-to-end test that runs with that skill's flags unset, the way a real run starts.

A flag defaults ON when its Default in the [README Flags table](../README.md#flags) is `true`, or when its name ends in `_MODE`.

## Why

A paired-agent-tdd bug passed every test because each e2e test set its flags explicitly on or off; only a real run with the defaults found it (fixed in c089224, now covered by `skills/paired-agent-tdd/e2e.default.test.mjs`).

## How to satisfy it

In one `skills/<skill>/*.test.mjs` file:

- Put the comment `// flags: defaults` in it.
- Start a process: `spawnSync`, `spawn`, `execFile`, `execFileSync` or `fork`. This is the proxy for "end to end".
- Keep at least one top-level `test(...)` or `it(...)` block that sets none of the skill's ON flags. The code before the first test (imports, helpers, a shared env) sets none of them either.

"Sets" means the name used as an object key (`NAME:`, `'NAME':`, `"NAME":`), as `NAME=` (shell or env string), or as a property set (`env.NAME = ...`). The name as a value, in a filter list, in a comment or in a test name is fine. Inheriting `process.env` counts as unset: CI sets no flag.

A new flag prefix needs an owner in `OWNERS` in `rules/checks/flag-defaults-e2e.mjs`, or the check fails.

`rules/checks/flag-defaults-e2e.test.mjs` runs the check on this repo in CI. Run it alone with `node rules/checks/flag-defaults-e2e.mjs`.

## What the check cannot see

- Whether the marked test reaches the code the flag controls. A spawn and an unset flag are necessary, not sufficient.
- A flag set indirectly: a spread of a shared object (`...SPEED_ENV`), a helper in another file, a name built from a string, or a wrapper script that sets it.
- Tests nested inside `describe(...)` or another block: only top-level `test(` and `it(` count.
- A test that is skipped where CI runs (for example, a missing `python3`).
- A CI job or a developer shell that does set a flag.
