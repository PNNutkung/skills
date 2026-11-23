// Offline check of ZT_TEST_PROCESS_MAX at the gates (zproc): a sh runner counts the test commands that run at once. Its own file: it waits on many short sleeps. tdd.mjs runs in-process through the shared fixture (test-fixture.mjs). Run: node --test tdd.zproc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, ON_ENV, plannedWith, peakRunner, CALC, calcTest } from './test-fixture.mjs';

test('zproc: ZT_TEST_PROCESS_MAX caps the test commands ONE gate runs at once (red; green with its test probe, mutation probe and coverage; reflake; final); unset runs as before', { timeout: 240000 }, async t => {
  const { fx } = await plannedWith(t, { ...ON_ENV, ZT_TEST_PROCESS_MAX: '' }, { plan: CALC });
  const stub = peakRunner(fx);
  put(fx.repo, { 'tests/test_calc.sh': calcTest('test_ac1_happy', 'f', 2), 'tests/test_calc2.sh': calcTest('test_ac1_happy_g', 'g', 3) });
  const peakOf = async (cmd, env) => { stub.reset(); const r = await fx.tdd(cmd[0], cmd.slice(1), env); assert.equal(r.status, 0, r.err); return { peak: stub.peak(), out: r.out }; };
  assert.ok((await peakOf(['red', '--group', 'a'], {})).peak >= 2, 'unset: red runs its files together');
  put(fx.repo, { 'src/calc.mjs': 'export const f = () => 1 + 1;\nexport const g = () => 1 + 2;\n' });
  const free = await peakOf(['green', '--group', 'a'], {});
  assert.match(free.out, /^GREEN a ok=true/, free.out);
  assert.ok(free.peak > 3, `unset: the probes and coverage overlap (peak ${free.peak})`);
  for (const max of [1, 2, 3, 5]) {
    const env = { ZT_TEST_PROCESS_MAX: String(max) };
    for (const cmd of [['red', '--group', 'a'], ['green', '--group', 'a'], ['green', '--group', 'a', '--reuse'], ['final', '--again']]) {
      const { peak, out } = await peakOf(cmd, env);
      assert.ok(peak >= 1 && peak <= max, `${cmd.join(' ')} with ZT_TEST_PROCESS_MAX=${max}: peak ${peak}`);
      if (cmd[0] === 'green') assert.match(out, /^GREEN a ok=true/, `${cmd.join(' ')} ${max}: ${out}`);
    }
  }
});
