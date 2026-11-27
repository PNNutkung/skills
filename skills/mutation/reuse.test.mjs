// Integration tests for the reuse option of runMutation (ADR 0011 Interface, A10 speed): a mutant killed in an earlier Result on the same bytes is not run
// again; it is reported killed with reused: true. reuse takes paths of earlier Result files (the JSON runMutation resolved with).
// "The same bytes": the mutated file's content at head is the same as when the earlier Result was made; any other change to that file means run it again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALC, KILLED_LINE, calcOpts, calcRepo, commit } from './fixtures/repo.mjs';
import { runMutation } from './engine.mjs';

const saved = (fx, name, r) => { const f = join(fx.dir, name); writeFileSync(f, JSON.stringify(r)); return f; };

test('should not run again a mutant an earlier Result killed on the same bytes when reuse names that Result (FinalSpeed happy)', async t => {
  const fx = calcRepo(t);
  const first = await runMutation(calcOpts(fx));
  const second = await runMutation(calcOpts(fx, { reuse: [saved(fx, 'first.json', first)] }));
  assert.deepEqual(second.mutants.map(m => [m.id, m.result]), first.mutants.map(m => [m.id, m.result]), 'same verdicts');
  for (const m of second.mutants) {
    if (m.result === 'killed') assert.equal(m.reused, true, `${m.id} killed before: reused`);
    else assert.ok(!m.reused, `${m.id} ${m.result}: a survivor always runs again`);
  }
  assert.ok(second.mutants.some(m => m.reused) && second.mutants.some(m => m.result === 'survived'));
  assert.deepEqual(second.score, first.score);
});

test('should run every mutant again when the mutated file changed since the earlier Result (FinalSpeed fail)', async t => {
  const fx = calcRepo(t);
  const first = await runMutation(calcOpts(fx));
  // a trailing comment: the mutants of line 2 keep their ids, but the file's bytes differ
  const head2 = commit(fx.repo, { 'src/calc.mjs': `${CALC}// note\n` }, 'touch');
  const again = await runMutation(calcOpts(fx, { head: head2, reuse: [saved(fx, 'first.json', first)] }));
  const ids = new Set(first.mutants.filter(m => m.line === KILLED_LINE).map(m => m.id));
  assert.ok(again.mutants.some(m => ids.has(m.id)), 'the ids are the same');
  assert.ok(again.mutants.every(m => !m.reused), JSON.stringify(again.mutants.filter(m => m.reused)));
  assert.ok(again.mutants.filter(m => ids.has(m.id)).every(m => m.result === 'killed'));
});

test('should reuse nothing when the earlier Result had the mutant survive or time out (FinalSpeed edge)', async t => {
  const fx = calcRepo(t);
  const first = await runMutation(calcOpts(fx));
  // the earlier Result claims every mutant survived (or timed out): nothing was killed there, so all of them run now
  const forged = { ...first, mutants: first.mutants.map((m, i) => ({ ...m, result: i % 2 ? 'survived' : 'timeout' })) };
  const again = await runMutation(calcOpts(fx, { reuse: [saved(fx, 'forged.json', forged)] }));
  assert.ok(again.mutants.every(m => !m.reused));
  assert.deepEqual(again.mutants.map(m => m.result), first.mutants.map(m => m.result));
});
