---
name: paired-subagent-tdd
description: Use for non-trivial, multi-file features or bugfixes that need tests, running TDD as driver/navigator subagent pairs orchestrated end-to-end via the Workflow tool.
---

# Paired Subagent TDD

This skill runs TDD (RED/GREEN/REFACTOR) as a sequence of driver-subagent-writes-it / navigator-subagent-verifies-it steps, bracketed by a pre-implementation existing-test audit and a post-implementation review-and-fix loop, all orchestrated by the main agent, which never edits code directly at any stage.

## When to use

- Non-trivial, multi-file change where tests are appropriate and the request implies implement/fix-with-tests.
- NOT for single-line fixes, exploratory research, or when the user hasn't asked for tests.
- Cost caveat: this pattern spawns many subagents (a recent real case used ~14 for a 2-source-file + 3-test-file change) — don't reach for it reflexively on small tasks.

## When NOT to use

- Single-file/single-line changes, exploratory research, no-test-expected tasks, or when the user's instructions already specify a different explicit process. Prefer solo work or a lighter-weight skill/agent (e.g. the tdd-guide agent alone) for those cases.

## Orchestrator-only rule

Once this skill is invoked, the main agent acts PURELY as orchestrator for every stage. It never writes test/implementation/refactor/integration-test code itself, never edits files to directly patch them, and never runs the code-review pass inline. Every stage's actual work — driver, navigator, integration-test author, review pass, and even small IMPORTANT/nit fixes found in Stage 5 — is delegated to a spawned subagent. The main agent's only direct actions are: dispatch subagents, read their reports, update TaskCreate/TaskUpdate state, and run cheap read-only commands that don't edit source (git status, git diff --stat, re-confirming a pass/fail count an agent already reported) — never editing/writing source or test files directly.

## Always execute via the Workflow tool

Invoking this skill IS the user's opt-in signal for Workflow-tool orchestration on this run — there is no fallback branch, no "if the user separately opted in" gating. Every run of this skill's five-stage pipeline goes through the Workflow tool.

## The five-stage pipeline

0. **Existing-test audit** — before writing new tests, check whether the change will make existing tests stale (new fields breaking strict shape assertions, new code paths needing new mocks); fix in the same pass. Can run in parallel with Stage 1.
1. **RED** — driver subagent writes failing tests against current code; test plan must cover happy path, fail path, AND edge/collision cases implied by the feature's invariants (not just whatever case the bug report named) — an untested collision with an internally-reserved value is how bugs ship. Driver must report *why* each test fails (confirms failure for the right reason, not a fixture/import error).
2. **GREEN** — driver subagent implements the minimum change to pass the RED tests. Sequential — depends on Stage 1's tests existing.
3. **REFACTOR** — driver subagent cleans up once green; apply the project's three-strikes DRY rule explicitly (don't extract shared abstractions on the second occurrence of a pattern).

   Stages 0-3 each get an independent navigator-subagent review — see Driver/navigator contract below — before being marked done.

4. **Integration test** — one subagent adds a real-dependency (no-mock) test exercising the full path; can run in parallel with Stage 3 when independent.
5. **Verification + review loop** — run the full test suite and linters/pre-commit (delegate this to a subagent too, per the orchestrator-only rule — do not run it directly). Then run /code-review-excellence (or an equivalent review skill) against the diff via a subagent. For BLOCKING findings, spawn one fix subagent per finding. For IMPORTANT/nit findings, still delegate the fix to a small subagent rather than fixing inline (per the orchestrator-only rule).

## Driver/navigator contract

- Driver subagent gets: full background context (why, what files, the existing sibling pattern to mirror, expected diff shape), told explicitly NOT to touch out-of-scope files, and told what to report back (diff + test output). For Stage 1 (RED), the driver must be told explicitly to produce all three test categories — happy path, fail path, edge/collision case(s) — even if the originating bug report only names one.
- Navigator subagent gets: the SAME background context (it wasn't present for the driver's run) plus the driver's claims, and a checklist to independently re-verify (re-run tests itself, re-read the diff itself, check specific correctness properties named by the plan). Navigator may delegate a fix for small issues via another subagent rather than bouncing back to the driver, per the orchestrator-only rule.
- Independent stages (e.g. Stage 0 + Stage 1; Stage 3 + Stage 4) are dispatched as parallel calls, not sequentially, when they don't depend on each other's output. Use TaskCreate/TaskUpdate with addBlockedBy to encode the real dependency graph before dispatching.

## Links out to (don't re-explain these — reference them)

- **superpowers:subagent-driven-development** — general task-dispatch mechanics, briefing structure, review-loop patterns at the whole-plan level; this skill narrows that to per-TDD-step pairing.
- **tdd-workflow** (or tdd) — RED/GREEN/REFACTOR mechanics themselves; this skill only adds the pairing wrapper, not the cycle's mechanics.
- **superpowers:verification-before-completion** — the evidence-before-claims discipline the navigator step enforces.
- Contrast with **superpowers:dispatching-parallel-agents** (parallel agents on DIFFERENT problems) — this skill is two agents cooperating on the SAME unit of work, not fan-out.

## Workflow tool script skeleton

```javascript
export const meta = {
  name: 'paired-subagent-tdd',
  phases: [
    'Audit + RED',
    'GREEN + REFACTOR',
    'Integration test',
    'Review + fix',
  ],
};

phase('Audit + RED', async () => {
  const [auditReport, redReport] = await parallel([
    agent({
      name: 'stage0-audit',
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        Existing-test audit. Background: {feature background, files touched}.
        Check whether the planned change will make any existing test stale
        (strict shape assertions on new fields, code paths needing new mocks).
        Fix any stale tests you find in this same pass.
        Report: list of files touched + why each was stale.
      `,
    }),
    agent({
      name: 'stage1-red-driver',
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        RED stage driver. Background: {feature background, files touched,
        sibling pattern to mirror}. Write failing tests against the CURRENT
        code for {feature}, covering all three categories: (1) happy path,
        (2) fail path, (3) edge/collision case(s) implied by the feature's
        invariants — even if not explicitly named in the bug report/request.
        Do not touch files outside {scope}.
        Report: diff + test run output + why each test currently fails
        (must fail for the right reason, not a fixture/import error) +
        which of the three categories each test covers.
      `,
    }),
  ]);

  const redNavigator = await agent({
    name: 'stage1-red-navigator',
    model: 'sonnet',
    effort: 'xhigh',
    prompt: `
      RED stage navigator. Same background as the driver: {feature
      background, files touched, sibling pattern}. Driver claims: ${redReport}.
      Independently re-run the new tests yourself, re-read the diff yourself,
      and confirm each test fails for the right reason (not a fixture/import
      error). Confirm all three categories are present: happy path, fail
      path, and edge/collision case(s) — reject if any category is missing.
      If you find a small issue, delegate the fix to another
      subagent rather than fixing it yourself.
      Report: PASS/FAIL verdict + evidence.
    `,
  });

  return { auditReport, redReport, redNavigator };
});

phase('GREEN + REFACTOR', async ({ redReport }) => {
  // pipeline() is the default primitive here: GREEN and REFACTOR are
  // per-file sequential driver-then-navigator steps with no barrier
  // between files — each file flows through all four stages independently,
  // and each stage receives (prevResult, originalItem, index).
  const files = ['schemas.py', 'tool.py']; // files touched by this change

  const results = await pipeline(
    files,
    file => agent({
      name: `stage2-green-driver:${file}`,
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        GREEN stage driver. Background: {feature background}. RED tests from
        the prior stage: ${redReport}. Implement the MINIMUM change needed in
        ${file} to make those tests pass. Do not touch files outside {scope}.
        Report: diff + full test run output (all RED tests now passing).
      `,
    }),
    (greenReport, file) => agent({
      name: `stage2-green-navigator:${file}`,
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        GREEN stage navigator. Same background as the driver. Driver claims
        for ${file}: ${greenReport}. Independently re-run the full test suite
        for this change yourself and re-read the diff yourself. Confirm the
        implementation is minimal (no unrequested scope creep). Delegate any
        small fix to another subagent rather than fixing it yourself.
        Report: PASS/FAIL verdict + evidence.
      `,
    }),
    (greenNavigator, file) => agent({
      name: `stage3-refactor-driver:${file}`,
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        REFACTOR stage driver. Background: {feature background}. Navigator
        confirmation for ${file}: ${greenNavigator}. Clean up ${file} now
        that tests are green. Apply the three-strikes DRY rule explicitly —
        do NOT extract a shared abstraction on only the second occurrence of
        a pattern.
        Report: diff + test run output (still green).
      `,
    }),
    (refactorReport, file) => agent({
      name: `stage3-refactor-navigator:${file}`,
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        REFACTOR stage navigator. Same background as the driver. Driver
        claims for ${file}: ${refactorReport}. Re-run tests yourself, re-read
        the diff yourself, and confirm no premature abstraction was
        introduced (check the three-strikes rule was honored) and behavior
        is unchanged. Delegate any small fix to another subagent rather than
        fixing it yourself.
        Report: PASS/FAIL verdict + evidence.
      `,
    }),
  ); // results[i] is the refactor-navigator verdict for files[i]

  const refactorReport = results;
  return { refactorReport };
});

phase('Integration test', async ({ refactorReport }) => {
  const [integrationReport] = await parallel([
    agent({
      name: 'stage4-integration-test',
      model: 'sonnet',
      effort: 'xhigh',
      prompt: `
        Integration test stage. Background: {feature background}. Refactored
        diff: ${refactorReport}. Add ONE real-dependency (no-mock) test that
        exercises the full path end to end for {feature}.
        Report: diff + test run output.
      `,
    }),
    // Runs in parallel with REFACTOR's navigator pass when independent;
    // shown here as its own call for clarity if REFACTOR is still settling.
  ]);

  return { integrationReport };
});

phase('Review + fix', async ({ refactorReport, integrationReport }) => {
  const reviewReport = await agent({
    name: 'stage5-review',
    model: 'sonnet',
    effort: 'xhigh',
    prompt: `
      Run /code-review-excellence (or an equivalent review skill) against
      the full diff for this change: ${refactorReport} + ${integrationReport}.
      Also run the project's full test suite and linters/pre-commit and
      report the results.
      Return findings as structured JSON matching:
      { findings: [{ file, line, severity: "BLOCKING"|"IMPORTANT"|"NIT",
      summary, fix_suggestion }] }
    `,
    outputSchema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              severity: { enum: ['BLOCKING', 'IMPORTANT', 'NIT'] },
              summary: { type: 'string' },
              fix_suggestion: { type: 'string' },
            },
          },
        },
      },
    },
  });

  const blocking = reviewReport.findings.filter(f => f.severity === 'BLOCKING');
  const nonBlocking = reviewReport.findings.filter(f => f.severity !== 'BLOCKING');

  const blockingFixes = await parallel(
    blocking.map(finding =>
      agent({
        name: `fix-blocking-${finding.file}-${finding.line}`,
        model: 'sonnet',
        effort: 'xhigh',
        prompt: `
          Fix this BLOCKING review finding. Background: {feature background}.
          Finding: ${JSON.stringify(finding)}.
          Do not touch files outside {scope}. Report: diff + test run output.
        `,
      }),
    ),
  ); // empty array fan-out if no BLOCKING findings

  const nitFixes = await parallel(
    nonBlocking.map(finding =>
      agent({
        name: `fix-nit-${finding.file}-${finding.line}`,
        model: 'sonnet',
        effort: 'xhigh',
        prompt: `
          Fix this IMPORTANT/NIT review finding (still delegated per the
          orchestrator-only rule, never fixed inline). Background:
          {feature background}. Finding: ${JSON.stringify(finding)}.
          Report: diff + test run output.
        `,
      }),
    ),
  );

  return { reviewReport, blockingFixes, nitFixes };
});
```
