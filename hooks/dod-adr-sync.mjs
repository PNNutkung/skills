#!/usr/bin/env node
// PostToolUse hook (Bash) for the definition-of-done skill. On by default; DOD_ADR_TOUCHES_SYNC_ENABLED=false turns it off.
// After the agent moves files with `mv` or `git mv`, it rewrites the `touches` globs of the repo's ADRs (and their index) so they follow the
// move, and tells the agent what it changed or what it could not decide. Only frontmatter and the index change; never a DoD section.
// The git pre-commit hook that `dod.mjs adr` installs does the same for moves a person makes. Fail open: always exits 0.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SYNC_ENV = 'DOD_ADR_TOUCHES_SYNC_ENABLED';
const HERE = dirname(fileURLToPath(import.meta.url));
const ADRIO = join(HERE, '..', 'skills', 'definition-of-done', 'adrio.mjs');
const FLAGS = join(HERE, '..', 'skills', 'definition-of-done', 'flags.mjs');
const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n()`]|\$\(/;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin']);
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

const unquote = t => t.replace(/^(["'])(.*)\1$/s, '$2');
const tokenize = seg => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
function segments(command) {
  const masked = command.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
  const out = [];
  let start = 0;
  for (const m of masked.matchAll(new RegExp(SEGMENT_SPLIT_RE.source, 'g'))) { out.push(command.slice(start, m.index)); start = m.index + m[0].length; }
  out.push(command.slice(start));
  return out;
}

/** The moves of a command line: [{ sources, target }] for each `mv` or `git mv` with at least one source and a target. */
export function movesOf(command) {
  const out = [];
  for (const seg of segments(String(command ?? ''))) {
    let t = tokenize(seg);
    let i = 0;
    while (i < t.length && (/^[A-Za-z_]\w*=/.test(t[i]) || WRAPPERS.has(t[i]))) i++;
    t = t.slice(i);
    if (basename(t[0] ?? '') === 'git') {
      let j = 1;
      while (j < t.length && t[j].startsWith('-')) j += GIT_VALUE_FLAGS.has(t[j]) ? 2 : 1;
      if (t[j] !== 'mv') continue;
      t = t.slice(j);
    } else if (basename(t[0] ?? '') !== 'mv') continue;
    const args = t.slice(1).filter(a => !a.startsWith('-'));
    if (args.length >= 2) out.push({ sources: args.slice(0, -1), target: args[args.length - 1] });
  }
  return out;
}

const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
const inside = (repo, abs) => { const r = relative(repo, abs); return r && !r.startsWith('..') && !r.startsWith(sep) ? r.split(sep).join('/') : null; };

/** [old, new] file pairs of the moves, from the files now on disk (a moved folder becomes one pair per file under it). */
function renamesOf(moves, cwd, repo, files) {
  const out = [];
  for (const { sources, target } of moves) {
    const targetAbs = resolve(cwd, target);
    for (const src of sources) {
      const oldAbs = resolve(cwd, src);
      const into = isDir(targetAbs) && (sources.length > 1 || existsSync(join(targetAbs, basename(oldAbs))));
      const oldRel = inside(repo, oldAbs), newRel = inside(repo, into ? join(targetAbs, basename(oldAbs)) : targetAbs);
      if (!oldRel || !newRel) continue;
      if (files.includes(newRel)) out.push([oldRel, newRel]);
      else for (const f of files) if (f.startsWith(newRel + '/')) out.push([oldRel + f.slice(newRel.length), f]);
    }
  }
  return out;
}

async function decide(input) {
  if (input?.tool_name !== 'Bash') return null;
  const { FlagError, enabled } = await import(FLAGS);
  try {
    if (!enabled(process.env, SYNC_ENV, true)) return null;
  } catch (e) {
    if (e instanceof FlagError) return { block: `dod-adr-sync: ${e.message}. Fix the flag where it is set (shell or settings.json env)` };
    throw e;
  }
  const command = String(input?.tool_input?.command ?? '');
  if (!/\bmv\b/.test(command)) return null;
  const moves = movesOf(command);
  if (!moves.length) return null;
  const io = await import(ADRIO);
  const cwd = input.cwd ?? process.cwd();
  const repo = io.topLevel(cwd);
  if (!repo || !existsSync(join(repo, io.adrDir(repo)))) return null;
  const files = io.repoFiles(repo).filter(f => existsSync(join(repo, f)));
  const r = io.syncRepo({ repo, renames: renamesOf(moves, realpathSync(cwd), repo, files), files });
  const lines = [...r.changes.map(c => `dod-adr: ${c.adr}: ${c.from !== undefined ? `${c.from} -> ${c.to}` : `added ${c.added} next to ${c.next}`}`), ...r.warnings.map(w => `dod-adr: warning: ${w}`)];
  return lines.length ? `${lines.join('\n')}\n(the ADRs' touches followed the move; commit them with it. ${SYNC_ENV}=false turns this off)` : null;
}

async function main() {
  try {
    const said = await decide(JSON.parse(readFileSync(0, 'utf8')));
    if (said?.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: said.block }));
    else if (said) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: said } }));
  } catch { /* fail open: no output */ }
  process.exit(0);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();
