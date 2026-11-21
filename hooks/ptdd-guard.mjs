#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|Bash) for paired-agent-tdd's file fence. The rules live in skills/paired-agent-tdd/fence.mjs.
// Off unless `tdd.mjs plan` ran with PTDD_GUARD=1 (it then writes the marker this hook reads); only subagents are fenced.
// Fail open: it always exits 0 and denies only through the JSON permissionDecision; any internal error allows the action.
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input?.agent_id) {
    const { readFence, fenceVerdict } = await import('../skills/paired-agent-tdd/fence.mjs');
    // same marker dir as zero-trust-review's runctx.mjs: from the passwd entry, never $HOME; ZT_MARKER_DIR is the test seam
    const markerDir = process.env.ZT_MARKER_DIR || join(userInfo().homedir, '.cache', 'zt-review');
    const reason = fenceVerdict(input, readFence(markerDir));
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  }
} catch { /* fail open: no output */ }
process.exit(0);
