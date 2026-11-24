#!/usr/bin/env node
// NoLoss check (ADR 0003): the names of the tests some files hold, read from a TAP run, and a comparison with an earlier list.
//   node test-names.mjs list <file.test.mjs>...            run them (node --test, TAP) and print one test name per line, sorted
//   node test-names.mjs list --tap <run.tap>               the same names, read from a saved TAP output
//   node test-names.mjs compare <before.txt> <after.txt>   every name of before must be in after, and after must hold at least as many: exit 1 with the lost names otherwise
// Only top-level tests count (a subtest is part of its test). A name is kept raw, so a moved test must keep its exact name.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** TAP text -> the names of its top-level tests (`ok N - name` / `not ok N - name`, no indent), in order */
export function tapNames(tap) {
  return tap.split('\n').map(l => /^(?:not )?ok \d+ - (.*?)(?: # (?:SKIP|TODO)\b.*)?$/.exec(l)).filter(Boolean).map(m => m[1].replace(/\\#/g, '#').replace(/\\\\/g, '\\'));
}

/** -> { lost: names of before missing from after, before, after: counts, ok } */
export function compareNames(before, after) {
  const have = new Set(after), lost = [...new Set(before)].filter(n => !have.has(n));
  return { lost, before: before.length, after: after.length, ok: lost.length === 0 && after.length >= before.length };
}

const lines = f => readFileSync(f, 'utf8').split('\n').filter(Boolean);

function cli(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'list') {
    let tap;
    if (rest[0] === '--tap') tap = readFileSync(rest[1], 'utf8');
    else {
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...rest], { encoding: 'utf8', maxBuffer: 1 << 28 });
      tap = r.stdout;
    }
    process.stdout.write(`${tapNames(tap).sort().join('\n')}\n`);
    return 0;
  }
  if (cmd === 'compare' && rest.length === 2) {
    const r = compareNames(lines(rest[0]), lines(rest[1]));
    process.stdout.write(`before ${r.before}, after ${r.after}, lost ${r.lost.length}\n${r.lost.map(n => `  lost: ${n}\n`).join('')}`);
    return r.ok ? 0 : 1;
  }
  process.stderr.write('usage: test-names.mjs list <files...> | list --tap <file> | compare <before.txt> <after.txt>\n');
  return 2;
}

const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) process.exitCode = cli(process.argv.slice(2));
