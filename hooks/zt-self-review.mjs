// Self-review guard (opt-in: ZT_SELF_REVIEW_GUARD=1). An author never reviews its own code (ai-code-delivery: "Fresh reviewer").
// zt-authors.mjs (PostToolUse Edit|Write|MultiEdit) records who edited which file in <markerDir>/authors.jsonl. zt-guard.mjs calls selfReviewVerdict
// for every Bash command, and it denies a review verdict (gh pr review, glab mr approve) when the actor edited any file the branch changes.
// The actor is the subagent (agent_id) when there is one, else the session. A fresh subagent started by the authoring session is NOT the author:
// its context is clean, which is how zero-trust-review reviews (decided with Nut, 2026-11-21).
// The branch's change = files in `git diff <merge-base> --` (committed and uncommitted) against origin/HEAD, main or master.
// Like the other guards it catches mistakes, not a determined agent: a review typed into an editor or another tool is out of its reach.
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, isAbsolute, join } from 'node:path';
import { commandSegments, stripPrefix, tokenize } from './zt-post-guard.mjs';

export const SELF_REVIEW_ENV = 'ZT_SELF_REVIEW_GUARD';
export const LEDGER = 'authors.jsonl';
const GIT_TIMEOUT_MS = 3000;
const MAX_LEDGER_BYTES = 4 * 1024 * 1024; // read at most the last 4 MB: old rows age out of the check

const mine = st => typeof process.getuid !== 'function' || st.uid === process.getuid();
const closed = st => (st.mode & 0o022) === 0;

/** True when the command posts a review verdict on a change request. */
export function isReviewVerdict(command) {
  return commandSegments(command).some(seg => {
    const t = stripPrefix(tokenize(seg)), prog = basename(t[0] ?? ''), words = t.slice(1).filter(w => !w.startsWith('-'));
    return (prog === 'gh' && words[0] === 'pr' && words[1] === 'review') || (prog === 'glab' && words[0] === 'mr' && words[1] === 'approve');
  });
}

/** Append one authorship row: { s: session, a: agent or '', f: real path }. 0600 file in a 0700 dir; never follows a planted symlink. */
export function recordAuthor(markerDir, { session, agent, file }) {
  mkdirSync(markerDir, { recursive: true, mode: 0o700 });
  const st = lstatSync(markerDir);
  if (!st.isDirectory() || !mine(st) || !closed(st)) return;
  const fd = openSync(join(markerDir, LEDGER), constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { writeSync(fd, `${JSON.stringify({ s: session, a: agent ?? '', f: file })}\n`); } finally { closeSync(fd); }
}

/** Real paths this actor edited, from a ledger we own and nobody else can write; empty otherwise. */
function editedBy(markerDir, session, agent) {
  try {
    const file = join(markerDir, LEDGER), st = lstatSync(file);
    if (!st.isFile() || !mine(st) || !closed(st)) return new Set();
    const text = readFileSync(file, 'utf8').slice(-MAX_LEDGER_BYTES);
    const out = new Set();
    for (const line of text.split('\n')) {
      try {
        const r = JSON.parse(line);
        if (agent ? r.a === agent : r.s === session && !r.a) out.add(r.f);
      } catch { /* a torn first line after the slice */ }
    }
    return out;
  } catch { return new Set(); }
}

const git = (cwd, args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return r.status === 0 ? r.stdout.trim() : '';
};

/** Real paths of the files the branch at cwd changes, committed or not; empty when it cannot tell. */
function changedFiles(cwd) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) return [];
  const head = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const base = [head, 'origin/main', 'origin/master', 'main', 'master'].find(ref => ref && git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]));
  const mb = base && git(root, ['merge-base', base, 'HEAD']);
  if (!mb) return [];
  const real = realpathSync(root);
  return git(root, ['diff', '--name-only', mb, '--']).split('\n').filter(Boolean).map(f => join(real, f));
}

/** A deny reason, or null. ctx = { session, agent, cwd, markerDir }. */
export function selfReviewVerdict(command, ctx) {
  if (!isReviewVerdict(command) || !ctx.cwd || !isAbsolute(ctx.cwd)) return null;
  const mineEdits = editedBy(ctx.markerDir, ctx.session, ctx.agent);
  if (!mineEdits.size) return null;
  const overlap = changedFiles(ctx.cwd).filter(f => mineEdits.has(f));
  if (!overlap.length) return null;
  const who = ctx.agent ? `this agent (${ctx.agent})` : 'this session';
  const root = git(ctx.cwd, ['rev-parse', '--show-toplevel']);
  const shown = overlap.slice(0, 10).map(f => (root && f.startsWith(realpathSync(root)) ? f.slice(realpathSync(root).length + 1) : f));
  return `self-review guard: ${who} edited ${shown.join(', ')}${overlap.length > 10 ? ` and ${overlap.length - 10} more` : ''}, which this change touches, and an author never reviews its own code. `
    + 'Hand the review to a fresh agent (zero-trust-review runs fresh subagents) or to another session, and post its verdict from there.';
}
