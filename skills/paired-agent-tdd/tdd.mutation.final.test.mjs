// ADR 0011 phase 2, the FINAL gate: every changed line mutated once, PTDD_MUTATION_MAX caps the count (FinalFull), no time limit (FinalNoLimit), and the judge's
// equivalent marks in RUN/mutation-equivalent.json written by `tdd.mjs equivalent --add` (EquivJudge). Run: node --test tdd.mutation.final.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { put } from './test-fixture.mjs';
import { CALC, CALC_TEST, FG, FOURTEEN, TW_OFF, fourteenChecks, gateText, jsTest, mfx, mutantId, runsOf } from './fixtures/mutation.mjs';

/** plan, RED, source, GREEN (asserted ok or not), then FINAL: -> { green, final, finalRuns: test runs the final gate made } */
async function through(fx, { test, src, greenOk = true }) {
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: test });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: src });
  const green = await fx.go('green', ['--group', 'a']);
  if (greenOk !== null) assert.match(green.out, new RegExp(`^GREEN a ok=${greenOk}`), green.out); // null: the green verdict is not what the test is about
  const before = runsOf(fx), final = await fx.go('final');
  assert.equal(final.status, 0, final.err);
  return { green, final, finalRuns: runsOf(fx) - before };
}

// ---------------------------------------------------------------- FinalFull: every changed line once; PTDD_MUTATION_MAX caps the count
test('should pass final and run only the mutants green did not kill when every changed line is pinned (FinalFull happy)', async t => {
  const fx = mfx(t, { env: TW_OFF });
  const { final, finalRuns } = await through(fx, { test: jsTest(fourteenChecks()), src: FOURTEEN });
  assert.match(final.out, /^FINAL ok=true/m, final.out);
  // green sampled 12 of the 14 and killed them: final reuses those, runs lines 7 and 14, the baseline and the group test together
  assert.ok(finalRuns >= 3 && finalRuns <= 8, `final ran the test ${finalRuns} time(s): want the 2 mutants green left out, not all 14 again`);
});

test('should fail final when a changed line that green did not sample has a surviving mutant (FinalFull fail)', async t => {
  const fx = mfx(t, { env: TW_OFF });
  const { final } = await through(fx, { test: jsTest(fourteenChecks(['f7'])), src: FOURTEEN }); // green's sample of 12 leaves out line 7
  assert.match(final.out, /^FINAL ok=false/m, final.out);
  const gate = JSON.parse(gateText(fx, 'final.json'));
  assert.equal(gate.ok, false);
  assert.ok(gateText(fx, 'final.json').includes(mutantId(CALC, 7, 'const-inc', 'export const f7 = () => 71;')), 'final.json names the survivor on line 7');
});

test('should cap the final mutants at PTDD_MUTATION_MAX when it is a number (FinalFull edge)', async t => {
  const fx = mfx(t, { env: { ...TW_OFF, PTDD_MUTATION_MAX: '12' } });
  const { final } = await through(fx, { test: jsTest(fourteenChecks(['f7'])), src: FOURTEEN });
  assert.match(final.out, /^FINAL ok=true/m, `a sample of 12 leaves out line 7 at final too: ${final.out}`);
});

// ---------------------------------------------------------------- FinalNoLimit: no budget at final, so no mutant is skipped for time
test('should run every mutant at final with no time limit when the green budget skipped them all (FinalNoLimit happy)', async t => {
  const fx = mfx(t, { plan: { mutation: { budget: 0 } }, env: TW_OFF });
  const { final, finalRuns } = await through(fx, { test: jsTest(fourteenChecks()), src: FOURTEEN, greenOk: null });
  assert.match(final.out, /^FINAL ok=true/m, final.out);
  assert.ok(finalRuns >= 15, `final ran the test ${finalRuns} time(s): want each of the 14 mutants and the group test`);
  assert.doesNotMatch(gateText(fx, 'final.json'), /"result":\s*"skipped"/, 'no mutant is skipped for time at final');
});

test('should fail final on a survivor when the green budget skipped every mutant (FinalNoLimit fail)', async t => {
  const fx = mfx(t, { plan: { mutation: { budget: 0 } }, env: TW_OFF });
  const { final } = await through(fx, { test: jsTest(fourteenChecks(['f3'])), src: FOURTEEN, greenOk: null });
  assert.match(final.out, /^FINAL ok=false/m, final.out);
});

test('should run every mutant at final when PTDD_MUTATION_MAX is unlimited and the plan sets a small green max (FinalNoLimit edge)', async t => {
  const fx = mfx(t, { plan: { mutation: { max: 2 } }, env: { ...TW_OFF, PTDD_MUTATION_MAX: 'unlimited' } });
  const { final } = await through(fx, { test: jsTest(fourteenChecks(['f7'])), src: FOURTEEN }); // green samples 2: lines 1 and 8
  assert.match(final.out, /^FINAL ok=false/m, `line 7 is mutated at final whatever green sampled: ${final.out}`);
});

// ---------------------------------------------------------------- EquivJudge: tdd.mjs equivalent --add, by the rules of skills/mutation equivalent.mjs
const G_SURVIVOR = mutantId(CALC, 2, 'const-inc', 'export const g = () => 4;'); // g = 3 is never tested
const REASON = 'g is a constant no caller reads; 3 and 4 give the same observable output here';
const marksOf = fx => JSON.parse(readFileSync(join(fx.run, 'mutation-equivalent.json'), 'utf8'));

test('should write the mark into RUN/mutation-equivalent.json and pass final when the judge marks the survivor equivalent (EquivJudge happy)', async t => {
  const fx = mfx(t, { env: TW_OFF });
  const { final } = await through(fx, { test: jsTest([['f', 2]]), src: FG, greenOk: false });
  assert.match(final.out, /^FINAL ok=false/m, final.out);
  const add = await fx.go('equivalent', ['--add', G_SURVIVOR, '--reason', REASON]);
  assert.equal(add.status, 0, add.err);
  const doc = marksOf(fx);
  assert.equal(doc.schema, 1);
  assert.deepEqual(doc.marks.map(m => [m.id, m.file, m.line, m.reason]), [[G_SURVIVOR, CALC, 2, REASON]]);
  assert.equal(typeof doc.marks[0].judge, 'string');
  const again = await fx.go('final', ['--again']);
  assert.match(again.out, /^FINAL ok=true/m, again.out);
  assert.ok(again.out.includes(G_SURVIVOR), 'the final report lists the equivalent mutant for the user to read');
});

test('should refuse the mark and write nothing when the id is not a survivor or the reason is under 20 characters (EquivJudge fail)', async t => {
  const fx = mfx(t, { env: TW_OFF });
  await through(fx, { test: jsTest([['f', 2]]), src: FG, greenOk: false });
  const killed = mutantId(CALC, 1, 'const-inc', 'export const f = () => 3;');
  for (const [args, re] of [
    [['--add', killed, '--reason', REASON], /not a survivor/],
    [['--add', 'X-00000000', '--reason', REASON], /not a survivor/],
    [['--add', G_SURVIVOR, '--reason', 'same output'], /at least 20 characters/],
  ]) {
    const r = await fx.go('equivalent', args);
    assert.equal(r.status, 1, `${args.join(' ')} must be refused with exit 1`);
    assert.match(r.err, re);
    assert.equal(existsSync(join(fx.run, 'mutation-equivalent.json')), false, 'a refused mark writes nothing');
  }
});

test('should stop applying a mark when the marked line changes, since the mutant id changes with it (EquivJudge edge)', async t => {
  const fx = mfx(t, { env: TW_OFF });
  await through(fx, { test: jsTest([['f', 2]]), src: FG, greenOk: false });
  assert.equal((await fx.go('equivalent', ['--add', G_SURVIVOR, '--reason', REASON])).status, 0);
  put(fx.repo, { [CALC]: 'export const f = () => 2;\nexport const g = () => 5;\n' }); // a new edit on line 2: a new mutant id, still untested
  const again = await fx.go('final', ['--again']);
  assert.match(again.out, /^FINAL ok=false/m, again.out);
});

test('should check the mark against the green result when no final has run yet (EquivJudge edge)', async t => {
  const fx = mfx(t, { env: TW_OFF });
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2]]) });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a ok=true/);
  put(fx.repo, { [CALC]: FG });
  assert.match((await fx.go('green', ['--group', 'a'])).out, /^GREEN a ok=false/);
  const add = await fx.go('equivalent', ['--add', G_SURVIVOR, '--reason', REASON]);
  assert.equal(add.status, 0, add.err);
  assert.deepEqual(marksOf(fx).marks.map(m => m.id), [G_SURVIVOR]);
  assert.match((await fx.go('final')).out, /^FINAL ok=true/m, 'final runs with the mark');
});
