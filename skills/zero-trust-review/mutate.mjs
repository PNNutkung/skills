#!/usr/bin/env node
// Mutation probe for zero-trust-review: do the CHANGED tests pin the CHANGED code? It mutates only the lines the change touched (mutants.mjs: a flipped comparison,
// an inverted condition, a dropped statement, a different return value ...) and runs the changed test files against each mutant. A mutant every test still passes
// ("survived") is a test gap with a reproducible proof: its `run` is the sandbox ledger id, citable as {mode: executed, ref: run}.
// Every test command is untrusted code and runs ONLY through the sandbox runner (exit 86 = no sandbox, 124 = timeout). REPO is only read; mutants live in scratch copies.
// The host NEVER writes into a tree that untrusted code has run in: a test can swap a file or a directory for a symlink, and a host-side restore would follow it out of
// the tree and write the change request's own bytes anywhere the user can. So a mutant is applied AND undone by the sandboxed command itself (where such a write is
// refused); a tree whose run did not end cleanly (timeout, kill, no stamp) is deleted and re-extracted instead of repaired.
//   node mutate.mjs --repo DIR --base REV --head REV --scratch DIR --cmd 'pytest -q {file}' [--tests a,b] [--max 30] [--jobs 4] [--timeout 120] [--budget 600]
//     [--kill-exits 1] [--link NAME]... [--ro DIR]... [--env K=V]... [--runner PATH] [--runner-inprocess] [--files a.py:10-40,b.py]
//   --runner-inprocess: --runner is paired-agent-tdd's direct-run.mjs: run it in this process, no node start per command and no --check
//   --files: mutate these files (or line ranges; a bare path = every line) at --head instead of the lines a diff touched; --base is then optional and --tests required
//   --kill-exits: only these non-zero exits count as a kill (pytest: 1 = a test failed; 2 = collection error from a mutant that does not even import = inconclusive)
//   --baseline-from FILE: the HEAD run testprobe.mjs --head-out wrote; used instead of an own baseline run only when it is from this exact tree, command and environment
// Flags: ZT_MUTATION_BASELINE_REUSE_ENABLED (default true) allows --baseline-from; ZT_MUTATION_BUDGET_STRICT_ENABLED (default true) also stops the mutants still
// running when --budget runs out (reported skipped, never killed or survived); ZT_TEST_PROCESS_MAX caps how many test commands run at once (default unlimited).
// Prints one JSON object and exits 0 (results are data); usage errors exit 2.
// A thin wrapper (ADR 0011 A18): the work is skills/mutation/engine.mjs runMutation; this file reads the ZT flags, keeps today's defaults (max 30, budget 600, jobs 4,
// every usable test file per mutant) and prints the output it always printed.
// In-process (tests): main(argv, { env, cwd }) -> { code, stdout, stderr }, the same bytes the CLI prints; the CLI is a thin wrapper around it.
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileRanges } from './mutants.mjs';
import { enabled } from './flags.mjs';
import { MUTATION_SKILL_DIR, backendOf, inprocRunner, intOption, parseProbeArgs, testProcessSlots } from './probelib.mjs';

const { runMutation } = await import(pathToFileURL(join(MUTATION_SKILL_DIR, 'engine.mjs')).href);
const MAX_SURVIVORS_SHOWN = 3, LINE_CUT = 40; // the lead pastes this summary into FACTS, which reviewers see clipped to ~800 chars
const BASELINE_REUSE_FLAG = 'ZT_MUTATION_BASELINE_REUSE_ENABLED', BUDGET_STRICT_FLAG = 'ZT_MUTATION_BUDGET_STRICT_ENABLED';

function parse(argv, env, cwd) {
  const { values, ...common } = parseProbeArgs({ max: { type: 'string', default: '30' }, budget: { type: 'string', default: '600' }, 'kill-exits': { type: 'string' }, files: { type: 'string' },
    'baseline-from': { type: 'string' } },
    { optional: argv.includes('--files') ? ['base'] : [], args: argv, cwd });
  if (values.files && !common.tests?.length) throw new Error('--tests is required with --files');
  const killExits = values['kill-exits']?.split(',').map(Number);
  if (killExits?.some(n => !Number.isInteger(n) || n < 1 || n > 255)) throw new Error('--kill-exits wants integers 1-255, comma separated');
  const reuse = enabled(env, BASELINE_REUSE_FLAG, true), strict = enabled(env, BUDGET_STRICT_FLAG, true), slots = testProcessSlots(env);
  return { ...common, max: intOption(values, 'max', 1), budget: intOption(values, 'budget', 0), killExits, files: values.files && fileRanges(values.files),
    baselineFrom: reuse ? values['baseline-from'] : undefined, strict, slots, procEnv: env }; // procEnv: the env the runner starts with (proc.runIn)
}

function summarize(out) {
  const { score, mutants } = out;
  if (out.reason) return `mutation: ${out.reason}`;
  const parts = [`${score.killed} killed`, `${score.survived} survived`];
  for (const k of ['timeout', 'inconclusive', 'skipped', 'unverifiable']) if (score[k]) parts.push(`${score[k]} ${k}`);
  const lines = [`mutation: ${score.total} of ${out.available} mutants on changed lines: ${parts.join(', ')}`];
  const survivors = mutants.filter(m => m.result === 'survived');
  const cut = x => (x.length > LINE_CUT ? `${x.slice(0, LINE_CUT - 1)}…` : x);
  for (const m of survivors.slice(0, MAX_SURVIVORS_SHOWN)) lines.push(`survived ${m.id} ${m.file}:${m.line} ${m.op}: ${cut(m.before)} -> ${cut(m.after)} (run ${m.run})`);
  if (survivors.length > MAX_SURVIVORS_SHOWN) lines.push(`+${survivors.length - MAX_SURVIVORS_SHOWN} more survivors`);
  return lines.join('\n');
}

const tally = mutants => {
  const score = { total: mutants.length, killed: 0, survived: 0, timeout: 0, inconclusive: 0, skipped: 0, unverifiable: 0 };
  for (const m of mutants) if (m.result in score) score[m.result]++;
  return score;
};

async function run(argv, env, cwd, write) {
  const o = parse(argv, env, cwd);
  const inproc = o.inprocess ? await inprocRunner(o.runner) : undefined;
  const backend = backendOf(o.runner, env, { inprocess: o.inprocess });
  const r = await runMutation({ repo: o.repo, head: o.head, base: o.base, files: o.files, tests: o.tests, cmd: o.cmd, runner: o.runner, scratch: o.scratch, max: o.max, budget: o.budget,
    jobs: o.jobs, timeout: o.timeout, killExits: o.killExits, link: o.link, ro: o.extraRo, env: o.env, baselineFrom: o.baselineFrom, budgetStrict: o.strict, slots: o.slots,
    select: 'all', procEnv: o.procEnv, ...(inproc && { inproc }) });
  // the keys this tool always printed: the engine's score and pass are the gate's, not this probe's (its score is the tally)
  const out = { backend, available: r.available, mutants: r.mutants, ...(r.reason ? { reason: r.reason } : { tests: r.tests }), ...(r.baseline && { baseline: r.baseline }) };
  out.score = tally(out.mutants);
  write(`${JSON.stringify({ ...out, summary: summarize(out) })}\n`);
}

/** The whole tool, in-process: no process.exit, no write to the real stdout/stderr, no change to process.env or the cwd once it returns. */
const realCwd = c => { try { return realpathSync(c); } catch { return c; } }; // a started process sees its cwd as a real path (macOS /var -> /private/var, rules/paths.md)
export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  let stdout = '';
  try {
    await run(argv, env, realCwd(cwd), s => { stdout += s; });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: 2, stdout, stderr: `mutate: ${e.message}\n` };
  }
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  main(process.argv.slice(2)).then(r => {
    process.stdout.write(r.stdout);
    if (r.code) { process.stderr.write(r.stderr); process.exit(r.code); }
  });
}
