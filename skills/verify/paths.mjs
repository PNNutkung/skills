// Where verify keeps its state: run folders and per-session markers, never in the repo. The hook imports this file: it never throws.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const SESSION_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const SESSIONS_DIR = 'sessions';
const real = p => { try { return realpathSync(p); } catch { return resolve(p); } };

/** $VERIFY_CACHE_DIR (tests), else $XDG_CACHE_HOME/verify, else ~/.cache/verify. */
export function cacheRoot(env = process.env, home = homedir()) {
  if (env.VERIFY_CACHE_DIR) return env.VERIFY_CACHE_DIR;
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'verify');
}

/** <cacheRoot>/sessions/<id>.json, or null when the id is missing or not a plain name. */
export function sessionMarker(sessionId, env = process.env, home = homedir()) {
  if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) return null;
  return join(cacheRoot(env, home), SESSIONS_DIR, `${sessionId}.json`);
}

/** <cacheRoot>/<repo basename>-<12 hex of sha256(realpath repo)>/<slug> */
export function runDir(repo, slug, env = process.env, home = homedir()) {
  const r = real(repo);
  const key = `${basename(r).replace(/[^A-Za-z0-9._-]/g, '_')}-${createHash('sha256').update(r).digest('hex').slice(0, 12)}`;
  return join(cacheRoot(env, home), key, slug);
}
