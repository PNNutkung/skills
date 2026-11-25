#!/usr/bin/env node
// Time caps for the test suite in CI (rules/performance.md). Node 22+, no dependencies. Two parts in one file:
//   reporter  node --test --test-reporter=spec --test-reporter-destination=stdout \
//               --test-reporter=./rules/checks/test-time.mjs --test-reporter-destination=test-time.jsonl <files>
//             writes one JSON line per test file, {"file": <path from the cwd>, "ms": <the file's wall time>}, and one for the run, {"suite": <ms>}
//   check     node rules/checks/test-time.mjs test-time.jsonl
//             fails when a file took longer than CHECKS_TEST_FILE_SECONDS_MAX (default 30) or the run longer than CHECKS_TEST_SUITE_SECONDS_MAX
//             (default 120); `unlimited` turns a cap off. Warns (stderr, a GitHub annotation; the exit code does not change) for each file over
//             CHECKS_TEST_FILE_WARN_SECONDS_MAX (default 20, `unlimited` turns it off). Prints one JSON line. Exit 0 ok, 1 over a cap, 2 usage error,
//             no timings, or a flag value that is not valid.
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLAG = { file: 'CHECKS_TEST_FILE_SECONDS_MAX', suite: 'CHECKS_TEST_SUITE_SECONDS_MAX', fileWarn: 'CHECKS_TEST_FILE_WARN_SECONDS_MAX' };
export const DEFAULT_SECONDS = { file: 30, suite: 120, fileWarn: 20 };
export class FlagError extends Error {}

/** NAME_MAX: a whole number above 0, or unlimited (null); dflt when unset or empty. Anything else throws a FlagError naming the fix. */
function secondsMax(env, name, dflt) {
  const v = String(env?.[name] ?? '').trim();
  if (!v) return dflt;
  if (v.toLowerCase() === 'unlimited') return null;
  if (/^\d+$/.test(v) && Number(v) > 0) return Number(v);
  throw new FlagError(`${name}=${env[name]} is not valid: use a whole number of seconds above 0, or unlimited`);
}

/** -> { file, suite, fileWarn }: seconds, or null for no cap (no warning). */
export function readCaps(env = process.env) {
  return Object.fromEntries(Object.keys(FLAG).map(k => [k, secondsMax(env, FLAG[k], DEFAULT_SECONDS[k])]));
}

// The test runner reports each test file as a top-level test named after the file; its duration is the file's wall time.
const isFileEvent = d => d.nesting === 0 && typeof d.file === 'string' && typeof d.name === 'string' && (d.name === d.file || d.file.endsWith(sep + d.name));

/** The reporter (default export, the node:test custom reporter shape). */
export default async function* reporter(source) {
  for await (const e of source) {
    const d = e.data ?? {};
    if (e.type === 'test:complete' && isFileEvent(d)) yield `${JSON.stringify({ file: relative(process.cwd(), d.file), ms: Math.round(d.details?.duration_ms ?? 0) })}\n`;
    else if (e.type === 'test:diagnostic' && d.nesting === 0 && /^duration_ms [\d.]+$/.test(d.message ?? '')) yield `${JSON.stringify({ suite: Math.round(Number(d.message.split(' ')[1])) })}\n`;
  }
}

/** JSONL text -> { files: [{ file, ms }], suiteMs } (suiteMs null when the run line is missing). Throws on a line that is not JSON. */
export function parseTimings(text) {
  const files = [];
  let suiteMs = null;
  for (const [i, line] of String(text ?? '').split('\n').entries()) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { throw new Error(`line ${i + 1} is not JSON: ${line.slice(0, 80)}`); }
    if (typeof o.file === 'string' && Number.isFinite(o.ms)) files.push({ file: o.file, ms: o.ms });
    else if (Number.isFinite(o.suite)) suiteMs = o.suite;
  }
  return { files, suiteMs };
}

/** -> { ok, over: [{ file|suite, sec, max }], warn: [{ file, sec, max }] (files over caps.fileWarn; never fails), slowest: top 5 files, suiteSec } */
export function checkTimings({ files, suiteMs }, caps) {
  const sec = ms => Math.round(ms / 100) / 10;
  const over = [];
  for (const f of files) if (caps.file !== null && f.ms > caps.file * 1000) over.push({ file: f.file, sec: sec(f.ms), max: caps.file });
  if (suiteMs !== null && caps.suite !== null && suiteMs > caps.suite * 1000) over.push({ suite: true, sec: sec(suiteMs), max: caps.suite });
  const warn = caps.fileWarn === null ? [] : files.filter(f => f.ms > caps.fileWarn * 1000).map(f => ({ file: f.file, sec: sec(f.ms), max: caps.fileWarn }));
  const slowest = [...files].sort((a, b) => b.ms - a.ms).slice(0, 5).map(f => ({ file: f.file, sec: sec(f.ms) }));
  return { ok: over.length === 0, over, warn, slowest, suiteSec: suiteMs === null ? null : sec(suiteMs) };
}

/** One GitHub Actions warning annotation per warned file (shown in the CI UI). */
export const warnLines = (warn, caps) => warn.map(w => `::warning file=${w.file}::${w.file} took ${w.sec} s, over the warn level of ${w.max} s (${caps.file === null ? 'no cap' : `cap ${caps.file} s`})`);

/** The check CLI: argv after the script, env -> { code, out } */
export function main(argv, env = process.env) {
  if (argv.length !== 1 || argv[0].startsWith('-')) return { code: 2, out: { ok: false, error: 'usage: test-time.mjs <timings.jsonl> (written by this file as a node --test reporter)' } };
  let caps, timings;
  try { caps = readCaps(env); } catch (e) { return { code: 2, out: { ok: false, error: e.message } }; }
  try { timings = parseTimings(readFileSync(argv[0], 'utf8')); } catch (e) { return { code: 2, out: { ok: false, error: `cannot read ${argv[0]}: ${e.message}` } }; }
  if (!timings.files.length) return { code: 2, out: { ok: false, error: `no test file timings in ${argv[0]}: did the reporter run?` } };
  const r = checkTimings(timings, caps);
  return { code: r.ok ? 0 : 1, out: { ...r, caps } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { code, out } = main(process.argv.slice(2));
  for (const line of warnLines(out.warn ?? [], out.caps ?? {})) console.error(line);
  console.log(JSON.stringify(out));
  process.exitCode = code;
}
