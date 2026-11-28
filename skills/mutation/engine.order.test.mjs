// Tests of the order in which runMutation runs a mutant's test files (ADR 0011 FinalSpeed). The order changes only which test file runs first: a killed
// mutant stops at the first test file that fails, so a good first guess saves runs; a survivor still runs every selected test file, so no mutant is skipped.
// A fake in-process runner (the `inproc` option of proc.runIn) runs nothing: it answers each run with the exit code the test picks and records which test file ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { calcOpts, calcRepo } from './fixtures/repo.mjs';
import { runMutation } from './engine.mjs';

const STAMP = /ZT-MUTANT (X-[0-9a-f]{8})/;
const FILE = /test\/(\w+)\.test\.mjs/;
const USES_CALC = "import { isBig } from '../src/calc.mjs';\n";

// test/slow.test.mjs and test/fast.test.mjs both import src/calc.mjs, so every calc mutant selects both
const twoTests = t => calcRepo(t, { testText: USES_CALC, extra: { 'test/slow.test.mjs': USES_CALC, 'test/fast.test.mjs': USES_CALC } });

// baselineMs(file) -> how long the unmutated run of that test file takes; decide(file, id) -> the exit code of a mutant run
function fakeRunner({ baselineMs = () => 0, decide = () => 1 } = {}) {
  const calls = [];
  const inproc = async ({ cmd, onData }) => {
    const file = FILE.exec(cmd[2])?.[1];
    const id = STAMP.exec(cmd[2])?.[1];
    if (!id) { await sleep(baselineMs(file)); return { exit: 0 }; }
    const exit = decide(file, id);
    calls.push({ id, file });
    onData(`ZT-RUN fake-${calls.length} exit=${exit}\n`);
    onData(`ZT-MUTANT ${id} fake exit=${exit}\n`);
    return { exit };
  };
  return { inproc, calls };
}

// the test file each mutant ran first, in run order
const firstFiles = calls => [...new Set(calls.map(c => c.id))].map(id => calls.find(c => c.id === id).file);

test('should run the test file with the shortest baseline time first when the baseline times differ', async t => {
  const fx = twoTests(t);
  const { inproc, calls } = fakeRunner({ baselineMs: f => (f === 'fast' ? 0 : 300), decide: () => 1 });
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, tests: ['test/slow.test.mjs', 'test/fast.test.mjs'] }));
  const killed = r.mutants.filter(m => m.result === 'killed');
  assert.ok(killed.length >= 2, `${killed.length} killed`);
  assert.deepEqual([...new Set(firstFiles(calls))], ['fast']);
  assert.ok(killed.every(m => m.by === 'test/fast.test.mjs'), JSON.stringify(killed.map(m => m.by)));
});

test('should run the test file that killed the previous mutant of the same file first when the next mutant of that file runs', async t => {
  const fx = twoTests(t);
  // fast never kills; slow kills every mutant
  const { inproc, calls } = fakeRunner({ baselineMs: f => (f === 'fast' ? 0 : 300), decide: f => (f === 'slow' ? 1 : 0) });
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, tests: ['test/slow.test.mjs', 'test/fast.test.mjs'] }));
  const calc = r.mutants.filter(m => m.file === 'src/calc.mjs');
  assert.ok(calc.length >= 3, `${calc.length} calc mutants`);
  assert.ok(calc.every(m => m.result === 'killed' && m.by === 'test/slow.test.mjs'));
  const first = firstFiles(calls);
  assert.equal(first[0], 'fast', 'no killer is known yet: the fastest runs first');
  assert.deepEqual(first.slice(1), first.slice(1).map(() => 'slow'), 'afterwards the last killer runs first');
  assert.equal(calls.length, calc.length + 1, 'only the first mutant ran the file that never kills');
});

test('should run every selected test file on a mutant that survives when the order puts another file first', async t => {
  const fx = twoTests(t);
  const { inproc, calls } = fakeRunner({ baselineMs: f => (f === 'fast' ? 0 : 300), decide: () => 0 });
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, tests: ['test/slow.test.mjs', 'test/fast.test.mjs', 'test/calc.test.mjs'] }));
  const survivors = r.mutants.filter(m => m.file === 'src/calc.mjs');
  assert.ok(survivors.length >= 2 && survivors.every(m => m.result === 'survived'));
  for (const m of survivors) assert.deepEqual(calls.filter(c => c.id === m.id).map(c => c.file).sort(), ['calc', 'fast', 'slow'], m.id);
});

test('should keep the given test file order when the baseline times are equal', async t => {
  const fx = twoTests(t);
  const { inproc, calls } = fakeRunner({ decide: () => 1 });
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, tests: ['test/slow.test.mjs', 'test/fast.test.mjs'] }));
  assert.ok(r.mutants.some(m => m.result === 'killed'));
  assert.equal(calls[0].file, 'slow');
});
