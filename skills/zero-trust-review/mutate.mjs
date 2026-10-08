#!/usr/bin/env node
// Mutation probe for zero-trust-review: do the CHANGED tests pin the CHANGED code? It mutates only the lines the change touched (mutants.mjs: a flipped comparison,
// an inverted condition, a dropped statement, a different return value ...) and runs the changed test files against each mutant. A mutant every test still passes
// ("survived") is a test gap with a reproducible proof: its `run` is the sandbox ledger id, citable as {mode: executed, ref: run}.
// Every test command is untrusted code and runs ONLY through the sandbox runner (exit 86 = no sandbox, 124 = timeout). REPO is only read; mutants live in scratch copies.
//   node mutate.mjs --repo DIR --base REV --head REV --scratch DIR --cmd 'pytest -q {file}' [--tests a,b] [--max 30] [--jobs 4] [--timeout 120] [--budget 600]
//     [--kill-exits 1] [--link NAME]... [--ro DIR]... [--env K=V]... [--runner PATH]
//   --kill-exits: only these non-zero exits count as a kill (pytest: 1 = a test failed; 2 = collection error from a mutant that does not even import = inconclusive)
// Prints one JSON object and exits 0 (results are data); usage errors exit 2.
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedLines, generateMutants, sample } from './mutants.mjs';
import { DOC, NO_SANDBOX, TEST, TIMEOUT, backendOf, changes, clear, editableRoots, ensureDir, extract, gitOut, intOption, isSource, parseProbeArgs, pool, runIn, shq } from './probelib.mjs';

const MAX_SURVIVORS_SHOWN = 3, LINE_CUT = 40; // the lead pastes this summary into FACTS, which reviewers see clipped to ~800 chars

// A mutant that edits a line without changing the file size (>= 10 -> >= 11) inside the same second looks unchanged to any cache keyed on size and mtime (python's
// .pyc): the tests would run the OLD code and the mutant would falsely survive. So bytecode is never written, and every write or restore gets a mtime nobody has seen.
let tick = 0;
const freshMtime = file => { const t = Math.floor(Date.now() / 1000) + ++tick; utimesSync(file, t, t); };

function parse() {
  const { values, ...common } = parseProbeArgs({ max: { type: 'string', default: '30' }, budget: { type: 'string', default: '600' }, 'kill-exits': { type: 'string' } });
  const killExits = values['kill-exits']?.split(',').map(Number);
  if (killExits?.some(n => !Number.isInteger(n) || n < 1 || n > 255)) throw new Error('--kill-exits wants integers 1-255, comma separated');
  return { ...common, max: intOption(values, 'max', 1), budget: intOption(values, 'budget', 0), killExits };
}

// a regular file in a regular directory: a HEAD tree can swap either for a symlink to steer our writes out of the copy
function regularFile(root, path) {
  ensureDir(root, path.split('/').slice(0, -1).join('/'));
  const f = join(root, path);
  if (!lstatSync(f).isFile()) throw new Error(`not a regular file: ${path}`);
  return f;
}

// The test command, then one line naming the mutant and the exit code. It lands in the sandbox ledger's output, so even a quiet pass (a survivor) is a citable
// proof: {mode: executed, ref: <run>, exit: 0, quote: 'ZT-MUTANT <id> <file>:<line> <op> exit=0'}, and the id is a hash of the mutation, so it names it exactly.
const stamp = m => `ZT-MUTANT ${m.id} ${m.file}:${m.line} ${m.op} exit=`;
const wrap = (command, m) => `( ${command} ); zt=$?; printf '%s%s\\n' ${shq(stamp(m))} "$zt"; exit "$zt"`;
const verdict = (m, result, r) => ({ result, by: r.by, exit: r.exit, run: r.run, quote: `${stamp(m)}${r.exit}` });

// one mutant: write it into this worker's tree, run the changed tests until one fails, put the file back
async function tryMutant(o, tree, mutant, tests) {
  const file = regularFile(tree, mutant.file);
  const original = readFileSync(file), mode = statSync(file).mode & 0o777;
  const lines = original.toString('utf8').split('\n');
  lines[mutant.line - 1] = mutant.newLine;
  try {
    writeFileSync(file, lines.join('\n'));
    freshMtime(file);
    let last;
    for (const t of tests) {
      last = await runIn(o, tree, wrap(o.cmd.replaceAll('{file}', () => shq(t)), mutant));
      if (last.exit === NO_SANDBOX) return { result: 'unverifiable', reason: 'no sandbox' };
      if (last.exit === TIMEOUT) return verdict(mutant, 'timeout', { ...last, by: t }); // a mutant that hangs the tests is caught
      if (last.exit !== 0) {
        const kill = !o.killExits || o.killExits.includes(last.exit);
        return verdict(mutant, kill ? 'killed' : 'inconclusive', { ...last, by: t });
      }
    }
    return verdict(mutant, 'survived', last);
  } finally {
    writeFileSync(file, original);
    chmodSync(file, mode);
    freshMtime(file);
  }
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

async function main() {
  const o = parse();
  if (!o.env.some(e => e.startsWith('PYTHONDONTWRITEBYTECODE='))) o.env.push('PYTHONDONTWRITEBYTECODE=1');
  const backend = backendOf(o.runner);
  const done = extra => {
    const out = { backend, available: 0, mutants: [], ...extra };
    out.score = tally(out.mutants);
    process.stdout.write(`${JSON.stringify({ ...out, summary: summarize(out) })}\n`);
  };
  const changed = changes(o.repo, o.base, o.head);
  const sources = changed.filter(c => isSource(c.path) && (c.status === 'A' || c.status === 'M') && c.mode !== '120000' && c.mode !== '160000').map(c => c.path);
  const tests = o.tests ?? changed.filter(c => c.status !== 'D' && TEST.test(c.path) && !DOC.test(c.path)).map(c => c.path);
  if (!tests.length) return done({ reason: 'no changed test files' });
  if (!sources.length) return done({ reason: 'no changed source files' });

  const patch = gitOut(o.repo, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', `${o.base}...${o.head}`, '--', ...sources]).toString('utf8');
  const touched = changedLines(patch);
  const all = [...touched.keys()].sort().flatMap(p => generateMutants(p, gitOut(o.repo, ['show', `${o.head}:${p}`]).toString('utf8'), touched.get(p)));
  if (!all.length) return done({ reason: 'no mutable changed lines (only python, javascript/typescript and c-like sources are mutated)' });
  const picked = sample(all, o.max);

  mkdirSync(o.scratch, { recursive: true });
  const scratch = realpathSync(o.scratch);
  const workers = Math.min(o.jobs, picked.length);
  const trees = Array.from({ length: workers }, () => mkdtempSync(join(scratch, 'mut-')));
  const linked = o.link.map(name => realpathSync(join(o.repo, name)));
  o.ro = [...linked, ...editableRoots(linked, o.repo), ...o.extraRo];
  await Promise.all(trees.map(t => extract(o.repo, o.head, t)));
  o.link.forEach((name, i) => { for (const t of trees) { clear(t, name); symlinkSync(o.ro[i], join(t, name)); } });

  // only test files that pass on the unmutated HEAD can say anything about a mutant
  const base = await pool(tests, o.jobs, f => runIn(o, trees[0], o.cmd.replaceAll('{file}', () => shq(f))));
  const unverifiable = reason => done({ available: all.length, reason: `unverifiable: ${reason}`, mutants: picked.map(({ newLine, ...m }) => ({ ...m, result: 'unverifiable' })) });
  if (base.some(r => r.exit === NO_SANDBOX)) return unverifiable('no sandbox');
  const usable = tests.filter((_, i) => base[i].exit === 0);
  if (!usable.length) return unverifiable('no changed test file passes on HEAD');

  const deadline = performance.now() + o.budget * 1000;
  const results = new Array(picked.length);
  let next = 0;
  await Promise.all(trees.map(async tree => {
    while (next < picked.length) {
      const i = next++;
      const verdictOf = performance.now() > deadline ? { result: 'skipped' } : await tryMutant(o, tree, picked[i], usable).catch(e => ({ result: 'inconclusive', reason: e.message }));
      results[i] = { ...picked[i], ...verdictOf };
    }
  }));
  done({ available: all.length, tests: { run: usable, notUsable: tests.filter(t => !usable.includes(t)) }, mutants: results.map(({ newLine, ...m }) => m) });
}

main().catch(e => { console.error(`mutate: ${e.message}`); process.exit(2); });
