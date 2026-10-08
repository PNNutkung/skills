# Zero-trust checklist (30 points)

## Contents

- Intent: 1
- Tests: 2-3
- Design: 4-5
- Security: 6-7
- Correctness under retry and concurrency: 8-11
- Resources and limits: 12-18
- Runtime and platform: 19-23
- Failure behavior: 24-26
- Operability: 27-29
- Grilling: 30

Each point: trigger in the diff, then the hazard to assert. Always-on points: 1, 2, 3, 4, 5, 24, 25, 27, 28, 29, 30.
All others are trigger-gated: `triage.py` fires one only when its regex matches an ADDED line of production code (comment-only lines, tests and prose docs are not scanned; see `points` in the triage JSON).
Read only your assigned points: `Grep -n -A1 -E '^(6|7|24)\. ' <this file>` returns each point plus its Trigger line.

## Intent

1. **Scope and intent alignment** — scope creep, stray files, undocumented config changes; acceptance criteria only partially implemented; logic that satisfies the text but breaks an implied business invariant. For an agent-authored change request, no reproducible proof of correctness (the `ai-code-delivery` template): no named feature flag controlling the code; tests that assert nothing real (no-ops); a UI change without a screenshot or recording, a backend or infra change without a runtime log or CLI trace; a summary that is prose instead of concise bullets. Missing proof is a finding, not a style note.
   Trigger: always-on (every diff).

## Tests

2. **Coverage depth** — per new or modified function *and branch*: happy path; every explicit error case, unexpected payload, upstream failure, null/empty state; boundary and off-by-one, empty collections, timeouts, extreme thresholds, type coercion. A contract, DB, or API change needs an integration or E2E test proving it end to end. Flag any mock so permissive it mocks out the behavior under test.
   Trigger: always-on (every diff).
3. **Test integrity and flakiness** — `assertNotNull(res)` or `assertTrue(true)` instead of asserting state mutation and exact payload; `Thread.sleep()` or `setTimeout()` instead of deterministic polling (Awaitility, a predicate poll); wall-clock or timezone dependence instead of an injected clock; static singletons, global state, or a test DB mutated with no teardown; existing assertions *weakened* to force green; new `@Ignore`/`skip`/commented-out tests; untouched tests now asserting behavior the diff contradicts. FACTS carry the real-run probe: a `no-signal` test (passes with the change reverted), a `fails-on-head` or `nondeterministic` one is a finding with that output as proof; `unverifiable` means say so, never "tests pass".
   Trigger: always-on (every diff).

## Design

4. **DRY and reuse** — duplicated validation, regex, constants, or mappings *within* the diff; hand-rolled parsing, string handling, date formatting, HTTP retry, or validation where a project helper or installed library already exists. Name the existing helper and its signature.
   Trigger: always-on (every diff).
5. **Refactor boundary** — if accommodating this cleanly needs restructuring, do **not** bless a sloppy merge and do **not** approve bundling a large refactor here. Propose the specific split as a separate change request.
   Trigger: always-on (every diff).

## Security

6. **Input, authz, secrets** — request bodies, path params, headers, and query strings validated and sanitized before use; SQL/NoSQL injection, SSRF, path traversal, command injection, unsafe deserialization; permissions, roles, and *ownership* checked at the business layer (IDOR / BOLA); no hardcoded credentials, keys, tokens, or internal endpoints.
   Trigger: fires when an added line matches: request, os.getenv/environ, json.loads, pickle, subprocess, open(, requests., execute(, raise_for_access, security_manager, eval(/exec(.
7. **Crypto** — `Math.random()` or `rand()` for tokens, passwords, session IDs, or verification codes: demand a CSPRNG (`crypto.randomBytes`, `SecureRandom`). An HMAC, webhook token, or auth hash compared with `==` or `.equals()`: demand constant-time comparison (`timingSafeEqual`, `MessageDigest.isEqual`).
   Trigger: fires when an added line matches: random., Math.random, hmac, secrets, token, password.

## Correctness under retry and concurrency

8. **Idempotency** — a half-failed network call, consumer, webhook, or cron retry must not duplicate records, re-send payments or emails, or corrupt state. Require an idempotency key, a unique constraint, or an atomic compare-and-swap.
   Trigger: fires when an added line matches: retry, idempot, delay(, apply_async, webhook, celery.
9. **Dual-write** — event published *before* commit: downstream processes ghost data on rollback. Committed but the publish fails: lost event, so require a transactional outbox or two-phase pattern. Write to primary then immediately read from an async replica: replication-lag read-your-own-writes bug.
   Trigger: fires when an added line matches: commit(, publish, send_task, outbox, replica.
10. **Transaction scope** — no HTTP/RPC call, slow file I/O, or queue emit **inside** `@Transactional` or `BEGIN ... COMMIT`. Acquire the connection late and release it immediately; heavy parsing and business logic belong outside the boundary. Otherwise: pool starvation under load.
   Trigger: fires when an added line matches: @transaction, session.begin, commit(, BEGIN.
11. **Distributed state** (directive 24) — out-of-order arrival (`Update` or `Cancel` before `Create`) handled or cleanly rejected; missing optimistic-concurrency `version` check, missing distributed lock, check-then-act race; lock ordering and nested transactions under concurrency.
   Trigger: fires when an added line matches: lock, version_id/col/check, with_for_update, race, optimistic.

## Resources and limits

12. **Query indexing** (directive 11) — new or changed `WHERE`, `JOIN`, `ORDER BY`, `GROUP BY` matching a composite index in *prefix order*, or a sequential scan. Flag `LIKE '%term%'`, unindexed regex, and indexed columns wrapped in functions (`WHERE LOWER(col) = ?`).
   Trigger: fires when an added line matches: order by, group by, SELECT, LIKE, JOIN, outerjoin, index=True, Index(, create_index, add_index.
13. **Unbounded memory** (directive 12) — explicit `LIMIT`, keyset pagination, or a streaming cursor on every DB query and external fetch; reject open-ended `findAll()` and unconstrained `SELECT *`. Reject `readAllBytes()` and giant in-memory lists; require streaming or chunking.
   Trigger: fires when an added line matches: fetchall, .all(), limit, paginate, read(), fetchmany, cursor, stream, chunk, SELECT *.
14. **Cancellation** (directive 13) — `context.Context`, `AbortSignal`, or `CancellationToken` threaded to DB queries, HTTP clients, and child routines. A client disconnect or upstream timeout must abort downstream work, not leave zombie execution burning CPU and connections.
   Trigger: fires when an added line matches: timeout, cancel, abort, SoftTimeLimit, revoke, stop.
15. **Async lifecycle** (directive 14) — a detached `go func()`, unawaited Promise, `CompletableFuture.runAsync()`, or raw thread: unsupervised, unbounded, no timeout. Every background routine needs an error boundary or recover so a panic or unhandled rejection does not kill the process. Trace ID, Span ID, MDC, and baggage must be explicitly propagated across the handoff or the logs are uncorrelatable.
   Trigger: fires when an added line matches: Thread, asyncio, create_task, gevent, spawn, Promise, setTimeout, apply_async.
16. **Monotonic clocks** (directive 15) — elapsed time, intervals, and timeouts from `Date.now()` or `System.currentTimeMillis()` instead of `System.nanoTime()` or `performance.now()`; an NTP jump yields negative elapsed time or a non-terminating timer.
   Trigger: fires when an added line matches: time.time(, Date.now, datetime.now, monotonic, perf_counter.
17. **Cache coherency** (directive 16) — invalidate **after** commit, never before; a stale read racing the invalidation re-caches old data. A high-traffic key needs a single-flight lock or TTL jitter against stampede. Cache keys must not embed unbounded user input.
   Trigger: fires when an added line matches: cache, lru_cache, invalidate, ttl, redis.
18. **Resource cleanup** (directive 22) — file descriptors, sockets, HTTP response bodies, thread pools, and transactions closed on *every* path (`finally`, `defer`, `try-with-resources`). Watch unbounded in-memory caches, growing module-level maps, unremoved listeners, and goroutine or thread leaks.
   Trigger: fires when an added line matches: open(, close(, connect, cursor, socket, Pool, finally, ExitStack, addEventListener, setInterval.

## Runtime and platform

19. **K8s lifecycle** (directive 17) — `SIGTERM` intercepted; in-flight requests, workers, and consumers drained before exit, or rolling restarts emit 502/504. Cache warm-up, schema check, or remote handshake must not run inside liveness or block startup into a crash loop. Keep-alive sockets, DB pools, and broker channels get a drain window.
   Trigger: fires when an added line matches: SIGTERM, signal., liveness, readiness, probe, drain, graceful.
20. **LLM safeguards** (directive 18, if applicable) — strict schema validation (Zod, Pydantic) on model JSON and graceful handling of hallucinated keys; prompt plus history bounded by token limits, with a guard against runaway generation and cost blowup; untrusted input never concatenated raw into system instructions; no system prompt or backend parameter leaked in completions.
   Trigger: fires when an added line matches: openai, anthropic, llm, prompt, completion, embedding, tokens, mcp_service.
21. **Serialization** (directive 19) — 64-bit IDs emitted as JSON numbers lose precision above 2^53-1 in JS clients, so serialize them as strings; a new enum value must not crash older consumers (needs `UNKNOWN` or a default); whole nested models serialized when a few fields were needed.
   Trigger: fires when an added line matches: Enum, json.dumps, serialize, marshmallow, pydantic, Decimal, BigInt, JSON.stringify, asdict.
22. **Retention and deletion** (directive 20) — hard `DELETE FROM` on users, bookings, payments, or audit trails instead of soft delete or archive; transient rows (sessions, idempotency keys, audit logs) written with no TTL, giving unbounded growth.
   Trigger: fires when an added line matches: delete(, DELETE FROM, drop, truncate, soft delete, expire, retention.
23. **External quotas** (directive 21) — the outbound client must read HTTP `429` and honor `Retry-After` rather than blind-retry; an incoming request must not fan out into an unbounded external-call loop.
   Trigger: fires when an added line matches: 429, Retry-After, rate limit, quota, backoff, httpx, urllib.

## Failure behavior

24. **Error integrity** (directive 23) — an empty catch, or `catch (Exception e)` returning `null` or empty without logging or rethrowing; an upstream failure or timeout converted into a deceptive `200 OK` with an empty payload, hiding the outage from monitoring; a wrapped exception dropping the root-cause stack trace.
   Trigger: always-on (every diff).
25. **Failure cascade** (directive 25) — a non-critical dependency failure taking down the primary flow with no fallback; retries unbounded or lacking exponential backoff with full jitter; remote calls without explicit aggressive connect and read timeouts or a circuit breaker.
   Trigger: always-on (every diff).
26. **Feature flags** (directive 26) — new user-visible or trunk-integrating behavior shipped with no flag at all, or integration points left outside the flag so incomplete logic can leak into live traffic (gate the blast radius before the feature code, not after); an instant kill-switch without a hotfix deploy (turning the flag off, never an emergency code revert), safe at a 1-5% canary and at every ramp step; **both** ON and OFF paths tested, or toggling off in production hits bit-rot; the flag evaluated once per request, not inside a hot loop; rollback after an hour must not orphan or corrupt data; the flag marked temporary with a cleanup owner.
   Trigger: fires when an added line matches: FEATURE_FLAGS, is_feature_enabled, app.config, os.getenv, ENABLE_, flag.

## Operability

27. **Operational readiness** — OpenAPI, Protobuf, or GraphQL schema updated alongside the code; new config keys, flags, and env vars documented with safe production defaults; the change request or docs explain how a 3am on-call engineer triages and mitigates the alert this can fire.
   Trigger: always-on (every diff).
28. **Backward compatibility** — public endpoints, RPC methods, or event payloads breaking consumers *during the rolling-update window*; migrations non-destructive (no `NOT NULL` without a default, no immediate rename, no unsafe index lock); an explicit dual-read/dual-write or deprecation path for changed contracts.
   Trigger: always-on (every diff).
29. **Observability** — errors and unexpected states logged with trace ID, entity ID, and request metadata; no PII, token, secret, or auth header in logs; business metrics, error counters, and latency emitted where they are needed.
   Trigger: always-on (every diff).

## Grilling

30. **Zero-trust questions** — list every ambiguous branch, non-obvious default, unhandled race, and undocumented choice as a direct question. Sharpen each against the concrete hazard, not the abstraction:
   Trigger: always-on (every diff).

- "This query against 500k rows: where is the cursor or pagination?"
- "Which composite index does this prefix-match, and in what order?"
- "Who awaits this goroutine, and where does its panic land?"
- "How does the Trace ID reach that spawned thread?"
- "Why wall-clock and not a monotonic clock here?"
- "Why is that RPC inside the open transaction? What happens when it lags?"
- "What stops the stampede when this key expires at peak?"
- "Why `==` on an HMAC instead of a constant-time compare?"
- "What happens to in-flight work when K8s sends SIGTERM?"
- "What does the parser do when the model returns invalid JSON or an unexpected key?"
- "What caps a single user's token spend?"
- "Rollback fires after the event was published — then what?"
- "Is this 64-bit ID precision-safe once a browser parses it?"
- "Why a hard DELETE with no audit trail?"
- "The partner returns 429 — how do we back off?"
- "Why `sleep` and not a poll predicate? How is this not flaky in CI?"
- "Has the flag-OFF path actually run?"
- "Why is this exception swallowed with no alert and no rethrow?"
- "What if this event arrives out of sequence, or 10 minutes late?"
- "Dependency Z times out under load: whole endpoint down, or graceful degradation?"
- "How does on-call roll this back at 3am?"
- "Why is there no test asserting <specific failure case>?"

Verify before asserting. A claimed missing index means you read the schema; a claimed missing
test means you grepped the test files. Mark anything unverified **UNVERIFIED** rather than
stating it as fact.
