#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash|mcp__.*) for the definition-of-done skill. Opt-in: does nothing unless DOD_GUARD=1.
// While a DoD session is open for this session (skills/definition-of-done/session.mjs marker), it:
//   - denies file changes outside <repo>/docs/dod/, the run folder and the ADR and index `dod.mjs adr` wrote (no product code before the DoD is done),
//   - denies writing to a ticket (CLI or MCP) until the user approved the exact rendered text (dod.mjs approve, bound by sha256),
//   - denies creating a ticket at all (the skill only updates the ticket the work is linked to),
//   - denies a third-party ticket CLI the user has not trusted on this machine (dod.mjs trust),
//   - denies the agent running `dod.mjs approve` or `dod.mjs trust`: only the user runs them (own terminal or the ! prefix).
// The close command is always allowed and named in every deny. Like qa-guard it catches agent mistakes, not a determined attacker:
// pattern matching on the command text, no shell evaluation. Fail open: it always exits 0 and denies only through the JSON decision.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARD_ENV = 'DOD_GUARD';
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..', 'skills', 'definition-of-done');
const DOD_MJS = join(SKILL, 'dod.mjs');
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n()`]|\$\(/;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin']);
const REDIRECT_RE = /(?:^|[\s\d])(>>?)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g;
const USER_ONLY = new Set(['approve', 'trust']);
const THIRD_PARTY = new Set(['jira', 'linear']);
// prog -> [noun path, write verbs, create verbs]; positionals only, flags skipped
const TICKET_CLI = {
  gh: [['issue'], ['edit', 'comment', 'close', 'reopen', 'delete', 'transfer', 'pin', 'unpin', 'lock', 'unlock'], ['create']],
  glab: [['issue'], ['update', 'note', 'close', 'reopen', 'delete'], ['create']],
  acli: [['jira', 'workitem'], ['edit', 'update', 'transition', 'comment', 'assign', 'delete'], ['create', 'create-bulk', 'clone']],
  jira: [['issue'], ['edit', 'move', 'comment', 'assign', 'delete', 'link', 'unlink'], ['create', 'clone']],
  linear: [['issue'], ['update', 'edit', 'comment', 'close'], ['create']],
};
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template', '--hostname', '-R', '--repo']);
const API_BODY_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);
const MCP_SYSTEM_RE = /jira|atlassian|asana|linear|trello|github|gitlab/i;
const MCP_WRITE_RE = /edit|update|write|create|add|transition|set|delete|move|comment|assign|patch/i;

const unquote = t => t.replace(/^(["'])(.*)\1$/s, '$2');
const tokenize = seg => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}
/** Simple commands of a command line; a quoted span is data, so it is blanked before splitting. */
function segments(command) {
  const masked = command.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
  const out = [];
  let start = 0;
  for (const m of masked.matchAll(new RegExp(SEGMENT_SPLIT_RE.source, 'g'))) { out.push(command.slice(start, m.index)); start = m.index + m[0].length; }
  out.push(command.slice(start));
  return out;
}

/** realpath of a path that may not exist yet: the nearest existing ancestor, resolved, plus the missing tail. */
function realPathLoose(p) {
  let dir = resolve(p), tail = '';
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return resolve(p);
    tail = tail ? join(basename(dir), tail) : basename(dir);
    dir = up;
  }
  return tail ? join(realpathSync(dir), tail) : realpathSync(dir);
}
const isInside = (child, parent) => child === parent || child.startsWith(parent + sep);

/** For `gh api` / `glab api`: true when the call writes an issue, or runs a GraphQL mutation. */
function apiWritesIssue(args, segText) {
  let method = '', body = false, path = '';
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].startsWith('--') ? args[i].split(/=(.*)/s) : [args[i], undefined];
    if (API_VALUE_FLAGS.has(flag)) {
      const value = inline ?? args[++i] ?? '';
      if (flag === '-X' || flag === '--method') method = value.toUpperCase();
      if (API_BODY_FLAGS.has(flag)) body = true;
    } else if (!path && !args[i].startsWith('-')) path = args[i];
  }
  if (path === 'graphql') return /\bmutation\b/.test(segText);
  return (method || (body ? 'POST' : 'GET')) !== 'GET' && /(?:^|\/)issues(?:\/|$|\?)/.test(path);
}

/** 'create' | 'write' | null for one simple command, and the program name. */
function ticketAction(tokens, segText) {
  const prog = basename(tokens[0] ?? '');
  const spec = TICKET_CLI[prog];
  if (!spec) return null;
  const pos = tokens.slice(1).filter(t => !t.startsWith('-'));
  if ((prog === 'gh' || prog === 'glab') && pos[0] === 'api') return apiWritesIssue(tokens.slice(tokens.indexOf('api') + 1), segText) ? { prog, action: 'write' } : null;
  const [nouns, writes, creates] = spec;
  if (!nouns.every((n, i) => pos[i] === n)) return null;
  const verb = pos[nouns.length];
  if (creates.includes(verb)) return { prog, action: 'create' };
  if (writes.includes(verb)) return { prog, action: 'write' };
  return null;
}

const blankQuotes = s => s.replace(/(>>?\s*)?("[^"]*"|'[^']*')/g, (m, redirect) => (redirect ? m : ' '.repeat(m.length)));
function writeTargets(command) {
  const cleaned = command.replace(/\d*>&\d*-?/g, ' ').replace(/&>>?/g, '>');
  const targets = [...blankQuotes(cleaned).matchAll(REDIRECT_RE)].map(m => unquote(m[2]));
  for (const seg of segments(cleaned)) {
    const t = stripPrefix(tokenize(seg));
    const files = t.slice(1).filter(x => !x.startsWith('-'));
    if (t[0] === 'tee') targets.push(...files);
    if (t[0] === 'sed' && t.some(x => /^-[A-Za-z]*i|^--in-place/.test(x))) targets.push(...(t.some(x => /^-[A-Za-z]*[ef]$|^--(expression|file)/.test(x)) ? files : files.slice(1)));
  }
  return targets.filter(p => !p.startsWith('/dev/'));
}

/**
 * A deny reason for a Bash command, or null.
 * ctx = { approved: bool, trusted(cli) -> bool, allowedPath(abs) -> bool, cwd }
 */
export function bashVerdict(command, ctx) {
  const segs = segments(command).map(s => ({ text: s, tokens: stripPrefix(tokenize(s)) }));
  const dodCall = ({ tokens }) => { const i = tokens.findIndex(t => basename(t) === 'dod.mjs'); return i >= 0 ? tokens[i + 1] : null; };
  if (segs.some(s => dodCall(s) === 'close')) return null;
  for (const s of segs) {
    const sub = dodCall(s);
    if (USER_ONLY.has(sub)) return `only the user runs dod.mjs ${sub}. Show the user what it approves and ask them to run it in their own terminal (or with the ! prefix): node "${DOD_MJS}" ${sub}${sub === 'trust' ? ' --cli <name>' : ''}`;
    const t = ticketAction(s.tokens, s.text);
    if (!t) continue;
    if (t.action === 'create') return `${t.prog} would create a ticket; the definition-of-done skill never creates tickets, it only updates the one the work is linked to`;
    if (THIRD_PARTY.has(t.prog) && !ctx.trusted(t.prog)) return `${t.prog} is a third-party CLI the user has not trusted on this machine. Ask the user; to trust it they run: node "${DOD_MJS}" trust --cli ${t.prog}`;
    if (!ctx.approved) return `${t.prog} would write to the ticket, and the user has not approved the rendered text. Show the user the run's ticket-new.md; to approve, they run: node "${DOD_MJS}" approve`;
  }
  for (const p of writeTargets(command)) {
    const abs = realPathLoose(isAbsolute(p) ? p : join(ctx.cwd ?? process.cwd(), p));
    if (!ctx.allowedPath(abs)) return `writing to ${p} would change a file outside docs/dod and the run folder`;
  }
  return null;
}

/** A deny reason for an MCP tool call, or null. Only ticket systems' write tools are gated. */
export function mcpVerdict(name, input, ctx) {
  const n = String(name ?? '');
  if (!n.startsWith('mcp__') || !MCP_SYSTEM_RE.test(n) || !MCP_WRITE_RE.test(n)) return null;
  const mode = input && typeof input === 'object' ? String(input.method ?? input.action ?? '').toLowerCase() : '';
  if (/create/i.test(n) || mode === 'create') return `${n} would create a ticket or item; the definition-of-done skill never creates tickets, it only updates the one the work is linked to`;
  if (!ctx.approved) return `${n} would write to the ticket, and the user has not approved the rendered text. Show the user the run's ticket-new.md; to approve, they run: node "${DOD_MJS}" approve`;
  return null;
}

async function decide(input) {
  if (process.env[GUARD_ENV] !== '1') return null;
  const { session_id: session, tool_name: tool, tool_input: ti, cwd } = input ?? {};
  if (!session || !tool) return null;
  const isFile = FILE_TOOLS.has(tool), isMcp = String(tool).startsWith('mcp__');
  if (!isFile && !isMcp && tool !== 'Bash') return null;
  const s = await import(join(SKILL, 'session.mjs'));
  const active = s.readActive({ session, env: process.env });
  if (!active) return null;
  const run = realpathSync(active.run), dodDir = join(realpathSync(active.repo), 'docs', 'dod');
  const adrFiles = new Set(active.adrFiles ?? []); // the ADR and index that dod.mjs adr wrote (AD8): no other ADR
  const allowedPath = abs => isInside(abs, run) || isInside(abs, dodDir) || adrFiles.has(abs);
  const approved = s.ticketApproved(run);
  let why = null;
  if (isFile) {
    const p = ti?.file_path ?? ti?.notebook_path;
    if (typeof p === 'string' && !allowedPath(realPathLoose(isAbsolute(p) ? p : join(cwd ?? process.cwd(), p)))) why = `${p} is outside docs/dod and the run folder`;
  } else if (isMcp) why = mcpVerdict(tool, ti, { approved });
  else why = bashVerdict(String(ti?.command ?? ''), { approved, trusted: cli => s.isTrusted(cli, process.env), allowedPath, cwd: cwd ?? active.repo });
  return why ? `definition-of-done session ${active.run} is open (DOD_GUARD=1): ${why}. To close the session: node "${DOD_MJS}" close --session ${session}` : null;
}

async function main() {
  try {
    const reason = await decide(JSON.parse(readFileSync(0, 'utf8')));
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  } catch { /* fail open: no output */ }
  process.exit(0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
