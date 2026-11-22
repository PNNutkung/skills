#!/usr/bin/env node
// The retro CLI. Every command prints one JSON line on stdout.
//   collect       [--repo .] [--pr <n> | --base <ref> | --since 7d] [--session <id>...] [--lang th|en]   facts -> <run>/collect.json
//   check         --run <run>        verify each finding's evidence (passed, not-passed, no-evidence), check proposals, write report.md
//   applied-check --run <run>        every file changed since collect is named by an approved proposal (answers.md)
//   log           --run <run>        append one line to docs/retro/log.md
// Exit: 0 ok, 1 the check did not pass (a bad proposal, an unapproved change), 2 usage error or a flag that is not valid.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appliedCheck, checkProposals, parseApprovals } from './approvals.mjs';
import { collect } from './collect.mjs';
import { verifyAll } from './evidence.mjs';
import { FlagError, readFlags } from './flags.mjs';
import { readBaseline, topLevel } from './ratchet-io.mjs';
import { LOG_FILE, appendLog, renderReport } from './report.mjs';

const COMMANDS = ['collect', 'check', 'applied-check', 'log'];
const SELF = realpathSync(fileURLToPath(import.meta.url));
const VALUE_OPTS = ['repo', 'pr', 'base', 'since', 'session', 'lang', 'run'];
class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { session: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].startsWith('--') ? argv[i].slice(2) : null;
    if (!key || !VALUE_OPTS.includes(key)) throw new UsageError(`unknown option ${argv[i]}`);
    const v = argv[++i];
    if (v === undefined) throw new UsageError(`--${key} needs a value`);
    if (key === 'session') opts.session.push(v); else opts[key] = v;
  }
  return opts;
}

const readJson = (file, what) => {
  if (!existsSync(file)) throw new UsageError(`${what} not found: ${file}`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`${what} is not JSON: ${e.message}`); }
};
const readText = p => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
function runFolder(opts) {
  if (!opts.run || !isAbsolute(opts.run)) throw new UsageError('--run needs the absolute run folder that collect printed');
  const collected = readJson(join(opts.run, 'collect.json'), 'collect.json');
  return { run: opts.run, collected };
}
function metricAt(obj, path) {
  let v = obj;
  for (const k of path.split('.')) { if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) return undefined; v = v[k]; }
  return v === null || typeof v === 'object' ? undefined : v;
}
const gitOut = (repo, args) => { try { return execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; } };

function check(opts) {
  const { run, collected } = runFolder(opts);
  const repo = collected.repo;
  const findings = readJson(join(run, 'findings.json'), 'findings.json');
  const proposals = existsSync(join(run, 'proposals.json')) ? readJson(join(run, 'proposals.json'), 'proposals.json') : [];
  const sessionPaths = new Set((collected.sessions ?? []).map(s => s.path));
  const ctx = {
    readFile: p => readText(join(repo, p)),
    transcriptLine: (p, n) => (sessionPaths.has(p) ? (readText(p) ?? '').split('\n')[n - 1] ?? null : null),
    commit: sha => gitOut(repo, ['show', '--stat', '--format=%H%n%B', sha]),
    runFile: name => readText(join(run, name)),
    metric: key => metricAt(collected, key),
  };
  const { findings: verified, counts } = verifyAll(findings, ctx);
  const errors = checkProposals(proposals, verified);
  writeFileSync(join(run, 'verified.json'), `${JSON.stringify(verified, null, 1)}\n`);
  writeFileSync(join(run, 'report.md'), renderReport({ work: collected.work?.label ?? '', findings: verified, proposals: errors.length ? [] : proposals, lang: collected.lang }));
  return { code: errors.length ? 1 : 0, out: { ok: !errors.length, counts, errors, report: join(run, 'report.md') } };
}

function changedSince(repo, ref) {
  const tracked = (gitOut(repo, ['diff', '--name-only', '-z', ref]) ?? '').split('\0');
  const untracked = (gitOut(repo, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '').split('\0');
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

function appliedCheckCmd(opts) {
  const { run, collected } = runFolder(opts);
  if (!collected.startRef) throw new UsageError('collect.json has no startRef (the repo had no commit)');
  const proposals = existsSync(join(run, 'proposals.json')) ? readJson(join(run, 'proposals.json'), 'proposals.json') : [];
  const approvals = parseApprovals(readText(join(run, 'answers.md')) ?? '');
  const r = appliedCheck({ proposals, approvals, changed: changedSince(collected.repo, collected.startRef) });
  return { code: r.ok ? 0 : 1, out: { ok: r.ok, unapproved: r.unapproved, approved: [...approvals].filter(([, y]) => y).map(([id]) => id) } };
}

function logCmd(opts) {
  const { run, collected } = runFolder(opts);
  const verified = readJson(join(run, 'verified.json'), 'verified.json (run check first)');
  const approvals = parseApprovals(readText(join(run, 'answers.md')) ?? '');
  const before = new Set(collected.ratchet?.rules ?? []);
  const now = Object.keys(readBaseline(collected.repo).baseline?.rules ?? {});
  const row = { date: new Date().toISOString().slice(0, 10), work: collected.work?.label ?? '', sessions: collected.totals?.sessions ?? 0, tokens: collected.totals?.tokens ?? 0,
    findings: verified.length, passed: verified.filter(f => f.verify === 'passed').length, approved: [...approvals.values()].filter(Boolean).length, ratchetRules: now.filter(r => !before.has(r)).length };
  const file = join(collected.repo, LOG_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, appendLog(readText(file), row));
  return { code: 0, out: { ok: true, log: LOG_FILE, row } };
}

/** -> { code, out } */
export function run(argv, env = process.env, cwd = process.cwd()) {
  try {
    const [cmd, ...rest] = argv;
    if (!COMMANDS.includes(cmd)) throw new UsageError(`usage: retro.mjs ${COMMANDS.join('|')} ...`);
    const flags = readFlags(env);
    const opts = parseArgs(rest);
    if (cmd === 'collect') {
      const repo = topLevel(opts.repo ?? cwd);
      if (!repo) throw new UsageError(`${opts.repo ?? cwd} is not inside a git repo`);
      if (opts.lang && !['th', 'en'].includes(opts.lang)) throw new UsageError('--lang must be th or en');
      if ([opts.pr, opts.base, opts.since].filter(Boolean).length > 1) throw new UsageError('use one of --pr, --base, --since');
      const { run: dir, collect: c } = collect({ repo, base: opts.base, pr: opts.pr, since: opts.since, sessions: opts.session, lang: opts.lang, flags, env });
      return { code: 0, out: { ok: true, run: dir, work: c.work.label, sessions: c.totals.sessions, tokens: c.totals.tokens, guardrail: !c.guardrail.finding, notes: c.notes } };
    }
    if (cmd === 'check') return check(opts);
    if (cmd === 'applied-check') return appliedCheckCmd(opts);
    return logCmd(opts);
  } catch (e) {
    if (e instanceof FlagError || e instanceof UsageError) return { code: 2, out: { ok: false, errors: [e.message] } };
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === SELF) {
  const { code, out } = run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  if (code === 2) for (const e of out.errors ?? []) process.stderr.write(`${e}\n`);
  process.exitCode = code;
}
