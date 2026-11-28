#!/usr/bin/env node
// The mutation engine from a shell (ADR 0011): prints the Result of runMutation as one JSON document and exits 0, even when the score fails (a result is data).
// A usage error exits 2 with the message on stderr and nothing on stdout; any other error exits 1. Progress goes to stderr: `mutation: DONE/TOTAL RESULT FILE:LINE`. Without --scratch the engine uses a temp folder of its own.
//   node cli.mjs --repo . --base REV --head REV --cmd 'node --test {file}' --runner PATH [--tests a,b] [--files a.py:10-40,b.py] [--max N|unlimited]
//     [--budget SEC|none] [--jobs N] [--timeout SEC] [--score-min N] [--select imports|all] [--equivalent FILE] [--reuse FILE]... [--kill-exits 1,2]
//     [--link NAME]... [--ro DIR]... [--env K=V]... [--scratch DIR]
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { UsageError, runMutation } from './engine.mjs';

const str = { type: 'string' }, many = { type: 'string', multiple: true, default: [] };
const OPTIONS = { repo: str, base: str, head: str, cmd: str, runner: str, tests: str, files: str, max: str, budget: str, jobs: str, timeout: str, 'score-min': str, select: str,
  equivalent: str, reuse: many, 'kill-exits': str, link: many, ro: many, env: many, scratch: str };
// a whole number stays a number for the engine to check; a word ("unlimited", "none") stays a word; anything else reaches the engine as given and is refused there
const num = v => (v === undefined ? undefined : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

/** argv -> runMutation options; throws UsageError */
export function optionsOf(argv, cwd = process.cwd()) {
  let values;
  try { ({ values } = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false })); } catch (e) { throw new UsageError(e.message); }
  const abs = p => (p === undefined ? undefined : resolve(cwd, p));
  for (const k of ['repo', 'cmd', 'runner']) if (!values[k]) throw new UsageError(`--${k} is required`);
  return { repo: abs(values.repo), base: values.base, head: values.head, cmd: values.cmd, runner: abs(values.runner), files: values.files,
    tests: values.tests?.split(',').filter(Boolean), max: num(values.max), budget: num(values.budget), jobs: num(values.jobs), timeout: num(values.timeout),
    scoreMin: num(values['score-min']), select: values.select, equivalent: abs(values.equivalent), reuse: values.reuse.map(abs),
    killExits: values['kill-exits']?.split(',').map(Number), link: values.link, ro: values.ro.map(abs), env: values.env, scratch: abs(values.scratch) };
}

// -> { code, stdout, stderr }
async function main(argv) {
  try {
    // progress on stderr, one line per mutant, as each verdict arrives: stdout stays one JSON document
    const onProgress = ({ done, total, mutant: m }) => process.stderr.write(`mutation: ${done}/${total} ${m.result} ${m.file}:${m.line}\n`);
    const r = await runMutation({ ...optionsOf(argv), onProgress });
    return { code: 0, stdout: `${JSON.stringify(r)}\n`, stderr: '' };
  } catch (e) {
    return { code: e instanceof UsageError ? 2 : 1, stdout: '', stderr: `mutation: ${e.message}\n` };
  }
}

const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) {
  main(process.argv.slice(2)).then(r => {
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    process.exitCode = r.code;
  });
}
