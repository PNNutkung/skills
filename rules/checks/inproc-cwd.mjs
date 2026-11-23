#!/usr/bin/env node
// An in-process CLI entry, `export (async) function main(argv, { ..., cwd })`, must see its cwd the way a started process does: as a real path
// (macOS /var -> /private/var, rules/paths.md). So each such module
//   1. resolves the cwd it is given with realpathSync, in main itself or through a `realCwd` helper defined with realpathSync, and
//   2. has a test file beside it, marked `// cwd: linked`, that imports the module and makes a symlink (symlinkSync): a spawned-vs-in-process
//      test run through a linked folder, which fails on Linux too, not only on the macOS CI job.
//   node rules/checks/inproc-cwd.mjs [--root <repo>]
// Prints one JSON line. Exit 0 ok, 1 violations, 2 usage error. Node 22+, no dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER = /\/\/\s*cwd:\s*linked\b/;
const MAIN = /^export\s+(?:async\s+)?function\s+main\s*\(\s*[\w$]+\s*,\s*\{([^}]*)\}/m;
const REAL_CWD_DEF = /\bconst\s+realCwd\s*=[^\n]*\brealpathSync\(/;

/** The text of main: from its signature to the first line that closes it at the top level ("}" alone). null when there is no such main. */
export function mainBody(src) {
  const m = MAIN.exec(src);
  if (!m || !/\bcwd\b/.test(m[1])) return null;
  const rest = src.slice(m.index);
  const end = rest.search(/\n\}\s*(\n|$)/);
  return end < 0 ? rest : rest.slice(0, end + 2);
}

/** -> [problem] for one module; [] when it has no main(argv, { cwd }) or follows both rules. tests: [{ name, text }] beside it. */
export function checkModule(name, src, tests) {
  const body = mainBody(src);
  if (body === null) return [];
  const problems = [];
  const direct = /\brealpathSync\(/.test(body), helper = /\brealCwd\(/.test(body);
  if (!direct && !helper) problems.push(`${name}: main(argv, { cwd }) does not resolve cwd with realpathSync (or a realCwd helper); a started process sees a real path`);
  else if (!direct && !REAL_CWD_DEF.test(src)) problems.push(`${name}: main calls realCwd, but realCwd is not defined with realpathSync in the file`);
  const imports = new RegExp(`from\\s+['"]\\./${basename(name).replace(/[.]/g, '\\.')}['"]`);
  const linked = tests.filter(t => MARKER.test(t.text) && imports.test(t.text) && /\bsymlinkSync\(/.test(t.text));
  if (!linked.length) problems.push(`${name}: no test file beside it is marked \`// cwd: linked\`, imports ./${basename(name)} and makes a symlink (rules/paths.md)`);
  return problems;
}

/** modules: [{ path, text }]; testsByDir: { dir: [{ name, text }] } -> { ok, checked, violations } */
export function checkRepo(modules, testsByDir) {
  const violations = [], checked = [];
  for (const m of modules) {
    if (mainBody(m.text) === null) continue;
    checked.push(m.path);
    violations.push(...checkModule(m.path, m.text, testsByDir[dirname(m.path)] ?? []));
  }
  return { ok: !violations.length, checked, violations };
}

export function loadRepo(root) {
  const files = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', 'skills', 'hooks'], { encoding: 'utf8' }).split('\0').filter(f => f.endsWith('.mjs'));
  const read = f => readFileSync(join(root, f), 'utf8');
  const modules = files.filter(f => !f.endsWith('.test.mjs') && existsSync(join(root, f))).map(path => ({ path, text: read(path) }));
  const testsByDir = {};
  for (const f of files.filter(f => f.endsWith('.test.mjs') && existsSync(join(root, f)))) (testsByDir[dirname(f)] ??= []).push({ name: basename(f), text: read(f) });
  return { modules, testsByDir };
}

function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--root' && argv[k + 1]) root = resolve(argv[++k]);
    else { console.log(JSON.stringify({ ok: false, error: `usage: inproc-cwd.mjs [--root <repo>] (got ${argv[k]})` })); return 2; }
  }
  let repo;
  try { repo = loadRepo(root); } catch (e) { console.log(JSON.stringify({ ok: false, error: `cannot list ${root}: ${e.message.split('\n')[0]}` })); return 2; }
  const r = checkRepo(repo.modules, repo.testsByDir);
  console.log(JSON.stringify(r));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
