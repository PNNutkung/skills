# Skills

Personal agent skills and hooks that gate how agent-written code is tested, reviewed and delivered.

## Language

### Delivery

**Change request**:
A request to merge a branch into a base branch, on GitHub or GitLab.
_Avoid_: MR, PR, merge request, pull request (as the generic term)

**Definition of done**:
The list of observable behaviors a change must show before it counts as finished, each quoted from a spec, the ticket or the user's own answer, plus its feature flag, backward compatibility, non-goals, verify environment and test tiers. Written by `definition-of-done` in `docs/dod/<slug>.json`.
_Avoid_: DoD as a bare term outside a skill's own text, acceptance criteria (as a separate list)

### Testing

**Test tier**:
One of three levels of test, set by what the test runs against: unit, integration or e2e. A change request that touches source needs all three.
_Avoid_: test level, test type, test suite (overloaded: it can mean a runner, a file or a tier)

**Unit tier**:
Tests that run in one process with no network, disk or container. Mocks are allowed.
_Avoid_: component test

**Integration tier**:
Tests that run our code against real dependencies, such as a database, a queue or another service, in containers.
_Avoid_: service test

**E2E tier**:
Tests that drive the whole system through its public interface, such as HTTP, a UI or a CLI, in containers.
_Avoid_: functional test, acceptance test

**Container-first**:
The rule that integration and e2e tests use a real dependency in a container, and fall back to a mock only when no container is possible.

**Mock justification**:
The stated reason a dependency is mocked instead of containerised, for example a third-party vendor that offers no UAT server.

**Requirement**:
A behavior the application must have, quoted from a spec, a ticket or the user's own answer. A behavior nobody stated is not a requirement.
_Avoid_: assumption, expected behavior

**Defect**:
The application behaving differently from what its requirements say.
_Avoid_: bug, issue, flaw (as the generic term)

**Weak test**:
A test whose result does not track the behavior it checks: it passes when that behavior is broken, or fails when nothing changed.
_Avoid_: bad test, useless test

**Test gap**:
A required behavior that no test checks.
_Avoid_: missing test case, coverage gap (coverage is a line count, a different thing)

### Guardrails

**Rule**:
Written guidance an agent reads and should follow. Nothing enforces it.
_Avoid_: policy

**Hook**:
A script the agent harness runs on an event, which can deny the action. The only enforcement that applies to every tool call.
