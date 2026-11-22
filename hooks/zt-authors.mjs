#!/usr/bin/env node
// PostToolUse hook (Edit|Write|MultiEdit) for the opt-in self-review guard (ZT_SELF_REVIEW_GUARD_ENABLED=true): records which session or agent edited
// which file, so zt-guard.mjs can refuse a review verdict from the change's own author (zt-self-review.mjs).
// Fail open and silent: always exits 0, and prints only to block when the flag is not true or false (or the old name is set).
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

let on = false;
try {
  const { FlagError, enabled } = await import('../skills/zero-trust-review/flags.mjs');
  try { on = enabled(process.env, 'ZT_SELF_REVIEW_GUARD_ENABLED', false, { renamedFrom: 'ZT_SELF_REVIEW_GUARD' }); } catch (e) {
    if (e instanceof FlagError) process.stdout.write(JSON.stringify({ decision: 'block', reason: `zero-trust-review self-review guard: ${e.message}. Fix the flag where it is set (shell or settings.json env)` }));
    else throw e;
  }
} catch { /* fail open */ }
try {
  if (on) {
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
