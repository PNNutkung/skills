// Tests of runMutation's worker loop (ADR 0011 Interface) with a fake in-process runner (the `inproc` option of proc.runIn): it runs nothing, answers each
// mutant run with the exit code the test picks, and records the tree (cwd) each run got. So the tests see when a tree is kept and when it is thrown away and
// extracted again, how the budget stops the loop, and what a reused verdict carries, in well under a second per run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { calcOpts, calcRepo } from './fixtures/repo.mjs';
import { runMutation } from './engine.mjs';

const STAMP = /ZT-MUTANT (X-[0-9a-f]{8})/;
// decide(call, signal) -> { exit, stamp = true } for each mutant run; a run that is not a mutant (the baseline) passes. stamp: false leaves out the line the wrapped
// command prints after its restore, as when the command was cut short.
function fakeRunner(decide = () => ({ exit: 1 })) {
  const calls = [];
  const inproc = async ({ cwd, cmd, timeout, signal, onData }) => {
    const id = STAMP.exec(cmd[2])?.[1];
    if (!id) return { exit: 0 };
    const call = { id, cwd, timeout, n: calls.length, trees: readdirSync(dirname(cwd)).filter(n => n.startsWith('mut-')).length };
    calls.push(call);
    const { exit, stamp = true } = await decide(call, signal);
    onData(`ZT-RUN fake-${call.n} exit=${exit}\n`);
    if (stamp) onData(`ZT-MUTANT ${id} fake exit=${exit}\n`);
    return { exit };
  };
  return { inproc, calls };
}

// src/aaa.mjs and src/calc.mjs are imported by the test, src/bbb.mjs by nothing: its mutants sort between the other two and run against no test
const AAA = 'export const inc = n => n + 1;\n', BBB = 'export const dec = n => n - 1;\n';
const TEST_ABC = "import { inc } from '../src/aaa.mjs';\nimport { isBig } from '../src/calc.mjs';\n";
const abcRepo = t => calcRepo(t, { testText: TEST_ABC, extra: { 'src/aaa.mjs': AAA, 'src/bbb.mjs': BBB } });
const distinct = calls => new Set(calls.map(c => c.cwd)).size;

test('should keep a tree after a run that ended cleanly and extract a new one after a run that did not when one worker runs every mutant (Module happy)', async t => {
  const fx = abcRepo(t);
  const first = special => (call => (call.n === 0 ? special : { exit: 1 }));
  // [name, the first mutant run's answer, whether the tree is replaced after it]
  const cases = [
    ['a stamped pass', first({ exit: 0 }), false],
    ['a stamped fail', first({ exit: 1 }), false],
    ['a pass with no stamp', first({ exit: 0, stamp: false }), true],
    ['no sandbox (86)', first({ exit: 86 }), false],
    ['a patch that failed (125)', first({ exit: 125 }), true],
    ['a timeout (124)', first({ exit: 124 }), true],
  ];
  for (const [name, decide, replaced] of cases) {
    const { inproc, calls } = fakeRunner(decide);
    const r = await runMutation(calcOpts(fx, { inproc, jobs: 1 }));
    assert.ok(calls.length >= 4, `${name}: ${calls.length} runs`);
    assert.ok(r.mutants.some(m => m.file === 'src/bbb.mjs' && m.result === 'survived' && m.reason === 'no test file imports this file'), name);
    assert.ok(calls.findIndex(c => c.id.startsWith('X-') && r.mutants.find(m => m.id === c.id).file === 'src/calc.mjs') > 0, `${name}: calc runs after aaa and bbb`);
    if (replaced) {
      assert.notEqual(calls[1].cwd, calls[0].cwd, `${name}: a new tree after the first run`);
      assert.equal(distinct(calls.slice(1)), 1, `${name}: kept afterwards`);
    } else assert.equal(distinct(calls), 1, `${name}: one tree for every run, the bbb mutants that ran nothing included`);
  }

  // a run that throws (here: the limiter) is inconclusive and its tree is replaced; slot 1 is the baseline, slot 3 the second mutant
  const { inproc, calls } = fakeRunner();
  let slot = 0;
  const slots = fn => (++slot === 3 ? Promise.reject(new Error('slot broke')) : fn());
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, slots }));
  assert.equal(r.mutants.filter(m => m.result === 'inconclusive' && m.reason === 'slot broke').length, 1);
  assert.notEqual(calls[1].cwd, calls[0].cwd, 'a new tree after the run that threw');
  assert.equal(distinct(calls.slice(1)), 1);
});

test('should give the runner a 120 second timeout and start one tree when timeout is not set and only one mutant runs (Module edge)', async t => {
  const fx = calcRepo(t);
  const { inproc, calls } = fakeRunner();
  const r = await runMutation(calcOpts(fx, { inproc, timeout: undefined, max: 1, jobs: 4 }));
  assert.equal(r.mutants.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 120);
  assert.equal(calls[0].trees, 1, 'one worker tree for one mutant, though jobs is 4');
  assert.match(basename(calls[0].cwd), /^mut-/);
});

test('should run mutants until the clock passes the budget and skip the rest when budgetStrict is false (FinalSpeed edge)', async t => {
  const fx = calcRepo(t);
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  // budget 1 s: the deadline is 1000 ms on the fake clock. After run 1 the clock is exactly at it (not past: the next mutant runs), after run 2 just past it.
  const { inproc, calls } = fakeRunner(call => { clock = call.n === 0 ? 1000 : 1000.5; return { exit: 1 }; });
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, budget: 1, budgetStrict: false }));
  assert.ok(r.mutants.length >= 4, String(r.mutants.length));
  assert.equal(calls.length, 2);
  assert.deepEqual(r.mutants.map(m => m.result), r.mutants.map((_, i) => (i < 2 ? 'killed' : 'skipped')));
});

test('should stop the running mutant at the deadline when budgetStrict is not set (FinalSpeed fail)', async t => {
  const fx = calcRepo(t);
  // a mutant run that hangs until it is stopped, at most 5 s
  const { inproc, calls } = fakeRunner((_, signal) => new Promise(done => {
    const late = setTimeout(() => done({ exit: 0 }), 5000);
    signal.addEventListener('abort', () => { clearTimeout(late); done({ exit: 0, stamp: false }); }, { once: true });
  }));
  const t0 = performance.now();
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, budget: 0.2 }));
  assert.ok(performance.now() - t0 < 4000, 'stopped at the deadline, not after the 5 s the run would take');
  assert.equal(calls.length, 1);
  assert.ok(r.mutants.every(m => m.result === 'skipped'), JSON.stringify(r.mutants.map(m => m.result)));
});

test('should carry by, run and quote of the earlier verdict when a reused mutant is reported killed (FinalSpeed happy)', async t => {
  const fx = calcRepo(t);
  const first = await runMutation(calcOpts(fx, { inproc: fakeRunner().inproc }));
  assert.ok(first.mutants.every(m => m.result === 'killed' && m.by === 'test/calc.test.mjs' && m.run.startsWith('fake-') && m.quote));
  const saved = join(fx.dir, 'first.json');
  writeFileSync(saved, JSON.stringify(first));
  const { inproc, calls } = fakeRunner();
  const again = await runMutation(calcOpts(fx, { inproc, reuse: [saved] }));
  assert.equal(calls.length, 0, 'nothing runs again');
  assert.deepEqual(again.mutants, first.mutants.map(({ exit, ...m }) => ({ ...m, reused: true })), 'the exit code is not carried over');
});

test('should ignore an earlier Result whose mutants are not a list when reuse names it (FinalSpeed edge)', async t => {
  const fx = calcRepo(t);
  const odd = join(fx.dir, 'odd.json');
  writeFileSync(odd, JSON.stringify({ mutants: { 'X-00000000': { result: 'killed' } }, blobs: {} }));
  const { inproc, calls } = fakeRunner();
  const r = await runMutation(calcOpts(fx, { inproc, reuse: [odd] }));
  assert.ok(r.mutants.length > 0 && r.mutants.every(m => !m.reused));
  assert.equal(calls.length, r.mutants.length);
});

test('should report each mutant once with a count that ends at the total when onProgress is a function', async t => {
  const fx = abcRepo(t);
  const seen = [];
  const r = await runMutation(calcOpts(fx, { inproc: fakeRunner().inproc, jobs: 2, onProgress: p => seen.push(p) }));
  assert.equal(seen.length, r.mutants.length);
  assert.deepEqual(seen.map(p => p.done), seen.map((_, i) => i + 1), 'done counts up by one');
  assert.ok(seen.every(p => p.total === r.mutants.length));
  assert.deepEqual(seen.map(p => p.mutant.id).sort(), r.mutants.map(m => m.id).sort(), 'each mutant once');
  assert.ok(seen.every(p => r.mutants.find(m => m.id === p.mutant.id).result === p.mutant.result));
});

test('should report reused mutants too when reuse gives every verdict', async t => {
  const fx = calcRepo(t);
  const first = await runMutation(calcOpts(fx, { inproc: fakeRunner().inproc }));
  const saved = join(fx.dir, 'first.json');
  writeFileSync(saved, JSON.stringify(first));
  const seen = [];
  await runMutation(calcOpts(fx, { inproc: fakeRunner().inproc, reuse: [saved], onProgress: p => seen.push(p) }));
  assert.equal(seen.length, first.mutants.length);
  assert.ok(seen.every(p => p.mutant.reused === true));
});

test('should refuse onProgress when it is not a function', async t => {
  const fx = calcRepo(t);
  await assert.rejects(runMutation(calcOpts(fx, { inproc: fakeRunner().inproc, onProgress: 'yes' })), /onProgress must be a function/);
});
