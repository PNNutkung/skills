#!/usr/bin/env node
// dev-workflow CLI: one run per piece of work, its step and the gate out of it. Prints one JSON line.
//   open --slug S [--measure]       start at step intake (run folder under ~/.cache/dev-workflow)
//   status [--slug S]               the step and what its gate still needs; with no run folder, resume from repo evidence
//   next [--slug S] [--dod F] [--pr URL]   record evidence, then move on only if the gate is open
//   skip [--slug S] --answer A<n>   skip the current step on the user's saved answer (never dod, verify, retro)
//   tick [--slug S]                 DoD items whose real run passed in verify.md: tick these on the ticket without asking
//   close [--slug S]                end the run
// Exit 0 ok, 1 gate closed or refused, 2 usage or flag error. Node 22+, no dependencies.
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlagError, readFlags } from './flags.mjs';
import { SLUG_RE, currentBranch, evidence, openRuns, readState, repoRoot, runDir, runsOf, writeState } from './io.mjs';
import { STEPS, advance, gate, inferStep, skip } from './steps.mjs';

class Usage extends Error {}
const COMMANDS = ['open', 'status', 'next', 'skip', 'tick', 'close'];
const VALUE_OPTS = new Set(['--slug', '--dod', '--pr', '--answer']);
const BOOL_OPTS = new Set(['--measure']);

function parse(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS.includes(cmd)) throw new Usage(`usage: workflow.mjs ${COMMANDS.join('|')} [options]`);
  const v = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (BOOL_OPTS.has(a)) { v[a.slice(2)] = true; continue; }
    if (!VALUE_OPTS.has(a) || rest[i + 1] === undefined) throw new Usage(`unknown or incomplete option ${a}`);
    v[a.slice(2)] = rest[++i];
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

const summary = ev => ({ facts: ev.facts, measure: ev.measure, dod: ev.dod.ok, board: ev.board.ok, choice: ev.board.choice, adr: ev.adr, pr: ev.pr, verify: ev.verify.ok, retro: ev.retro });

/** The CLI as a function: { code, out } where out is the JSON object printed. deps: { env, cwd, gh, dodMjs }. */
export function main(argv, { env = process.env, cwd = process.cwd(), gh, dodMjs } = {}) {
  try {
    readFlags(env);
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
      if (v.dod) state = { ...state, dod: v.dod };
      if (v.pr) state = { ...state, pr: v.pr };
      writeState(run, state);
    }
    const ev = evidence(state, run, root, deps);

    if (cmd === 'status') {
      const needs = state.step === 'done' ? [] : gate(state.step, ev, state.measure);
      return { code: 0, out: { ok: true, run, slug: state.slug, step: state.step, index: STEPS.indexOf(state.step), resumed: Boolean(state.resumed), needs, evidence: summary(ev) } };
    }
    if (cmd === 'tick') {
      if (!ev.verify.ok) return { code: 1, out: { ok: false, errors: ev.verify.errors } };
      return { code: 0, out: { ok: true, tick: ev.verify.tickable } };
    }
    const r = cmd === 'skip' ? (v.answer ? skip(state, ev.answers, v.answer) : (() => { throw new Usage('skip needs --answer A<n>'); })()) : advance(state, ev);
    if (!r.ok) return { code: 1, out: { ok: false, step: state.step, errors: r.errors } };
    writeState(run, r.state);
    return { code: 0, out: { ok: true, from: state.step, step: r.state.step } };
  } catch (e) {
    if (e instanceof Usage || e instanceof FlagError) return { code: 2, out: { ok: false, errors: [e.message] } };
    throw e;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { code, out } = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = code;
}
