// Mutation-gate gap test for engine.mjs: only a killing test file becomes the "last killer" that runs first for the next mutant of the same file (ADR 0011 FinalSpeed).
// A fake in-process runner (the `inproc` option of proc.runIn) answers each run with the exit code the test picks and records which test file ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { calcOpts, calcRepo } from './fixtures/repo.mjs';
import { runMutation } from './engine.mjs';

const STAMP = /ZT-MUTANT (X-[0-9a-f]{8})/;
const FILE = /test\/(\w+)\.test\.mjs/;
const USES_CALC = "import { isBig } from '../src/calc.mjs';\n";

function fakeRunner({ baselineMs = () => 0, decide }) {
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

test('should keep running the fastest test file first when the file that failed a mutant did not count as a kill', async t => {
  const fx = calcRepo(t, { testText: USES_CALC, extra: { 'test/slow.test.mjs': USES_CALC, 'test/fast.test.mjs': USES_CALC } });
  // fast passes every mutant; slow exits 2, which killExits [1] makes inconclusive (by slow), not a kill
  const { inproc, calls } = fakeRunner({ baselineMs: f => (f === 'fast' ? 0 : 300), decide: f => (f === 'slow' ? 2 : 0) });
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, killExits: [1], tests: ['test/slow.test.mjs', 'test/fast.test.mjs'] }));
  const calc = r.mutants.filter(m => m.file === 'src/calc.mjs');
  assert.ok(calc.length >= 3, `${calc.length} calc mutants`);
  assert.ok(calc.every(m => m.result === 'inconclusive' && m.by === 'test/slow.test.mjs'), JSON.stringify(calc.map(m => m.result)));
  for (const m of calc) assert.deepEqual(calls.filter(c => c.id === m.id).map(c => c.file), ['fast', 'slow'], `fast still runs first for ${m.id}`);
});
