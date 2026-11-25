// Unit tests for test-e2e-speed.mjs: the layout of the e2e.speed*.test.mjs files (ADR 0007) and the worker helper. Run: node --test test-e2e-speed.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './test-e2e-run.mjs';
import { inWorker, runWithInWorker } from './test-e2e-speed.mjs';

// The 9 tests kept their assertions when they moved to one file each (ADR 0007); they were renamed to the should ... when ... shape (A14). old name -> new name
const RENAMED = {
  'fcompat: every speed flag off runs the v2.0.0 pipeline: four agents a group, a courier, the reviewer after the integration tester':
    'should run the v2.0.0 pipeline (four agents a group, a courier, the reviewer after the integration tester) when every speed flag is off (fcompat)',
  'vmeasure: all flags on against all off: fewer agents and hops; prints agent count, critical-path hops and gate wall-clock':
    'should use fewer agents and hops, and print agent count, critical-path hops and gate wall-clock, when all flags are on against all off (vmeasure)',
  'fcompat: with truly every flag off (PTDD and ZT) the whole run is the v2.0.0 path end to end: same agents, no speed key, no head run, no baseline reuse, no courier skip':
    'should run the v2.0.0 path end to end (same agents, no speed key, no head run, no baseline reuse, no courier skip) when truly every flag of PTDD and ZT is off (fcompat)',
  'pmode: PTDD_PIPELINE_MODE=fast alone gives the group with no after one tdd-driver and one navigator over both gates':
    'should give the group with no after one tdd-driver and one navigator over both gates when PTDD_PIPELINE_MODE=fast is set alone (pmode)',
  'pquick: PTDD_QUICK_DRIVER_GATE_ENABLED alone makes each driver\'s middle GREEN run quick (no mutants); the navigator\'s run mutates':
    "should make each driver's middle GREEN run quick (no mutants) while the navigator's run mutates when PTDD_QUICK_DRIVER_GATE_ENABLED is on alone (pquick)",
  'preuse, pvreuse: PTDD_GATE_REUSE_ENABLED alone lets each navigator reuse its driver\'s last full run (flake check re-run) and verify reuse the courier\'s final':
    "should let each navigator reuse its driver's last full run (flake check re-run) and verify reuse the courier's final when PTDD_GATE_REUSE_ENABLED is on alone (preuse, pvreuse)",
  'pcourier: PTDD_COURIER_SKIP_ENABLED alone spawns no courier when the fixer reports its gate ok; verify is the check':
    'should spawn no courier and leave verify as the check when PTDD_COURIER_SKIP_ENABLED is on alone and the fixer reports its gate ok (pcourier)',
  'pparrev: PTDD_PARALLEL_REVIEW_ENABLED alone runs the integration tester and the reviewer at the same time; the reviewer leaves the integration file out':
    'should run the integration tester and the reviewer at the same time, the reviewer leaving the integration file out, when PTDD_PARALLEL_REVIEW_ENABLED is on alone (pparrev)',
  'pcourier: a fixer of group a that breaks group b and still reports its own gate ok: the courier is skipped and verify reports the run not done':
    'should skip the courier and have verify report the run not done when a fixer of group a breaks group b and still reports its own gate ok (pcourier)',
};
const NAMES = Object.values(RENAMED);
const speedFiles = () => readdirSync(HERE).filter(n => /^e2e\.speed.*\.test\.mjs$/.test(n)).sort().map(name => ({ name, src: readFileSync(join(HERE, name), 'utf8') }));
const count = (src, re) => (src.match(re) ?? []).length;
const dataUrl = js => new URL(`data:text/javascript,${encodeURIComponent(js)}`);

test('should hold one top-level test and at most one scripted run awaited in turn when an e2e.speed file is read', () => {
  const files = speedFiles();
  assert.equal(files.length, NAMES.length, files.map(f => f.name).join(', '));
  for (const { name, src } of files) {
    assert.equal(count(src, /^test\(/gm), 1, name);
    assert.ok(count(src, /\bawait\s+runWith(?:Js)?\(/g) <= 1, `${name}: more than one run awaited one after another`);
    assert.equal(count(src, /\bawait\s+runWithInWorker\(/g), 0, `${name}: runWithInWorker runs side by side, inside Promise.all`);
    if (/runWithInWorker\(/.test(src)) assert.equal(count(src, /\bawait\s+runWith(?:Js)?\(/g), 0, `${name}: a run in turn next to the worker runs`);
  }
});

test('should run the same 9 test names as before the split when the names of every e2e.speed file are put together', () => {
  const names = speedFiles().map(({ src }) => /^test\((['"])(.*?)(?<!\\)\1,/m.exec(src)?.[2].replace(/\\(.)/g, '$1'));
  assert.deepEqual(names.sort(), [...NAMES].sort());
});

test('should give the first message when the worker posts one, and reject when it throws or exits before it posts', async () => {
  assert.deepEqual(await inWorker(dataUrl("import { parentPort, workerData } from 'node:worker_threads'; parentPort.postMessage({ got: workerData });"), { a: 1 }), { got: { a: 1 } });
  await assert.rejects(inWorker(dataUrl("throw new Error('boom');"), {}), /boom/);
  await assert.rejects(inWorker(dataUrl('process.exit(3);'), {}), /exited with code 3 before it posted/);
  await assert.rejects(inWorker(dataUrl(''), {}), /exited with code 0 before it posted/);
});

test('should start no run when another worker imports the module without asking for one', async () => {
  const mod = new URL('./test-e2e-speed.mjs', import.meta.url).href;
  assert.equal(await inWorker(dataUrl(`import { parentPort } from 'node:worker_threads'; await import(${JSON.stringify(mod)}); parentPort.postMessage('loaded');`), {}), 'loaded');
});

test('should reject when the scripted run in the worker fails', async () => {
  await assert.rejects(runWithInWorker({ PTDD_PIPELINE_MODE: 'not-a-mode' }), /PTDD_PIPELINE_MODE/);
});
