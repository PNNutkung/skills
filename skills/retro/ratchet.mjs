#!/usr/bin/env node
// The ratchet CLI. Every command prints one JSON line on stdout; messages for people go to stderr.
//   check   [--repo .] [--staged] [--write] [--ci]   fail (exit 1) when a count in .ratchet.json went up; --write lowers what went down
//   add     --rule <id> [--rule <id>...] [--regex <re> --glob <glob> --flags <f>]   start enforcing rules at today's counts
//   accept  --rule <id> --file <path> --reason "<why>" [--count <n>]                 raise one count on purpose (kept in the file)
//   install [--repo .]                                                              the git pre-commit hook (runs check --staged --write)
// Exit: 0 ok, 1 a count went up (or, in CI, a counter could not run), 2 usage error or a flag that is not valid.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FlagError, readFlags } from './flags.mjs';
import { BASELINE_FILE, accept, addRule, applyRenames, compare, lower } from './ratchet-core.mjs';
import { countViolations, countsFor, installHook, readBaseline, stage, stagedFiles, stagedRenames, topLevel, writeBaseline } from './ratchet-io.mjs';

const COMMANDS = ['check', 'add', 'accept', 'install'];
const SELF = realpathSync(fileURLToPath(import.meta.url));

class UsageError extends Error {}
function parseArgs(argv) {
  const opts = { rule: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`unexpected argument ${a}`);
    const key = a.slice(2);
    if (['staged', 'write', 'ci'].includes(key)) { opts[key] = true; continue; }
    if (!['repo', 'rule', 'file', 'reason', 'count', 'regex', 'glob', 'flags'].includes(key)) throw new UsageError(`unknown option ${a}`);
    const v = argv[++i];
    if (v === undefined) throw new UsageError(`${a} needs a value`);
    if (key === 'rule') opts.rule.push(v); else opts[key] = v;
  }
  return opts;
}

const say = line => process.stderr.write(`${line}\n`);
const where = (violations, rule, file) => violations.filter(v => v.rule === rule && v.file === file).map(v => `${file}:${v.line}`);

function check(repo, opts, env) {
  const ci = !!opts.ci || String(env.CI ?? '').toLowerCase() === 'true';
  const { baseline, exists, errors: bad } = readBaseline(repo);
  if (bad.length) return { code: 2, out: { ok: false, errors: bad } };
  if (!exists || !Object.keys(baseline.rules).length) return { code: 0, out: { ok: true, up: [], down: [], note: `no rules in ${BASELINE_FILE}; nothing is enforced` } };
  const renames = opts.staged ? stagedRenames(repo) : [];
  const rules = applyRenames(baseline.rules, renames);
  const files = opts.staged ? [...new Set([...stagedFiles(repo), ...renames.map(([o]) => o)])] : null;
  const { violations, errors, missing } = countViolations({ repo, rules: Object.keys(rules), patterns: baseline.patterns, files, env });
  const { up, down } = compare(rules, countsFor(violations), { files });
  const upLines = up.map(u => ({ ...u, at: where(violations, u.rule, u.file) }));
  const problems = [...errors, ...missing.map(t => `${t} is not installed, so its rules were not counted`)];
  let lowered = false;
  if (!up.length && opts.write && (down.length || renames.length)) {
    writeBaseline(repo, lower({ ...baseline, rules }, down));
    if (opts.staged) stage(repo, [BASELINE_FILE]);
    lowered = true;
  }
  if (up.length) {
    say(`retro ratchet: ${up.length} count${up.length > 1 ? 's' : ''} went up`);
    for (const u of upLines) say(`  ${u.rule}  ${u.file}  ${u.from} -> ${u.to}${u.at.length ? `  (${u.at.join(', ')})` : ''}`);
    say(`fix it, or keep it on purpose: node "${SELF}" accept --rule <rule> --file <file> --reason "<why>"`);
  } else if (down.length) {
    say(lowered ? `retro ratchet: ${down.length} count${down.length > 1 ? 's' : ''} went down, ${BASELINE_FILE} updated${opts.staged ? ' and staged' : ''}` : `retro ratchet: ${down.length} count${down.length > 1 ? 's' : ''} went down; run check --write to lock them in`);
    for (const d of down) say(`  ${d.rule}  ${d.file}  ${d.from} -> ${d.to}`);
  }
  for (const p of problems) say(`retro ratchet: ${p}`);
  const failed = up.length > 0 || (ci && problems.length > 0);
  return { code: failed ? 1 : 0, out: { ok: !failed, up: upLines, down, lowered, renames, errors: problems } };
}

function add(repo, opts, env) {
  if (!opts.rule.length) throw new UsageError('add needs --rule');
  const { baseline, errors: bad } = readBaseline(repo);
  if (bad.length) return { code: 2, out: { ok: false, errors: bad } };
  let b = baseline;
  if (opts.regex) {
    if (opts.rule.length !== 1) throw new UsageError('--regex adds one custom rule at a time');
    try { new RegExp(opts.regex, opts.flags ?? ''); } catch (e) { throw new UsageError(`--regex: ${e.message}`); }
    b = { ...b, patterns: { ...(b.patterns ?? {}), [opts.rule[0]]: { regex: opts.regex, ...(opts.glob ? { glob: opts.glob } : {}), ...(opts.flags ? { flags: opts.flags } : {}) } } };
  }
  const { violations, errors, missing } = countViolations({ repo, rules: opts.rule, patterns: b.patterns, env });
  const problems = [...errors, ...missing.map(t => `${t} is not installed; cannot count its rules`)];
  if (problems.length) return { code: 1, out: { ok: false, errors: problems } };
  const counts = countsFor(violations);
  for (const r of opts.rule) b = addRule(b, r, counts[r] ?? {});
  writeBaseline(repo, b);
  return { code: 0, out: { ok: true, added: Object.fromEntries(opts.rule.map(r => [r, counts[r] ?? {}])) } };
}

function acceptCmd(repo, opts, env) {
  if (opts.rule.length !== 1 || !opts.file) throw new UsageError('accept needs one --rule and --file');
  const { baseline, errors: bad } = readBaseline(repo);
  if (bad.length) return { code: 2, out: { ok: false, errors: bad } };
  let count = opts.count === undefined ? null : Number(opts.count);
  if (count === null) {
    const { violations } = countViolations({ repo, rules: opts.rule, patterns: baseline.patterns, files: [opts.file], env });
    count = violations.length;
  }
  try { writeBaseline(repo, accept(baseline, { rule: opts.rule[0], file: opts.file, count, reason: opts.reason })); }
  catch (e) { throw new UsageError(e.message); }
  return { code: 0, out: { ok: true, rule: opts.rule[0], file: opts.file, count } };
}

/** -> { code, out } */
export function run(argv, env = process.env, cwd = process.cwd()) {
  try {
    const [cmd, ...rest] = argv;
    if (!COMMANDS.includes(cmd)) throw new UsageError(`usage: ratchet.mjs ${COMMANDS.join('|')} ...`);
    const flags = readFlags(env);
    const opts = parseArgs(rest);
    const repo = topLevel(opts.repo ?? cwd);
    if (!repo) throw new UsageError(`${opts.repo ?? cwd} is not inside a git repo`);
    if (cmd === 'check') return check(repo, opts, env);
    if (cmd === 'add') return add(repo, opts, env);
    if (cmd === 'accept') return acceptCmd(repo, opts, env);
    if (!flags.ratchetHook) return { code: 0, out: { ok: true, skipped: 'RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED=false' } };
    return { code: 0, out: { ok: true, ...installHook({ repo, ratchetMjs: SELF }) } };
  } catch (e) {
    if (e instanceof FlagError || e instanceof UsageError) return { code: 2, out: { ok: false, errors: [e.message] } };
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === SELF) {
  const { code, out } = run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  for (const e of out.errors ?? []) if (code === 2) say(e);
  process.exitCode = code;
}
