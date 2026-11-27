#!/usr/bin/env node
// PreToolUse hook (Bash|mcp__.*) for the ticket-writer skill (ADR 0012, Guard, GuardMcp, GuardFlag). On by default: TICKET_WHY_GUARD_ENABLED=false
// turns it off; any other value that is not true or false denies the guarded calls with the fix.
// It denies `gh issue create`, `gh pr create`, `glab issue create`, `glab mr create` and the GitHub/GitLab MCP create tools when the body does not
// start with Why, Expected outcome, If we do nothing and How we know (skills/ticket-writer/why.mjs). A body it cannot read (editor, --fill, a
// shell variable) is denied with the fix: --body-file <file>. Pattern matching on the command text, no shell evaluation. Fail open: always exit 0.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..', 'skills', 'ticket-writer');
// A hook copied without its skill must not crash on import: verdict() then allows everything.
let mods = null;
try {
  mods = { ...(await import(join(SKILL, 'flags.mjs'))), ...(await import(join(SKILL, 'why.mjs'))), ...(await import(join(SKILL, 'create.mjs'))) };
} catch { mods = null; }
const TICKET_MJS = join(SKILL, 'ticket.mjs');
const TEMPLATE = join(SKILL, 'template.md');

/** A deny reason, or null. input: the PreToolUse payload. */
export function verdict(input, env = process.env) {
  if (!mods) return null;
  const { FLAG, FlagError, enabled, checkBody, createCall, mcpCreate } = mods;
  const { tool_name: tool, tool_input: ti, cwd } = input ?? {};
  let call = null;
  if (tool === 'Bash') call = createCall(String(ti?.command ?? ''));
  else if (String(tool ?? '').startsWith('mcp__')) call = mcpCreate(tool, ti);
  if (!call) return null;
  try {
    if (!enabled(env, FLAG.guard, true)) return null;
  } catch (e) {
    if (e instanceof FlagError) return `ticket-writer guard: ${e.message}. Fix the flag where it is set (shell or settings.json env) and start again`;
    throw e;
  }
  const what = call.kind === 'pr' ? 'pull request' : 'issue';
  const tail = `Start the body with Why, Expected outcome, If we do nothing and How we know (template: ${TEMPLATE}; check: node "${TICKET_MJS}" issue-check --body <file>). ${FLAG.guard}=false turns this guard off.`;
  if (call.unreadable) return `ticket-writer: this ${what} body cannot be checked: ${call.unreadable}. ${tail}`;
  let body = call.body;
  if (call.bodyFile !== undefined) {
    const p = isAbsolute(call.bodyFile) ? call.bodyFile : join(cwd ?? process.cwd(), call.bodyFile);
    if (!existsSync(p)) return `ticket-writer: the ${what} body file ${call.bodyFile} does not exist. ${tail}`;
    body = readFileSync(p, 'utf8');
  }
  const errors = checkBody(body ?? '');
  return errors.length ? `ticket-writer: the ${what} body does not say why the work exists and what result we expect: ${errors.join('; ')}. ${tail}` : null;
}

async function main() {
  try {
    const reason = verdict(JSON.parse(readFileSync(0, 'utf8')));
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  } catch { /* fail open: no output */ }
  process.exit(0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
