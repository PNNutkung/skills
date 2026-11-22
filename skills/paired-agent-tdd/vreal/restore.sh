#!/usr/bin/env bash
# Undo setup.sh exactly.
set -uo pipefail
V=${VREAL_DIR:-$HOME/ptdd-vreal}
CLONE=$V/skills/skills
for s in paired-agent-tdd zero-trust-review; do
  if [ -L ~/.claude/skills/$s ] && [ "$(readlink ~/.claude/skills/$s)" = "$CLONE/$s" ]; then rm ~/.claude/skills/$s; fi
  if { [ -e $V/backup/$s ] || [ -L $V/backup/$s ]; } && [ ! -e ~/.claude/skills/$s ] && [ ! -L ~/.claude/skills/$s ]; then
    mv $V/backup/$s ~/.claude/skills/$s
  fi
done
rm -f ~/.claude/agents/tdd-guide.md ~/.claude/agents/code-reviewer.md
if [ "$(cat $V/backup/agents-dir-state 2>/dev/null)" = absent ]; then rmdir ~/.claude/agents 2>/dev/null; fi
rm -f $V/backup/agents-dir-state; rmdir $V/backup 2>/dev/null
echo "restored:"
ls -la ~/.claude/skills/paired-agent-tdd ~/.claude/skills/zero-trust-review
ls -d ~/.claude/agents 2>&1 || true
ls $V/backup 2>&1 || true
exit 0
