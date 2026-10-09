#!/usr/bin/env node
// Real-execution probe for zero-trust-review: runs the CHANGED test files for real so a review states facts, not guesses.
//   (a) pass-after: each file on the HEAD tree; (b) fail-before: the same HEAD file on a tree whose changed non-test source is restored
//   to BASE (still passing there = verdict no-signal); (c) flake: N extra concurrent HEAD runs (differing exit codes = nondeterministic).
// Every test command is untrusted code and runs ONLY through the sandbox runner (exit 86 = no sandbox, 124 = timeout). REPO is only read.
//   node testprobe.mjs --repo DIR --base REV --head REV --scratch DIR --cmd 'pytest -q {file}' [--tests a,b] [--flake 3] [--jobs 4]
//     [--timeout 120] [--link NAME]... [--ro DIR]... [--env K=V]... [--runner PATH]   (--ro: extra read-only dirs, e.g. the interpreter install behind a venv)
// Prints one JSON object and exits 0 (results are data); usage errors exit 2.
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { NO_SANDBOX, TEST, TIMEOUT, DOC, backendOf, changes, clear, editableRoots, extract, intOption, isSource, parseProbeArgs, pool, restore, runIn, shq } from './probelib.mjs';

const MAX_LINES = 6;

function parse() {
  const { values, ...common } = parseProbeArgs({ flake: { type: 'string', default: '3' }, src: { type: 'string', default: '' } });
  return { ...common, flake: intOption(values, 'flake', 0), src: new Set(values.src.split(',').filter(Boolean)) }; // --src: files the caller declares as source whatever their name (a config file the tests need)
}

const run = (o, copy, file) => runIn(o, copy, o.cmd.replaceAll('{file}', () => shq(file)));

function judge(h, b, noSource) {
  if (h === NO_SANDBOX || b === NO_SANDBOX) return ['unverifiable', 'no sandbox'];
  if (h === TIMEOUT) return ['unverifiable', 'timeout'];
  if (h !== 0) return ['fails-on-head'];
  if (b === TIMEOUT) return ['unverifiable', 'timeout'];
  if (b !== 0) return ['exercises-change'];
  return ['no-signal', noSource ? 'no changed source files' : undefined];
}

async function probeOne(o, dirs, file) {
  const [head, base, ...flakes] = await Promise.all([run(o, dirs.head, file), run(o, dirs.base, file), ...Array.from({ length: o.flake }, () => run(o, dirs.head, file))]);
  const [verdict, reason] = judge(head.exit, base.exit, o.noSource), exits = flakes.map(r => r.exit);
  const slim = ({ exit, sec }) => ({ exit, sec });
  return { file, head: slim(head), base: slim(base), verdict, ...(reason && { reason }), ...(verdict === 'fails-on-head' && { tail: head.tail }),
    flake: { runs: o.flake, exits, nondeterministic: new Set([head.exit, ...exits]).size > 1 } };
}

function summarize(tests) {
  if (!tests.length) return 'no changed test files';
  const n = {};
  for (const t of tests) n[t.verdict] = (n[t.verdict] ?? 0) + 1;
  const lines = [`${tests.length} test file(s): ${Object.entries(n).map(([k, c]) => `${c} ${k}`).join(', ')}`];
  if (tests.some(t => t.reason === 'no sandbox')) lines.push('no sandbox available: tests were not run');
  for (const t of tests) {
    const flaky = t.flake.nondeterministic;
    if (t.reason === 'no sandbox' || (t.verdict === 'exercises-change' && !flaky)) continue;
    lines.push(`${t.file}: ${t.verdict}${t.reason ? ` (${t.reason})` : ''}${flaky ? `, nondeterministic (exits ${t.flake.exits})` : ''}`);
  }
  return (lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), `+${lines.length - MAX_LINES + 1} more`] : lines).join('\n');
}

async function main() {
  const o = parse();
  const changed = changes(o.repo, o.base, o.head), sources = changed.filter(c => isSource(c.path) || o.src.has(c.path));
  const files = o.tests ?? changed.filter(c => c.status !== 'D' && TEST.test(c.path) && !DOC.test(c.path)).map(c => c.path);
  let backend = backendOf(o.runner), tests = [];
  if (files.length) {
    mkdirSync(o.scratch, { recursive: true });
    const scratch = realpathSync(o.scratch);
    const dirs = { head: mkdtempSync(join(scratch, 'head-')), base: mkdtempSync(join(scratch, 'base-')) };
    const linked = o.link.map(name => realpathSync(join(o.repo, name)));
    o.ro = [...linked, ...editableRoots(linked, o.repo), ...o.extraRo];  // linked dirs first: the symlink loop below indexes them
    await Promise.all([extract(o.repo, o.head, dirs.head), extract(o.repo, o.head, dirs.base)]);
    restore(o.repo, dirs.base, sources);
    o.link.forEach((name, i) => { for (const d of Object.values(dirs)) { clear(d, name); symlinkSync(o.ro[i], join(d, name)); } });
    o.noSource = !sources.length;
    tests = await pool(files, o.jobs, f => probeOne(o, dirs, f));
  }
  if (tests.some(t => t.head.exit === NO_SANDBOX || t.base.exit === NO_SANDBOX)) backend = 'none';
  process.stdout.write(JSON.stringify({ backend, tests, summary: summarize(tests) }) + '\n');
}

main().catch(e => { console.error(`testprobe: ${e.message}`); process.exit(2); });
