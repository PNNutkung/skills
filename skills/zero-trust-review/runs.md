## Measured notes

- 2026-10-06, standard run, 5-file MR (470 source lines, 2 groups): 7 agents, ~407k subagent tokens, ~316 s, 7 findings all low/nit, 5 confirmed. Two verifiers reported UNVERIFIED because the macOS host has no `timeout` binary.
- 2026-10-06, paired fix run (generator + runbook; 2 drivers + 2 navigators + 1 opus reviewer, sonnet high / opus high): 5 agents, ~564k tokens, ~368 s. A navigator reported 2 real defects the driver never fixed; the opus re-read found them still present plus 2 more both navigators missed (an arithmetic error in an example, a stale code comment).
- 2026-10-06, second paired run (3 small assertions, 1 sonnet-high navigator): the gap-hunting checklist item found a real false failure.
- Full-fleet baseline (USD 34.75 per run): attempt 1 wasted 6.7M tokens on 27 agents (harness interrupts any agent silent for ~180 s and every retry restarted from zero; 9 long reviewers died on one gateway stall); attempt 2, resumed, ran 95 agents and 5.8M tokens: 2 audit agents (~11.5k unit tests on HEAD and a baseline copy; a Docker Postgres probe), 9 dimension reviewers (15 of 30 points ended N/A after ~45 tool calls each), 1 opus triage, 53 clusters x 1-3 skeptics (~75 verifiers, 0 refuted, 33 "confirmed low"), 1 opus critic, 5 gap reviewers whose 13 findings were verified again. Prompts embedded ~18 KB of checklist and context.

## Runs

date | sha8 | mode | agentsByNode | tokens | wall-clock | note
2026-10-06 | 2aaa36c4 | standard | reviewer 2, verifier-refute 2, verifier-reproduce 2, batch-verifier 1 (=7) | ~407k | ~316 s | 7 findings low/nit, 5 confirmed; USD n/a; no 'timeout' binary on macOS host
