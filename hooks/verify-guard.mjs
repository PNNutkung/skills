#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash) for the verify skill (ADR 0008 A10). On by default: VERIFY_GUARD_ENABLED=false turns it off.
// An invalid VERIFY_GUARD_ENABLED, or the removed VERIFY_FLAG_RUNS_ENABLED still set, denies every guarded tool with the fix.
// While this session has a verify run open (skills/verify/paths.mjs session marker), only the repo is fenced:
//   - file edits in the repo outside docs/verify/ are denied (the run folder lives in the cache, outside the repo),
//   - an edit of a docs/verify file that changes, removes or forges a section verify.mjs wrote (skills/verify/marker.mjs) is denied,
//   - Bash commands that write into the repo outside docs/verify/, or overwrite a verify file with code-written sections, are denied;
//     so is inline interpreter code (python -c, node -e, perl -e/-i, ruby -e) that writes or names a repo path outside docs/verify/.
// `node .../verify/verify.mjs ...` is always allowed. The Bash checks are best effort: pattern matching on the command text, with
// `cd`/`pushd` followed within one command and shell -c / eval scripts read a few levels deep, but no shell evaluation (variables,
// globs, scripts in files and heredocs fed to an interpreter go unseen). The backstop is verify.mjs itself: it snapshots the work tree
// at open and fails a run, and status and close report, any product file changed since. Fail open: always exit 0, deny only through the JSON.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
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
// git subcommands that change the work tree, the index, history, refs or the remote; branch only when forced, stash unless it only reads
const GIT_WRITES = new Set(['commit', 'push', 'apply', 'restore', 'checkout', 'switch', 'clean', 'merge', 'rebase', 'pull', 'cherry-pick', 'revert', 'am', 'mv', 'rm',
  'reset', 'checkout-index', 'update-ref']);
const STASH_READS = new Set(['list', 'show']);
const BRANCH_FORCE = new Set(['-f', '--force', '-M', '-C', '-D']);
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
// a shell -c script nested deeper than this is denied: it cannot be read reliably
const MAX_SHELL_DEPTH = 4;
const SHELL_SCRIPT_FLAG_RE = /^-[A-Za-z]*c[A-Za-z]*$/;
// inline interpreter code: the flag that takes the code, per interpreter
const INLINE = [
  { re: /^python(\d+(\.\d+)*)?$/, code: /^-[A-Za-z]*c$/ },
  { re: /^node$/, code: /^(-e|--eval|-p|--print|-pe|-ep)$/, attached: /^--(?:eval|print)=(.*)$/s },
  { re: /^perl$/, code: /^-[A-Za-z]*[eE]$/, inPlace: /^-[A-Za-z]*i/ },
  { re: /^ruby$/, code: /^-[A-Za-z]*e$/, inPlace: /^-[A-Za-z]*i/ },
];
// an obvious file write, delete or shell-out in inline code
const WRITE_API_RE = new RegExp([
  String.raw`\bopen\s*\([^)]*,\s*(?:mode\s*=\s*)?['"][^'"]*[wax+]`,
  String.raw`\b(?:writeFile|appendFile|rm|rmdir|unlink|rename|copyFile|cp|truncate|mkdir|symlink|link|createWriteStream|chmod)(?:Sync)?\s*\(`,
  String.raw`\bunlink\b`, String.raw`\.write_(?:text|bytes)\s*\(`, String.raw`\.(?:unlink|rmdir|rename|replace|touch|mkdir)\s*\(`, String.raw`\bshutil\.`,
  String.raw`\bos\.(?:remove|unlink|rename|replace|rmdir|removedirs|makedirs|mkdir|system|popen|truncate|chmod)\b`, String.raw`\bsubprocess\b`,
  String.raw`\bchild_process\b`, String.raw`\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|system)\s*\(`, String.raw`\bFile(?:Utils)?\.(?:write|delete|rename|open|unlink)`,
].join('|'));
const PATH_IN_CODE_RE = /(['"`])((?:(?!\1)[^\n])+)\1|(?<![\w./-])((?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+)/g;
const MARKER_TEXT_RE = /<!-- verify: written by verify\.mjs/;
// commands that write the files they get on stdin (xargs) or under their start paths (find)
const XARGS_WRITERS = new Set(['rm', 'mv', 'cp', 'tee', 'touch', 'truncate', 'ln', 'install', 'dd', 'shred']);
const FIND_WRITERS = new Set(['rm', 'mv', 'cp', 'tee', 'truncate', 'shred', 'sed', 'perl']);

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
const QUOTED_RE = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const unquote = t => (/^"(.*)"$/s.test(t) ? t.slice(1, -1).replace(/\\(["\\$`])/g, '$1') : t.replace(/^'(.*)'$/s, '$1'));
const tokenize = seg => (seg.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) ?? []).map(unquote);
function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}
/** Simple commands of a command line in order: { raw, t (tokens), before (the separator before it) }. A quoted span is data, so it
 *  is blanked before splitting, and fd redirects (2>&1, &>) are not separators. */
function segments(command) {
  const cleaned = command.replace(/\d*>&\d*-?/g, m => ' '.repeat(m.length)).replace(/&>/g, ' >');
  const masked = cleaned.replace(QUOTED_RE, m => ' '.repeat(m.length));
  const out = [];
  let start = 0, before = null;
  const add = raw => out.push({ raw, t: stripPrefix(tokenize(raw)), before });
  for (const m of masked.matchAll(SEGMENT_SPLIT_RE)) { add(cleaned.slice(start, m.index)); before = m[0]; start = m.index + m[0].length; }
  add(cleaned.slice(start));
  return out;
}
const commands = command => segments(command).map(s => s.t).filter(t => t.length);
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
  const writes = GIT_WRITES.has(sub) || (sub === 'stash' && !STASH_READS.has(rest[0])) || (sub === 'branch' && rest.some(x => BRANCH_FORCE.has(x)));
  return writes && isInside(realPathLoose(dir), repo) ? `git ${sub} changes the repo` : null;
}

/** Arguments that are not options or redirects (`< file` drops the file too); valueFlags drop their value. */
function positionals(args, valueFlags = new Set()) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^\d*<{1,3}$/.test(a) || valueFlags.has(a)) { i++; continue; }
    if (!a.startsWith('-') && !/^\d*[<>]/.test(a)) out.push(a);
  }
  return out;
}
const PATCH_VALUE_FLAGS = new Set(['-o', '-i', '-d', '-r', '-B', '-D', '-F', '-z', '-V', '-Y', '--output', '--input', '--directory', '--reject-file']);
function flagValue(args, short, long) {
  const i = args.findIndex(a => a === short || a === long);
  return i >= 0 ? args[i + 1] : args.find(a => a.startsWith(`${long}=`))?.slice(long.length + 1);
}

/** Paths a simple command removes, moves away or writes beyond what writeTargets sees ('.' stands for the cwd when they are unknown). */
function removedPaths(t) {
  const prog = basename(t[0] ?? ''), args = t.slice(1);
  if (prog === 'rm' || prog === 'shred') return positionals(args);
  if (prog === 'mv') return positionals(args).slice(0, -1);
  if (prog === 'dd') return args.filter(a => a.startsWith('of=')).map(a => a.slice(3));
  if (prog === 'truncate') return positionals(args, new Set(['-s', '--size', '-r', '--reference']));
  if (prog === 'patch') {
    const dir = flagValue(args, '-d', '--directory') ?? '.';
    const file = positionals(args, PATCH_VALUE_FLAGS)[0];
    return [flagValue(args, '-o', '--output') ?? (file ? (isAbsolute(file) ? file : join(dir, file)) : dir)];
  }
  if (prog === 'find') {
    const at = args.findIndex(a => a === '-exec' || a === '-execdir' || a === '-ok' || a === '-okdir');
    if (!args.includes('-delete') && !(at >= 0 && FIND_WRITERS.has(basename(args[at + 1] ?? '')))) return [];
    const starts = [];
    for (const a of args) { if (/^[-(!]/.test(a)) break; starts.push(a); }
    return starts.length ? starts : ['.'];
  }
  if (prog === 'xargs') {
    const cmd = args.find(a => !a.startsWith('-') && !/^\d+$/.test(a));
    return cmd && XARGS_WRITERS.has(basename(cmd)) ? ['.'] : [];
  }
  return [];
}

/** The script of `sh -c`, `bash -lc ...` or `eval ...`, or null. */
function shellScript(t) {
  if (t[0] === 'eval') return t.slice(1).join(' ');
  if (!SHELLS.has(basename(t[0]))) return null;
  const args = t.slice(1);
  const c = args.findIndex(x => SHELL_SCRIPT_FLAG_RE.test(x));
  if (c < 0) return null;
  return args.slice(c + 1).find(x => x !== '--' && !x.startsWith('-')) ?? '';
}

/** { prog, code, inPlace } for inline interpreter code (python -c, node -e, perl -e, ruby -e), or null. */
function inlineCode(t) {
  const prog = basename(t[0] ?? '');
  const kind = INLINE.find(k => k.re.test(prog));
  if (!kind) return null;
  const inPlace = Boolean(kind.inPlace && t.slice(1).some(x => kind.inPlace.test(x)));
  for (const [i, x] of t.entries()) {
    const m = kind.attached?.exec(x);
    if (m) return { prog, code: m[1], inPlace };
    if (kind.code.test(x)) return { prog, code: t[i + 1] ?? '', inPlace };
  }
  return inPlace ? { prog, code: '', inPlace } : null;
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
  const dup = [...ids].filter(id => after.get(id) > (before.get(id) ?? 0));
  if (dup.length) return `a second ## ${dup.join(', ')} heading would shadow the section verify.mjs wrote (the last section of an id wins): put notes under another heading`;
  // dev-workflow reads result: lines whoever wrote them, so a new hand section with one forges a result
  const handBefore = headingCounts(oldMd, handResult), handAfter = headingCounts(newMd, handResult);
  const forged = [...handAfter.keys()].filter(id => handAfter.get(id) > (handBefore.get(id) ?? 0));
  if (forged.length) return `the new ## ${forged.join(', ')} section has a result: line, which only verify.mjs writes (node "${VERIFY_MJS}" run --only ${forged.join(',')})`;
  return null;
}
const MARKER_LINE_RE = /^## [^\n]*\n<!-- verify: written by verify\.mjs/;
const handResult = text => !MARKER_LINE_RE.test(text) && /^result:/m.test(text);
function headingCounts(md, keep = () => true) {
  const n = new Map();
  for (const { id, text } of mods.splitSections(md)) if (id !== null && keep(text)) n.set(id, (n.get(id) ?? 0) + 1);
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

/** The deny reason of inline interpreter code that writes or names a repo path outside docs/verify, or null. */
function inlineVerdict(t, at, guarded, r) {
  const x = inlineCode(t);
  if (!x) return null;
  if (x.inPlace) return `inline ${x.prog} code edits files in place (-i)`;
  if (WRITE_API_RE.test(x.code)) return `inline ${x.prog} code writes, deletes or runs commands: put the check in the plan and run it with verify.mjs`;
  for (const m of x.code.matchAll(PATH_IN_CODE_RE)) {
    const p = (m[2] ?? m[3]).trim();
    const abs = at(p);
    if (abs !== r.repo && guarded(abs) && !isInside(abs, r.verifyDir) && (isAbsolute(p) || existsSync(abs))) return `inline ${x.prog} code names ${p}, a repo path outside ${VERIFY_DIR}/`;
  }
  return null;
}

function bashVerdict(command, cwd0, r, depth = 0) {
  if (depth > MAX_SHELL_DEPTH) return `shell scripts nested deeper than ${MAX_SHELL_DEPTH} levels cannot be checked`;
  const guarded = abs => isInside(abs, r.repo) && !(r.run && isInside(abs, r.run));
  const forging = MARKER_TEXT_RE.test(command);
  let cwd = cwd0;
  const at = p => realPathLoose(isAbsolute(p) ? p : join(cwd, p));
  const check = p => {
    const abs = at(p);
    if (!guarded(abs)) return null;
    if (!isInside(abs, r.verifyDir)) return `writing ${p} changes the repo outside ${VERIFY_DIR}/`;
    if (forging) return `the verify.mjs marker in the text written to ${p} is written only by verify.mjs`;
    return holdsMarks(abs) ? `writing or removing ${p} would change sections verify.mjs wrote` : null;
  };
  // each simple command is checked from the dir a cd or pushd before it left; a subshell's cd ends with the subshell
  const stack = [];
  for (const { raw, t, before } of segments(mods.stripHeredocs(command))) {
    if (before === '(' || before === '$(') stack.push(cwd);
    if (before === ')') cwd = stack.pop() ?? cwd;
    for (const p of mods.writeTargets(raw)) { const why = check(p); if (why) return why; }
    if (!t.length) continue;
    if (t[0] === 'cd' || t[0] === 'pushd') {
      const d = t.slice(1).find(x => !x.startsWith('-') || x === '-');
      if (d !== '-') cwd = d === undefined ? homedir() : at(d);
      continue;
    }
    const script = shellScript(t);
    if (script !== null) { const why = bashVerdict(script, cwd, r, depth + 1); if (why) return why; }
    const why = gitWrite(t, cwd, r.repo) ?? inlineVerdict(t, at, guarded, r) ?? removedPaths(t).map(check).find(Boolean);
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
