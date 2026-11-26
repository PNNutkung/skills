// IO for verify: the repo, the ADR finder, the run folder and the session marker. Copied from dev-workflow's io.mjs on purpose (ADR 0009 A9).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const FILES = { state: 'state.json', plan: 'plan.json', answers: 'answers.md', claims: 'claims.json' };
const ADR_DIRS = ['docs/adr', 'docs/decisions', 'doc/adr', 'adr'];

export const readOr = (p, d = '') => { try { return readFileSync(p, 'utf8'); } catch { return d; } };
export const real = p => { try { return realpathSync(p); } catch { return resolve(p); } };

/** The repo root above dir (a .git folder or file), or null. */
export function repoRoot(dir) {
  let d = real(dir);
  for (;;) {
    if (existsSync(join(d, '.git'))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** The ADR whose front matter says `dod: <slug>`, or null. */
export function findAdr(root, slug) {
  const custom = readOr(join(root, '.adr-dir')).trim();
  for (const d of [...(custom ? [custom] : []), ...ADR_DIRS]) {
    let names = [];
    try { names = readdirSync(join(root, d)); } catch { continue; }
    for (const n of names.filter(x => /^\d{4}-.*\.md$/.test(x)).sort()) {
      const text = readOr(join(root, d, n));
      if (new RegExp(`^dod:\\s*${slug}\\s*$`, 'm').test(text.split(/^---\s*$/m)[1] ?? '')) return { path: join(root, d, n), text };
    }
  }
  return null;
}

export const verifyPath = (root, slug) => join(root, 'docs', 'verify', `${slug}.md`);

export function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function writePrivateJson(p, obj) {
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 });
}

export function writeText(p, text) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

export const removeFile = p => rmSync(p, { force: true });

export function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
