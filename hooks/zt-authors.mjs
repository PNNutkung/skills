#!/usr/bin/env node
// PostToolUse hook (Edit|Write|MultiEdit) for the opt-in self-review guard (ZT_SELF_REVIEW_GUARD=1): records which session or agent edited
// which file, so zt-guard.mjs can refuse a review verdict from the change's own author (zt-self-review.mjs).
// Fail open and silent: never prints, always exits 0.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

try {
  if (process.env.ZT_SELF_REVIEW_GUARD === '1') {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const path = input?.tool_input?.file_path;
    if (typeof path === 'string' && input.session_id) {
      const { recordAuthor } = await import('./zt-self-review.mjs');
      const { markerDir } = await import('../skills/zero-trust-review/runctx.mjs');
      const abs = isAbsolute(path) ? path : resolve(input.cwd || process.cwd(), path);
      let real = abs;
      try { real = realpathSync(abs); } catch { try { real = join(realpathSync(dirname(abs)), abs.slice(dirname(abs).length + 1)); } catch { /* keep abs */ } }
      recordAuthor(markerDir(), { session: input.session_id, agent: input.agent_id, file: real });
    }
  }
} catch { /* fail open */ }
process.exit(0);
