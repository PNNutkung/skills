// The DoD session: a private run folder plus a per-session marker that hooks/dod-guard.mjs reads, the ticket approval (bound to the exact
// rendered text by its sha256) and the per-machine list of trusted third-party CLIs.
// Importing this file never exits or throws: the hook imports it, and a PreToolUse hook that exits 2 blocks the user's tool call.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IDLE_MS = 8 * 3600e3; // a grill can pause for a working day; every CLI call refreshes it
export const APPROVAL_FILE = '.ticket-ok';
export const RENDERED_FILE = 'ticket-new.md';
const SESSION_RE = /^[A-Za-z0-9-]{1,80}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DOD_MJS = join(dirname(fileURLToPath(import.meta.url)), 'dod.mjs');

// Official CLIs first; third-party ones only after the user trusts them on this machine. No entry means MCP or the file.
export const OFFICIAL_CLI = { github: 'gh', gitlab: 'glab', jira: 'acli' };
export const THIRD_PARTY_CLI = { jira: 'jira', linear: 'linear' };
export const SYSTEMS = ['github', 'gitlab', 'jira', 'linear', 'asana', 'trello'];

const uid = () => (typeof process.getuid === 'function' ? process.getuid() : undefined);
const mine = st => uid() === undefined || st.uid === uid();
const privateFile = st => st.isFile() && !st.isSymbolicLink() && mine(st) && (st.mode & 0o022) === 0;
const privateDir = p => { const st = lstatSync(p); return st.isDirectory() && !st.isSymbolicLink() && mine(st) && (st.mode & 0o022) === 0; };
const sha256 = text => createHash('sha256').update(text).digest('hex');

export const markerDir = (env = process.env) => env.DOD_MARKER_DIR || join(homedir(), '.cache', 'definition-of-done');
const runBase = (env = process.env) => env.DOD_RUN_BASE || join(tmpdir(), `dod-${uid() ?? 'user'}`);
const configDir = (env = process.env) => env.DOD_CONFIG_DIR || join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'definition-of-done');
export function markerPath(session, env) {
  if (typeof session !== 'string' || !SESSION_RE.test(session)) throw new Error('bad session id');
  return join(markerDir(env), `${session}.json`);
}

/** This session's run when its marker is trusted and fresh, else null. Never throws. */
export function readActive({ session, env = process.env, now = Date.now() } = {}) {
  try {
    const f = markerPath(session, env), st = lstatSync(f);
    if (!privateFile(st) || now - st.mtimeMs > IDLE_MS || !privateDir(dirname(f))) return null;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    if (typeof m.run !== 'string' || !privateDir(m.run) || !m.run.startsWith(realpathSync(runBase(env)))) return null;
    const adrFiles = Array.isArray(m.adrFiles) ? m.adrFiles.filter(f => typeof f === 'string') : [];
    // whyFields: opened by a version that requires why / outcomes / costOfInaction (ADR 0012 NewOnly); an older session's marker has none
    return { run: m.run, repo: m.repo, slug: m.slug, session: m.session, started: m.started, adrFiles, whyFields: m.whyFields === true };
  } catch { return null; }
}

/** Open a session: run folder (0700) and marker (0600). Throws while one is active. */
export function open({ repo, slug, session, env = process.env, now = Date.now() } = {}) {
  const f = markerPath(session, env);
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) throw new Error(`bad slug ${JSON.stringify(slug)}: ${SLUG_RE}`);
  const active = readActive({ session, env });
  if (active) throw new Error(`a run is active: ${active.run}`);
  const top = realpathSync(execFileSync('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  const base = runBase(env);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  if (!privateDir(base)) throw new Error(`unsafe run base ${base}`);
  const run = join(realpathSync(base), `${slug}-${new Date(now).toISOString().replaceAll(':', '-')}-${process.pid}`);
  mkdirSync(run, { mode: 0o700 });
  const md = markerDir(env);
  mkdirSync(md, { recursive: true, mode: 0o700 });
  if (!privateDir(md)) throw new Error(`unsafe marker dir ${md}`);
  rmSync(f, { force: true }); // a stale or planted marker (a symlink goes, never its target)
  writeFileSync(f, JSON.stringify({ run, repo: top, slug, session, started: new Date(now).toISOString(), whyFields: true }) + '\n', { mode: 0o600, flag: 'wx' });
  if (!readActive({ session, env })) { rmSync(f, { force: true }); throw new Error('the new marker did not verify: the session would not be guarded'); }
  return { run, marker: f };
}

/** Record the ADR files `dod.mjs adr` wrote, so hooks/dod-guard.mjs lets the agent edit them and no other ADR. */
export function recordAdr({ session, files, env = process.env } = {}) {
  const active = readActive({ session, env });
  if (!active) throw new Error('no active run: dod.mjs open first');
  const f = markerPath(session, env);
  const m = { run: active.run, repo: active.repo, slug: active.slug, session: active.session, started: active.started, adrFiles: [...new Set([...active.adrFiles, ...files])] };
  rmSync(f, { force: true });
  writeFileSync(f, JSON.stringify(m) + '\n', { mode: 0o600, flag: 'wx' });
  return m.adrFiles;
}

/** Refresh the idle clock of this session's marker, if active. */
export function touch({ session, env = process.env } = {}) {
  if (!readActive({ session, env })) return;
  const t = new Date(); utimesSync(markerPath(session, env), t, t);
}

/** Remove this session's marker; idempotent. The run folder stays for the record. */
export function close({ session, env = process.env } = {}) {
  const f = markerPath(session, env), closed = readActive({ session, env })?.run ?? null;
  rmSync(f, { force: true });
  return { closed };
}

/** The user approves the rendered ticket text as it is now. hooks/dod-guard.mjs denies the agent running this. */
export function approve({ session, env = process.env } = {}) {
  const active = readActive({ session, env });
  if (!active) throw new Error('no active run: dod.mjs open first');
  const rendered = join(active.run, RENDERED_FILE);
  if (!existsSync(rendered)) throw new Error('nothing to approve: render first');
  const digest = sha256(readFileSync(rendered));
  const f = join(active.run, APPROVAL_FILE);
  rmSync(f, { force: true });
  writeFileSync(f, digest + '\n', { mode: 0o600, flag: 'wx' });
  return { approved: digest };
}

/** True when the approval file is private and matches the rendered text byte for byte. */
export function ticketApproved(run) {
  try {
    const f = join(run, APPROVAL_FILE);
    if (!privateFile(lstatSync(f))) return false;
    return readFileSync(f, 'utf8').trim() === sha256(readFileSync(join(run, RENDERED_FILE)));
  } catch { return false; }
}

// ---------- third-party CLI trust ----------
const trustFile = env => join(configDir(env), 'trusted-cli.json');
function trustedList(env) {
  try {
    const f = trustFile(env);
    if (!privateFile(lstatSync(f))) return [];
    const cli = JSON.parse(readFileSync(f, 'utf8')).cli;
    return Array.isArray(cli) ? cli.filter(c => typeof c === 'string') : [];
  } catch { return []; }
}
export const isTrusted = (cli, env = process.env) => trustedList(env).includes(cli);

/** The user trusts a third-party CLI on this machine. hooks/dod-guard.mjs denies the agent running this. */
export function trust({ cli, env = process.env } = {}) {
  if (Object.values(OFFICIAL_CLI).includes(cli)) throw new Error(`${cli} is an official CLI: no trust needed`);
  if (!Object.values(THIRD_PARTY_CLI).includes(cli)) throw new Error(`${cli} is not a known third-party ticket CLI (${Object.values(THIRD_PARTY_CLI).join(', ')})`);
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const list = [...new Set([...trustedList(env), cli])].sort();
  const f = trustFile(env);
  rmSync(f, { force: true });
  writeFileSync(f, JSON.stringify({ cli: list }) + '\n', { mode: 0o600, flag: 'wx' });
  return { trusted: list };
}

function onPath(name, env) {
  for (const dir of String(env.PATH ?? '').split(delimiter).filter(Boolean)) {
    try { accessSync(join(dir, name), constants.X_OK); return true; } catch { /* next */ }
  }
  return false;
}

/** Which tool writes the ticket: the official CLI, a trusted third-party CLI, a question to the user, or MCP (else the .ticket.md file). */
export function toolFor({ system, env = process.env } = {}) {
  if (!SYSTEMS.includes(system)) throw new Error(`unknown system ${JSON.stringify(system)} (${SYSTEMS.join(', ')})`);
  const official = OFFICIAL_CLI[system];
  if (official && onPath(official, env)) return { use: 'cli', cli: official };
  const third = THIRD_PARTY_CLI[system];
  if (third && onPath(third, env)) {
    if (isTrusted(third, env)) return { use: 'cli', cli: third, thirdParty: true };
    return { use: 'ask-trust', cli: third, command: `node "${DOD_MJS}" trust --cli ${third}` };
  }
  return { use: 'mcp-or-file' };
}
