#!/usr/bin/env node
// Run lifecycle of qa-sweep: opens a QA run (a run folder plus a per-session marker) and closes it.
//   node run.mjs start --repo DIR [--session ID]   create the run folder and the marker, print {run, marker}
//   node run.mjs touch [--session ID]               refresh the marker's idle clock
//   node run.mjs end   [--session ID]               remove the marker, print {ended}
//   node run.mjs snap  --files a,b [--session ID]   commit HEAD plus those working-tree files (temporary index: no ref, index or file changes), print {snap}
// The marker is what hooks/qa-guard.mjs reads (readActive) to restrict the session; the session defaults to $CLAUDE_CODE_SESSION_ID.
// Importing this file never exits or throws: the hook imports it, and a PreToolUse hook that exits 2 blocks the user's tool call.
// zero-trust-review (ZT_DIR overrides where it lives) is needed only to create a run folder and to vet one; a missing one is an Error, and only the CLI turns it into exit 2.
// Exit: 0 ok; 2 usage error, no session id, a run already active, or zero-trust-review missing; 1 other error.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const IDLE_MS = 2 * 3600e3;
const SESSION_RE = /^[A-Za-z0-9-]{1,80}$/;
const HERE = dirname(fileURLToPath(import.meta.url));
const ZT = resolve(process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review'));
const ZT_MISSING = `the zero-trust-review skill is not at ${ZT} (set ZT_DIR): its run folder helpers are required`;

// Resolved once at import, never throws: a missing or broken zero-trust-review leaves null and the functions that need it report it.
const zt = existsSync(join(ZT, 'runctx.mjs')) ? await import(pathToFileURL(join(ZT, 'runctx.mjs')).href).catch(() => null) : null;
const needZt = () => { if (!zt) throw new Error(ZT_MISSING); return zt; };

export const markerDir = (env = process.env) => env.QA_MARKER_DIR || join(userInfo().homedir, '.cache', 'qa-sweep');
export function markerPath(session, env) {
  if (typeof session !== 'string' || !SESSION_RE.test(session)) throw new Error('bad session id');
  return join(markerDir(env), `${session}.json`);
}

const uidOf = o => (o.uid !== undefined ? o.uid : typeof process.getuid === 'function' ? process.getuid() : undefined);
const isMine = (st, o) => uidOf(o) === undefined || st.uid === uidOf(o);
// Same checks as readMarker in ../zero-trust-review/runctx.mjs: a regular file, not a link, ours, closed to group and others, and fresh.
const trusted = (st, o) => st.isFile() && !st.isSymbolicLink() && isMine(st, o) && (st.mode & 0o022) === 0 && (o.now ?? Date.now()) - st.mtimeMs <= IDLE_MS;

const safeMarkerDir = (dir, o) => { const st = lstatSync(dir); return st.isDirectory() && !st.isSymbolicLink() && isMine(st, o) && (st.mode & 0o022) === 0; };

/** The marker of this session when it is trusted and names a trusted run folder, else null. Never throws: the hook calls it on every tool use. */
export function readActive(o = {}) {
  try {
    const f = markerPath(o.session, o.env), st = lstatSync(f);
    if (!trusted(st, o)) return null;
    if (!safeMarkerDir(dirname(f), o)) return null;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    if (!zt || !zt.checkRunDir(m.run, o)) return null;
    return { run: m.run, session: m.session, repo: m.repo, started: m.started };
  } catch { return null; }
}

/** Open a run: the run folder plus this session's marker (0600, wx). Throws `a run is active: <run>` while a fresh marker exists. */
export function start(o = {}) {
  const { createRunDir } = needZt();
  const f = markerPath(o.session, o.env), now = new Date(o.now ?? Date.now());
  const active = readActive(o);
  if (active) throw new Error(`a run is active: ${active.run}`);
  const repo = realpathSync(execFileSync('git', ['-C', o.repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  const run = createRunDir(`qa-${now.toISOString().replaceAll(':', '-')}`, o);
  const md = markerDir(o.env);
  mkdirSync(md, { recursive: true, mode: 0o700 });
  if (!safeMarkerDir(md, o)) throw new Error(`unsafe marker dir ${md}`); // readActive would refuse every marker in it: the guard would be silently off
  rmSync(f, { force: true }); // a stale or planted marker (a symlink goes, never its target)
  writeFileSync(f, JSON.stringify({ run, session: o.session, repo, started: now.toISOString() }) + '\n', { mode: 0o600, flag: 'wx' });
  if (!readActive({ ...o, now: undefined })) { rmSync(f, { force: true }); throw new Error('the new marker did not verify: the run would not be guarded'); }
  return { run, marker: f };
}

/** Refresh the marker's idle clock when this session's run is active, else do nothing. */
export function touch(o = {}) {
  if (!readActive(o)) return;
  const t = new Date(); utimesSync(markerPath(o.session, o.env), t, t);
}

const COMMIT_ENV = { GIT_AUTHOR_NAME: 'qa-sweep', GIT_AUTHOR_EMAIL: 'qa-sweep@localhost', GIT_COMMITTER_NAME: 'qa-sweep', GIT_COMMITTER_EMAIL: 'qa-sweep@localhost' };

/** repo-relative path of f when it names a regular file inside the repo (no link, no escape), else null */
function insideFile(repo, f) {
  try {
    const p = join(repo, f), st = lstatSync(p);
    const rel = relative(repo, join(realpathSync(dirname(p)), basename(p)));
    return st.isFile() && rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) ? rel : null;
  } catch { return null; }
}

/**
 * A commit of HEAD plus the given working-tree files of the active run's repo, built with a temporary index in the run folder,
 * like snapshot() in ../paired-agent-tdd/tdd.mjs: no ref, no index and no file of the repo changes (only loose objects are added).
 * mutate.mjs reads committed code, so this is how a new, uncommitted test reaches it.
 */
export function snap(o = {}) {
  const active = readActive(o);
  if (!active) throw new Error('no active run: run.mjs start first');
  if (!o.files?.length) throw new Error('snap needs --files');
  const { repo, run } = active, index = join(run, `snap-${process.pid}-${Date.now()}.index`);
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...COMMIT_ENV, GIT_INDEX_FILE: index }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const parent = g('rev-parse', '--verify', 'HEAD^{commit}');
    g('read-tree', parent);
    for (const f of new Set(o.files)) {
      const rel = insideFile(repo, f);
      if (!rel) throw new Error(`refusing to snapshot ${f}: not a regular file inside the repo`);
      const mode = lstatSync(join(repo, rel)).mode & 0o111 ? '100755' : '100644';
      g('update-index', '--add', '--cacheinfo', `${mode},${g('hash-object', '-w', '--no-filters', '--', rel)},${rel}`);
    }
    const sha = g('commit-tree', g('write-tree'), '-p', parent, '-m', 'qa-sweep snapshot');
    touch(o);
    return { snap: sha };
  } finally { rmSync(index, { force: true }); }
}

/** Remove this session's marker; idempotent. */
export function end(o = {}) {
  const f = markerPath(o.session, o.env), ended = readActive(o)?.run ?? null;
  rmSync(f, { force: true });
  return { ended };
}

function main(argv) {
  const fail = (code, msg) => { process.stderr.write(`qa-run: ${msg}\n`); process.exit(code); };
  let parsed;
  try { parsed = parseArgs({ args: argv, allowPositionals: true, options: { repo: { type: 'string' }, session: { type: 'string' }, files: { type: 'string' } } }); } catch (e) { fail(2, e.message); }
  const { positionals: [cmd], values } = parsed;
  const session = values.session ?? process.env.CLAUDE_CODE_SESSION_ID;
  if (!['start', 'end', 'touch', 'snap'].includes(cmd)) fail(2, 'usage: run.mjs start --repo DIR | end | touch | snap --files a,b [--session ID]');
  if (!session) fail(2, 'no session id: pass --session');
  if (cmd === 'start' && !values.repo) fail(2, 'start needs --repo DIR');
  if (cmd === 'snap' && !values.files) fail(2, 'snap needs --files a,b');
  if (!zt && cmd === 'start') fail(2, ZT_MISSING);
  try {
    const run = { start: () => start({ repo: values.repo, session }), end: () => end({ session }), touch: () => (touch({ session }), { touched: true }),
      snap: () => snap({ session, files: values.files.split(',').filter(Boolean) }) };
    process.stdout.write(JSON.stringify(run[cmd]()) + '\n');
  } catch (e) { fail(/a run is active|bad session id|no active run|snap needs/.test(e.message) ? 2 : 1, e.message); }
}

const direct = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) main(process.argv.slice(2));
