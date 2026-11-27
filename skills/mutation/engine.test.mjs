// Integration tests for engine.mjs runMutation (ADR 0011 Interface): a temp git repo with a tiny JS module and a node:test file, run through paired-agent-tdd's
// direct-run.mjs. Line 2 of src/calc.mjs is pinned by the test (its mutants are killed), line 6 is never tested (its mutants survive).
// Result.score is scoreOf(result.mutants, {min: scoreMin}) and Result.pass is score.pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KILLED_LINE, SURVIVOR_LINE, calcOpts, calcRepo, tempDir } from './fixtures/repo.mjs';
import { runMutation } from './engine.mjs';
import { scoreOf } from './score.mjs';

const REASON = 'half is not part of this change, judged equivalent for the test';

test('should kill the mutants of the tested line and report the untested line as survivors when it runs on a change (Module happy)', async t => {
  const fx = calcRepo(t);
  const r = await runMutation(calcOpts(fx));
  assert.ok(r.available >= 4, `available ${r.available}`);
  assert.deepEqual(r.tests, { run: ['test/calc.test.mjs'], notUsable: [] });
  const killed = r.mutants.filter(m => m.line === KILLED_LINE), survived = r.mutants.filter(m => m.line === SURVIVOR_LINE);
  assert.ok(killed.length > 0 && killed.every(m => m.result === 'killed' && m.by === 'test/calc.test.mjs'), JSON.stringify(killed));
  assert.ok(survived.length > 0 && survived.every(m => m.result === 'survived'), JSON.stringify(survived));
  for (const m of r.mutants) {
    for (const k of ['id', 'file', 'line', 'op', 'before', 'after', 'result']) assert.ok(k in m, `mutant has ${k}`);
    assert.equal(m.file, 'src/calc.mjs');
    assert.ok(!('newLine' in m));
  }
  assert.deepEqual(r.score, scoreOf(r.mutants, { min: 100 }));
  assert.ok(Math.abs(r.score.value - (100 * killed.length) / r.mutants.length) < 1e-9);
  assert.equal(r.pass, false, 'a survivor fails the default scoreMin 100');
  assert.equal(JSON.parse(JSON.stringify(r)).mutants.length, r.mutants.length, 'a Result is plain JSON data');

  // the same run with the survivors marked equivalent: they leave the score and the run passes; a stale mark changes nothing
  const eq = join(fx.dir, 'mutation-equivalent.json');
  const marks = survived.map(m => ({ id: m.id, file: m.file, line: m.line, reason: REASON, judge: 'judge' }));
  writeFileSync(eq, JSON.stringify({ schema: 1, marks: [...marks, { id: 'X-0ld0ld00', file: 'src/calc.mjs', line: 2, reason: REASON, judge: 'judge' }] }));
  const marked = await runMutation(calcOpts(fx, { equivalent: eq }));
  assert.deepEqual(marked.mutants.filter(m => m.line === SURVIVOR_LINE).map(m => m.result), survived.map(() => 'equivalent'));
  assert.deepEqual(marked.mutants.filter(m => m.line === KILLED_LINE).map(m => m.result), killed.map(() => 'killed'));
  assert.equal(marked.score.value, 100);
  assert.equal(marked.score.equivalent, survived.length);
  assert.equal(marked.pass, true);
});

test('should pass when the score reaches scoreMin and fail just above it (Module edge)', async t => {
  const fx = calcRepo(t);
  const low = await runMutation(calcOpts(fx, { scoreMin: 0, max: 'unlimited', budget: 'none' }));
  const value = low.score.value;
  assert.ok(value > 0 && value < 100, String(value));
  assert.equal(low.pass, true);
  const at = await runMutation(calcOpts(fx, { scoreMin: Math.floor(value) }));
  assert.equal(at.pass, true);
  const above = await runMutation(calcOpts(fx, { scoreMin: Math.floor(value) + 1 }));
  assert.equal(above.pass, false);
  assert.equal(above.score.value, value, 'scoreMin changes only pass');
});

test('should run a mutant only against the tests whose imports reach its file when select is imports (FinalSpeed happy)', async t => {
  // other.test.mjs imports nothing from src and appends a line to a log each time it runs (the direct runner does not confine it)
  const log = join(tempDir(t).dir, 'other.log');
  const fx = calcRepo(t, { extra: { 'test/other.test.mjs': `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, 'ran\\n');\n` } });
  const runs = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0);
  const imports = await runMutation(calcOpts(fx));
  const afterImports = runs();
  assert.ok(afterImports <= 1, `other.test.mjs runs at most once (its baseline) with select imports, ran ${afterImports}`);
  assert.ok(imports.mutants.some(m => m.result === 'survived') && imports.mutants.some(m => m.result === 'killed'));
  const every = await runMutation(calcOpts(fx, { select: 'all' }));
  assert.ok(runs() - afterImports > 1, 'select all runs every test file against the survivors');
  assert.deepEqual(every.mutants.map(m => [m.id, m.result]), imports.mutants.map(m => [m.id, m.result]), 'the verdicts do not change, only the work');
});
