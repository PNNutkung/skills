// Pins the timer that stops the running mutants at a strict budget's deadline (ADR 0011 Interface): it is armed for the time left, never less than 0 ms, so
// a deadline that has already passed stops them at once and does not give them a millisecond more. The clock is fixed, so the time left is exactly 0.
// Run: node --test skills/mutation/engine.mut-budget.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcOpts, calcRepo } from './fixtures/repo.mjs';
import { runMutation } from './engine.mjs';

// the delay of every timer armed during one run with a fixed clock and the fake in-process runner (exit 1: every mutant killed)
async function delays(t, extra) {
  const fx = calcRepo(t);
  t.mock.method(performance, 'now', () => 1000);
  const seen = [];
  const real = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...rest) => { seen.push(ms); return real(fn, ms, ...rest); });
  const inproc = async ({ cmd, onData }) => {
    const id = /ZT-MUTANT (X-[0-9a-f]{8})/.exec(cmd[2])?.[1];
    if (!id) return { exit: 0 };
    onData(`ZT-RUN fake exit=1\nZT-MUTANT ${id} fake exit=1\n`);
    return { exit: 1 };
  };
  const r = await runMutation(calcOpts(fx, { inproc, jobs: 1, ...extra }));
  return { seen, r };
}

test('should arm the stop timer for 0 ms when the strict budget has no time left', async t => {
  const { seen, r } = await delays(t, { budget: 0, budgetStrict: true });
  assert.ok(r.mutants.length >= 4);
  assert.ok(seen.includes(0), `timer delays: ${JSON.stringify(seen)}`);
});

test('should arm no stop timer for 0 ms when the budget is not strict', async t => {
  const { seen } = await delays(t, { budget: 0, budgetStrict: false });
  assert.ok(!seen.includes(0), `timer delays: ${JSON.stringify(seen)}`);
});
