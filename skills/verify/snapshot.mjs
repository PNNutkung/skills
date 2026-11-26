// The work tree outside docs/verify at open, and what changed since (ADR 0009 Fail, Guard): the backstop for any guard bypass.
// A snapshot is HEAD plus a content hash of each file that differs from HEAD or is untracked (not ignored), outside docs/verify.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './io.mjs';

const VERIFY_PREFIX = 'docs/verify/';
const names = (repo, args) => git(repo, args).split('\0').filter(Boolean);
const hashOf = p => { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch (e) { return e.code ?? 'unreadable'; } };
const short = sha => (sha ? sha.slice(0, 12) : 'none');

/** -> { head, files: { path: hash } } for the repo (paths relative to its root, / separated). */
export function snapshot(repo) {
  let head = null;
  try { head = git(repo, ['rev-parse', '--verify', '-q', 'HEAD']).trim() || null; } catch { head = null; }
  const changed = head ? names(repo, ['diff', '--name-only', '--no-renames', '-z', 'HEAD']) : names(repo, ['ls-files', '-m', '-z']);
  const paths = [...new Set([...changed, ...names(repo, ['ls-files', '-o', '--exclude-standard', '-z'])])].filter(p => !p.startsWith(VERIFY_PREFIX)).sort();
  return { head, files: Object.fromEntries(paths.map(p => [p, hashOf(join(repo, p))])) };
}

/** What differs between two snapshots: `HEAD a -> b` first, then the changed paths in order; skip(path) leaves a path out. */
export function changedSince(before, after, skip = () => false) {
  const out = before.head === after.head ? [] : [`HEAD ${short(before.head)} -> ${short(after.head)}`];
  const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
  return [...out, ...paths.filter(p => before.files[p] !== after.files[p] && !skip(p))];
}
