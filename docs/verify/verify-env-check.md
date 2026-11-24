# Verify: verify-env-check (ADR 0005)

Booked: `[cloud]` cloud container (Linux, node v22.23.5), `[ci]` GitHub Actions on PR #27. Every section below was run for real; the dogfood section runs the new gate on this file.

## EnvNames
env: cloud container (Linux)
run: node --test skills/dev-workflow/env.test.mjs
result: pass
```
✔ should read the bracketed names in order, lowercased and once each, when the verify env line books them (EnvNames)
✔ should book nothing when the verify env line is prose, missing, or names sit on another line (EnvNames, NoNames)
ℹ pass 10
ℹ fail 0
```

## EnvMatch
env: cloud container (Linux)
run: node --test skills/dev-workflow/env.test.mjs skills/dev-workflow/fuzz.test.mjs skills/dev-workflow/env.e2e.test.mjs
result: pass
```
✔ should close verify on an unbooked env and open it when every booked env has a passing item (flags: defaults) (EnvMatch, Mismatch, EnvCoverage)
✔ should close verify on an unbooked env and open it when every booked env has a passing item (flags: on) (EnvMatch, Mismatch, EnvCoverage)
✔ should pass and tick every item when each env starts with a booked name in any case (EnvMatch, TrustText)
✔ should close the gate and name the item, its env and the booked names when an env is not booked (EnvMatch, Mismatch)
✔ should not match a booked name when it is only the start of a longer word (EnvMatch edge)
✔ should never tick an item whose env does not start with a booked name when env lines are random (EnvMatch)
ℹ pass 19
ℹ fail 0
```

## Mismatch
env: cloud container (Linux)
run: node --test skills/dev-workflow/env.test.mjs skills/dev-workflow/env.e2e.test.mjs
result: pass
```
✔ should close verify on an unbooked env and open it when every booked env has a passing item (flags: defaults) (EnvMatch, Mismatch, EnvCoverage)
✔ should close verify on an unbooked env and open it when every booked env has a passing item (flags: on) (EnvMatch, Mismatch, EnvCoverage)
✔ should close the gate and name the item, its env and the booked names when an env is not booked (EnvMatch, Mismatch)
✔ should let the user accept an item by answer id when its env is not booked (Mismatch)
ℹ pass 15
ℹ fail 0
```

## EnvCoverage
env: cloud container (Linux)
run: node --test skills/dev-workflow/env.test.mjs skills/dev-workflow/env.e2e.test.mjs
result: pass
```
✔ should close verify on an unbooked env and open it when every booked env has a passing item (flags: defaults) (EnvMatch, Mismatch, EnvCoverage)
✔ should close verify on an unbooked env and open it when every booked env has a passing item (flags: on) (EnvMatch, Mismatch, EnvCoverage)
✔ should fail and name each booked env when no passing item used it (EnvCoverage)
✔ should not count an item as using a booked env when it is mismatched or failing (EnvCoverage edge)
ℹ pass 15
ℹ fail 0
```

## NoNames
env: cloud container (Linux)
run: node --test skills/dev-workflow/env.test.mjs skills/dev-workflow/env.e2e.test.mjs
result: pass
```
✔ should pass with a warning when the ADR books no env names (flags: defaults) (NoNames)
✔ should book nothing when the verify env line is prose, missing, or names sit on another line (EnvNames, NoNames)
✔ should skip the comparison and warn when no names are booked (NoNames)
ℹ pass 15
ℹ fail 0
```

## TrustText
env: cloud container (Linux)
run: node --test skills/dev-workflow/env.test.mjs; grep -c 'os\.\|process.platform\|hostname' skills/dev-workflow/check.mjs
result: pass
```
✔ should pass and tick every item when each env starts with a booked name in any case (EnvMatch, TrustText)
ℹ pass 10
ℹ fail 0
host lookups in check.mjs: 0
```

## Docs
env: cloud container (Linux)
run: node --test skills/dev-workflow/docs.test.mjs; grep -c WORKFLOW_VERIFY_ENV_CHECK_ENABLED README.md rules/README.md skills/dev-workflow/SKILL.md
result: pass
```
✔ should document the flag in SKILL.md, the README Flags table and rules/README when flags change
ℹ pass 10
ℹ fail 0
README.md:1
rules/README.md:1
skills/dev-workflow/SKILL.md:2
```

## Dogfood
env: cloud container (Linux)
run: node skills/dev-workflow/workflow.mjs tick --slug verify-env-check (before the [ci] section was written; then with WORKFLOW_VERIFY_ENV_CHECK_ENABLED=false)
```
{"ok":false,"errors":["Flag: missing (add a \"## Flag\" section)","booked env [ci] has no passing item: run at least one DoD item there (env: ci ...)"]}
{"ok":false,"errors":["Flag: missing (add a \"## Flag\" section)"]}
```

