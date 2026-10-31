# Skills

Personal agent skills and hooks that gate how agent-written code is tested, reviewed and delivered.

## Language

### Delivery

**Change request**:
A request to merge a branch into a base branch, on GitHub or GitLab.
_Avoid_: MR, PR, merge request, pull request (as the generic term)

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
