# Gates (T0): what `tdd.mjs` runs and what each fact means

Plain code, no model. Every test command runs through the sandbox runner of `zero-trust-review` (no network, writes only inside a scratch copy, a timeout of its own); exit 86 = no sandbox, 124 = timeout. A command that did not run is `unverifiable`, never a pass. The agents themselves run the project's test command directly in the working tree while they work; the gates re-run in the sandbox so the numbers do not depend on what an agent says it saw.

## Run folder and snapshots

`tdd.mjs plan` creates `$RUN` under `<tmpdir>/zt-review-<uid>/pat-<sha8>-<time>` (0700, the only place the ledger tools approve) and **no marker**: the review-only `zt-guard` hook must not restrict agents that write code. Layout: `plan.json`, `args.json`, `gates/<group>.red.json`, `gates/<group>.green.json`, `gates/final.json`, `gates/reviewed.json` (the first `final` run: the tree the reviewer saw), `gates/verify.json`, `gates/<group>.rows.json` (the matrix, saved by every `dod` call), `continue.json` (`resume`), `diff/*.patch`, `exec.jsonl` (the sandbox ledger: one entry per command, cited as `ZT-RUN <id>`), `dod-matrix.md`.

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
| `maxRepairs` | repairs for the WHOLE run, 0 to 40 (default `LIM.repairs` = 2 per group): the cheapest brake on tokens. Spent, a failing group is `paused` (resumable), not retried; 0 = no repair at all. `args.maxRepairs` overrides it for one run |
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

## resume (`tdd.mjs resume --run RUN [--ret return.json] [--group G]`)

Where each group stands, read off the gate files and the working tree: no agent, no token. It writes `RUN/continue.json` (`{version, base, groups{G: {next, why, matrix, files, defects, retest}}}`), which the lead passes to the Workflow as `args.resume` (with a new `maxRepairs`: continuing is a decision about spend). A file made for another base is refused. `next`:

| next | when | the script starts at |
|---|---|---|
| `done` | judged PASS in the last run (`--ret`), gates fresh and ok, DoD pairs closed | nothing: the group costs no agent |
| `green-fix` | the GREEN gate is fresh and not ok, or the last navigator reported defects (`--ret`) the gate cannot see | a repair with those defects (gate defects via `defectsFromGreen`, merged) |
| `green-check` | gates ok, or code exists with no fresh GREEN gate; nobody judged them | one green navigator |
| `green` | RED passed (a navigator said so in `--ret`), no code yet | the green driver |
| `red-fix` | the RED gate is not ok, or the last navigator reported defects while the gate is ok (a tautology, a token edge test) | a repair with the RED defects |
| `red-check` | RED gate stale with rows saved, or ok but no navigator has passed it | one red navigator |
| `red` | no RED gate, or stale with no rows | the red driver |

A fresh GREEN verdict outranks a stale RED one (tests grow after GREEN on purpose). `retest` comes from the return, from the flag the GREEN gate recorded for itself, or, failing both, from tests that only gained lines since RED (lost lines are a weakening). The matrix is `rows.json` (every `dod` call merges its named rows into it, so a partial call or a phantom never shrinks or pollutes it) plus the return's rows, each kept only while its test still exists in its file. A gate whose snapshot was pruned is stale for that group. An `unverifiable` or `timeout` gate prints a warning: that is the sandbox, not a reason to spend makers. A group that stalled last run is flagged: the same repair will probably stall again. Defects are capped at 6, worst first; the continue file names its base and run folder and the Workflow refuses one made for another. With `--group` it only prints that group and writes nothing: a replacement for a dead agent runs it first instead of exploring the tree.

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

**Budget and admissions.** Every repair (a rework, a repair round, the matrix rework) draws on one run-wide budget; the ceiling of build agents is the smaller of 5 + 5R per group and 4g + 3B for the run (B = the budget), so 3 groups cap at 30 by default. The budget counts only groups that still have work (a carried-over `done` group gets none), and each group is guaranteed its share (budget ÷ groups): a hard group beyond its share draws only on what the groups still running have not got coming, so it cannot starve an easy one. A `paused` group means the change is not whole: the reviewer, fixers and courier are skipped until `resume` has finished it (the review reads the whole change once). A maker that stops on a failing gate lists what `remaining`: the next pass starts from that list and no navigator is spent on a failure already known (only when it was the sole maker of the round: two makers never ran the gate, so their claims are not admissions). A maker's `gateOk=true` is never taken: a navigator on fresh facts ends every stage.

**After review.** Fixers of dependent groups run in `after` order (a group's gate builds on its dependencies' working-tree files); independent groups fix side by side. Then a courier re-runs `final --again`; each problem goes to the group that owns its file (or the group the courier names for an unowned test); check, fix, check, and once more when `rounds` allows (two fix passes at most). A problem with no owner is listed under `notDone`, not guessed at; a failure caused by another group's code goes to the owner of the failing file, whose fence may not reach the cause (then `notFixed` and `notDone`).

## Limits, stated

- Granularity is the **test file**: a row is credited when its file failed at RED and passes at GREEN, not per test function (runner-neutral, no junit parsing). The matrix check in code stops a row from naming a test that does not exist.
- Mutants are single-line text edits of python, javascript/typescript and c-like sources, sampled (`max`); a survivor can be an equivalent mutant (the share is unmeasured: [`runs.md`](./runs.md)). Other languages report `no mutable changed lines`.
- The sandbox has no network and no DB: a test that needs one fails in the gate. The gate then says `fails-on-head` or `unverifiable`, and the navigator must say so instead of trusting its own run.
- Coverage is lcov only. The affected-test pick is a name heuristic, not a call graph.
- `plan.repo` must be the top level of its work tree (snapshots are tree-relative), every `src` file must count as source for the probes (a test-like path, a data or config file does not: the group could never be judged green), and `plan` refuses to start while a zero-trust-review marker is active (its guard hook would deny the agents' test commands). A moving `base` such as `HEAD` or a branch is stored as the sha it is at `plan` time.
- A whole-tree snapshot (`git add -A`: the base of a dirty tree, the stray scan) applies the repo's clean filters and eol conversion, a per-file group snapshot does not (`--no-filters`): on a `text=auto` CRLF repo the two can differ byte for byte. Names are read with `-z` and `core.quotePath=false`, so non-ASCII paths are not misread.
- The gates trust the lead's `plan.json` and the working tree, not the agents' words; they do not defend against an agent that forges files in `$RUN`. The sandbox, not these gates, is the boundary for running code.
