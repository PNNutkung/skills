# Verify: dev-workflow

Every item ran in the cloud container (Linux, Node v22.23.5) on branch claude/project-thread-iq711c. `run:` is the exact command; the block lists the tests it ran and the totals.

## Skill
env: cloud container (Linux)
run: node --test --test-name-pattern='Skill' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should keep SKILL.md short with the dev-workflow name and a quoted description (Skill, Name)
ok - should register the hook and list the skill when the plugin ships it (Skill)
ok - should run the CLI and guard edits only when the flag says so (flags: defaults) (Skill, GuardEdit, GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: on) (Skill, GuardEdit, GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: off) (Skill, GuardEdit, GuardIdle)
5 matching tests passed, fail 0
```

## Name
env: cloud container (Linux)
run: node --test --test-name-pattern='Name' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should keep SKILL.md short with the dev-workflow name and a quoted description (Skill, Name)
1 matching tests passed, fail 0
```

## Order
env: cloud container (Linux)
run: node --test --test-name-pattern='Order' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should describe the steps in order with the never-skipped ones when SKILL.md lists them (Order, ShortPath)
ok - should list the steps in the agreed order when the table is read (Order)
ok - should move one step at a time when each gate has its evidence (Order, Gate)
ok - should walk every step to done when each gate gets its evidence (Order, Gate, Board, Verify, RetroFirst)
4 matching tests passed, fail 0
```

## RetroFirst
env: cloud container (Linux)
run: node --test --test-name-pattern='RetroFirst|GuardMerge' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should deny gh pr merge and glab mr merge while verify or retro is not done (GuardMerge)
ok - should walk every step to done when each gate gets its evidence (Order, Gate, Board, Verify, RetroFirst)
2 matching tests passed, fail 0
```

## ShortPath
env: cloud container (Linux)
run: node --test --test-name-pattern='ShortPath' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should describe the steps in order with the never-skipped ones when SKILL.md lists them (Order, ShortPath)
ok - should never skip DoD, verify or retro whatever the answer says (ShortPath)
ok - should skip the board only with a user answer that gives a reason (ShortPath, Gate)
ok - should never skip the DoD, verify or retro steps when asked to (ShortPath)
ok - should skip the board on a saved answer with a reason and refuse to skip the DoD (ShortPath)
5 matching tests passed, fail 0
```

## RunDir
env: cloud container (Linux)
run: node --test --test-name-pattern='RunDir' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should keep the run folder under the cache and write nothing in the repo when a run opens (RunDir, RunCache)
1 matching tests passed, fail 0
```

## RunCache
env: cloud container (Linux)
run: node --test --test-name-pattern='RunCache' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should keep the run folder under the cache and write nothing in the repo when a run opens (RunDir, RunCache)
1 matching tests passed, fail 0
```

## Resume
env: cloud container (Linux)
run: node --test --test-name-pattern='Resume' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should infer the step from repo evidence when the run folder is gone (Resume)
ok - should resume at the step the repo shows when the run folder is gone (Resume)
2 matching tests passed, fail 0
```

## Gate
env: cloud container (Linux)
run: node --test --test-name-pattern='Gate' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should open a gate only when its own evidence is there when the evidence is random (Gate)
ok - should move one step at a time when each gate has its evidence (Order, Gate)
ok - should refuse to move on and name the missing evidence when a gate has none (Gate)
ok - should skip the board only with a user answer that gives a reason (ShortPath, Gate)
ok - should walk every step to done when each gate gets its evidence (Order, Gate, Board, Verify, RetroFirst)
ok - should pass the DoD gate only when the real dod.mjs check passes in an open DoD session (Gate, integration)
6 matching tests passed, fail 0
```

## GuardEdit
env: cloud container (Linux)
run: node --test --test-name-pattern='GuardEdit' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should deny a product-code edit and allow docs and outside files when the design is not locked (GuardEdit)
ok - should allow product-code edits when the run is at tdd or later (GuardEdit)
ok - should deny a Bash write into product code before the lock and allow it after (GuardEdit)
ok - should print a deny decision and always exit 0 when run as a hook with the flag on (GuardEdit, flags: on)
ok - should run the CLI and guard edits only when the flag says so (flags: defaults) (Skill, GuardEdit, GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: on) (Skill, GuardEdit, GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: off) (Skill, GuardEdit, GuardIdle)
7 matching tests passed, fail 0
```

## GuardMerge
env: cloud container (Linux)
run: node --test --test-name-pattern='GuardMerge' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should deny gh pr merge and glab mr merge while verify or retro is not done (GuardMerge)
1 matching tests passed, fail 0
```

## GuardIdle
env: cloud container (Linux)
run: node --test --test-name-pattern='GuardIdle' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should block nothing when no workflow is open on this branch (GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: defaults) (Skill, GuardEdit, GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: on) (Skill, GuardEdit, GuardIdle)
ok - should run the CLI and guard edits only when the flag says so (flags: off) (Skill, GuardEdit, GuardIdle)
4 matching tests passed, fail 0
```

## Board
env: cloud container (Linux)
run: node --test --test-name-pattern='Board' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should require a mermaid diagram when it fits and two or more variants when SKILL.md describes the board (Board, Variants)
ok - should need the user choice on the board when the board itself is valid (Board)
ok - should read the chosen variant id when the board answer starts with it (Board)
ok - should walk every step to done when each gate gets its evidence (Order, Gate, Board, Verify, RetroFirst)
4 matching tests passed, fail 0
```

## Variants
env: cloud container (Linux)
run: node --test --test-name-pattern='Variants' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should accept a board when it has two variants with a pro, a con and a recommended one (Variants)
ok - should accept more than three variants when the board lists them (Variants: no upper limit)
ok - should list every problem when a board breaks the rules (Variants)
ok - should require a mermaid diagram when it fits and two or more variants when SKILL.md describes the board (Board, Variants)
4 matching tests passed, fail 0
```

## Facts
env: cloud container (Linux)
run: node --test --test-name-pattern='Facts' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should need measure.md too when the run was opened for speed or size work (Facts)
1 matching tests passed, fail 0
```

## Verify
env: cloud container (Linux)
run: node --test --test-name-pattern='Verify' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should pass and tick only items with a passing real run when every item has evidence or an accepted answer (Verify, TicketTick)
ok - should fail when an item is missing, failed, has no evidence or names an answer that does not exist (Verify)
ok - should walk every step to done when each gate gets its evidence (Order, Gate, Board, Verify, RetroFirst)
3 matching tests passed, fail 0
```

## TicketTick
env: cloud container (Linux)
run: node --test --test-name-pattern='TicketTick' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should pass and tick only items with a passing real run when every item has evidence or an accepted answer (Verify, TicketTick)
1 matching tests passed, fail 0
```

## Subagents
env: cloud container (Linux)
run: node --test --test-name-pattern='Subagents' skills/dev-workflow/*.test.mjs hooks/workflow-guard.test.mjs
result: pass
```
ok - should name the subagent for each kind of work when SKILL.md says who does what (Subagents)
1 matching tests passed, fail 0
```

## Dogfood

This PR's own run, resumed from repo evidence (its run folder never existed), after this file was written:

```
$ node skills/dev-workflow/workflow.mjs status --slug dev-workflow
{"ok":true,"run":"/root/.cache/dev-workflow/skills-d9f431e686d5/dev-workflow","slug":"dev-workflow","step":"verify","index":5,"resumed":true,"needs":[],"evidence":{"facts":false,"measure":false,"dod":false,"board":false,"choice":null,"adr":true,"pr":"https://github.com/PNNutkung/skills/pull/25","verify":true,"retro":false}}
```
