#!/usr/bin/env node
// Tests a branch adds are named `should ... when ...` (rules/test-naming.md). Only added lines count, so legacy names never fail it.
//   node rules/checks/test-names.mjs [--base <ref>] [--root <repo>]
// Compares the merge base of <ref> (default origin/main) with the working tree: commits, uncommitted edits and untracked files,
// so a run before commit sees new tests too (CI has a clean checkout, so it reads the commits). Prints one JSON line. Exit 0 ok, 1 bad names or a removed test
// missing from rules/checks/test-merges.json, 2 usage, git or map file error.
// The same patterns as hooks/test-name-guard, so CI catches what that standalone hook would have caught.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const JS_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|(^|\/)__tests__\/.*\.(ts|tsx|js|jsx)$/;
export const PY_FILE = /(^|\/)(tests?|__tests__)\/.*\.py$|(^|\/)(test_[^/]*|[^/]*_test)\.py$/;
const JS_CASE = /^\+\s*(?:test|it)(?:\.(?:only|skip))?(?:\.each\(.*?\))?\(\s*(['"`])(.*?)\1/;
const PY_DEF = /^\+\s*(?:async\s+)?def\s+(test_\w*)\s*\(/;
export const JS_TITLE = /^should\s+\S.*\s+when\s+\S.*$/;
export const MERGES = 'rules/checks/test-merges.json';
export const PY_NAME =/^test_should_[a-z0-9]+(?:_[a-z0-9]+)*_when_[a-z0-9]+(?:_[a-z0-9]+)*$/;

// The added tests in a unified diff whose names break the rule: [{ file, line, name }].
export function badNames(diff) {
  const out = [];
  let file = null, line = 0;
  for (const raw of diff.split('\n')) {
    const f = /^\+\+\+ (?:b\/)?(.*)$/.exec(raw);
    if (f) { file = f[1] === '/dev/null' ? null : f[1]; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (h) { line = Number(h[1]); continue; }
    if (!file || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) {
      const js = JS_FILE.test(file) && JS_CASE.exec(raw);
      const py = PY_FILE.test(file) && PY_DEF.exec(raw);
      if (js && !JS_TITLE.test(js[2])) out.push({ file, line, name: js[2] });
      if (py && !PY_NAME.test(py[1])) out.push({ file, line, name: py[1] });
      line++;
    } else if (!raw.startsWith('-')) line++;
  }
  return out;
}

// ADR 0008 A8: a branch may drop a test only when its assertions moved into another one, listed in rules/checks/test-merges.json as
// { "<file>::<old name>": "<file>::<new name>" }. A removed test: a deleted `test(`/`it(`/`def test_` line whose name the diff adds nowhere (a move or an edited line is no removal).
const JS_ANY = /^[-+]\s*(?:test|it)(?:\.(?:only|skip))?(?:\.each\(.*?\))?\(\s*(['"`])(.*?)\1/;
const PY_ANY = /^[-+]\s*(?:async\s+)?def\s+(test_\w*)\s*\(/;
const caseName = (file, raw) => (JS_FILE.test(file) && JS_ANY.exec(raw)?.[2]) || (PY_FILE.test(file) && PY_ANY.exec(raw)?.[1]) || null;

/** The tests a unified diff removes: [{ file, name }]. A name the diff adds again in any test file is a move or an edit, not a removal. */
export function removedTests(diff) {
  const gone = [], added = new Set();
  let from = null, to = null;
  for (const raw of diff.split('\n')) {
    const a = /^--- (?:a\/)?(.*)$/.exec(raw);
    if (a) { from = a[1] === '/dev/null' ? null : a[1]; continue; }
    const b = /^\+\+\+ (?:b\/)?(.*)$/.exec(raw);
    if (b) { to = b[1] === '/dev/null' ? null : b[1]; continue; }
    if (raw.startsWith('-') && from) { const n = caseName(from, raw); if (n) gone.push({ file: from, name: n }); }
    if (raw.startsWith('+') && to) { const n = caseName(to, raw); if (n) added.add(n); }
  }
  return gone.filter(g => !added.has(g.name));
}

/** The removed tests the merge map does not account for. exists(file, name) -> whether the target test is there (the CLI reads the working tree). */
export const unmapped = (removed, merges, exists = () => true) => removed.filter(r => {
  const to = merges[`${r.file}::${r.name}`];
  if (typeof to !== 'string' || !to.includes('::')) return true;
  const cut = to.indexOf('::');
  return !exists(to.slice(0, cut), to.slice(cut + 2));
});

function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let base = 'origin/main';
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--base' && argv[k + 1]) base = argv[++k];
    else if (argv[k] === '--root' && argv[k + 1]) root = resolve(argv[++k]);
    else { console.log(JSON.stringify({ ok: false, error: `usage: test-names.mjs [--base <ref>] [--root <repo>] (got ${argv[k]})` })); return 2; }
  }
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  let diff;
  try {
    const mb = git('merge-base', base, 'HEAD').trim();
    diff = git('diff', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=AMRD', mb);
    for (const file of git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(f => JS_FILE.test(f) || PY_FILE.test(f))) {
      const lines = readFileSync(join(root, file), 'utf8').split('\n');
      diff += `+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;
    }
  } catch {
    console.log(JSON.stringify({ ok: false, error: `cannot diff against ${base}: fetch it first (actions/checkout with fetch-depth: 0)` }));
    return 2;
  }
  let merges = {};
  const mapFile = join(root, MERGES);
  if (existsSync(mapFile)) {
    try { merges = JSON.parse(readFileSync(mapFile, 'utf8')); } catch { merges = null; }
    if (!merges || typeof merges !== 'object' || Array.isArray(merges)) { console.log(JSON.stringify({ ok: false, error: `${MERGES} is not a JSON object of "<file>::<old name>": "<file>::<new name>"` })); return 2; }
  }
  const bad = badNames(diff), removed = removedTests(diff);
  const exists = (file, name) => { try { return readFileSync(join(root, file), 'utf8').includes(name); } catch { return false; } };
  const lost = unmapped(removed, merges, exists);
  const fix = bad.map(b => `${b.file}:${b.line} "${b.name}": name it should <expected> when <state>`);
  const out = { ok: !bad.length && !lost.length, base, bad: fix };
  if (lost.length) out.unmapped = lost.map(r => `${r.file}::${r.name}: a removed test; list it in ${MERGES} with the "<file>::<name>" of the test that holds its assertions now`);
  const merged = removed.filter(r => !lost.includes(r));
  if (merged.length) out.merged = merged.map(r => `${r.file}::${r.name}`);
  console.log(JSON.stringify(out));
  return out.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
