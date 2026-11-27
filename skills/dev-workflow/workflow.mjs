#!/usr/bin/env node
// dev-workflow CLI: one run per piece of work, its step and the gate out of it. Prints one JSON line.
//   open --slug S [--measure]       start at step intake (run folder under ~/.cache/dev-workflow)
//   status [--slug S]               the step and what its gate still needs; with no run folder, resume from repo evidence
//   next [--slug S] [--dod F] [--pr URL] [--pr-body F] [--test-cmd CMD] [--ptdd-run DIR]
//                                   record evidence, then move on only if the gate is open; the PR body must start with
//                                   Why, Expected outcome, If we do nothing, How we know (read through gh, or from F; WORKFLOW_PR_WHY_CHECK_ENABLED).
//                                   Out of tdd it runs the mutation engine itself (ADR 0011; WORKFLOW_MUTATION_CHECK_ENABLED, WORKFLOW_MUTATION_SCORE_MIN) on the
//                                   branch's committed source changes since the merge base, with CMD (one test file per run, `{file}`; kept in the run) and the
//                                   equivalent marks of the ptdd run DIR (kept in the run) or RUN/mutation-equivalent.json; the result is RUN/mutation.json
//   skip [--slug S] --answer A<n>   skip the current step on the user's saved answer (never dod, verify, retro)
//   tick [--slug S]                 DoD items whose real run passed in verify.md: tick these on the ticket without asking
//   close [--slug S]                end the run
// Exit 0 ok, 1 gate closed or refused, 2 usage or flag error. Node 22+, no dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FlagError, readFlags } from './flags.mjs';
import { SLUG_RE, currentBranch, evidence, openRuns, readState, repoRoot, runDir, runsOf, writeState } from './io.mjs';
import { STEPS, advance, gate, inferStep, skip } from './steps.mjs';

class Usage extends Error {}
const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = ['open', 'status', 'next', 'skip', 'tick', 'close'];
const VALUE_OPTS = new Set(['--slug', '--dod', '--pr', '--pr-body', '--answer', '--test-cmd', '--ptdd-run']);
const BOOL_OPTS = new Set(['--measure']);

function parse(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS.includes(cmd)) throw new Usage(`usage: workflow.mjs ${COMMANDS.join('|')} [options]`);
  const v = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (BOOL_OPTS.has(a)) { v[a.slice(2)] = true; continue; }
    if (!VALUE_OPTS.has(a) || rest[i + 1] === undefined) throw new Usage(`unknown or incomplete option ${a}`);
    v[a.slice(2).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = rest[++i];
  }
  return { cmd, v };
}

function pick(env, root, slug) {
  if (slug) {
    if (!SLUG_RE.test(slug)) throw new Usage('--slug: lowercase letters, digits and -');
    const run = runDir(env, root, slug);
    return { run, state: readState(run) };
  }
  const open = openRuns(env, root);
  if (open.length === 1) return open[0];
  const branch = currentBranch(root);
  const mine = open.length ? [] : runsOf(env, root).filter(r => r.state.branch === branch && !r.state.closed);
  if (mine.length === 1) return mine[0];
  throw new Usage(open.length ? `several runs are open on this branch: pass --slug (${open.map(r => r.state.slug).join(', ')})` : 'no open run on this branch: open --slug S, or pass --slug to resume');
}

const summary = ev => ({ facts: ev.facts, measure: ev.measure, dod: ev.dod.ok, board: ev.board.ok, choice: ev.board.choice, adr: ev.adr, pr: ev.pr, verify: ev.verify.ok, verifyWarnings: ev.verify.warnings ?? [], retro: ev.retro });

// A started process sees its cwd as a real path (macOS /var -> /private/var, rules/paths.md); in-process callers get the same.
const realCwd = p => { try { return realpathSync(p); } catch { return p; } };

// ---------------------------------------------------------------- the mutation gate out of tdd (ADR 0011 phase 3)
const EQUIV_FILE = 'mutation-equivalent.json', MUTATION_FILE = 'mutation.json';
const BASE_REFS = ['origin/HEAD', 'origin/main', 'main', 'master'];
const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const isJs = f => JS_EXT.has(extname(f).toLowerCase());
// a file under a test folder that is never a test itself (fixtures, helpers), as paired-agent-tdd treats it
const NOT_A_TEST = /(^|\/)(__init__|conftest|setup|helpers?|fixtures?|mocks?|utils?|common)(\.[^/]*)?$|\/(fixtures?|mocks?|__snapshots__)\//i;
// a test can only exercise a source of its own language family
const sameFamily = (test, src) => (isJs(test) && isJs(src)) || extname(test).toLowerCase() === extname(src).toLowerCase();
const gitText = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });

/** the default branch to take the merge base against: origin/HEAD, else origin/main, main or master; null when none exists */
function baseRef(root) {
  for (const ref of BASE_REFS) {
    try { gitText(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return ref; } catch { /* next */ }
  }
  return null;
}

const writeJson = (run, name, obj) => {
  mkdirSync(run, { recursive: true, mode: 0o700 });
  const f = join(run, name), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, f);
};

/**
 * Runs the mutation engine on the branch's committed changes (base...HEAD) and writes RUN/mutation.json. -> { errors, usage? }: errors [] when the gate is open.
 * Survivors always close it; WORKFLOW_MUTATION_SCORE_MIN only limits the skipped, inconclusive and unverifiable mutants. A changed file with 0 mutants is ignored.
 */
async function mutationGate({ env, root, run, state, scoreMin }) {
  if (!state.testCmd) return { errors: ['the mutation check needs the test command once: next --test-cmd \'<command with {file}>\' (one test file per run; kept in the run)'] };
  const mutDir = resolve(env.MUTATION_DIR || join(HERE, '..', 'mutation'));
  const runner = join(HERE, '..', 'paired-agent-tdd', 'direct-run.mjs');
  if (!existsSync(join(mutDir, 'engine.mjs'))) return { errors: [`the mutation skill is not at ${mutDir} (set MUTATION_DIR)`] };
  if (!existsSync(runner)) return { errors: [`the paired-agent-tdd runner is not at ${runner}`] };
  const mimp = f => import(pathToFileURL(join(mutDir, f)).href);
  const [{ runMutation, UsageError }, proc, { testsFor }, { changedLines, generateMutants }, { readMarks }] = await Promise.all(['engine.mjs', 'proc.mjs', 'select.mjs', 'mutants.mjs', 'equivalent.mjs'].map(mimp));

  const base = baseRef(root);
  if (!base) return { errors: [`no default branch to take the merge base against: none of ${BASE_REFS.join(', ')} exists`] };
  const changed = proc.changes(root, base, 'HEAD');
  const sources = changed.filter(c => proc.isSource(c.path) && (c.status === 'A' || c.status === 'M') && c.mode !== '120000' && c.mode !== '160000').map(c => c.path);
  if (!sources.length) {
    writeJson(run, MUTATION_FILE, { available: 0, mutants: [], score: null, pass: true, reason: 'no changed source files', base, tests: { run: [], notUsable: [] } });
    return { errors: [] };
  }
  const isTest = f => proc.TEST.test(f) && !proc.DOC.test(f) && !NOT_A_TEST.test(f);
  // the A21 test set: the changed tests plus every existing test whose import graph reaches a changed source (select.mjs)
  const changedTests = changed.filter(c => c.status !== 'D' && isTest(c.path)).map(c => c.path);
  const listed = gitText(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0').filter(f => f && isTest(f) && !changedTests.includes(f));
  const cache = new Map();
  const reaching = listed.filter(t => sources.some(src => sameFamily(t, src) && testsFor(src, [t], root, cache).length));
  const tests = [...new Set([...changedTests, ...reaching])].sort();

  // the equivalent marks: the named ptdd run's file when present, else the run folder's
  const ptddFile = state.ptddRun ? join(state.ptddRun, EQUIV_FILE) : null;
  const equivalent = ptddFile && existsSync(ptddFile) ? ptddFile : join(run, EQUIV_FILE);
  try { readMarks(equivalent); } catch (e) { return { errors: [`${equivalent}: ${e.message}`] }; }

  let r;
  if (!tests.length) {
    // nothing can kill a mutant: the gate is closed only when the change has mutants at all (a file with 0 mutants is ignored)
    const touched = changedLines(gitText(root, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', `${base}...HEAD`, '--', ...sources]));
    const count = [...touched.keys()].reduce((n, p) => n + generateMutants(p, gitText(root, ['show', `HEAD:${p}`]), touched.get(p)).length, 0);
    r = { available: count, mutants: [], score: null, pass: !count, reason: count ? 'no test file reaches the changed sources' : 'no mutable changed lines', tests: { run: [], notUsable: [] } };
    writeJson(run, MUTATION_FILE, { ...r, base });
    return { errors: count ? [`mutation check: ${count} mutant(s) on ${sources.join(', ')} and no test file reaches them: add tests`] : [] };
  }
  try {
    r = await runMutation({ repo: root, base, head: 'HEAD', tests, cmd: state.testCmd, runner, max: 'unlimited', budget: 'none', scoreMin, equivalent, procEnv: env, procCwd: root });
  } catch (e) {
    if (e instanceof UsageError) return { errors: [`mutation check: ${e.message}`], usage: true };
    throw e;
  }
  const survivors = r.mutants.filter(m => m.result === 'survived');
  const counted = r.score?.counted ?? 0;
  // no mutant (NoMutants is a ptdd green rule only) or every mutant marked equivalent: nothing left to score
  const scoreOk = !r.mutants.length || !counted || (r.score.value !== null && r.score.value >= scoreMin);
  const pass = !survivors.length && scoreOk;
  writeJson(run, MUTATION_FILE, { ...r, pass, base, scoreMin, equivalentFile: equivalent });
  const errors = survivors.map(m => `surviving mutant ${m.id} ${m.file}:${m.line} ${m.op}: ${String(m.before).slice(0, 80)} -> ${String(m.after).slice(0, 80)}: add a test that kills it, or have a judge mark it equivalent in ${join(run, EQUIV_FILE)}`);
  if (!scoreOk) {
    const notKilled = Object.entries(r.mutants.filter(m => ['skipped', 'inconclusive', 'unverifiable'].includes(m.result)).reduce((o, m) => ({ ...o, [m.result]: (o[m.result] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(', ');
    errors.push(`mutation score ${r.score.value === null ? 'none' : `${Math.round(r.score.value * 10) / 10}%`} is under WORKFLOW_MUTATION_SCORE_MIN=${scoreMin}${notKilled ? ` (${notKilled})` : ''}${r.reason ? `: ${r.reason}` : ''}`);
  }
  return { errors };
}

/** The CLI as a function: Promise<{ code, out }> where out is the JSON object printed. deps: { env, cwd, gh, dodMjs }. */
export async function main(argv, { env = process.env, cwd = process.cwd(), gh, dodMjs } = {}) {
  try {
    cwd = realCwd(cwd);
    const flags = readFlags(env);
    const { cmd, v } = parse(argv);
    const root = repoRoot(cwd);
    if (!root) throw new Usage('not inside a git repository');
    const deps = { env, gh, dodMjs };

    if (cmd === 'open') {
      if (!v.slug || !SLUG_RE.test(v.slug)) throw new Usage('open needs --slug S (lowercase letters, digits and -)');
      const run = runDir(env, root, v.slug);
      const old = readState(run);
      if (old && !old.closed) return { code: 1, out: { ok: false, errors: [`a run for ${v.slug} is already open at step ${old.step}: use status`], run } };
      const state = { slug: v.slug, repo: realpathSync(root), branch: currentBranch(root), step: 'intake', measure: Boolean(v.measure), skipped: {}, opened: new Date().toISOString() };
      writeState(run, state);
      return { code: 0, out: { ok: true, run, step: state.step, files: ['facts.md', ...(state.measure ? ['measure.md'] : []), 'answers.md', 'board.json'].map(f => join(run, f)) } };
    }

    let { run, state } = pick(env, root, v.slug);
    if (!state && cmd === 'status') {
      // the run folder is gone (A18): resume from what the repo shows
      state = { slug: v.slug, repo: realpathSync(root), branch: currentBranch(root), step: 'intake', measure: false, skipped: {}, opened: new Date().toISOString() };
      state.step = inferStep(evidence(state, run, root, deps));
      state.resumed = true;
      writeState(run, state);
    }
    if (!state) throw new Usage(`no run for ${v.slug}: open --slug ${v.slug}`);
    if (state.closed && cmd !== 'status') return { code: 1, out: { ok: false, errors: [`the run for ${state.slug} is closed`] } };

    if (cmd === 'close') { writeState(run, { ...state, closed: new Date().toISOString() }); return { code: 0, out: { ok: true, closed: run } }; }

    if (cmd === 'next') {
      if (v.dod) state = { ...state, dod: resolve(cwd, v.dod) };
      if (v.pr) state = { ...state, pr: v.pr };
      if (v.prBody) state = { ...state, prBodyFile: resolve(cwd, v.prBody) };
      if (v.testCmd !== undefined) {
        if (!v.testCmd.includes('{file}')) throw new Usage('--test-cmd needs {file} where the test file goes (one test file per run), e.g. --test-cmd \'node --test {file}\'');
        state = { ...state, testCmd: v.testCmd };
      }
      if (v.ptddRun) state = { ...state, ptddRun: resolve(cwd, v.ptddRun) };
      writeState(run, state);
    }
    const ev = evidence(state, run, root, deps);

    if (cmd === 'status') {
      const needs = state.step === 'done' ? [] : gate(state.step, ev, state.measure);
      return { code: 0, out: { ok: true, run, slug: state.slug, step: state.step, index: STEPS.indexOf(state.step), resumed: Boolean(state.resumed), needs, evidence: summary(ev) } };
    }
    if (cmd === 'tick') {
      if (!ev.verify.ok) return { code: 1, out: { ok: false, errors: ev.verify.errors } };
      return { code: 0, out: { ok: true, tick: ev.verify.tickable, warnings: ev.verify.warnings ?? [] } };
    }
    const r = cmd === 'skip' ? (v.answer ? skip(state, ev.answers, v.answer) : (() => { throw new Usage('skip needs --answer A<n>'); })()) : advance(state, ev);
    // out of tdd the mutation gate runs too (ADR 0011): its errors join the step's own, so the agent sees both at once
    if (cmd === 'next' && state.step === 'tdd' && flags.mutationCheck) {
      const m = await mutationGate({ env, root, run, state, scoreMin: flags.mutationScoreMin });
      if (m.usage) return { code: 2, out: { ok: false, step: state.step, errors: [...m.errors, ...r.errors] } };
      if (m.errors.length) return { code: 1, out: { ok: false, step: state.step, errors: [...r.errors, ...m.errors] } };
    }
    if (!r.ok) return { code: 1, out: { ok: false, step: state.step, errors: r.errors } };
    writeState(run, r.state);
    return { code: 0, out: { ok: true, from: state.step, step: r.state.step } };
  } catch (e) {
    if (e instanceof Usage || e instanceof FlagError) return { code: 2, out: { ok: false, errors: [e.message] } };
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { code, out } = await main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = code;
}
