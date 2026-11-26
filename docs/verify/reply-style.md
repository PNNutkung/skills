# Verify: reply-style (ADR 0010)

Booked: `[cloud]` cloud container (Linux, node v22.23.5), `[ci]` GitHub Actions on PR #42, `[nut]` one Claude Code session on Nut's machine with the branch plugin. Every section below was run for real.

## RuleFile
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should keep the rule parts the ADR asks for when the rule file is read (RuleFile, FirstUse, SteRules, Scope, Guideline)
ℹ pass 11
ℹ fail 0
```

## FirstUse
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should keep the rule parts the ADR asks for when the rule file is read (RuleFile, FirstUse, SteRules, Scope, Guideline)
ℹ pass 11
ℹ fail 0
```

## SteRules
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should keep the rule parts the ADR asks for when the rule file is read (RuleFile, FirstUse, SteRules, Scope, Guideline)
ℹ pass 11
ℹ fail 0
```

## Scope
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should keep the rule parts the ADR asks for when the rule file is read (RuleFile, FirstUse, SteRules, Scope, Guideline)
ℹ pass 11
ℹ fail 0
```

## Hook
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should inject the whole rule file when the session starts with the flag unset (Hook)
✔ should inject the rule when REPLY_STYLE_ENABLED is true or empty in any case (Hook)
✔ should do nothing when the event is not SessionStart (Hook)
✔ should inject the rule when the plugin folder is reached through a symlink (Hook, rules/paths.md)
ℹ pass 11
ℹ fail 0
```

## FlagOff
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should print nothing and exit 0 when REPLY_STYLE_ENABLED is false (FlagOff)
ℹ pass 11
ℹ fail 0
```

## FlagBad
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should exit 2 and name the flag, the value and the fix when REPLY_STYLE_ENABLED is invalid (FlagBad)
✔ should accept only true, false or empty when the flag value is random (FlagBad, fuzz)
ℹ pass 11
ℹ fail 0
```

## Missing
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should warn on stderr and exit 0 when the rule file is missing (Missing)
ℹ pass 11
ℹ fail 0
```

## SkillLine
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should link the rule from every SKILL.md when the skills are read (SkillLine)
ℹ pass 11
ℹ fail 0
```

## Guideline
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should keep the rule parts the ADR asks for when the rule file is read (RuleFile, FirstUse, SteRules, Scope, Guideline)
ℹ pass 11
ℹ fail 0
```

## Docs
env: cloud container (Linux)
run: node --test hooks/reply-style.test.mjs
result: pass
```
✔ should register the hook and document the flag when the plugin files are read (Docs)
ℹ pass 11
ℹ fail 0
```

## Version
env: cloud container (Linux)
run: node -e "console.log(require('./.claude-plugin/plugin.json').version)"
result: pass
```
2.9.0
```

## CI
env: ci GitHub Actions on PR #42, head 69e43c2
run: test workflow (node 22, 24, 26 on ubuntu-latest and macos-latest, lint, ratchet, test names)
result: pass
```
check_suite.completed on 69e43c29dabe304ff0b5012711de7a176ba5a6bd: no check failed or still running
first head d5ca065 failed on macOS (Missing test): the hook compared argv[1] without realpath; fixed in 69e43c2
```

## RealSession
env: nut Claude Code on Nut's machine with the branch plugin
run: open a session, ask one question, read the reply
result: open
```
waiting for Nut
```
