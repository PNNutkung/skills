// The git and file side of the ADR code (adr.mjs stays pure). Used by dod.mjs, by paired-agent-tdd and qa-sweep (they import this file through
// DOD_DIR), and by hooks/dod-adr-sync.mjs. Paths given and returned are relative to the repo's top level, with forward slashes.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { checkAdr, matchGlob, nextNumber, parseAdr, parseFrontmatter, syncTouches, setTouches, upsertIndex } from './adr.mjs';

export const ADR_DIRS = ['docs/adr', 'docs/decisions', 'doc/adr', 'docs/architecture/decisions'];
export const DEFAULT_ADR_DIR = 'docs/adr';
export const HOOK_ENV = 'DOD_ADR_PRECOMMIT_HOOK_ENABLED';
const HOOK_TAG = 'dod-adr-sync (definition-of-done)';
const ADR_FILE = /^\d{4}-.+\.md$/;
const INACTIVE = /superseded|deprecated|rejected/i;

const git = (repo, args) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const tryGit = (repo, args) => { try { return git(repo, args); } catch { return null; } };
const nul = text => String(text ?? '').split('\0').filter(Boolean);
/** A normalized path inside the repo, or null. */
export function relPath(p) {
  if (typeof p !== 'string' || !p || isAbsolute(p) || p.includes('\0')) return null;
  const n = normalize(p).replace(/\\/g, '/');
  return n === '.' || n.startsWith('../') || n === '..' ? null : n;
}

export const topLevel = dir => (tryGit(dir, ['rev-parse', '--show-toplevel']) ?? '').trim() || null;
export const readAt = (repo, rev, path) => tryGit(repo, ['show', `${rev}:${path}`]);
const readWorking = (repo, path) => { try { return readFileSync(join(repo, path), 'utf8'); } catch { return null; } };

/** The repo's ADR folder: `.adr-dir` (adr-tools) wins, then the first known folder that exists, else docs/adr. */
export function adrDir(repo) {
  const custom = relPath((readWorking(repo, '.adr-dir') ?? '').trim());
  if (custom) return custom;
  return ADR_DIRS.find(d => existsSync(join(repo, d))) ?? DEFAULT_ADR_DIR;
}

/** Every ADR file of the folder, read from the working tree or (rev) from git: [{ n, file, text }], by number. */
export function listAdrs(repo, { rev = null } = {}) {
  const dir = adrDir(repo);
  let names;
  if (rev) names = nul(tryGit(repo, ['ls-tree', '-z', '--name-only', `${rev}:${dir}`]));
  else { try { names = readdirSync(join(repo, dir)); } catch { names = []; } }
  return names.filter(n => ADR_FILE.test(n)).sort().map(n => {
    const file = `${dir}/${n}`;
    return { n: Number(n.slice(0, 4)), file, text: rev ? readAt(repo, rev, file) : readWorking(repo, file) };
  }).filter(a => typeof a.text === 'string');
}

const entryOf = a => { const p = parseAdr(a.text); return { n: a.n, file: a.file.split('/').pop(), path: a.file, title: (p.title ?? '').replace(/^\d+\.\s*/, ''), status: p.status ?? '', touches: p.touches, slug: p.slug, hasDod: !!p.section }; };

/** Where the ADR of this DoD slug goes: its existing file (rewritten in place) or the next number. */
export function adrTarget(repo, slug) {
  const all = listAdrs(repo);
  const mine = all.find(a => parseFrontmatter(a.text).slug === slug);
  if (mine) return { n: mine.n, file: mine.file, existing: true };
  const n = nextNumber(all.map(a => a.file.split('/').pop()));
  return { n, file: `${adrDir(repo)}/${String(n).padStart(4, '0')}-${slug}.md`, existing: false };
}

/** Rewrite the index in the ADR folder's README from the working tree. -> { file, changed } */
export function writeIndex(repo) {
  const dir = adrDir(repo), file = `${dir}/README.md`;
  const before = readWorking(repo, file);
  const after = upsertIndex(before, listAdrs(repo).map(entryOf));
  if (after === before) return { file, changed: false };
  mkdirSync(join(repo, dir), { recursive: true });
  writeFileSync(join(repo, file), after);
  return { file, changed: true };
}

/** Active ADRs (not superseded, deprecated or rejected) whose touches match any of the files. [{ n, file, title, status, touches, hasDod }] */
export function findAdrsFor(repo, files, { rev = null } = {}) {
  const wanted = files.map(relPath).filter(Boolean);
  return listAdrs(repo, { rev }).map(entryOf).filter(e => !INACTIVE.test(e.status) && e.touches.some(g => wanted.some(f => matchGlob(g, f))))
    .map(({ n, path, title, status, touches, hasDod }) => ({ n, file: path, title, status, touches, hasDod }));
}

/**
 * The DoD of an ADR as paired-agent-tdd and qa-sweep read it: the file at `rev` (default HEAD), unchanged in the working tree when rev is HEAD,
 * passing checkAdr. warnings: its touches globs that match no file at `rev` (a move the hooks did not follow).
 * -> { ok: true, file, parsed, blob, warnings } | { ok: false, errors }
 */
export function loadAdrDod({ repo, file, rev = 'HEAD' }) {
  const rel = relPath(file);
  if (!rel) return { ok: false, errors: [`dodFile ${JSON.stringify(file)} must be a relative path inside the repo`] };
  const text = readAt(repo, rev, rel);
  if (text === null) return { ok: false, errors: [`dodFile ${rel} is not committed at ${rev}; commit the ADR first (the DoD is read from git)`] };
  if (rev === 'HEAD' && readWorking(repo, rel) !== text) return { ok: false, errors: [`dodFile ${rel} differs from HEAD; commit it first (the DoD is read at HEAD)`] };
  const errors = checkAdr(text, { show: p => readAt(repo, rev, p) });
  if (errors.length) return { ok: false, errors: [`dodFile ${rel} does not pass the DoD check:`, ...errors.map(e => `  ${e}`)] };
  const parsed = parseAdr(text);
  const files = nul(tryGit(repo, ['ls-tree', '-r', '-z', '--name-only', rev]));
  const warnings = syncTouches(parsed.touches, [], files).warnings.map(w => `${rel}: ${w}`);
  return { ok: true, file: rel, parsed, blob: (tryGit(repo, ['rev-parse', `${rev}:${rel}`]) ?? '').trim(), warnings };
}

/** Renames staged in the index: [[old, new]]. */
export function stagedRenames(repo) {
  const parts = nul(tryGit(repo, ['diff', '--cached', '-M', '--name-status', '-z']));
  const out = [];
  for (let i = 0; i < parts.length; i++) if (/^R\d*$/.test(parts[i])) { out.push([parts[i + 1], parts[i + 2]]); i += 2; } else if (/^[CR]/.test(parts[i])) i += 2; else i += 1;
  return out;
}

/** The repo's files: the index, plus untracked ones that are not ignored unless staged only. */
export const repoFiles = (repo, { staged = false } = {}) => nul(tryGit(repo, ['ls-files', '-z', '--cached', ...(staged ? [] : ['--others', '--exclude-standard'])]));

/**
 * Follow renames in every ADR's touches, then refresh the index. stage: git add what changed (the pre-commit hook).
 * -> { changed: [file], changes: [{adr, ...change}], warnings: [string] }
 */
export function syncRepo({ repo, renames, files, stage = false }) {
  const changed = [], changes = [], warnings = [];
  if (!renames.length) return { changed, changes, warnings };
  for (const a of listAdrs(repo)) {
    const fm = parseFrontmatter(a.text);
    if (!fm.touches.length) continue;
    if (!renames.some(([o]) => fm.touches.some(g => matchGlob(g, o)))) continue; // a move this ADR does not touch says nothing about it
    const r = syncTouches(fm.touches, renames, files);
    warnings.push(...r.warnings.map(w => `${a.file}: ${w}`));
    if (!r.changes.length) continue;
    writeFileSync(join(repo, a.file), setTouches(a.text, r.touches));
    changed.push(a.file);
    changes.push(...r.changes.map(c => ({ adr: a.file, ...c })));
  }
  if (changed.length) { const idx = writeIndex(repo); if (idx.changed) changed.push(idx.file); }
  if (stage && changed.length) git(repo, ['add', '--', ...changed]);
  return { changed, changes, warnings };
}

/** The pre-commit hook script; dodMjs is this skill's dod.mjs, absolute. */
export const hookLine = dodMjs => `node "${dodMjs}" adrs --sync --staged >/dev/null || true`; // the dod-adr: lines on stderr stay
export const hookScript = dodMjs => `#!/bin/sh\n# ${HOOK_TAG}: follows file moves in the ADRs' touches. ${HOOK_ENV}=false skips it.\n[ "$${HOOK_ENV}" = "false" ] && exit 0\ncommand -v node >/dev/null 2>&1 || exit 0\n[ -f "${dodMjs}" ] || exit 0\n${hookLine(dodMjs)}\n`;

/**
 * Install the pre-commit hook. Never overwrites a hook it did not write, and leaves a hook manager (core.hooksPath: husky, lefthook...) alone:
 * then it returns the line to add. -> { installed: path } | { skipped: reason, line }
 */
export function installHook({ repo, dodMjs }) {
  const line = hookLine(dodMjs);
  const managed = (tryGit(repo, ['config', '--get', 'core.hooksPath']) ?? '').trim();
  if (managed) return { skipped: `core.hooksPath is ${managed} (a hook manager); add this line to its pre-commit hook`, line };
  const dir = resolve(repo, (tryGit(repo, ['rev-parse', '--git-path', 'hooks']) ?? '.git/hooks').trim());
  const file = join(dir, 'pre-commit');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current !== null && !current.includes(HOOK_TAG)) return { skipped: `${file} exists and is not ours; add this line to it`, line };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, hookScript(dodMjs));
  chmodSync(file, 0o755);
  return { installed: file };
}
