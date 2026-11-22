// Post guard for zero-trust-review, called from zt-guard.mjs for the LEAD session (no agent_id) when ZT_POST_GUARD_ENABLED=true and a review run is active.
// zero-trust-review says "do not post until the user asks". Subagents cannot reach gh/glab at all (zt-guard's allow-list); this file covers the lead.
// While the run has no approval, it denies commands that post to the review host: gh pr comment|review, gh issue comment, glab mr note|comment|approve,
// and gh/glab api writes to comments, reviews, discussions or notes (or a GraphQL mutation). Reads stay allowed.
// Approval is RUN/.post-ok, written by `note.mjs allow-post`. Only the user writes it: this guard denies the agent running allow-post, so the user runs it
// in their own terminal (or with the `!` prefix, which no hook sees). It ends with the run: `note.mjs deactivate` removes the marker.
// Like qa-guard, it catches agent mistakes, not a determined agent: pattern matching on the command text, no shell evaluation.
import { lstatSync } from 'node:fs';
import { basename, join } from 'node:path';

export const POST_GUARD_ENV = 'ZT_POST_GUARD_ENABLED';
export const OLD_POST_GUARD_ENV = 'ZT_POST_GUARD';
export const APPROVAL_FILE = '.post-ok';

const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n()`]|\$\(/;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin']);
const POSTING_SUBCOMMANDS = { gh: { pr: ['comment', 'review'], issue: ['comment'] }, glab: { mr: ['note', 'comment', 'approve'] } };
const API_WRITE_PATH_RE = /(?:^|\/)(?:comments|reviews|discussions|notes)(?:\/|$|\?)/;
const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template',
  '--hostname', '-p', '--preview', '--cache', '-R', '--repo']);
const API_BODY_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);

const unquote = t => t.replace(/^(["'])(.*)\1$/s, '$2');
export const tokenize = seg => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
export function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}

/** True when RUN/.post-ok is a regular file (not a symlink) that we own and nobody else can write. */
export function postApproved(run) {
  try {
    const st = lstatSync(join(run, APPROVAL_FILE));
    const mine = typeof process.getuid !== 'function' || st.uid === process.getuid();
    return st.isFile() && mine && (st.mode & 0o022) === 0;
  } catch { return false; }
}

/** For `gh api` / `glab api`: true when the call writes a comment, review, discussion or note, or runs a GraphQL mutation. */
function apiWrites(args) {
  let method = '', body = false, path = '', mutation = false;
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].startsWith('--') ? args[i].split(/=(.*)/s) : [args[i], undefined];
    if (API_VALUE_FLAGS.has(flag)) {
      const value = inline ?? args[++i] ?? '';
      if (flag === '-X' || flag === '--method') method = value.toUpperCase();
      if (API_BODY_FLAGS.has(flag)) body = true;
      if (/\bmutation\b/.test(value)) mutation = true;
    } else if (!path && !args[i].startsWith('-')) path = args[i];
  }
  const verb = method || (body ? 'POST' : 'GET');
  if (path === 'graphql') return mutation;
  return verb !== 'GET' && API_WRITE_PATH_RE.test(path);
}

/** What this segment posts (e.g. "gh pr comment"), 'allow-post' for the approval command, or null. */
function segmentPosts(tokens) {
  const noteAt = tokens.findIndex(t => basename(t) === 'note.mjs');
  if (noteAt >= 0 && tokens[noteAt + 1] === 'allow-post') return 'allow-post';
  const prog = basename(tokens[0] ?? '');
  const subs = POSTING_SUBCOMMANDS[prog];
  if (!subs) return null;
  const [group, action] = tokens.slice(1).filter(t => !t.startsWith('-'));
  if (subs[group]?.includes(action)) return `${prog} ${group} ${action}`;
  if (group === 'api' && apiWrites(tokens.slice(tokens.indexOf('api') + 1))) return `${prog} api write`;
  return null;
}

/** The simple commands of a command line. A quoted span is data (echo "gh pr comment"), so it is blanked before splitting; segments keep the original text. */
export function commandSegments(command) {
  const masked = command.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
  let start = 0;
  const segments = [];
  for (const m of masked.matchAll(new RegExp(SEGMENT_SPLIT_RE.source, 'g'))) { segments.push(command.slice(start, m.index)); start = m.index + m[0].length; }
  segments.push(command.slice(start));
  return segments;
}

/** A deny reason, or null. ctx = { run, note? (path shown in the message) }. */
export function postVerdict(command, ctx) {
  const note = ctx.note ?? 'node <skillDir>/note.mjs';
  const approve = `${note.startsWith('node ') ? note : `node "${note}"`} allow-post`;
  for (const seg of commandSegments(command)) {
    const what = segmentPosts(stripPrefix(tokenize(seg)));
    if (what === 'allow-post') {
      return `zero-trust-review: only the user approves posting. Do not run note.mjs allow-post yourself. Ask the user to review the findings and, to approve, run in their own terminal (or with the ! prefix): ${approve}`;
    }
    if (what && !postApproved(ctx.run)) {
      return `zero-trust-review: ${what} would post to the review host, and the user has not approved posting in this run (posting.md: do not post until the user asks). `
        + `Ask the user first. To approve, the user runs in their own terminal (or with the ! prefix): ${approve}`;
    }
  }
  return null;
}
