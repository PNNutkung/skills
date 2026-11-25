#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash) for the verify skill (ADR 0008 A10). On by default: VERIFY_GUARD_ENABLED=false turns it off.
// An invalid VERIFY_GUARD_ENABLED, or the removed VERIFY_FLAG_RUNS_ENABLED still set, denies every guarded tool with the fix.
// While this session has a verify run open (skills/verify/paths.mjs session marker), only the repo is fenced:
//   - file edits in the repo outside docs/verify/ are denied (the run folder lives in the cache, outside the repo),
//   - an edit of a docs/verify file that changes, removes or forges a section verify.mjs wrote (skills/verify/marker.mjs) is denied,
//   - Bash commands that write into the repo outside docs/verify/, or overwrite a verify file with code-written sections, are denied.
// `node .../verify/verify.mjs ...` is always allowed. Like workflow-guard it catches agent mistakes, not a determined attacker: pattern
// matching on the command text, no shell evaluation, no `cd` tracking. Otherwise fail open: it always exits 0 and denies only through the JSON.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..', 'skills', 'verify');
const VERIFY_MJS = join(SKILL, 'verify.mjs');
// A hook copied without its skill must not crash on import: verdict() then allows everything.
let mods = null;
try {
  mods = {
    ...(await import(join(SKILL, 'flags.mjs'))), ...(await import(join(SKILL, 'marker.mjs'))), ...(await import(join(SKILL, 'paths.mjs'))),
    ...(await import(join(HERE, 'workflow-guard.mjs'))),
  };
} catch { mods = null; }

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const BASH = 'Bash';
const VERIFY_DIR = join('docs', 'verify');
const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n()`]|\$\(/g;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const VERIFY_CLI_RE = /(^|[/\\])verify[/\\]verify\.mjs$/;
// git subcommands that change the work tree, history or remote; reset only with --hard, stash unless it only reads
const GIT_WRITES = new Set(['commit', 'push', 'apply', 'restore', 'checkout', 'switch', 'clean', 'merge', 'rebase', 'pull', 'cherry-pick', 'revert', 'am', 'mv', 'rm']);
const STASH_READS = new Set(['list', 'show']);
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const MAX_SHELL_DEPTH = 2;

// ---------- paths ----------
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

// ---------- Bash ----------
const unquote = t => t.replace(/^(["'])(.*)\1$/s, '$2');
const tokenize = seg => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}
/** Simple commands of a command line, as token lists; a quoted span is data, so it is blanked before splitting. */
function commands(command) {
  const masked = command.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
  const out = [];
  let start = 0;
  for (const m of masked.matchAll(SEGMENT_SPLIT_RE)) { out.push(command.slice(start, m.index)); start = m.index + m[0].length; }
  out.push(command.slice(start));
  return out.map(s => stripPrefix(tokenize(s))).filter(t => t.length);
}
const isVerifyCli = t => basename(t[0]) === 'node' && VERIFY_CLI_RE.test(t[1] ?? '');

/** The deny reason of a git command run against the repo, or null. */
function gitWrite(t, cwd, repo) {
  if (basename(t[0]) !== 'git') return null;
  let dir = cwd, i = 1;
  for (; i < t.length && t[i].startsWith('-'); i++) {
    if (t[i] === '-C') dir = resolve(dir, t[i + 1] ?? '.');
    if (GIT_VALUE_FLAGS.has(t[i])) i++;
  }
  const [sub, ...rest] = t.slice(i);
  const writes = GIT_WRITES.has(sub) || (sub === 'reset' && rest.includes('--hard')) || (sub === 'stash' && !STASH_READS.has(rest[0]));
  return writes && isInside(realPathLoose(dir), repo) ? `git ${sub} changes the repo` : null;
}

/** Paths a simple command removes or moves away: rm targets and mv sources (writeTargets covers the files written). */
function removedPaths(t) {
  const args = t.slice(1).filter(x => !x.startsWith('-'));
  if (t[0] === 'rm') return args;
  if (t[0] === 'mv') return args.slice(0, -1);
  return [];
}

// ---------- verify file ----------
const sectionKey = s => `${s.id}\0${s.hash}\0${s.body.trim()}`;
/** A deny reason when newMd changes, removes or adds a code-written section of oldMd, else null. */
function sectionChange(oldMd, newMd) {
  const left = mods.markedList(newMd).map(sectionKey);
  const changed = [];
  for (const s of mods.markedList(oldMd)) {
    const at = left.indexOf(sectionKey(s));
    if (at < 0) changed.push(s.id); else left.splice(at, 1);
  }
  if (changed.length) return `section ${changed.join(', ')} was written by verify.mjs: only a rerun changes it (node "${VERIFY_MJS}" run --only ${changed.join(',')})`;
  if (left.length) return `the verify.mjs marker on ${left.map(k => k.split('\0')[0]).join(', ')} is written only by verify.mjs, not by hand`;
  // dev-workflow reads the last section of an id, so a second heading of a marked id would shadow the code-written one
  const before = headingCounts(oldMd), after = headingCounts(newMd);
  const ids = new Set([...mods.markedList(oldMd), ...mods.markedList(newMd)].map(s => s.id));
  const dup = [...ids].filter(id => after.get(id) > 1 && after.get(id) > (before.get(id) ?? 0));
  if (dup.length) return `a second ## ${dup.join(', ')} heading would shadow the section verify.mjs wrote (the last section of an id wins): put notes under another heading`;
  return null;
}
function headingCounts(md) {
  const n = new Map();
  for (const { id } of mods.splitSections(md)) if (id !== null) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
}
const readOr = (p, dflt) => (existsSync(p) ? readFileSync(p, 'utf8') : dflt);
/** True when a file (or a file directly in a folder) under docs/verify holds code-written sections. */
function holdsMarks(abs) {
  if (!existsSync(abs)) return false;
  const files = statSync(abs).isDirectory() ? readdirSync(abs).map(f => join(abs, f)).filter(f => statSync(f).isFile()) : [abs];
  return files.some(f => mods.markedList(readFileSync(f, 'utf8')).length > 0);
}

/** The file text after the Edit, or null when the tool will fail by itself (old_string not in the file). */
function applyEdit(text, { old_string: from = '', new_string: to = '', replace_all: all }) {
  if (text === null) return from ? null : to;
  if (!from || !text.includes(from)) return null;
  if (all) return text.split(from).join(to);
  const i = text.indexOf(from);
  return text.slice(0, i) + to + text.slice(i + from.length);
}
function nextText(tool, ti, current) {
  if (tool === 'Write') return String(ti.content ?? '');
  if (tool === 'Edit') return applyEdit(current, ti);
  let text = current;
  for (const e of Array.isArray(ti.edits) ? ti.edits : []) { text = applyEdit(text, e); if (text === null) return null; }
  return text;
}

// ---------- verdict ----------
function openRun(session, env) {
  const file = mods.sessionMarker(session, env);
  if (!file || !existsSync(file)) return null;
  const m = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof m?.repo !== 'string' || !isAbsolute(m.repo)) return null;
  const repo = realPathLoose(m.repo);
  const run = typeof m.run === 'string' && isAbsolute(m.run) ? realPathLoose(m.run) : null;
  return { repo, run, verifyDir: join(repo, VERIFY_DIR), slug: String(m.slug ?? (run ? basename(run) : 'unknown')) };
}

function bashVerdict(command, cwd, r, depth = 0) {
  const at = p => realPathLoose(isAbsolute(p) ? p : join(cwd, p));
  const guarded = abs => isInside(abs, r.repo) && !(r.run && isInside(abs, r.run));
  const check = p => {
    const abs = at(p);
    if (!guarded(abs)) return null;
    if (!isInside(abs, r.verifyDir)) return `writing ${p} changes the repo outside ${VERIFY_DIR}/`;
    return holdsMarks(abs) ? `writing or removing ${p} would change sections verify.mjs wrote` : null;
  };
  for (const p of mods.writeTargets(command)) { const why = check(p); if (why) return why; }
  for (const t of commands(mods.stripHeredocs(command))) {
    const c = t.indexOf('-c');
    if (SHELLS.has(basename(t[0])) && c > 0 && depth < MAX_SHELL_DEPTH) {
      const why = bashVerdict(t[c + 1] ?? '', cwd, r, depth + 1); // `bash -c` with no script: nothing to check
      if (why) return why;
    }
    const why = gitWrite(t, cwd, r.repo) ?? removedPaths(t).map(check).find(Boolean);
    if (why) return why;
  }
  return null;
}

function fileVerdict(tool, ti, cwd, r) {
  const p = ti.file_path ?? ti.notebook_path;
  if (typeof p !== 'string' || !p) return null;
  const abs = realPathLoose(isAbsolute(p) ? p : join(cwd, p));
  if (!isInside(abs, r.repo) || (r.run && isInside(abs, r.run))) return null;
  if (!isInside(abs, r.verifyDir)) return `${p} is in the repo outside ${VERIFY_DIR}/`;
  if (tool === 'NotebookEdit') return null;
  const current = readOr(abs, null);
  const next = nextText(tool, ti, current);
  return next === null ? null : sectionChange(current ?? '', next);
}

const flagText = msg => `verify guard: ${msg}. Fix the flag where it is set (shell or settings.json env) and start again. To end a verify run: node "${VERIFY_MJS}" close`;
const denyText = (slug, why) =>
  `verify run ${slug} is open in this session: ${why}. While a run is open only ${VERIFY_DIR}/ (not the sections verify.mjs wrote) and the run folder may change (${mods.FLAG.guard}=false turns this guard off). To end the run: node "${VERIFY_MJS}" close`;

/** A deny reason, or null. input: the PreToolUse payload. */
export function verdict(input, env = process.env) {
  if (!mods) return null;
  const { session_id: sid, tool_name: tool, tool_input: ti, cwd: rawCwd } = input ?? {};
  if (!ti || (tool !== BASH && !FILE_TOOLS.has(tool))) return null;
  const command = tool === BASH ? String(ti.command ?? '') : '';
  if (tool === BASH) {
    const cmds = commands(mods.stripHeredocs(command));
    if (cmds.length && cmds.every(isVerifyCli) && !mods.writeTargets(command).length) return null;
  }
  try {
    mods.checkRemoved(env);
    if (!mods.guardEnabled(env)) return null;
  } catch (e) {
    if (e instanceof mods.FlagError) return flagText(e.message);
    throw e;
  }
  try {
    const r = openRun(sid || env.CLAUDE_CODE_SESSION_ID, env);
    if (!r) return null;
    const cwd = typeof rawCwd === 'string' && isAbsolute(rawCwd) ? rawCwd : r.repo;
    const why = tool === BASH ? bashVerdict(command, cwd, r) : fileVerdict(tool, ti, cwd, r);
    return why ? denyText(r.slug, why) : null;
  } catch { return null; }
}

async function main() {
  try {
    const reason = verdict(JSON.parse(readFileSync(0, 'utf8')));
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  } catch { /* fail open: no output */ }
  process.exit(0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
