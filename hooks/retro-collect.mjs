#!/usr/bin/env node
// Claude Code hook for the retro skill: after the agent merges a change request (`gh pr merge`, `glab mr merge`) and when a session ends, it
// saves the session's numbers (tokens, tool calls, repeated reads, failed commands) into a run folder and reminds the user that /retro can
// review the work. Code only: no agent, no tokens. On by default; RETRO_AUTO_COLLECT_ENABLED=false turns it off. A flag value that is not
// valid blocks (PostToolUse) or is printed (SessionEnd). Anything else fails open: exit 0, nothing printed.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'retro');
const MERGE = /(?:^|[\s;&|()])(?:gh\s+pr\s+merge|glab\s+mr\s+merge)(?=\s|$)/;

/** -> { stdout?: object, stderr?: string } for one hook event. */
export async function handle(input, env = process.env) {
  const event = input?.hook_event_name;
  const merged = event === 'PostToolUse' && input?.tool_name === 'Bash' && MERGE.test(String(input?.tool_input?.command ?? ''));
  if (!merged && event !== 'SessionEnd') return {};
  const { FlagError, readFlags } = await import(pathToFileURL(join(SKILL, 'flags.mjs')).href);
  let flags;
  try { flags = readFlags(env); } catch (e) {
    if (!(e instanceof FlagError)) throw e;
    return event === 'PostToolUse' ? { stdout: { decision: 'block', reason: `retro: ${e.message}` } } : { stderr: `retro: ${e.message}` };
  }
  if (!flags.autoCollect) return {};
  const { autoCollect } = await import(pathToFileURL(join(SKILL, 'collect.mjs')).href);
  const { run } = autoCollect({ transcriptPath: input.transcript_path, cwd: input.cwd, sessionId: input.session_id, flags });
  const msg = `retro: this session's numbers are saved in ${run}/collect.json. Tell the user they can run /retro to review the work (RETRO_AUTO_COLLECT_ENABLED=false turns this off).`;
  return event === 'PostToolUse' ? { stdout: { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } } } : { stderr: msg };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const out = await handle(JSON.parse(readFileSync(0, 'utf8') || '{}'));
    if (out.stdout) process.stdout.write(`${JSON.stringify(out.stdout)}\n`);
    if (out.stderr) process.stderr.write(`${out.stderr}\n`);
  } catch { /* fail open */ }
  process.exitCode = 0;
}
