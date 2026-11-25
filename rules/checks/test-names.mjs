#!/usr/bin/env node
// Tests a branch adds are named `should ... when ...` (rules/test-naming.md). Only added lines count, so legacy names never fail it.
//   node rules/checks/test-names.mjs [--base <ref>] [--root <repo>]
// Compares the merge base of <ref> (default origin/main) with the working tree: commits, uncommitted edits and untracked files,
// so a run before commit sees new tests too (CI has a clean checkout, so it reads the commits). Prints one JSON line. Exit 0 ok, 1 bad names, 2 usage or git error.
// The same patterns as hooks/test-name-guard, so CI catches what that standalone hook would have caught.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const JS_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|(^|\/)__tests__\/.*\.(ts|tsx|js|jsx)$/;
export const PY_FILE = /(^|\/)(tests?|__tests__)\/.*\.py$|(^|\/)(test_[^/]*|[^/]*_test)\.py$/;
const JS_CASE = /^\+\s*(?:test|it)(?:\.(?:only|skip))?(?:\.each\(.*?\))?\(\s*(['"`])(.*?)\1/;
const PY_DEF = /^\+\s*(?:async\s+)?def\s+(test_\w*)\s*\(/;
export const JS_TITLE = /^should\s+\S.*\s+when\s+\S.*$/;
export const PY_NAME = /^test_should_[a-z0-9]+(?:_[a-z0-9]+)*_when_[a-z0-9]+(?:_[a-z0-9]+)*$/;

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
    diff = git('diff', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=AMR', mb);
    for (const file of git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(f => JS_FILE.test(f) || PY_FILE.test(f))) {
      const lines = readFileSync(join(root, file), 'utf8').split('\n');
      diff += `+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;
    }
  } catch {
    console.log(JSON.stringify({ ok: false, error: `cannot diff against ${base}: fetch it first (actions/checkout with fetch-depth: 0)` }));
    return 2;
  }
  const bad = badNames(diff);
  const fix = bad.map(b => `${b.file}:${b.line} "${b.name}": name it should <expected> when <state>`);
  console.log(JSON.stringify({ ok: !bad.length, base, bad: fix }));
  return bad.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
