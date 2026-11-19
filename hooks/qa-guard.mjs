#!/usr/bin/env node
// PreToolUse hook (Edit|Write|Bash) for the qa-sweep skill. While a qa-sweep run is active for this session and repo, it keeps the
// session to additive test changes and no commits. Everything else is allowed, and the end command is always allowed and named in every deny.
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
const END_COMMAND_RE = /qa-sweep\/run\.mjs\s+end\b/;
const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n]/;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec']);
const FORBIDDEN_GIT = new Set(['commit', 'push']);
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

// ---------- additive-change checks ----------
const linesOf = (text) => String(text).split('\n').map((l) => l.replace(/\r$/, ''));

/** True when every old line appears in the new text, in order (extra new lines anywhere). */
function isSubsequence(oldLines, newLines) {
  let i = 0;
  for (const line of newLines) if (i < oldLines.length && line === oldLines[i]) i++;
  return i === oldLines.length;
}
export const isAdditiveEdit = (oldString, newString) => isSubsequence(linesOf(oldString), linesOf(newString));
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

/** true = test file, false = not a test file, null = unknown (fail open). */
function isTestFile(path, repo) {
  const r = spawnSync('python3', [TIERS_PY, '--is-test', relative(repo, realPathLoose(path))], { cwd: repo, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  return r.status === 0 ? true : r.status === 1 ? false : null;
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
/** The git subcommand of a token list that starts with git, skipping global flags (-C X, -c K=V, --git-dir=...). */
function gitSubcommand(tokens) {
  if (basename(tokens[0] ?? '') !== 'git') return null;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) return t;
    if (GIT_VALUE_FLAGS.has(t)) i++;
  }
  return null;
}
const nonFlags = (tokens) => tokens.filter((t) => !t.startsWith('-'));

/** File targets this segment writes: output redirects, `tee FILE`, `sed -i ... FILE`. */
function writeTargets(seg, tokens) {
  const targets = [...seg.matchAll(/(?:^|[\s\d])>>?\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g)].map((m) => unquote(m[1]));
  if (tokens[0] === 'tee') targets.push(...nonFlags(tokens.slice(1)));
  if (tokens[0] === 'sed' && tokens.some((t) => /^-[A-Za-z]*i|^--in-place/.test(t))) targets.push(...nonFlags(tokens.slice(1)).slice(-1));
  return targets;
}

/** A deny reason, or null. ctx = { run, cwd, repo, isTest(path) -> true | false | null }. */
export function bashVerdict(command, ctx) {
  if (END_COMMAND_RE.test(command)) return null;
  const cleaned = command.replace(/\d*>&\d*-?/g, ' ').replace(/&>>?/g, '>');
  for (const seg of cleaned.split(SEGMENT_SPLIT_RE)) {
    const tokens = stripPrefix(tokenize(seg));
    const sub = gitSubcommand(tokens);
    if (FORBIDDEN_GIT.has(sub)) return `git ${sub} is not allowed`;
    for (const target of writeTargets(seg, tokens)) {
      if (target.startsWith('/dev/')) continue;
      const abs = realPathLoose(isAbsolute(target) ? target : join(ctx.cwd, target));
      if (isInside(abs, ctx.run)) continue;
      if (ctx.isTest(abs) === false) return `writing to ${target} would change a file that is not a test file`;
    }
  }
  return null;
}

// ---------- Edit / Write ----------
function fileVerdict(tool, input, ctx) {
  const abs = realPathLoose(input.file_path);
  if (isInside(abs, ctx.run)) return null;
  const test = ctx.isTest(abs);
  if (test === null) return null;
  if (!test) return `${input.file_path} is not a test file`;
  if (!existsSync(abs)) return null;
  const additive = tool === 'Edit'
    ? isAdditiveEdit(input.old_string ?? '', input.new_string ?? '')
    : isAdditiveWrite(readFileSync(abs, 'utf8'), input.content ?? '');
  return additive ? null : `this change to ${input.file_path} removes or rewrites existing test lines`;
}

// ---------- main ----------
const denyText = (run, why) =>
  `qa-sweep run ${run} is active in this session: ${why}. During a run only test files (additions only) and the run folder may change, and nothing is committed. To end the run: node ${RUN_MJS} end`;

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
    return why ? denyText(active.run, why) : null;
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
