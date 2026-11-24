#!/usr/bin/env node
// Mutation probe for zero-trust-review: do the CHANGED tests pin the CHANGED code? It mutates only the lines the change touched (mutants.mjs: a flipped comparison,
// an inverted condition, a dropped statement, a different return value ...) and runs the changed test files against each mutant. A mutant every test still passes
// ("survived") is a test gap with a reproducible proof: its `run` is the sandbox ledger id, citable as {mode: executed, ref: run}.
// Every test command is untrusted code and runs ONLY through the sandbox runner (exit 86 = no sandbox, 124 = timeout). REPO is only read; mutants live in scratch copies.
// The host NEVER writes into a tree that untrusted code has run in: a test can swap a file or a directory for a symlink, and a host-side restore would follow it out of
// the tree and write the change request's own bytes anywhere the user can. So a mutant is applied AND undone by the sandboxed command itself (where such a write is
// refused); a tree whose run did not end cleanly (timeout, kill, no stamp) is deleted and re-extracted instead of repaired.
//   node mutate.mjs --repo DIR --base REV --head REV --scratch DIR --cmd 'pytest -q {file}' [--tests a,b] [--max 30] [--jobs 4] [--timeout 120] [--budget 600]
//     [--kill-exits 1] [--link NAME]... [--ro DIR]... [--env K=V]... [--runner PATH] [--files a.py:10-40,b.py]
//   --files: mutate these files (or line ranges; a bare path = every line) at --head instead of the lines a diff touched; --base is then optional and --tests required
//   --kill-exits: only these non-zero exits count as a kill (pytest: 1 = a test failed; 2 = collection error from a mutant that does not even import = inconclusive)
//   --baseline-from FILE: the HEAD run testprobe.mjs --head-out wrote; used instead of an own baseline run only when it is from this exact tree, command and environment
// Flags: ZT_MUTATION_BASELINE_REUSE_ENABLED (default true) allows --baseline-from; ZT_MUTATION_BUDGET_STRICT_ENABLED (default true) also stops the mutants still
// running when --budget runs out (reported skipped, never killed or survived); ZT_TEST_PROCESS_MAX caps how many test commands run at once (default unlimited).
// Prints one JSON object and exits 0 (results are data); usage errors exit 2.
// In-process (tests): main(argv, { env, cwd }) -> { code, stdout, stderr }, the same bytes the CLI prints; the CLI is a thin wrapper around it.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedLines, fileRanges, generateMutants, sample } from './mutants.mjs';
import { enabled } from './flags.mjs';
import { DOC, NO_SANDBOX, TEST, TIMEOUT, backendOf, changes, clear, editableRoots, extract, gitOut, intOption, isSource, parseProbeArgs, pool, readBaseline, runIdentity, runIn, shq,
  testProcessSlots } from './probelib.mjs';

const MAX_SURVIVORS_SHOWN = 3, LINE_CUT = 40; // the lead pastes this summary into FACTS, which reviewers see clipped to ~800 chars
const PATCH_FAILED = 125;
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
    baselineFrom: reuse ? values['baseline-from'] : undefined, strict, slots, procEnv: env }; // procEnv: the env the runner starts with (probelib.runIn)
}

// A pristine tree: HEAD extracted by git (symlink-safe), plus the linked dirs (venv ...) as symlinks to the real ones.
async function newTree(o, scratch, linked) {
  const tree = mkdtempSync(join(scratch, 'mut-'));
  await extract(o.repo, o.head, tree);
  o.link.forEach((name, i) => { clear(tree, name); symlinkSync(linked[i], join(tree, name)); });
  return tree;
}
// rmSync unlinks a symlink instead of following it; a tree that cannot be fully removed (untrusted code chmod'ed it) is simply left behind: scratch is disposable
const discard = tree => { try { rmSync(tree, { recursive: true, force: true }); } catch { /* left behind */ } };

// The test command, then one line naming the mutant and the exit code. It lands in the sandbox ledger's output, so even a quiet pass (a survivor) is a citable
// proof: {mode: executed, ref: <run>, exit: 0, quote: 'ZT-MUTANT <id> <file>:<line> <op> exit=0'}, and the id is a hash of the mutation, so it names it exactly.
const stamp = m => `ZT-MUTANT ${m.id} ${m.file}:${m.line} ${m.op} exit=`;
// patch (keep a copy, rewrite the one line) ; run the tests ; put the copy back ; stamp. All of it inside the sandbox, in the tree.
function wrap(command, m) {
  const f = shq(m.file), orig = shq(`${m.file}.zt-orig`), next = shq(`${m.file}.zt-new`);
  const apply = `cp ${f} ${orig} && { head -n ${m.line - 1} ${f}; printf '%s\\n' ${shq(m.newLine)}; tail -n +${m.line + 1} ${f}; } > ${next} && cat ${next} > ${f}`;
  return `${apply} || { rm -f ${orig} ${next}; exit ${PATCH_FAILED}; }; ( ${command} ); zt=$?; cat ${orig} > ${f}; rm -f ${orig} ${next}; printf '%s%s\\n' ${shq(stamp(m))} "$zt"; exit "$zt"`;
}
const finished = (m, r) => r.tail.includes(`ZT-MUTANT ${m.id}`); // the stamp is printed after the restore: no stamp, no trust in the tree
const verdict = (m, result, r) => ({ result, by: r.by, exit: r.exit, run: r.run, quote: `${stamp(m)}${r.exit}`, dirty: !finished(m, r) });

// one mutant, run against every usable changed test file until one fails
async function tryMutant(o, tree, mutant, tests) {
  let last;
  for (const t of tests) {
    last = await runIn(o, tree, wrap(o.cmd.replaceAll('{file}', () => shq(t)), mutant));
    if (last.aborted) return { result: 'skipped', dirty: true }; // stopped by the budget: it decided nothing
    if (last.exit === NO_SANDBOX) return { result: 'unverifiable', reason: 'no sandbox', dirty: false };
    if (last.exit === PATCH_FAILED) return { result: 'inconclusive', reason: 'the mutant could not be applied in the tree', dirty: true };
    if (last.exit === TIMEOUT) return { ...verdict(mutant, 'timeout', { ...last, by: t }), dirty: true }; // a mutant that hangs the tests is caught; the restore never ran
    if (last.exit !== 0) {
      const kill = !o.killExits || o.killExits.includes(last.exit);
      return verdict(mutant, kill ? 'killed' : 'inconclusive', { ...last, by: t });
    }
  }
  return verdict(mutant, 'survived', last);
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

// --files -> Map(path -> line numbers) like changedLines, each range clamped to the file's length at --head; null = every line
function wholeFiles(o) {
  const touched = new Map();
  for (const [path, ranges] of o.files) {
    const count = gitOut(o.repo, ['show', `${o.head}:${path}`]).toString('utf8').split('\n').length;
    const lines = new Set((ranges ?? [[1, count]]).flatMap(([a, b]) => Array.from({ length: Math.max(0, Math.min(b, count) - a + 1) }, (_, i) => a + i)));
    touched.set(path, [...lines].sort((x, y) => x - y));
  }
  return touched;
}

async function run(argv, env, cwd, write) {
  const o = parse(argv, env, cwd);
  const identity = o.baselineFrom && runIdentity(o); // the caller's environment, as testprobe.mjs saw it
  if (!o.env.some(e => e.startsWith('PYTHONDONTWRITEBYTECODE='))) o.env.push('PYTHONDONTWRITEBYTECODE=1'); // a same-size edit in the same second would run stale .pyc
  const backend = backendOf(o.runner, env);
  const done = extra => {
    const out = { backend, available: 0, mutants: [], ...extra };
    out.score = tally(out.mutants);
    write(`${JSON.stringify({ ...out, summary: summarize(out) })}\n`);
  };
  let tests = o.tests, touched;
  if (o.files) touched = wholeFiles(o); // no diff: the named files at --head
  else {
    const changed = changes(o.repo, o.base, o.head);
    const sources = changed.filter(c => isSource(c.path) && (c.status === 'A' || c.status === 'M') && c.mode !== '120000' && c.mode !== '160000').map(c => c.path);
    tests ??= changed.filter(c => c.status !== 'D' && TEST.test(c.path) && !DOC.test(c.path)).map(c => c.path);
    if (!tests.length) return done({ reason: 'no changed test files' });
    if (!sources.length) return done({ reason: 'no changed source files' });
    touched = changedLines(gitOut(o.repo, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', `${o.base}...${o.head}`, '--', ...sources]).toString('utf8'));
  }
  const all = [...touched.keys()].sort().flatMap(p => generateMutants(p, gitOut(o.repo, ['show', `${o.head}:${p}`]).toString('utf8'), touched.get(p)));
  if (!all.length) return done({ reason: 'no mutable changed lines (only python, javascript/typescript and c-like sources are mutated)' });
  const picked = sample(all, o.max);

  mkdirSync(o.scratch, { recursive: true });
  const scratch = realpathSync(o.scratch);
  const linked = o.link.map(name => realpathSync(join(o.repo, name)));
  o.ro = [...linked, ...editableRoots(linked, o.repo), ...o.extraRo];

  // the baseline runs in a tree of its own, thrown away afterwards: whatever the tests wrote there never reaches a mutant
  // a head run of this exact tree (testprobe.mjs --head-out) already says which test files pass unmutated
  const reused = identity && readBaseline(o.baselineFrom, identity, tests);
  const baseline = reused && (reused.exits ? { reused: true } : { reused: false, reason: reused.reason });
  const workers = Array.from({ length: Math.min(o.jobs, picked.length) }, () => ({ tree: null }));
  const [baseTree] = await Promise.all([reused?.exits ? null : newTree(o, scratch, linked), ...workers.map(async w => { w.tree = await newTree(o, scratch, linked); })]);
  const base = reused?.exits ? reused.exits.map(exit => ({ exit })) : await pool(tests, o.jobs, f => runIn(o, baseTree, o.cmd.replaceAll('{file}', () => shq(f))));
  if (baseTree) discard(baseTree);
  const unverifiable = reason => done({ available: all.length, reason: `unverifiable: ${reason}`, mutants: picked.map(({ newLine, ...m }) => ({ ...m, result: 'unverifiable' })), ...(baseline && { baseline }) });
  if (base.some(r => r.exit === NO_SANDBOX)) return unverifiable('no sandbox');
  const usable = tests.filter((_, i) => base[i].exit === 0); // only test files that pass on the unmutated HEAD can say anything about a mutant
  if (!usable.length) return unverifiable('no changed test file passes on HEAD');

  const deadline = performance.now() + o.budget * 1000;
  const stop = o.strict ? new AbortController() : null; // strict budget: the deadline also stops the mutants still running
  const timer = stop && setTimeout(() => stop.abort(), Math.max(0, deadline - performance.now()));
  o.signal = stop?.signal;
  const results = new Array(picked.length);
  let next = 0;
  await Promise.all(workers.map(async w => {
    while (next < picked.length) {
      const i = next++;
      const { newLine, ...mutant } = picked[i];
      if (performance.now() > deadline || o.signal?.aborted) { results[i] = { ...mutant, result: 'skipped' }; continue; }
      const { dirty, ...v } = await tryMutant(o, w.tree, picked[i], usable).catch(e => ({ result: 'inconclusive', reason: e.message, dirty: true }));
      results[i] = { ...mutant, ...v };
      if (dirty) { discard(w.tree); w.tree = o.signal?.aborted ? null : await newTree(o, scratch, linked); }
    }
  }));
  clearTimeout(timer);
  done({ available: all.length, tests: { run: usable, notUsable: tests.filter(t => !usable.includes(t)) }, mutants: results, ...(baseline && { baseline }) });
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
