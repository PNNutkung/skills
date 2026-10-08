// Trust anchor for the review run folder, shared by sandbox-run, note, proofcheck and the plugin hooks so every tool applies the SAME checks.
// The active marker lives in a per-user dir (never a shared /tmp), and nothing is trusted unless it is ours, not a symlink and closed to other users:
// a planted marker could otherwise redirect the ledgers or feed proofcheck a forged "ran it" record.
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, isAbsolute, join, sep } from 'node:path';

export const STALE_MS = 12 * 3600e3;
const me = o => (o && o.uid !== undefined ? o.uid : typeof process.getuid === 'function' ? process.getuid() : undefined);
const mine = (st, o) => me(o) === undefined || st.uid === me(o);
const closed = st => (st.mode & 0o022) === 0;  // not group- or world-writable
const safeDir = (dir, o) => { const st = lstatSync(dir); return st.isDirectory() && !st.isSymbolicLink() && mine(st, o) && closed(st); };

// The home dir comes from the passwd entry, not $HOME or $XDG_RUNTIME_DIR, which an agent can set in its own command line.
// ZT_MARKER_DIR is a test seam only: redirecting the marker can at worst lose ledger rows (proofcheck then finds no proof), it cannot forge one.
export const markerDir = (env = process.env) => env.ZT_MARKER_DIR || join(userInfo().homedir, '.cache', 'zt-review');
export const markerFile = env => join(markerDir(env), '.active');

/** The real path of a run dir we can trust, or ''. */
export function checkRunDir(dir, o) {
  try { return dir && isAbsolute(dir) && safeDir(dir, o) ? realpathSync(dir) : ''; } catch { return ''; }
}

/** The run dir named by the active marker, or '' (stale, foreign, symlinked, writable by others, or missing). */
export function readMarker(o = {}) {
  try {
    const dir = markerDir(o.env);
    if (!safeDir(dir, o)) return '';
    const f = join(dir, '.active'), st = lstatSync(f);
    if (!st.isFile() || st.isSymbolicLink() || !mine(st, o) || !closed(st)) return '';
    if ((o.now ?? Date.now()) - st.mtimeMs > STALE_MS) return '';
    return checkRunDir(readFileSync(f, 'utf8').split('\n')[0].trim(), o);
  } catch { return ''; }
}

const baseOf = o => join(o.tmp || tmpdir(), 'zt-review' + (me(o) === undefined ? '' : '-' + me(o)));
// An explicit run dir (flag or env) is accepted only if it was made by activate (under the per-user base) or is the marker's own target:
// otherwise an agent could aim the ledgers at any directory of the user's.
function approved(dir, o) {
  const d = checkRunDir(dir, o);
  if (!d) return '';
  try { if (d.startsWith(realpathSync(baseOf(o)) + sep)) return d; } catch { /* no base yet */ }
  return d === readMarker(o) ? d : '';
}

/** Run dir: explicit --run, then env ZT_RUN_DIR, then the marker. Each candidate is checked; an unsafe or unapproved one is skipped, never used. */
export const resolveRun = (o = {}) => approved(o.run, o) || approved((o.env || process.env).ZT_RUN_DIR, o) || readMarker(o);

/** Append text to a file that must resolve inside runDir; the leaf is opened with O_NOFOLLOW so a planted symlink is refused. */
export function appendSafe(runDir, file, text) {
  const root = realpathSync(runDir), parent = realpathSync(dirname(file));
  if (parent !== root && !parent.startsWith(root + sep)) throw new Error('path outside run folder');
  const fd = openSync(file, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { writeSync(fd, text); } finally { closeSync(fd); }
}

/** Replace a file inside a trusted run dir (e.g. verified.json, evidence.md): O_NOFOLLOW, mode 0600, refuses a run dir others can write. */
export function writeSafe(runDir, file, text, o) {
  if (!checkRunDir(runDir, o)) throw new Error('unsafe run dir ' + runDir);
  const root = realpathSync(runDir), parent = realpathSync(dirname(file));
  if (parent !== root && !parent.startsWith(root + sep)) throw new Error('path outside run folder');
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeSync(fd, text); } finally { closeSync(fd); }
}

/**
 * Create <tmp>/zt-review-<uid>/<name> (0700), WITHOUT the marker; returns its real path. The ledger tools (sandbox-run, proofcheck) accept an explicit --run or
 * $ZT_RUN_DIR only under that per-user base. A caller that is not a review (paired-agent-tdd) uses this: the marker would put the review-only guard hook on its agents.
 * Throws 'unsafe ...' instead of using a dir we do not own.
 */
export function createRunDir(name, o = {}) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(name) || name === '.' || name === '..') throw new Error('bad run name');
  const uid = me(o), base = join(o.tmp || tmpdir(), 'zt-review' + (uid === undefined ? '' : '-' + uid));
  mkdirSync(base, { recursive: true, mode: 0o700 });
  if (!safeDir(base, o)) throw new Error('unsafe base dir ' + base);
  const run = join(base, name);
  try { mkdirSync(run, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  if (!checkRunDir(run, o)) throw new Error('unsafe run dir ' + run);
  return realpathSync(run);
}

/** createRunDir plus the per-user marker (which turns the plugin guard on for subagents); returns the run dir. */
export function activate(name, o = {}) {
  const run = createRunDir(name, o);
  const md = markerDir(o.env);
  mkdirSync(md, { recursive: true, mode: 0o700 });
  if (!safeDir(md, o)) throw new Error('unsafe marker dir ' + md);
  const f = join(md, '.active');
  rmSync(f, { force: true });  // removes a planted symlink itself, never its target
  writeFileSync(f, realpathSync(run) + '\n', { mode: 0o600, flag: 'wx' });
  return realpathSync(run);
}

/** Remove the marker, but only if it still points at this run. */
export function deactivate(run, o = {}) {
  try { if (readMarker(o) === realpathSync(run)) rmSync(markerFile(o.env), { force: true }); } catch { /* nothing to remove */ }
}
