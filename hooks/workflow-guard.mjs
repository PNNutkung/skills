#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash) for the dev-workflow skill. On by default: WORKFLOW_GUARD_ENABLED=false turns it off.
// A value of WORKFLOW_GUARD_ENABLED that is not true or false denies every guarded tool with the fix: a typo never turns it off silently.
// While a dev-workflow run is open on the current branch (skills/dev-workflow, ~/.cache/dev-workflow), it:
//   - denies product-code changes (any file in the repo outside docs/) until the design is locked (step tdd or later),
//   - denies `gh pr merge` / `glab mr merge` until verify and retro are done (step done).
// With no open run on the branch it blocks nothing (A19). Like dod-guard it catches agent mistakes, not a determined attacker:
// pattern matching on the command text, no shell evaluation. Otherwise fail open: it always exits 0 and denies only through the JSON decision.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..', 'skills', 'dev-workflow');
// A hook copied without its skill must not crash on import: verdict() then allows everything.
let mods = null;
try {
  mods = { ...(await import(join(SKILL, 'flags.mjs'))), ...(await import(join(SKILL, 'io.mjs'))), ...(await import(join(SKILL, 'steps.mjs'))) };
} catch { mods = null; }
const WORKFLOW_MJS = join(SKILL, 'workflow.mjs');

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n()`]|\$\(/;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin']);
const REDIRECT_RE = /(?<![<>=&-])(>>?)(?!&)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g;
const MERGES = { gh: ['pr', 'merge'], glab: ['mr', 'merge'] };
const VALUE_FLAGS = new Set(['-R', '--repo', '--hostname']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const COPIERS = new Set(['cp', 'mv', 'install', 'ln']);
const HEREDOC_RE = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/g;

/** The command line without heredoc bodies: a body is data, not commands or redirects. */
export function stripHeredocs(command) {
  const out = [];
  let ends = [];
  for (const line of String(command).split('\n')) {
    if (ends.length) { if (line.replace(/^\t+/, '') === ends[0]) ends.shift(); continue; }
    out.push(line);
    ends = [...line.matchAll(HEREDOC_RE)].map(m => m[2]);
  }
  return out.join('\n');
}
const positionals = args => { const out = []; for (let i = 0; i < args.length; i++) { if (VALUE_FLAGS.has(args[i])) { i++; continue; } if (!args[i].startsWith('-')) out.push(args[i]); } return out; };

const unquote = t => t.replace(/^(["'])(.*)\1$/s, '$2');
const tokenize = seg => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
function stripPrefix(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  return tokens.slice(i);
}
/** Simple commands of a command line; a quoted span is data, so it is blanked before splitting. */
function segments(command) {
  const masked = command.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
  const out = [];
  let start = 0;
  for (const m of masked.matchAll(new RegExp(SEGMENT_SPLIT_RE.source, 'g'))) { out.push(command.slice(start, m.index)); start = m.index + m[0].length; }
  out.push(command.slice(start));
  return out;
}

/** 'gh pr merge' or 'glab mr merge' when the command line runs one, else null. */
export function mergeCommand(command, depth = 0) {
  for (const seg of segments(stripHeredocs(command))) {
    const t = stripPrefix(tokenize(seg));
    const prog = basename(t[0] ?? '');
    const c = t.indexOf('-c');
    if (SHELLS.has(prog) && c > 0 && t[c + 1] && depth < 2) { const inner = mergeCommand(t[c + 1], depth + 1); if (inner) return inner; continue; }
    const want = MERGES[prog];
    if (!want) continue;
    const pos = positionals(t.slice(1));
    if (pos[0] === want[0] && pos[1] === want[1]) return `${prog} ${want.join(' ')}`;
  }
  return null;
}

const blankQuotes = s => s.replace(/(>>?\s*)?("[^"]*"|'[^']*')/g, (m, redirect) => (redirect ? m : ' '.repeat(m.length)));
/** Files a command line writes: redirects, tee and sed -i. */
export function writeTargets(command) {
  const cleaned = stripHeredocs(command).replace(/\d*>&\d*-?/g, ' ').replace(/&>>?/g, '>');
  const targets = [...blankQuotes(cleaned).matchAll(REDIRECT_RE)].map(m => unquote(m[2]));
  for (const seg of segments(cleaned)) {
    const t = stripPrefix(tokenize(seg));
    const files = t.slice(1).filter(x => !x.startsWith('-'));
    if (t[0] === 'tee' || t[0] === 'touch') targets.push(...files);
    if (COPIERS.has(t[0]) && files.length > 1) targets.push(files[files.length - 1]);
    if (t[0] === 'sed' && t.some(x => /^-[A-Za-z]*i|^--in-place/.test(x))) targets.push(...(t.some(x => /^-[A-Za-z]*[ef]$|^--(expression|file)/.test(x)) ? files : files.slice(1)));
  }
  return targets.filter(p => !p.startsWith('/dev/'));
}

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

/** A deny reason, or null. input: the PreToolUse payload. Throws FlagError on a bad flag value. */
export function verdict(input, env = process.env) {
  if (!mods) return null;
  const { FLAG, STEPS, openRuns, readFlags, repoRoot } = mods;
  const UNLOCKED_FROM = STEPS.indexOf('tdd');
  if (!readFlags(env).guard) return null;
  const { tool_name: tool, tool_input: ti, cwd } = input ?? {};
  const isFile = FILE_TOOLS.has(tool);
  if (!isFile && tool !== 'Bash') return null;
  const root = repoRoot(cwd ?? process.cwd());
  if (!root) return null;
  const runs = openRuns(env, root);
  if (!runs.length) return null;
  const locked = runs.every(r => STEPS.indexOf(r.state.step) >= UNLOCKED_FROM);
  const first = runs.find(r => STEPS.indexOf(r.state.step) < UNLOCKED_FROM) ?? runs[0];
  const where = `dev-workflow run ${first.state.slug} is at step ${first.state.step} (${FLAG.guard}=false turns this guard off)`;
  const docs = join(root, 'docs');
  const product = p => { const abs = realPathLoose(isAbsolute(p) ? p : join(cwd ?? root, p)); return isInside(abs, root) && !isInside(abs, docs) && !isInside(abs, join(root, '.git')); };
  const notLocked = p => `${where}: the design is not locked, so ${p} (product code) stays untouched. Finish the concept board and the ADR, then: node "${WORKFLOW_MJS}" next`;

  if (isFile) {
    const p = ti?.file_path ?? ti?.notebook_path;
    return !locked && typeof p === 'string' && product(p) ? notLocked(p) : null;
  }
  const command = String(ti?.command ?? '');
  const merge = mergeCommand(command);
  if (merge) return `${where}: ${merge} waits for verify and retro (status: node "${WORKFLOW_MJS}" status). To stop the workflow instead: node "${WORKFLOW_MJS}" close`;
  if (!locked) for (const p of writeTargets(command)) if (product(p)) return notLocked(p);
  return null;
}

async function main() {
  try {
    let reason;
    try { reason = verdict(JSON.parse(readFileSync(0, 'utf8'))); } catch (e) {
      if (!(mods && e instanceof mods.FlagError)) throw e;
      reason = `dev-workflow guard: ${e.message}. Fix the flag where it is set (shell or settings.json env) and start again`;
    }
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  } catch { /* fail open: no output */ }
  process.exit(0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
