#!/usr/bin/env node
// PreToolUse hook (Edit|Write|Bash) for the qa-sweep skill. While a qa-sweep run is active for this session and repo, it keeps the
// session to additive test changes, no commits and no git command that discards uncommitted work. Everything else is allowed, and the end command is always allowed and named in every deny.
// It catches agent mistakes, not a determined attacker: the Bash checks are best-effort pattern matching on the command text (no shell
// parsing, no `cd` tracking, no subshells or aliases), exactly like zt-guard.mjs. Test-file status comes from hooks/pr-test-tiers.
// Fail open: it ALWAYS exits 0 (exit 2 would block the tool call). It denies only through the JSON permissionDecision; any internal
// error allows the action and is logged to <run>/hook-errors.log when the run is known.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_MJS = join(HERE, '..', 'skills', 'qa-sweep', 'run.mjs');
const TIERS_PY = join(HERE, 'pr-test-tiers', 'pr-test-tiers.py');
const SPAWN_TIMEOUT_MS = 3000;
const END_COMMAND_RE = /qa-sweep\/run\.mjs["']?\s+end\b/;
const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n]/;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec']);
const FORBIDDEN_GIT = new Set(['commit', 'push']);
const DISCARDING_GIT = new Set(['restore', 'clean']); // any form destroys uncommitted work
const STASH_READS = new Set(['list', 'show']);
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const IS_TEST_EXIT = 0, NOT_TEST_EXIT = 3; // pr-test-tiers.py --is-test; 2 is outside a repo, 1 a crash
const REDIRECT_RE = /(?:^|[\s\d])(>>?)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g;

// ---------- additive-change checks ----------
const linesOf = (text) => String(text).split('\n').map((l) => l.replace(/\r$/, ''));

/** True when every old line appears in the new text, in order (extra new lines anywhere). */
function isSubsequence(oldLines, newLines) {
  let i = 0;
  for (const line of newLines) if (i < oldLines.length && line === oldLines[i]) i++;
  return i === oldLines.length;
}
export const isAdditiveWrite = (oldText, newText) => isSubsequence(linesOf(oldText), linesOf(newText));

// ---------- paths ----------
/** realpath of a path that may not exist yet: the nearest existing ancestor, resolved, plus the missing tail. */
function realPathLoose(p) {
  const abs = resolve(p);
  let dir = abs, tail = '';
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return abs;
    tail = tail ? join(basename(dir), tail) : basename(dir);
    dir = up;
  }
  const real = realpathSync(dir);
  return tail ? join(real, tail) : real;
}
const nearestDir = (p) => {
  let d = resolve(p);
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
  return statSync(d).isDirectory() ? d : dirname(d);
};
function repoOf(path) {
  const r = spawnSync('git', ['-C', nearestDir(path), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  return r.status === 0 ? realpathSync(r.stdout.trim()) : null;
}
const isInside = (child, parent) => child === parent || child.startsWith(parent + sep);

/** true = test file, false = not a test file, null = unknown (fail open): any other exit, such as 1 from a Python crash. */
function isTestFile(path, repo) {
  const r = spawnSync('python3', [TIERS_PY, '--is-test', relative(repo, realPathLoose(path))], { cwd: repo, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  return r.status === IS_TEST_EXIT ? true : r.status === NOT_TEST_EXIT ? false : null;
}

// ---------- Bash ----------
const unquote = (t) => t.replace(/^(["'])(.*)\1$/, '$2');
const tokenize = (seg) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);

/** Drop env assignments and wrapper commands from the front of a token list. */
function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}
/** The git subcommand and its arguments of a token list that starts with git, skipping global flags (-C X, -c K=V, --git-dir=...). */
function gitArgs(tokens) {
  if (basename(tokens[0] ?? '') !== 'git') return [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) return tokens.slice(i);
    if (GIT_VALUE_FLAGS.has(t)) i++;
  }
  return [];
}
/** A deny reason for a git command that commits, pushes or discards uncommitted work, or null. */
function gitVerdict(tokens) {
  const [sub, ...rest] = gitArgs(tokens);
  if (FORBIDDEN_GIT.has(sub)) return `git ${sub} is not allowed`;
  const discards = DISCARDING_GIT.has(sub) || (sub === 'checkout' && rest.includes('--')) || (sub === 'reset' && rest.includes('--hard'))
    || (sub === 'stash' && !STASH_READS.has(rest[0]));
  return discards ? `git ${[sub, ...rest].join(' ')} would discard uncommitted work` : null;
}
const nonFlags = (tokens) => tokens.filter((t) => t && !t.startsWith('-'));

// A quoted span is data (`node -e 'x > 2'`), except a quoted target right after > (`> "src/app.py"`): blank the rest, same length.
const blankQuotes = (s) => s.replace(/(>>?\s*)?("[^"]*"|'[^']*')/g, (m, redirect) => (redirect ? m : ' '.repeat(m.length)));
/** Output redirect targets of a whole command, each { path, append }. */
const redirectTargets = (command) => [...blankQuotes(command).matchAll(REDIRECT_RE)].map((m) => ({ path: unquote(m[2]), append: m[1] === '>>' }));

/** Files this segment writes through a command, each { path, append }: `tee [-a] FILE...`, `sed -i ... FILE...`. */
function writeTargets(tokens) {
  const targets = [];
  if (tokens[0] === 'tee') {
    const append = tokens.some((t) => t === '-a' || t === '--append');
    targets.push(...nonFlags(tokens.slice(1)).map((path) => ({ path, append })));
  }
  if (tokens[0] === 'sed' && tokens.some((t) => /^-[A-Za-z]*i|^--in-place/.test(t))) {
    const files = nonFlags(tokens.slice(1));
    const scriptViaFlag = tokens.some((t) => /^-[A-Za-z]*[ef]$|^--(expression|file)/.test(t));
    targets.push(...(scriptViaFlag ? files : files.slice(1)).map((path) => ({ path, append: false })));
  }
  return targets;
}

/** A deny reason, or null. ctx = { run, cwd, repo, isTest(path) -> true | false | null }. */
export function bashVerdict(command, ctx) {
  if (END_COMMAND_RE.test(command)) return null;
  const cleaned = command.replace(/\d*>&\d*-?/g, ' ').replace(/&>>?/g, '>');
  const targets = redirectTargets(cleaned);
  for (const seg of cleaned.split(SEGMENT_SPLIT_RE)) {
    const tokens = stripPrefix(tokenize(seg));
    const why = gitVerdict(tokens);
    if (why) return why;
    targets.push(...writeTargets(tokens));
  }
  for (const { path, append } of targets) {
    if (path.startsWith('/dev/')) continue;
    const abs = realPathLoose(isAbsolute(path) ? path : join(ctx.cwd, path));
    if (isInside(abs, ctx.run) || !isInside(abs, ctx.repo)) continue; // the run folder and anything outside the repo are not guarded
    const test = ctx.isTest(abs);
    if (test === false) return `writing to ${path} would change a file that is not a test file`;
    if (test && !append && existsSync(abs)) return `writing to ${path} would truncate or rewrite an existing test file (appending is allowed)`;
  }
  return null;
}

// ---------- Edit / Write ----------
/** The file text after the Edit, or null when old_string is not in the file (the tool will fail by itself). */
function applyEdit(text, { old_string: oldString = '', new_string: newString = '', replace_all: all }) {
  if (!oldString || !text.includes(oldString)) return null;
  if (all) return text.split(oldString).join(newString);
  const i = text.indexOf(oldString);
  return text.slice(0, i) + newString + text.slice(i + oldString.length);
}
function fileVerdict(tool, input, ctx) {
  const abs = realPathLoose(input.file_path);
  if (isInside(abs, ctx.run)) return null;
  const test = ctx.isTest(abs);
  if (test === null) return null;
  if (!test) return `${input.file_path} is not a test file`;
  if (!existsSync(abs)) return null;
  const current = readFileSync(abs, 'utf8');
  const next = tool === 'Edit' ? applyEdit(current, input) : input.content ?? '';
  const additive = next === null || isAdditiveWrite(current, next);
  return additive ? null : `this change to ${input.file_path} removes or rewrites existing test lines`;
}

// ---------- main ----------
const denyText = (run, session, why) =>
  `qa-sweep run ${run} is active in this session: ${why}. During a run only test files (additions only) and the run folder may change, and nothing is committed. To end the run: node "${RUN_MJS}" end --session ${session}`;

async function decide(input) {
  const { session_id: session, tool_name: tool, tool_input: ti, cwd } = input ?? {};
  if (!session || !ti || !['Edit', 'Write', 'Bash'].includes(tool)) return null;
  const { readActive } = await import(RUN_MJS);
  const active = readActive({ session, env: process.env });
  if (!active) return null;
  const run = realPathLoose(active.run), repo = realpathSync(active.repo);
  try {
    const where = tool === 'Bash' ? cwd : ti.file_path;
    if (!where || repoOf(where) !== repo) return null;
    const ctx = { run, cwd: cwd ?? repo, repo, isTest: (p) => isTestFile(p, repo) };
    const why = tool === 'Bash' ? bashVerdict(String(ti.command ?? ''), ctx) : fileVerdict(tool, ti, ctx);
    return why ? denyText(active.run, session, why) : null;
  } catch (err) {
    try { appendFileSync(join(active.run, 'hook-errors.log'), `${new Date().toISOString()} qa-guard: ${String(err?.message ?? err).split('\n')[0]}\n`); } catch { /* the log is best-effort */ }
    return null;
  }
}

async function main() {
  try {
    const reason = await decide(JSON.parse(readFileSync(0, 'utf8')));
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  } catch { /* fail open: no output */ }
  process.exit(0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
