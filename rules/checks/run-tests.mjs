#!/usr/bin/env node
// Runs the test suite the way CI does (rules/performance.md). Node 22+, no dependencies.
//   node rules/checks/run-tests.mjs [node --test options] [test files]
//     lists `git ls-files '*.test.mjs'` (or the files given), starts the slowest first by rules/checks/test-times.json (files missing from it
//     first: a new file's time is unknown) and runs `node --test --test-concurrency=<N>` with every other argument passed through. N is
//     CHECKS_TEST_CONCURRENCY_MAX, or cores + 1 (os.availableParallelism()); a --test-concurrency you pass wins. Exits with node's exit code;
//     2 for a flag value that is not valid. Give an option's value after `=` or a space; a bare word that is not an option's value is a file.
//   node rules/checks/run-tests.mjs --write-times test-time.jsonl
//     rewrites test-times.json from what the test-time.mjs reporter wrote: new times win, files no longer tracked drop out.
//   --times <file> reads (or writes) another timings file; --dry-run prints the node command as JSON instead of running it.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTimings } from './test-time.mjs';

export const CONCURRENCY_FLAG = 'CHECKS_TEST_CONCURRENCY_MAX';
export const TIMES_FILE = join(dirname(fileURLToPath(import.meta.url)), 'test-times.json');
export class FlagError extends Error {}

// Files wait on child processes much of the time, so one more file than cores keeps the CPU busy; more only slows each file (rules/performance.md).
export const defaultConcurrency = cores => Math.max(1, cores) + 1;

/** CHECKS_TEST_CONCURRENCY_MAX: a whole number above 0; the cores-based default when unset or empty. Anything else throws a FlagError. */
export function chooseConcurrency(env = process.env, cores = availableParallelism()) {
  const v = String(env?.[CONCURRENCY_FLAG] ?? '').trim();
  if (!v) return defaultConcurrency(cores);
  if (/^\d+$/.test(v) && Number(v) > 0) return Number(v);
  throw new FlagError(`${CONCURRENCY_FLAG}=${env[CONCURRENCY_FLAG]} is not valid: use a whole number above 0`);
}

/** Files missing from times first (in the listed order), then slowest first; equal times keep the listed order. key maps a file to its times key. */
export function orderFiles(files, times, key = f => f) {
  const ms = f => times[key(f)];
  const unknown = files.filter(f => !Number.isFinite(ms(f)));
  const known = files.filter(f => Number.isFinite(ms(f))).map((f, i) => [f, i]).sort((a, b) => ms(b[0]) - ms(a[0]) || a[1] - b[1]).map(([f]) => f);
  return [...unknown, ...known];
}

// node options that take their value as the next argument when it is not given after `=`
const VALUE_OPTS = new Set(['--test-reporter', '--test-reporter-destination', '--test-name-pattern', '--test-skip-pattern', '--test-concurrency', '--test-timeout',
  '--test-shard', '--test-coverage-include', '--test-coverage-exclude', '--test-coverage-branches', '--test-coverage-functions', '--test-coverage-lines',
  '--test-global-setup', '--test-isolation', '--import', '--require', '-r', '--loader', '--experimental-loader', '--env-file', '--conditions', '-C', '--input-type']);

/** argv -> { files, pass (node options, in order), writeTimes, times, dryRun }. Throws when an option of its own has no value. */
export function parseArgs(argv) {
  const out = { files: [], pass: [], writeTimes: null, times: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const own = a.match(/^--(write-times|times)(?:=(.*))?$/);
    if (own) {
      const v = own[2] ?? argv[++i];
      if (!v) throw new Error(`--${own[1]} needs a file`);
      out[own[1] === 'times' ? 'times' : 'writeTimes'] = v;
    } else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('-')) {
      out.pass.push(a);
      if (VALUE_OPTS.has(a) && i + 1 < argv.length) out.pass.push(argv[++i]);
    } else out.files.push(a);
  }
  return out;
}

/** The arguments for node: --test, the concurrency (unless pass sets one), the passed options, then the files. */
export function nodeArgs({ files, pass, concurrency }) {
  const own = pass.some(a => a === '--test-concurrency' || a.startsWith('--test-concurrency=')) ? [] : [`--test-concurrency=${concurrency}`];
  return ['--test', ...own, ...pass, ...files];
}

/** New times win over old ones; only tracked files stay; ms rounded. */
export function mergeTimes(old, rows, tracked) {
  const keep = new Set(tracked), out = {};
  for (const [f, ms] of Object.entries(old ?? {})) if (keep.has(f)) out[f] = Math.round(ms);
  for (const { file, ms } of rows) if (keep.has(file)) out[file] = Math.round(ms);
  return out;
}

/** Sorted keys, rounded ms, two-space JSON and a final newline, so a refresh diffs only the times that moved. */
export const renderTimes = times => `${JSON.stringify(Object.fromEntries(Object.keys(times).sort().map(f => [f, Math.round(times[f])])), null, 2)}\n`;

const gitLines = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : null;
};
const readTimes = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };

function run(argv, env = process.env, cwd = process.cwd()) {
  let o, concurrency;
  try { o = parseArgs(argv); concurrency = chooseConcurrency(env); } catch (e) { return { code: 2, error: e.message }; }
  const timesFile = o.times ? resolve(cwd, o.times) : TIMES_FILE;
  const root = gitLines(cwd, 'rev-parse', '--show-toplevel')?.[0] ?? cwd;
  // times keys are repo-root paths with / so CI and every OS share one file; the test-time reporter writes paths from the cwd
  const key = f => relative(root, resolve(cwd, f)).split(sep).join('/');
  if (o.writeTimes) {
    let rows;
    try { rows = parseTimings(readFileSync(resolve(cwd, o.writeTimes), 'utf8')).files; } catch (e) { return { code: 2, error: `cannot read ${o.writeTimes}: ${e.message}` }; }
    if (!rows.length) return { code: 2, error: `no test file timings in ${o.writeTimes}: run the suite with --test-reporter=./rules/checks/test-time.mjs first` };
    const tracked = gitLines(root, 'ls-files', '*.test.mjs') ?? [];
    const times = mergeTimes(readTimes(timesFile), rows.map(r => ({ file: key(r.file), ms: r.ms })), tracked);
    writeFileSync(timesFile, renderTimes(times));
    return { code: 0, print: JSON.stringify({ ok: true, wrote: relative(cwd, timesFile), files: Object.keys(times).length }) };
  }
  const listed = o.files.length ? o.files : gitLines(cwd, 'ls-files', '*.test.mjs');
  if (!listed) return { code: 2, error: 'git ls-files failed: run inside the repo, or name the test files' };
  const args = nodeArgs({ files: orderFiles(listed, readTimes(timesFile), key), pass: o.pass, concurrency });
  if (o.dryRun) return { code: 0, print: JSON.stringify({ cores: availableParallelism(), concurrency, args }) };
  return { args };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = run(process.argv.slice(2));
  if (r.error) console.error(r.error);
  if (r.print) console.log(r.print);
  if (!r.args) process.exitCode = r.code;
  else {
    const child = spawn(process.execPath, r.args, { stdio: 'inherit' });
    // Ctrl-C reaches the child through the terminal's process group: wait for its exit code; forward what is sent to this process alone
    process.on('SIGINT', () => {});
    for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
    child.on('error', e => { console.error(e.message); process.exitCode = 1; });
    child.on('close', (code, signal) => { process.exitCode = code ?? 128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1, SIGKILL: 9 }[signal] ?? 0); });
  }
}
