#!/usr/bin/env bash
# usage: run.sh A|B   A: every PTDD_*/ZT_* speed flag off; B: the defaults (all unset).
set -uo pipefail
R=$1; V=${VREAL_DIR:-$HOME/ptdd-vreal}; D=$V/run$R
SK=$V/skills/skills/paired-agent-tdd
export ZT_DIR=$V/skills/skills/zero-trust-review
NOTE_PREFIX=${VREAL_NOTE:-VReal}
rm -rf $D; cp -a $V/base $D; cd $D
if [ "$R" = A ]; then
  export PTDD_PIPELINE_MODE=paired PTDD_QUICK_DRIVER_GATE_ENABLED=false PTDD_GATE_REUSE_ENABLED=false PTDD_COURIER_SKIP_ENABLED=false PTDD_PARALLEL_REVIEW_ENABLED=false ZT_MUTATION_BASELINE_REUSE_ENABLED=false ZT_MUTATION_BUDGET_STRICT_ENABLED=false
  NOTE="$NOTE_PREFIX flags off"
else
  unset PTDD_PIPELINE_MODE PTDD_QUICK_DRIVER_GATE_ENABLED PTDD_GATE_REUSE_ENABLED PTDD_COURIER_SKIP_ENABLED PTDD_PARALLEL_REVIEW_ENABLED ZT_MUTATION_BASELINE_REUSE_ENABLED ZT_MUTATION_BUDGET_STRICT_ENABLED
  NOTE="$NOTE_PREFIX flags on"
fi
env | grep -E '^(PTDD|ZT)_' | sort > $V/run$R.env.txt
T0=$(date +%s); date -Is > $V/run$R.start
claude -p "Use the paired-agent-tdd skill at $SK to implement ticket.md with plan.json. Follow its checklist through verify and record.mjs (--append $SK/runs.md, --note '$NOTE'). This is an unattended measurement run: do not ask for confirmation, proceed through every step. Write args.json, return.json and every other run file into the run folder that tdd.mjs plan prints (\$RUN), never inside this repo; do not create or delete any repo file yourself. Report at the end: the runs.md line record.mjs appended, agents by node, verify output (DoD closure), and any failure." \
  --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Grep Glob Agent Workflow Skill" \
  --output-format json > $V/run$R.out.json 2> $V/run$R.err.txt
RC=$?
T1=$(date +%s)
echo "rc=$RC wall=$((T1-T0))s" | tee $V/run$R.time
