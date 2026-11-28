// Mutation-gate gap tests for tdd.mjs: exit codes and messages of the mutation flags at a gate, the test writer's ADR Interface at plan, `green --retest` in writer mode, and
// `equivalent --add`. tdd.mjs runs in-process through the shared fixture. Run: node --test tdd.mut-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { put } from './test-fixture.mjs';
import { ADR_FILE, CALC, CALC_TEST, FG, INTERFACE_MARK, TW_OFF, adrText, jsTest, mfx, mutantId } from './fixtures/mutation.mjs';

const FAST = { mode: 'fast' };
const WRITER_ON = { PTDD_TEST_WRITER_ENABLED: 'true' }; // the shared fixture turns the test writer off in process.env

// ---------------------------------------------------------------- the flags a gate reads
test('should stop a gate with exit 2 and name the fix when a mutation flag value is not valid at green', async t => {
  const fx = mfx(t, { env: TW_OFF });
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2]]) });
  const r = await fx.go('green', ['--group', 'a'], { PTDD_MUTATION_SCORE_MIN: 'high' });
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /PTDD_MUTATION_SCORE_MIN=high is not valid: use a whole number from 0 to 100/);
});

test('should stop final with exit 2 when PTDD_MUTATION_MAX is not valid at the final gate', async t => {
  const fx = mfx(t, { env: TW_OFF });
  await fx.planOk();
  const r = await fx.go('final', [], { PTDD_MUTATION_MAX: 'ten' });
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /PTDD_MUTATION_MAX=ten is not valid/);
});

// ---------------------------------------------------------------- green --retest while the test writer is on
test('should refuse green --retest with exit 2 when a fast plan runs with the test writer on', async t => {
  const fx = mfx(t, { adr: 'iface', plan: FAST, env: WRITER_ON });
  await fx.planOk();
  const r = await fx.go('green', ['--group', 'a', '--retest']);
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /green --retest is refused while the test writer is on/);
});

test('should not refuse green --retest when the plan is not fast', async t => {
  const fx = mfx(t, { env: { PTDD_TEST_WRITER_ENABLED: 'true' } });
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: jsTest([['f', 2]]) });
  const r = await fx.go('green', ['--group', 'a', '--retest']);
  assert.equal(r.status, 0, r.err);
});

// ---------------------------------------------------------------- the ADR Interface a fast plan with the test writer needs
test('should stop plan with exit 2 and say the Interface is missing when the ADR of a fast plan has no Interface section', async t => {
  const bare = mfx(t, { adr: 'bare', plan: FAST, env: WRITER_ON });
  const r = await bare.planRaw();
  assert.equal(r.status, 2, r.err);
  assert.match(r.err, /has no `## Interface` section with text under it/);
  const empty = mfx(t, { adr: 'empty', plan: FAST, env: WRITER_ON });
  const e = await empty.planRaw();
  assert.equal(e.status, 2, e.err);
  assert.match(e.err, /has no `## Interface` section with text under it/);
});

test('should pass the whole Interface text to the Workflow args when the ADR has one', async t => {
  const fx = mfx(t, { adr: 'iface', plan: FAST, env: WRITER_ON });
  await fx.planOk();
  assert.ok(fx.args.interface.startsWith('```mermaid'), fx.args.interface.slice(0, 40));
  assert.ok(fx.args.interface.includes(INTERFACE_MARK));
  assert.equal(fx.args.testWriter, true);
});

// ---------------------------------------------------------------- equivalent --add
const REASON = 'neither value is read by any caller here; 3 and 4 behave the same';
const SURVIVORS = [['f', 1, 'export const f = () => 3;'], ['g', 2, 'export const g = () => 4;']].map(([name, line, text]) => ({ name, line, id: mutantId(CALC, line, 'const-inc', text) }));
const marks = fx => JSON.parse(readFileSync(join(fx.run, 'mutation-equivalent.json'), 'utf8')).marks;

/** two surviving mutants (a test that checks nothing), then the equivalent command */
async function twoSurvivors(t) {
  const fx = mfx(t, { env: TW_OFF });
  await fx.planOk();
  put(fx.repo, { [CALC_TEST]: jsTest([]) });
  assert.match((await fx.go('red', ['--group', 'a'])).out, /^RED a/);
  put(fx.repo, { [CALC]: FG });
  assert.match((await fx.go('green', ['--group', 'a'])).out, /^GREEN a ok=false/);
  return fx;
}

test('should record the file and line of the marked mutant itself when several mutants survive', async t => {
  const fx = await twoSurvivors(t);
  for (const s of [SURVIVORS[1], SURVIVORS[0]]) {
    const r = await fx.go('equivalent', ['--add', s.id, '--reason', REASON]);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, new RegExp(`^EQUIVALENT ${s.id} ${CALC}:${s.line} marked`));
  }
  assert.deepEqual(marks(fx).map(m => [m.id, m.file, m.line]).sort(), SURVIVORS.map(s => [s.id, CALC, s.line]).sort());
});

test('should exit 2 and write nothing when equivalent is called without an id or without a reason', async t => {
  const fx = await twoSurvivors(t);
  for (const args of [['--reason', REASON], ['--add', SURVIVORS[0].id], []]) {
    const r = await fx.go('equivalent', args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.err}`);
    assert.match(r.err, /equivalent needs --add <mutant id> --reason <text>/);
  }
});

test('should exit 1 and write nothing when the id is not a surviving mutant', async t => {
  const fx = await twoSurvivors(t);
  const r = await fx.go('equivalent', ['--add', 'X-00000000', '--reason', REASON]);
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /not a survivor/);
});
