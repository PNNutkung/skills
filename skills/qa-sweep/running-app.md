# Mode A: the running app

Read [`SKILL.md`](./SKILL.md) first. This mode starts the app, explores it only through the project's own e2e runner, and proves e2e test gaps and defects. Tests you write here follow `code.md`, sections 5 and 6.

## 1. Start the app

Start it the way the project documents: the README, a Makefile, docker compose, or a script in the package manifest. If nothing documents it, ask the user for the command; never guess one. Note the base URL it serves. Stop what you started before `run.mjs end`.

## 2. Every e2e command goes through target.mjs

```bash
ZT_RUN_DIR="$RUN" node "$SK/target.mjs" run --url http://localhost:3000 [--services web,api] [--env-name BASE_URL] -- \
  node "$PTDD_DIR/direct-run.mjs" --timeout 900 -- npx playwright test <spec>
```

- `--url`: the exact base URL the runner will hit. If the project's e2e config hard-codes one, pass that one.
- `--env-name`: the variable the e2e config reads its base URL from (default `BASE_URL`). `target.mjs` sets it to `--url`.
- `--services`: docker compose service names that count as local hosts.
- `direct-run.mjs` inside it writes the run to the ledger, so the run can be a proof.

If the host is not local (`localhost`, `*.localhost`, `127.x.x.x`, `::1` or a listed service), `target.mjs` exits 3 and runs nothing. Then ask the user: "May I run e2e tests against <url>? They may write data there." Only after a yes in this run, add `--confirm-target <url>` with the same URL. A yes from an earlier run does not count, and you never confirm a production URL on your own. Without a yes, start the app locally (section 1), or stop and say why.

Explore only this way. Never use a browser-automation tool, and never send requests to the app outside the project's runner.

## 3. Exploratory specs

A spec you write only to explore, not as a regression test, lives in `$RUN/explore/`. If the runner cannot load a spec from outside the repo (it cannot find its own packages there), put it in the project's e2e folder under a name that marks it, such as `qa-explore-checkout.spec.ts`, and delete it before `run.mjs end`. Only regression tests stay in the repo.

## 4. E2E test gaps: one coverage run

Mutating a running app needs a restart for every mutant, so an e2e test gap is proven by coverage instead:

1. Find a coverage tool the project already has for its server: for example Python `coverage`, `c8` or `nyc` for Node, or a JaCoCo agent. If it has none, record the gap with its requirement and a proposed tool; it lands under Unverified. Install nothing without the user's yes.
2. Start the server under that tool, run the existing e2e suite once through `target.mjs`, then stop the server so the coverage data is written.
3. Print the report for the implementing files only, through `direct-run.mjs`, for example `coverage report -m --include=<file>`.
4. Implementing lines of the case that never ran prove that no e2e test reaches the behavior.

The finding needs two proofs: a `code` proof at one of the lines that never ran, and the report run with `"coverage": true`, whose quote is the report line that names that file and its missed lines. `findings.mjs` accepts the coverage proof only when its quote contains the path of a verified `code` proof on the same finding.

```json
{"id": "G2", "kind": "test-gap", "tier": "e2e", "requirement": "R2", "title": "no e2e test applies a voucher at checkout",
 "proofs": [{"mode": "code", "ref": "src/checkout/total.ts:42", "quote": "<that line, word for word>"},
            {"mode": "executed", "ref": "<ZT-RUN id>", "exit": 0, "coverage": true, "quote": "src/checkout/total.ts 61 12 80% 40-48"}]}
```

The e2e regression test you then write has a passing run but no killed mutant, unless the user opted in to e2e mutants (section 5). Without one, `findings.mjs` lists it under Unverified with that reason. Tell the user so.

## 5. E2E weak tests: only on the user's opt-in

E2E weak tests are not hunted by default. Hunt them only when the user opts in for this run and accepts a restart of the app for every mutant. Then run `mutate.mjs` as in `code.md`, section 2, with a `--cmd` that starts the app from the mutant's copy (the command runs inside it), runs the one spec through `target.mjs`, and stops the app. Use a large `--timeout` and a small `--max`. Show the user the command before the first mutant runs.

## 6. E2E defects

An e2e run that fails with an assertion failure against a requirement proves a defect. Its regression test is an e2e test, kept under the strict expected-failure marker (`code.md`, section 6).
