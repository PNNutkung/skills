#!/usr/bin/env node
// A hook's "am I the script node started?" check must compare real paths: on macOS a temp path is /var/... in process.argv[1] but
// /private/var/... in import.meta.url, and a plugin folder can sit behind a symlink. A plain compare is then false and the hook silently
// does nothing (rules/paths.md; the reply-style hook failed this way on macOS CI, ADR 0010). So every line in hooks/*.mjs that compares
// process.argv[1] with import.meta.url must call realpathSync on both: realpathSync(process.argv[1]) and realpathSync(fileURLToPath(import.meta.url)).
//   node rules/checks/main-realpath.mjs [--root <repo>]
// Prints one JSON line. Exit 0 ok, 1 violations, 2 usage error. Node 22+, no dependencies.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGV1 = /process\.argv\[1\]/;
const META = /import\.meta\.url/;
const REAL_ARGV1 = /realpathSync\(\s*process\.argv\[1\]\s*\)/;
const REAL_META = /realpathSync\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/;

/** Violations in one file: each line that compares process.argv[1] with import.meta.url without realpathSync on both. */
export function checkFile(name, src) {
  return src.split('\n').flatMap((line, i) =>
    ARGV1.test(line) && META.test(line) && !(REAL_ARGV1.test(line) && REAL_META.test(line))
      ? [`${name}:${i + 1}: compare process.argv[1] and import.meta.url with realpathSync on both sides (rules/paths.md)`]
      : []);
}

export function checkRepo(root) {
  const dir = join(root, 'hooks');
  const files = readdirSync(dir).filter(n => n.endsWith('.mjs') && !n.endsWith('.test.mjs')).sort();
  const violations = files.flatMap(n => checkFile(`hooks/${n}`, readFileSync(join(dir, n), 'utf8')));
  return { ok: !violations.length, files: files.length, violations };
}

function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--root' && argv[k + 1]) root = resolve(argv[++k]);
    else { console.log(JSON.stringify({ ok: false, error: `usage: main-realpath.mjs [--root <repo>] (got ${argv[k]})` })); return 2; }
  }
  if (!existsSync(join(root, 'hooks'))) { console.log(JSON.stringify({ ok: false, error: `no hooks/ folder in ${root}` })); return 2; }
  const r = checkRepo(root);
  console.log(JSON.stringify(r));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
