# Gates (T0): what `tdd.mjs` runs and what each fact means

Plain code, no model. Every test command runs through the sandbox runner of `zero-trust-review` (no network, writes only inside a scratch copy, a timeout of its own); exit 86 = no sandbox, 124 = timeout. A command that did not run is `unverifiable`, never a pass. The agents themselves run the project's test command directly in the working tree while they work; the gates re-run in the sandbox so the numbers do not depend on what an agent says it saw.

## Run folder and snapshots

`tdd.mjs plan` creates `$RUN` under `<tmpdir>/zt-review-<uid>/pat-<sha8>-<time>` (0700, the only place the ledger tools approve) and **no marker**: the review-only `zt-guard` hook must not restrict agents that write code. Layout: `plan.json`, `args.json`, `gates/<group>.red.json`, `gates/<group>.green.json`, `gates/final.json`, `gates/reviewed.json` (the first `final` run: the tree the reviewer saw), `gates/verify.json`, `diff/*.patch`, `exec.jsonl` (the sandbox ledger: one entry per command, cited as `ZT-RUN <id>`), `dod-matrix.md`.

A **snapshot** is a git commit built with a temporary index from `base + chosen working-tree files`. No ref, index entry or file of your repo changes (only loose objects, which `git gc` prunes); a link or a path that resolves outside the repo is refused. The base is HEAD, or a snapshot of the whole dirty tree when it is not clean.

- RED of group G: base + G's test files (+ the groups G waits for, once their GREEN gate is ok).
- GREEN of G: a snapshot of the groups G waits for (`baseDeps`), then G's tests and sources as its **child**: the probes diff `base...head` (merge base), so a sibling snapshot would drag the other group's files into G's change. A test that passes with only the other groups' code is judged `no-signal`.
- final: base + every planned file.

## plan.json

| Field | Meaning |
|---|---|
| `repo`, `cmd` | required; `cmd` has `{file}` |
| `dod[]`, `groups[]` | see SKILL.md Step 0; validated in code (`gates.mjs validatePlan`): ids, one owner per file, normalized relative paths, every DoD id covered, `after` acyclic, quotes found in `ticket` |
| `ticket` | path; each `source` quote must occur in it (whitespace-insensitive) |
| `link[]` | repo-relative dirs (a venv) symlinked into every sandbox tree and mounted read-only; editable installs that point inside the repo are granted too |
| `ro[]`, `env[]` | extra read-only dirs (the real interpreter install: a version-manager shim reads `$HOME`, which the sandbox hides) and `K=V` for the program inside; `PYTHONDONTWRITEBYTECODE=1` is always added |
| `timeout`, `jobs` | seconds per command (120), parallel runs per gate (4) |
| `rounds` | repair rounds per stage before a group is blocked, 1 to 4 (default 3, `LIM.rounds` in `graph.mjs`); 1 is one repair and one re-check |
| `mutation` | `{max: 12, budget: 60, off}`; `killExits: [1]` for pytest (exit 2 = collection error = inconclusive) |
| `cover`, `coverMin` | command that writes an lcov file to `{out}` (`{files}` = the group's test files); minimum % of changed lines covered (80) |
| `integration` | `{file, goal}`: the one file the integration tester may create |
| `scratch`, `base` | optional overrides (scratch must be outside the repo) |

## red (`tdd.mjs red --run RUN --group G`)

Per new test file: `fails` (an assertion), `fails-to-load` (import or compile error before any assertion: right only when the code under test does not exist yet), `passes-already` (no new behavior pinned, needs a stated reason), `no-tests`, `missing`, `unverifiable`, `timeout`. `ok` = every file is `fails` or `fails-to-load`. The classifier reads the last 1200 characters of output; it is a heuristic, which is why the navigator judges "right reason" and the gate only reports the class. Output names `diff/G.red.patch`.

## green (`tdd.mjs green --run RUN --group G [--retest]`)

Runs `testprobe.mjs` (pass on HEAD, fail with the group's code reverted, 2 extra concurrent runs for flake), `mutate.mjs` (mutants of the lines this group changed, run against the group's tests) and the optional coverage command side by side. A file that differs from the base and that no group owns is listed as a **note**, not a reason: the tree is shared, so it cannot be pinned on this group (`final` blocks on it). `ok` is false, with a reason each, when:

| Reason | Meaning |
|---|---|
| a test file is not `exercises-change` | `no-signal`: it passes without the code (it pins nothing); `fails-on-head`: it does not pass |
| flaky | the 3 runs disagree |
| tests changed since RED | blob diff of the group's tests against the RED snapshot; `--retest` accepts it when a strengthening pass changed them on purpose, and the line count removed is printed so the navigator can see a weakening |
| N mutants survived | each is a test gap, with an id, `file:line`, the operator and a stamp `ZT-MUTANT <id> <file>:<line> <op> exit=0` that is citable as `{mode: executed, ref: <run>}` |
| changed-line coverage below `coverMin` | instrumented changed lines only; a file with no lcov entry is listed as no data, not as 100% |

## dod (`tdd.mjs dod --run RUN --group G --stage red|green --row ID:kind:test:file ...`)

The group's DoD pairs, asked at any moment: it runs nothing (a few git reads), so a maker can ask after every edit and a navigator can check in code what it would otherwise judge by reading. The rows are the driver's **claim**; the facts are the working tree and the gate file. A pair counts only if (1) its row is valid (`checkMatrix`: the id set apart in the name, one test one pair, the group's own file), (2) the test name exists in that file now as a whole identifier, (3) the file's verdict in the gate file is right (stage `red`: `fails` or `fails-to-load`; stage `green`: also `exercises-change`, and the GREEN gate was ok) and (4) **the gate file is not stale**: the group's files are compared with the tree the gate ran on, and a file edited since means "run the gate again", never a pass on an old file. A DoD item another group also owns can be closed there, so its gaps are listed as `also owned by another group`, not as blockers. Output: `DOD G stage=S ok=... covered n/m`, then `not ok:` reasons and one line per item. A `late` row (a strengthening pass) is never offered, as in `verify`.

## final (`tdd.mjs final --run RUN [--again]`)

`--again` is the re-run after fixes (the final courier): it prints and writes `final.json` but never `reviewed.json`, which stays the tree the reviewer saw. All groups' tests run together on the integrated snapshot (they can pass alone and fail together). Existing tests that **mention a changed module by name** (heuristic, over-approximates, capped at 12) run on the integrated tree; one that fails is re-run on the base: failing now but not before = **regression**, failing in both = already failing. The stray-file scope check **blocks here** (a scan that fails because a file vanished mid-scan is reported as `strayScan`, never as a failure), and `diff/final.patch` is written. The integration test is **not** run by the gates (it needs its real dependency, which the sandbox has not): its agent runs it for real and `verify` reads the exit code from the return.

## verify (`tdd.mjs verify --run RUN --ret return.json`)

- **DoD closure** (`gates.mjs closure`): for each DoD item and required kind, a matrix row counts only if (1) its test name exists in its file now as a whole identifier (a claim is not a fact; `test_ac2` is not `test_ac2_happy`), (2) the name carries the item id set apart by non-alphanumerics (`ac10` never serves `ac1`) and stands for that one (item, kind) only, (3) the file is one of the owning group's tests, (4) it is not a `late` row (a strengthening pass after GREEN cannot have failed at RED), (5) the file **failed at RED** (`fails` or `fails-to-load`) and **passes at GREEN** (`exercises-change`), and (6) that group's last GREEN gate was `ok` (not flaky, tests unchanged since RED or sanctioned, no survivors). All read from the gate files. Gaps are named (`AC2/edge: missing | unproven`); `dod-matrix.md` is the table.
- `overridden`: a navigator said PASS where its gate was not ok or never ran.
- `unfixed`: a reviewer finding whose quoted code is still in its file after the fixers (a nit is reported, never sent to a fixer, so never `unfixed`).
- `integration`: `ok`, `<file> exited N`, or `not run`; anything but `ok` is listed under `notDone`.
- `proofcheck.mjs` re-checks every reviewer proof against the tree the reviewer saw (`reviewed.json`) and the ledger.

## The repair loop (`workflow.js`), stated

A stage = a maker pass, then a navigator on fresh gate facts (`gate` then `dod`), repeated while it reports defects (a PASS that admits `gateOk=false` counts as a defect). The maker's own loop is the same commands, at most 3 gate runs; what it reports (`gateOk`, `gateRuns`, `testGaps`) is a claim kept for the record: the navigator runs the gate again. The loop ends on PASS, after `rounds` repairs, or when the defects come back unchanged: the stall check compares the sorted (class, file, line, first 200 normalized characters) of each defect between two rounds. A reworded defect defeats it and the round cap ends the loop instead; that costs rounds, while a false "same" would block a group that is making progress, so the key is strict. Per group the ceiling is **5 + 5R build agents** (RED: driver, matrix rework, R+1 checks, R reworks; GREEN: driver, R+1 checks, up to two makers a round); the reviewer, fixers, couriers and retries come on top.

**Test repairs.** A surviving mutant (`gap`) goes to a strengthening pass and from then on every gate run takes `--retest`; a frozen test that was changed, or a DoD pair that no longer closes (`test`), goes to a restore pass (compare with the version in the RED snapshot, put back what was removed, skipped, loosened or renamed) and its gate run stays **without** `--retest`, which would silence the very reason reported. Two makers on one group in one round never run the gate (it would see a half-edited tree); the next check does, and a repair carries no cleanup pass.

**After review.** Fixers of dependent groups run in `after` order (a group's gate builds on its dependencies' working-tree files); independent groups fix side by side. Then a courier re-runs `final --again`; each problem goes to the group that owns its file (or the group the courier names for an unowned test); check, fix, check, and once more when `rounds` allows (two fix passes at most). A problem with no owner is listed under `notDone`, not guessed at; a failure caused by another group's code goes to the owner of the failing file, whose fence may not reach the cause (then `notFixed` and `notDone`).

## Limits, stated

- Granularity is the **test file**: a row is credited when its file failed at RED and passes at GREEN, not per test function (runner-neutral, no junit parsing). The matrix check in code stops a row from naming a test that does not exist.
- Mutants are single-line text edits of python, javascript/typescript and c-like sources, sampled (`max`); a survivor can be an equivalent mutant (the share is unmeasured: [`runs.md`](./runs.md)). Other languages report `no mutable changed lines`.
- The sandbox has no network and no DB: a test that needs one fails in the gate. The gate then says `fails-on-head` or `unverifiable`, and the navigator must say so instead of trusting its own run.
- Coverage is lcov only. The affected-test pick is a name heuristic, not a call graph.
- `plan.repo` must be the top level of its work tree (snapshots are tree-relative), every `src` file must count as source for the probes (a test-like path, a data or config file does not: the group could never be judged green), and `plan` refuses to start while a zero-trust-review marker is active (its guard hook would deny the agents' test commands). A moving `base` such as `HEAD` or a branch is stored as the sha it is at `plan` time.
- A whole-tree snapshot (`git add -A`: the base of a dirty tree, the stray scan) applies the repo's clean filters and eol conversion, a per-file group snapshot does not (`--no-filters`): on a `text=auto` CRLF repo the two can differ byte for byte. Names are read with `-z` and `core.quotePath=false`, so non-ASCII paths are not misread.
- The gates trust the lead's `plan.json` and the working tree, not the agents' words; they do not defend against an agent that forges files in `$RUN`. The sandbox, not these gates, is the boundary for running code.
