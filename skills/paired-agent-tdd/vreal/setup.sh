#!/usr/bin/env bash
# VReal setup: stand-in agents + the clone's skills in ~/.claude. Undo with restore.sh. It changes ~/.claude, so the machine's owner runs it.
set -euo pipefail
V=${VREAL_DIR:-$HOME/ptdd-vreal}
CLONE=$V/skills/skills
if [ -e $V/backup ]; then echo "REFUSE: $V/backup exists (setup already ran?). Run restore.sh first."; exit 1; fi
for f in tdd-guide.md code-reviewer.md; do
  if [ -e ~/.claude/agents/$f ]; then echo "REFUSE: ~/.claude/agents/$f already exists"; exit 1; fi
done
for s in paired-agent-tdd zero-trust-review; do
  if [ ! -e ~/.claude/skills/$s ] && [ ! -L ~/.claude/skills/$s ]; then echo "REFUSE: ~/.claude/skills/$s missing"; exit 1; fi
  [ -d $CLONE/$s ] || { echo "REFUSE: $CLONE/$s missing"; exit 1; }
done
mkdir -p $V/backup
if [ -d ~/.claude/agents ]; then echo existed > $V/backup/agents-dir-state; else echo absent > $V/backup/agents-dir-state; fi
mkdir -p ~/.claude/agents
cat > ~/.claude/agents/tdd-guide.md <<'EOF'
---
name: tdd-guide
description: TDD driver stand-in for the paired-agent-tdd VReal measurement. Writes failing tests first, then minimal code, and runs the gate commands it is given.
tools: Read, Write, Edit, Bash, Grep
---
You are a TDD driver. Work strictly test-first: write the failing tests you are asked for, run the RED gate command you are given and confirm the tests fail for the right reason, then write the minimal code that makes them pass and run the GREEN gate command you are given. Edit only the files your prompt names. Use Bash only for the test command, the gate commands, and read-only git. Report exactly what the gates printed; never claim a result a gate did not show.
EOF
cat > ~/.claude/agents/code-reviewer.md <<'EOF'
---
name: code-reviewer
description: Read-only reviewer/navigator stand-in for the paired-agent-tdd VReal measurement. Judges from gate output and files read; never edits.
tools: Read, Grep, Glob, Bash
---
You are a read-only reviewer. Run the gate commands you are given, read the files involved, and judge only from the gate output and what you read. Never edit or write files. Use Bash only for gate commands, test commands, and read-only git. Report defects concretely (file, test, what is wrong) and state PASS or FAIL as your prompt asks.
EOF
# swap skills: mv moves a symlink as-is (its link text is kept), so restore.sh puts it back exactly
for s in paired-agent-tdd zero-trust-review; do
  mv ~/.claude/skills/$s $V/backup/$s
  ln -s $CLONE/$s ~/.claude/skills/$s
done
echo "setup done:"
ls -la ~/.claude/skills/paired-agent-tdd ~/.claude/skills/zero-trust-review
ls -la ~/.claude/agents $V/backup
