# Mode B: code and tests

Read [`SKILL.md`](./SKILL.md) first. This mode takes the cases from mode C (`<run>/cases.json`), proves with mutants whether a test checks each one, and adds the tests that are missing. Mutation is the proof: a text search alone never proves a weak test or a test gap.

## 1. Map each case to code and tests

For each case, name:

- **the implementing code**, as `file:from-to`: the lines that decide the case's result;
- **the mapped tests**: test cases that run the case's inputs and assert its expected result. Search the test folders for the function and module names (`git grep -n <name> -- <test folders>`), then read each hit. A test that runs the code but asserts nothing about this result does not map.

Add both to the case in `<run>/cases.json` (`code`, `tests`).

## 2. Mutate the implementing lines

```bash
ZT_RUN_DIR=<run> node "$ZT_DIR/mutate.mjs" --repo . --head HEAD \
  --files 'src/refunds/policy.ts:10-40' --tests tests/unit/policy.test.ts \
  --scratch "$(mktemp -d)" --cmd 'npx vitest run {file}' \
  --runner "$PTDD_DIR/direct-run.mjs" --link node_modules --kill-exits 1 --budget 420
```

- `--files`: the case's implementing lines. Several are comma separated; a bare path mutates every line.
- `--tests`: the mapped test files, comma separated. When none map, pass the module's whole tier, because a test gap needs mutants that survive every test of that tier: `--tests "$(python3 "$TIERS_PY" --list-tier unit --module src/refunds | paste -sd, -)"`, where `--module` is the case's module as `--inventory` names it (`src/refunds` is a module at `--depth 2`). If that prints nothing, leave out `--module` to use the repo's whole tier. If that prints nothing too, see "A missing tier" below. A whole tier is slow, so bound it with `--max N` (mutants, default 30).
- `--scratch`: a fresh `mktemp -d` folder, never inside `<run>`: the sandbox refuses to run in the run folder.
- `--cmd`: the project's command for one test file, with `{file}`. Add `--kill-exits 1`: `findings.mjs` counts only exit 1 as a kill (pytest's exit 2 is a collection error, not a kill).
- `--link`: the repo's dependency folder (`node_modules`, `.venv`), so the scratch copy can run.
- `--runner`: leave it out only when the user asked for the sandbox (`SKILL.md`, section 6).

Run it in the background and read its output when it finishes: in the foreground the Bash tool stops a command after 10 minutes, and a stopped run prints no JSON. Keep `--budget` (seconds in which new mutants may start, default 600) under that limit as well: `--budget 420`.

It mutates the files as committed at `--head`, in scratch copies; the repo is only read. It prints one JSON object: read `summary` first.

- A `reason`, such as `unverifiable: no changed test file passes on HEAD`, means no mutant ran. Fix `--cmd` or `--link` and run it again. File nothing from it.
- `tests.notUsable` lists test files that fail on HEAD. They were dropped and prove nothing about mutants; tell the user. When you passed a whole tier and this list is not empty, a survivor is not a proven test gap, because a dropped file might kill it: file no finding for it, and put it in the `unconfirmed` list (`requirements.md`, section 3) as a question that names the dropped files.
- Only Python, JavaScript/TypeScript and C-like sources are mutated. In another language a unit or integration test gap has no proof, and it stays unverified.

## 3. Judge each survivor

A mutant with `"result": "survived"` changed the code, and every test still passed. Before you file it, decide which kind it is:

- **Equivalent:** no input the requirement allows can tell the mutant from the original. For example, an earlier guard makes the changed branch unreachable, or the dropped line only logs. Not a finding. Note it in `<run>/survivors.md` with the reason.
- **Unstated:** it changes a behavior that no requirement states. Not a finding: it is a question for the user (`requirements.md`, section 3).
- **Real:** it breaks the case's expected result. File it, as in section 4.

`killed` means a test failed on the mutant. `timeout`, `inconclusive` and `skipped` prove nothing either way.

## 4. Weak test or test gap

| Mapped tests for the case | A real survivor is | Proofs in the finding |
|---|---|---|
| at least one | a **weak test** | a `code` proof at the mapped test's line, plus the survivor |
| none | a **test gap** | the survivor (the requirement record carries the source quote) |

The survivor proof copies the mutant's `run` and `quote` fields exactly. Each finding goes in the `findings` list of `<run>/findings.json`, with ids `W1`, `G1`, `D1` by kind:

```json
{"id": "W1", "kind": "weak-test", "tier": "unit", "requirement": "R1", "title": "the 30-day test does not check the refusal",
 "proofs": [{"mode": "code", "ref": "tests/unit/policy.test.ts:22", "quote": "expect(refund(order)).toBeDefined()"},
            {"mode": "executed", "ref": "<mutant run>", "exit": 0, "quote": "ZT-MUTANT <id> <file>:<line> <op> exit=0"}]}
```

A test gap has the same shape with `"kind": "test-gap"` and only the survivor proof. The weak test itself stays as it is: you add a test that kills its survivor.

**A missing tier.** A tier is missing only when the repo has no test of it, tiered or untiered. When `--list-tier` prints nothing for the whole repo, read the `untiered` list of `python3 "$TIERS_PY" --inventory`: files there may be that tier, in a layout the script does not know (a flat `tests/` folder, or `src/pay/a.test.ts` beside the code). Then ask the user one numbered question: which tier are these files, or will they map them in `.claude/test-tiers.json` (you may not write that file: `qa-guard` denies it). File nothing until they answer; if they name a tier, pass those files as `--tests`. Only with no untiered tests is it the top test gap: `{"id": "G1", "kind": "missing-tier", "tier": "e2e", "title": "no e2e tests: proposed setup <tool>, <one line on how>"}`, with no requirement and no proofs. `findings.mjs` runs the inventory itself (`--tiers-py`), verifies the finding only when no test of that tier exists, tiered or untiered, and lists it first under Test gaps. Install nothing: the user decides.

## 5. Write the test

For each test gap and weak test, add one test:

- **Where:** a new file in the project's existing test folder for the tier, or a new case at the end of an existing test file. Append to an existing file only in a pytest or Playwright suite, where a defect marker can later be added by adding lines. Elsewhere, write a new file. Only add lines: never change or remove an existing line (`qa-guard` denies it).
- **Tier:** the case's tier, the lowest one that can observe the behavior. Unit for logic. Integration when the behavior depends on a real dependency, such as a database, a queue or another service. E2E only when the behavior is visible only through the public interface (`running-app.md`).
- **Container-first:** integration and e2e tests use the real dependency in a container (Testcontainers, docker compose). Mock it only when no container is possible, with a `no-container: <reason>` comment in the file.
- **Style:** follow the project's naming rule and patterns. Copy a sibling test's imports, fixtures and layout.
- **Support files:** a new test that needs a file outside the test folders, such as a pytest `conftest` file beside product code or a helper module, is denied by `qa-guard`. Do not work around it: ask the user to add the file, or write the test without it.
- **What it asserts:** the requirement's expected result, never an output nobody stated.

Then prove it, in this order:

1. **It passes on HEAD.** Run it through `direct-run.mjs` (`SKILL.md`, section 6). Proof: `{"mode": "executed", "ref": "<ZT-RUN id>", "exit": 0, "quote": "<a line of its output, such as 1 passed>"}`. If it fails with an assertion error, it is a candidate defect: go to section 6.
2. **It kills the mutant.** `mutate.mjs` reads committed code, so first make a snapshot commit of HEAD plus the new test. No ref, index or file of the repo changes:

   ```bash
   node "$SK/run.mjs" snap --files <each new or extended test file, comma separated>   # prints {"snap": "<sha>"}
   ```

   Run `mutate.mjs` again as in section 2, with `--head <sha>`, `--files <file>:<line>-<line>` (the survivor's line) and `--tests <the new test file>`. The mutant with the survivor's `id` must now be `killed`. Proof: its `run`, `exit` and `quote`. `findings.mjs` accepts the kill only when its mutant id matches a survivor in the proofs of the finding the test is for, and the test only when both the passing run's and the kill run's commands name its `path`.

Record the test in the `tests_written` list of `<run>/findings.json`:

```json
{"path": "tests/unit/refund-window.test.ts", "finding": "G1", "proofs": [<the passing run>, <the killed mutant>]}
```

## 6. Defects

A test that encodes a requirement and fails on HEAD with an assertion failure proves a defect. An import, collection or setup error proves nothing: fix the test. Record a `defect` finding whose title ends with the test's path. Proof: `{"mode": "executed", "ref": "<ZT-RUN id>", "exit": <its exit code>, "quote": "<the assertion message, word for word>"}`.

Then keep the test in the suite under the framework's strict expected-failure marker, so CI stays green and the test fails the day the defect is fixed. Put `skip-reason: defect <finding id>: <title>` on the line before the marker: the removed-test check in `pr-test-tiers.py` refuses an expected-failure marker without one.

| Framework | How to add the marker |
|---|---|
| pytest | add `# skip-reason: defect D1: <title>` and `@pytest.mark.xfail(strict=True)` above the test function |
| Playwright | add `// skip-reason: defect D1: <title>` and `test.fail();` as the first lines of the test body |
| Vitest | delete the new file you wrote, and write it again with `// skip-reason: defect D1: <title>` above `test.fails(` |
| Jest | the same as Vitest, with `test.failing(` |
| any other | delete the new file you wrote, and write the test to `<run>/defects/` instead; the finding's title gives that path |

Delete only a file you created in this run, never any other. A test kept in the suite runs once more: with the marker it must pass.

A defect is reported, never fixed. Hand it to the user, or to `paired-agent-tdd`, where the failing test is already its RED step.
