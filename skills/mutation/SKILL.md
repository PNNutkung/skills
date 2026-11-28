---
name: mutation
description: Use to mutation-test a change on its own ("mutation-test my change", "do my tests pin this code?"): mutate the changed lines, run the tests against each mutant, and report the score and the survivors. Also the shared engine that zero-trust-review, paired-agent-tdd and dev-workflow call.
---

# mutation

Mutates the lines a change touched (a flipped comparison, a dropped `!`, a different constant ...) and runs the tests against each mutant. A mutant every test still passes is a **survivor**: a behavior the tests do not pin, with the runner's ledger id as proof. Design: [ADR 0011](../../docs/adr/0011-mutation-gate.md).

**Reply style:** each technical term in English, then a short note in brackets in the user's language; ASD-STE100 sentences ([rule](../../rules/reply-style.md)).

## When to call it alone

When the user asks to mutation-test a change, or to check that new tests pin new code. Other skills call it for you: `zero-trust-review/mutate.mjs` (review probe), paired-agent-tdd (green and final gates), dev-workflow (`next` from tdd).

```bash
node skills/mutation/cli.mjs --repo . --base main --head HEAD --cmd 'node --test {file}' --runner skills/paired-agent-tdd/direct-run.mjs
```

It prints the Result as JSON and exits 0, even when the score fails; a usage error exits 2. Report the score and the survivors; fix a survivor with a test that fails on it, or mark it equivalent (below).

Tests run through `--runner`. Code from someone else's branch runs only through zero-trust-review's `sandbox-run.mjs` ([rules/untrusted-input.md](../../rules/untrusted-input.md)); `direct-run.mjs` runs it bare, for your own code only.

## Options

From code: `runMutation(opts)` in `engine.mjs` (it reads no environment variable; every switch is an option). The CLI flag is the option in kebab case.

| Option | Default | Meaning |
|---|---|---|
| `repo`, `head` | -, `HEAD` | the repository and the revision to mutate |
| `base` or `files` | - | mutate the lines changed since `base`, or these files/ranges (`a.py:10-40,b.py`, needs `tests`) |
| `cmd` | - | test command, `{file}` = one test file |
| `runner` | - | path of the runner every command goes through |
| `tests` | changed test files | test files to run |
| `max` | `unlimited` | mutants to run (an even sample when fewer) |
| `budget` | `none` | seconds; mutants not started in time are `skipped` |
| `jobs` | all cores | mutants run at once |
| `scoreMin` | `100` | the score (0-100) that passes |
| `select` | `imports` | run each mutant only against the tests whose imports reach its file; `all` runs every test |
| `reuse` | none | earlier Result files: a mutant killed there on the same bytes of its file is not run again (`reused: true`) |
| `equivalent` | none | path of a `mutation-equivalent.json` |
| `scratch` | a temp folder | where the trees are extracted |

Also: `timeout`, `killExits`, `link`, `ro`, `env`, `baselineFrom`, `budgetStrict`, `slots`, `signal`, `onProgress({done, total, mutant})` (once per decided mutant; `cli.mjs` prints `mutation: DONE/TOTAL RESULT FILE:LINE` on stderr).

Result: `{available, mutants[], score: {value, pass, counted, equivalent}, pass, reason?, tests: {run, notUsable}, blobs}`. `score.value = 100 * (killed + timeout) / (total - equivalent)`; nothing counted is `value: null`, `pass: false`.

## The equivalent file

`mutation-equivalent.json` is `{"schema": 1, "marks": [{"id", "file", "line", "reason", "judge"}]}`. A mark turns a **survivor** into `equivalent`, which leaves the score. Add marks only with `addMarks(path, marks, result)` (`equivalent.mjs`): it refuses an id that is not a survivor of `result` and a reason under 20 characters. Mark a survivor only when no input can tell the mutant from the original; a test gap is not equivalent. A mark holds only while the mutant id (a hash of file, line and edit) stays the same: change the line and the mark marks nothing.

## Where it lives

`MUTATION_DIR` overrides this folder, like `ZT_DIR` for zero-trust-review (which re-exports `proc.mjs` and `mutants.mjs` from here, so install both).
