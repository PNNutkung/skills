// The mutation engine (ADR 0011): runMutation(opts) -> Promise<Result>. It mutates the lines a change touched (mutants.mjs) and runs the tests against each mutant,
// through the runner given by path (a sandbox runner, or paired-agent-tdd's direct-run.mjs ...). A mutant every test still passes ("survived") is a
// test gap with a reproducible proof: its `run` is the runner's ledger id.
// No env reads: every switch is an option, so each caller (the review probe, paired-agent-tdd, dev-workflow, cli.mjs) reads its own flags.
// A usage error throws UsageError; a run result (survivors, no sandbox, nothing to mutate) is data, never a throw.
// The host NEVER writes into a tree that tested code has run in: a test can swap a file or a directory for a symlink, and a host-side restore would follow it out of
// the tree. So a mutant is applied AND undone by the command the runner runs (where such a write is refused); a tree whose run did not end cleanly (timeout, kill,
// no stamp) is deleted and extracted again instead of repaired.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyMarks, readMarks } from './equivalent.mjs';
import { changedLines, fileRanges, generateMutants, sample } from './mutants.mjs';
import { DOC, NO_SANDBOX, TEST, TIMEOUT, changes, clear, editableRoots, extract, gitOut, isSource, pool, readBaseline, rel, runIdentity, runIn, shq } from './proc.mjs';
import { scoreOf } from './score.mjs';
import { testsFor } from './select.mjs';

export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}
const PATCH_FAILED = 125;
const SELECT = ['imports', 'all'];

const usage = msg => { throw new UsageError(msg); };
const isInt = (v, min) => Number.isInteger(v) && v >= min;
const strings = (v, name) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) usage(`${name} must be a list of strings`);
  return v;
};

/** opts -> the validated run options; throws UsageError */
function options(opts) {
  const o = { ...opts };
  if (typeof o.repo !== 'string' || !o.repo) usage('repo is required');
  if (!existsSync(o.repo)) usage(`repo not found: ${o.repo}`);
  o.repo = resolve(o.repo);
  o.head ??= 'HEAD';
  if (typeof o.head !== 'string' || !o.head) usage('head must be a revision');
  if (o.files !== undefined) {
    try { o.files = typeof o.files === 'string' ? fileRanges(o.files) : o.files instanceof Map ? o.files : usage('files must be a spec like a.py:10-40,b.py'); } catch (e) { usage(e.message); }
    if (!o.files.size) usage('files names no file');
  } else if (typeof o.base !== 'string' || !o.base) usage('base (or files) is required');
  if (typeof o.cmd !== 'string' || !o.cmd.includes('{file}')) usage('cmd must be a command that contains {file}');
  if (typeof o.runner !== 'string' || !o.runner) usage('runner (a path) is required');
  o.runner = resolve(o.runner);
  if (!o.inproc && !existsSync(o.runner)) usage(`runner not found: ${o.runner}`);
  o.max ??= 'unlimited';
  if (o.max !== 'unlimited' && !isInt(o.max, 1)) usage(`max must be a whole number from 1 or "unlimited", got ${String(o.max)}`);
  o.budget ??= 'none';
  if (o.budget !== 'none' && !(typeof o.budget === 'number' && o.budget >= 0 && Number.isFinite(o.budget))) usage(`budget must be seconds from 0 or "none", got ${String(o.budget)}`);
  o.jobs ??= availableParallelism();
  if (!isInt(o.jobs, 1)) usage(`jobs must be a whole number from 1, got ${String(o.jobs)}`);
  o.timeout ??= 120;
  if (!isInt(o.timeout, 1)) usage(`timeout must be a whole number of seconds from 1, got ${String(o.timeout)}`);
  o.scoreMin ??= 100;
  if (typeof o.scoreMin !== 'number' || Number.isNaN(o.scoreMin) || o.scoreMin < 0 || o.scoreMin > 100) usage(`scoreMin must be a number from 0 to 100, got ${String(o.scoreMin)}`);
  o.select ??= 'imports';
  if (!SELECT.includes(o.select)) usage(`select must be one of ${SELECT.join(', ')}, got ${String(o.select)}`);
  if (o.killExits !== undefined && (!Array.isArray(o.killExits) || !o.killExits.every(n => isInt(n, 1) && n <= 255))) usage('killExits must be a list of integers 1-255');
  o.tests = o.tests === undefined ? undefined : strings(o.tests, 'tests').map(t => { try { return rel(t); } catch (e) { return usage(e.message); } });
  if (o.files && !o.tests?.length) usage('tests are required with files');
  o.env = [...strings(o.env, 'env')];
  for (const e of o.env) if (!/^[A-Za-z_]\w*=/.test(e)) usage(`env wants K=V, got ${e}`);
  o.link = strings(o.link, 'link').map(n => { try { return rel(n); } catch (e) { return usage(e.message); } });
  o.extraRo = strings(o.ro, 'ro').map(p => resolve(p));
  o.reuse = strings(o.reuse, 'reuse');
  if (o.equivalent !== undefined && typeof o.equivalent !== 'string') usage('equivalent must be a path');
  o.budgetStrict ??= true;
  if (o.slots !== undefined && o.slots !== null && typeof o.slots !== 'function') usage('slots must be a limiter function');
  return o;
}

// A pristine tree: HEAD extracted by git (symlink-safe), plus the linked dirs (venv ...) as symlinks to the real ones.
async function newTree(o, scratch, linked) {
  const tree = mkdtempSync(join(scratch, 'mut-'));
  await extract(o.repo, o.head, tree);
  o.link.forEach((name, i) => { clear(tree, name); symlinkSync(linked[i], join(tree, name)); });
  return tree;
}
// rmSync unlinks a symlink instead of following it; a tree that cannot be fully removed (tested code chmod'ed it) is simply left behind: scratch is disposable
const discard = tree => { try { rmSync(tree, { recursive: true, force: true }); } catch { /* left behind */ } };

// The test command, then one line naming the mutant and the exit code. It lands in the runner's ledger output, so even a quiet pass (a survivor) is a citable
// proof: {mode: executed, ref: <run>, exit: 0, quote: 'ZT-MUTANT <id> <file>:<line> <op> exit=0'}, and the id is a hash of the mutation, so it names it exactly.
const stamp = m => `ZT-MUTANT ${m.id} ${m.file}:${m.line} ${m.op} exit=`;
// patch (keep a copy, rewrite the one line) ; run the tests ; put the copy back ; stamp. All of it inside the runner, in the tree.
function wrap(command, m) {
  const f = shq(m.file), orig = shq(`${m.file}.zt-orig`), next = shq(`${m.file}.zt-new`);
  const apply = `cp ${f} ${orig} && { head -n ${m.line - 1} ${f}; printf '%s\\n' ${shq(m.newLine)}; tail -n +${m.line + 1} ${f}; } > ${next} && cat ${next} > ${f}`;
  return `${apply} || { rm -f ${orig} ${next}; exit ${PATCH_FAILED}; }; ( ${command} ); zt=$?; cat ${orig} > ${f}; rm -f ${orig} ${next}; printf '%s%s\\n' ${shq(stamp(m))} "$zt"; exit "$zt"`;
}
const finished = (m, r) => r.tail.includes(`ZT-MUTANT ${m.id}`); // the stamp is printed after the restore: no stamp, no trust in the tree
const verdict = (m, result, r) => ({ result, by: r.by, exit: r.exit, run: r.run, quote: `${stamp(m)}${r.exit}`, dirty: !finished(m, r) });

// one mutant, run against the selected test files until one fails
async function tryMutant(o, tree, mutant, tests) {
  if (!tests.length) return { result: 'survived', reason: 'no test file imports this file', dirty: false };
  let last;
  for (const t of tests) {
    last = await runIn(o, tree, wrap(o.cmd.replaceAll('{file}', () => shq(t)), mutant));
    if (last.aborted) return { result: 'skipped', dirty: true }; // stopped by the budget or the caller: it decided nothing
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

// files -> Map(path -> line numbers) like changedLines, each range clamped to the file's length at head; null = every line
function wholeFiles(o) {
  const touched = new Map();
  for (const [path, ranges] of o.files) {
    const count = gitOut(o.repo, ['show', `${o.head}:${path}`]).toString('utf8').split('\n').length;
    const lines = new Set((ranges ?? [[1, count]]).flatMap(([a, b]) => Array.from({ length: Math.max(0, Math.min(b, count) - a + 1) }, (_, i) => a + i)));
    touched.set(path, [...lines].sort((x, y) => x - y));
  }
  return touched;
}

// The bytes of each mutated file at head, as git blob ids: a reused verdict holds only for the same bytes
const blobOf = (o, path) => gitOut(o.repo, ['rev-parse', '--verify', `${o.head}:${path}`]).toString().trim();

// Killed verdicts of earlier Results, by mutant id, only where that Result saw the same bytes of the mutated file. A file that cannot be read or is not a Result gives nothing.
function reusable(paths, blobs) {
  const out = new Map();
  for (const p of paths) {
    let doc;
    try { doc = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
    const seen = doc?.blobs;
    if (!Array.isArray(doc?.mutants) || typeof seen !== 'object' || seen === null) continue;
    for (const m of doc.mutants) {
      if (m?.result !== 'killed' || typeof m.id !== 'string' || typeof m.file !== 'string') continue;
      if (!blobs[m.file] || seen[m.file] !== blobs[m.file]) continue;
      out.set(m.id, m);
    }
  }
  return out;
}

const NO_TESTS = { run: [], notUsable: [] };

// FinalSpeed: the order only says which test file runs first. A killed mutant stops at the first failing file, so a good first guess saves runs;
// a survivor still runs every file, so nothing is skipped. Shortest baseline time first (a reused baseline has no times: the given order stands).
function byTime(list, tests, base) {
  const sec = new Map(tests.map((t, i) => [t, base[i].sec ?? 0]));
  return list.map((t, i) => [t, i]).sort((a, b) => sec.get(a[0]) - sec.get(b[0]) || a[1] - b[1]).map(([t]) => t);
}
const killerFirst = (list, killer) => (killer && list.includes(killer) ? [killer, ...list.filter(t => t !== killer)] : list);

/** -> Promise<Result> {available, mutants[], score, pass, reason?, tests: {run, notUsable}, blobs, baseline?}; a usage error throws UsageError */
export async function runMutation(opts = {}) {
  const o = options(opts);
  const identity = o.baselineFrom && runIdentity(o); // the caller's environment, as testprobe.mjs saw it
  if (!o.env.some(e => e.startsWith('PYTHONDONTWRITEBYTECODE='))) o.env.push('PYTHONDONTWRITEBYTECODE=1'); // a same-size edit in the same second would run stale .pyc
  const marks = o.equivalent ? readMarks(o.equivalent) : [];
  const finish = (extra, mutants = []) => {
    const judged = applyMarks(mutants, marks);
    const score = scoreOf(judged, { min: o.scoreMin });
    return { available: 0, tests: NO_TESTS, blobs: {}, ...extra, mutants: judged, score, pass: score.pass };
  };

  let tests = o.tests, touched;
  if (o.files) touched = wholeFiles(o); // no diff: the named files at head
  else {
    const changed = changes(o.repo, o.base, o.head);
    const sources = changed.filter(c => isSource(c.path) && (c.status === 'A' || c.status === 'M') && c.mode !== '120000' && c.mode !== '160000').map(c => c.path);
    tests ??= changed.filter(c => c.status !== 'D' && TEST.test(c.path) && !DOC.test(c.path)).map(c => c.path);
    if (!tests.length) return finish({ reason: 'no changed test files' });
    if (!sources.length) return finish({ reason: 'no changed source files' });
    touched = changedLines(gitOut(o.repo, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', `${o.base}...${o.head}`, '--', ...sources]).toString('utf8'));
  }
  const all = [...touched.keys()].sort().flatMap(p => generateMutants(p, gitOut(o.repo, ['show', `${o.head}:${p}`]).toString('utf8'), touched.get(p)));
  if (!all.length) return finish({ reason: 'no mutable changed lines (only python, javascript/typescript and c-like sources are mutated)' });
  const picked = o.max === 'unlimited' ? sample(all, all.length) : sample(all, o.max);
  const blobs = Object.fromEntries([...new Set(picked.map(m => m.file))].sort().map(f => [f, blobOf(o, f)]));
  const earlier = reusable(o.reuse, blobs);

  const ownScratch = !o.scratch;
  const scratchDir = o.scratch ? resolve(o.scratch) : mkdtempSync(join(tmpdir(), 'mutation-'));
  try {
    mkdirSync(scratchDir, { recursive: true });
    const scratch = realpathSync(scratchDir);
    const linked = o.link.map(name => realpathSync(join(o.repo, name)));
    o.ro = [...linked, ...editableRoots(linked, o.repo), ...o.extraRo];

    // the baseline runs in a tree of its own, thrown away afterwards: whatever the tests wrote there never reaches a mutant
    // a head run of this exact tree (testprobe.mjs --head-out) already says which test files pass unmutated
    const reused = identity && readBaseline(o.baselineFrom, identity, tests);
    const baseline = reused && (reused.exits ? { reused: true } : { reused: false, reason: reused.reason });
    const toRun = picked.filter(m => !earlier.has(m.id));
    const workers = Array.from({ length: Math.min(o.jobs, Math.max(1, toRun.length)) }, () => ({ tree: null }));
    const [baseTree] = await Promise.all([reused?.exits ? null : newTree(o, scratch, linked), ...workers.map(async w => { w.tree = await newTree(o, scratch, linked); })]);
    const base = reused?.exits ? reused.exits.map(exit => ({ exit })) : await pool(tests, o.jobs, f => runIn(o, baseTree, o.cmd.replaceAll('{file}', () => shq(f))));
    if (baseTree) discard(baseTree);
    const strip = ({ newLine, ...m }) => m;
    const extra = { available: all.length, blobs, ...(baseline && { baseline }) };
    const unverifiable = reason => finish({ ...extra, reason: `unverifiable: ${reason}` }, picked.map(m => ({ ...strip(m), result: 'unverifiable' })));
    if (base.some(r => r.exit === NO_SANDBOX)) return unverifiable('no sandbox');
    const usable = tests.filter((_, i) => base[i].exit === 0); // only test files that pass on the unmutated head can say anything about a mutant
    if (!usable.length) return unverifiable('no changed test file passes on HEAD');

    // which usable tests each mutated file is run against: its importers (select imports), or all of them
    const cache = new Map();
    const selected = Object.fromEntries(Object.keys(blobs).map(f => [f, byTime(o.select === 'all' ? usable : testsFor(f, usable, workers[0].tree, cache), tests, base)]));
    const killers = new Map(); // mutated file -> the test file that killed its last mutant: it runs first for the next mutant of that file

    const deadline = o.budget === 'none' ? Infinity : performance.now() + o.budget * 1000;
    const stop = new AbortController(); // the caller's signal, and with a strict budget the deadline, stop the mutants still running
    const onAbort = () => stop.abort();
    o.signal?.addEventListener('abort', onAbort, { once: true });
    if (o.signal?.aborted) stop.abort();
    const timer = o.budgetStrict && deadline !== Infinity ? setTimeout(() => stop.abort(), Math.max(0, deadline - performance.now())) : null;
    const run = { ...o, signal: stop.signal };
    const results = new Array(picked.length);
    picked.forEach((m, i) => {
      const was = earlier.get(m.id);
      if (was) results[i] = { ...strip(m), result: 'killed', ...(was.by !== undefined && { by: was.by }), ...(was.run !== undefined && { run: was.run }), ...(was.quote !== undefined && { quote: was.quote }), reused: true };
    });
    let next = 0;
    try {
      await Promise.all(workers.map(async w => {
        while (next < picked.length) {
          const i = next++;
          if (results[i]) continue;
          const mutant = strip(picked[i]);
          if (performance.now() > deadline || stop.signal.aborted) { results[i] = { ...mutant, result: 'skipped' }; continue; }
          const { dirty, ...v } = await tryMutant(run, w.tree, picked[i], killerFirst(selected[mutant.file], killers.get(mutant.file))).catch(e => ({ result: 'inconclusive', reason: e.message, dirty: true }));
          if (v.result === 'killed' && v.by) killers.set(mutant.file, v.by);
          results[i] = { ...mutant, ...v };
          if (dirty) { discard(w.tree); w.tree = stop.signal.aborted ? null : await newTree(o, scratch, linked); }
        }
      }));
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
      for (const w of workers) if (w.tree) discard(w.tree);
    }
    return finish({ ...extra, tests: { run: usable, notUsable: tests.filter(t => !usable.includes(t)) } }, results);
  } finally {
    if (ownScratch) discard(scratchDir);
  }
}
