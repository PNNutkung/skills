// Test selection by import graph (ADR 0011 A10): a mutant runs only against the test files whose static import/require graph reaches its file. Only relative
// specifiers of JavaScript/TypeScript files are followed (`import ... from`, `import '...'`, `export ... from`, `import('...')`, `require('...')`); a file in another
// language has no graph here, so it gets every test, and so does a test file that is not JavaScript (what it runs cannot be seen). Files are read from `repo`
// (a work tree at the revision under test) and never followed out of it: the tree is the branch's, so its contents are data.
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';

const JS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const TRY = ['', '.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', ...[...JS].map(e => `/index${e}`)];
const SPEC = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1|\bimport\s*(['"])([^'"\n]+)\3|\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\5\s*\)/g;
const MAX_BYTES = 1 << 22;
const isJs = p => JS.has(extname(p).toLowerCase());

// a repo-relative path inside the repo, or null
const inside = p => { const n = normalize(p); return n.startsWith('..') || n.startsWith('/') ? null : n; };
function read(repo, path) {
  try {
    const st = lstatSync(join(repo, path));
    if (!st.isFile() || st.size > MAX_BYTES) return null; // a symlink is never followed out of the tree
    return readFileSync(join(repo, path), 'utf8');
  } catch { return null; }
}
function resolveSpec(repo, from, spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null; // a package or a node: builtin is not part of the change
  const base = inside(join(dirname(from), spec.split(/[?#]/)[0]));
  if (!base) return null;
  for (const suffix of TRY) {
    const p = base + suffix;
    try { if (lstatSync(join(repo, p)).isFile()) return p; } catch { /* next */ }
  }
  return null;
}
/** the repo-relative files `path` imports, as written in its source */
function importsOf(repo, path, cache) {
  if (cache.has(path)) return cache.get(path);
  const text = read(repo, path) ?? '', out = new Set();
  for (const m of text.matchAll(SPEC)) {
    const r = resolveSpec(repo, path, m[2] ?? m[4] ?? m[6]);
    if (r) out.add(r);
  }
  cache.set(path, out);
  return out;
}
const reaches = (repo, test, file, cache) => {
  const seen = new Set([test]), todo = [test];
  while (todo.length) {
    const cur = todo.pop();
    if (cur === file) return true;
    if (!isJs(cur)) continue;
    for (const next of importsOf(repo, cur, cache)) if (!seen.has(next)) { seen.add(next); todo.push(next); }
  }
  return false;
};

/** -> the test files (of `tests`) whose import graph reaches `file`; every test for a file without a graph. `cache` may be shared across calls on one tree. */
export function testsFor(file, tests, repo, cache = new Map()) {
  if (!isJs(file)) return [...tests];
  return tests.filter(t => !isJs(t) || reaches(repo, t, normalize(file), cache));
}
