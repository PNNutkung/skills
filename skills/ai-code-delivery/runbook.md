# AI Code Review & Deployment Runbook

**Goal:** Safely integrate and ship high-velocity, AI-generated code without creating human review bottlenecks or compromising production stability.

Roles: **Author** = person or agent opening the PR (sections 1, 3, 4). **Reviewer** = person gating the PR (sections 2, 3, 5). **Release owner** = person turning the flag on (sections 6, 7).

---

## 1. Pre-Implementation: Feature Gating & Scoping

1. **Establish blast radius gates.** Before an agent writes feature code, define a feature flag (a LaunchDarkly toggle or an internal boolean).
2. **Decouple integration points.** Isolate leaf features from trunk code early. Integration code sits behind the flag, so incomplete or buggy logic cannot leak into live traffic.

---

## 2. Blast Radius Triage (the "Tree Model")

Calibrate manual review effort to where the code sits in the architecture.

| Classification | Definition and scope | Review standard |
| --- | --- | --- |
| **Trunk code** | Core entry points (`app.ts`), shared state and reducers, foundational infra (networking, storage, rendering pipelines). | **Deep line-by-line review.** High blast radius: assess side effects, backward compatibility and failure modes by hand. |
| **Leaf code** | Isolated components, gated sub-features, standalone utilities, new isolated endpoints. | **High-level skim.** Validate tests and visual artifacts; do not read every implementation detail if it is gated. |

---

## 3. Pull Request Requirements (Proof of Correctness)

Reject any agent-authored PR that lacks reproducible proof. Every PR follows this template:

```markdown
- [ ] Feature flag: <flag name that controls this code>
- [ ] Tests: <unit / component / snapshot result; the tests assert real invariants, not no-ops>
- [ ] Proof:
  - UI change: <screenshot or short screen recording>
  - Backend / infra change: <runtime log or CLI execution trace>
- [ ] Summary: <concise bullets only, no multi-paragraph explanation>
```

---

## 4. Automated Code Hygiene

1. **Ban manual nitpicking.** Do not spend human review time on formatting, conventions or syntax style.
2. **Delegate to tooling.** CI enforces strict type checking, linting and formatting before review starts.
3. **Let agents self-fix.** Configure local or CI agentic linters to resolve mechanical errors automatically.

---

## 5. Adversarial Agent Review & Automated Iteration

1. **Isolate the reviewer's context.** Never ask the authoring agent session to review its own diff. Use an independent agent or sub-agent with zero conversation history for an adversarial review pass.
2. **Automate PR babysitting.**
   - Configure review bots on the host (for example a Codex or Claude Code reviewer on GitHub).
   - Run background jobs that read reviewer comments, apply fixes, rerun the validation suite and push updates without manual intervention.

---

## 6. The 80/20 Production Readiness Gate

Merging behind a feature flag is only **80% complete** ("broad strokes"). Before general availability, do the final **20% human taste and reliability audit**:

1. **System health audit.** Inspect end-to-end performance overhead, edge-case behavior and potential security vulnerabilities.
2. **Design and UX polish.** Verify micro-interactions, responsive behavior, copy consistency and animations.
3. **Dead code and slop cleanup.** Refactor awkward agent abstractions and redundant boilerplate before customers see it.

---

## 7. Canary Deployment & Progressive Rollout

1. **Canary / internal cohort (1-5%).** Enable the flag for internal dogfooding or a tiny slice of production traffic.
2. **Telemetry verification.** Watch error budgets, crash rates and metric anomalies for a defined soak window.
3. **Progressive ramp.** Scale to 25%, then 50%, then 100%.
4. **Kill-switch readiness.** If an error threshold trips, flip the flag off at once. Do not attempt an emergency code revert.
