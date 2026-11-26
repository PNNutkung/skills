// End to end, PTDD_INPROCESS_RUNNER_ENABLED (ADR 0008 A4, A10): the REAL tdd.mjs CLI runs plan, RED and GREEN (test probe, mutation probe) through the built-in
// direct-run.mjs with the flag true (in-process) and false (a node process per command) on the same repo; the gate JSON is the same but for timings and ids.
//   node --test e2e.inproc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, fixture, put } from './test-fixture.mjs';

const DIRECT_RUNNER = join(HERE, 'direct-run.mjs');
const FLAG = 'PTDD_INPROCESS_RUNNER_ENABLED';
const SAME_TIME = { GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' }; // snapshot commits made at one time: their ids must match too
const lastJson = out => JSON.parse(out.trim().split('\n').pop());
// one JS group, so the mutation probe has mutants to run through the runner too
const CALC_PLAN = { dod: [{ id: 'AC1', text: 'f gives 2', source: 'assumed', kinds: ['happy'] }], groups: [{ id: 'a', tests: ['tests/test_calc.sh'], src: ['src/calc.mjs'], dod: ['AC1'], after: [] }] };
const CALC_TEST = `# test_ac1_happy\ntest -f src/calc.mjs || { echo 'no src/calc.mjs'; exit 1; }\n${process.execPath} -e "import('./src/calc.mjs').then(m => process.exit(m.f(1) === 2 ? 0 : 1))"\n`;

// timings and the ids of ledger entries differ from run to run; everything else must not
const TIMING = new Set(['sec', 'ms', 'seconds', 'elapsed', 'durationMs']);
const scrub = (v, runs) => {
  if (Array.isArray(v)) return v.map(x => scrub(x, runs));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !TIMING.has(k)).map(([k, x]) => [k, scrub(x, runs)]));
  if (typeof v !== 'string') return v;
  let s = v;
  for (const r of runs) s = s.replaceAll(r, '<run>');
  return s.replace(/\/(\w+)-[A-Za-z0-9]{6}\b/g, '/$1-<tmp>').replace(/r[0-9a-z]{6,}-[0-9a-z]{4}/g, '<id>').replace(/\b\d+(\.\d+)? ?s\b/g, '<t>');
};
const gates = run => Object.fromEntries(readdirSync(join(run, 'gates')).filter(f => f.endsWith('.json')).sort().map(f => [f, JSON.parse(readFileSync(join(run, 'gates', f), 'utf8'))]));
const ledger = run => readFileSync(join(run, 'exec.jsonl'), 'utf8').trim().split('\n').map(l => { const { id: _i, ts: _t, sec: _s, ...e } = JSON.parse(l); return e; });

test('should give the same gate JSON, ledger and exit codes for plan, RED and GREEN when PTDD_INPROCESS_RUNNER_ENABLED is true or false (RunnerFlag, Parity)', async t => {
  const fx = fixture(t, { plan: CALC_PLAN });
  fx.runner = DIRECT_RUNNER; // the built-in runner, named as the e2e tests name it
  const cli = (flag, cmd, args = []) => fx.cli(cmd, args, { [FLAG]: flag, ...SAME_TIME });
  const runs = {}, outs = { true: [], false: [] };
  for (const flag of ['false', 'true']) {
    fx.run = undefined;
    const r = cli(flag, 'plan', ['--plan', join(fx.dir, 'plan.json')]);
    assert.equal(r.status, 0, r.err);
    runs[flag] = lastJson(r.out).runDir;
  }
  const each = (cmd, args) => { for (const flag of ['false', 'true']) { fx.run = runs[flag]; const r = cli(flag, cmd, args); outs[flag].push([cmd, r.status, r.out, r.err]); } };
  put(fx.repo, { 'tests/test_calc.sh': CALC_TEST });
  each('red', ['--group', 'a']);
  put(fx.repo, { 'src/calc.mjs': 'export const f = n => n + 1;\n' });
  each('green', ['--group', 'a']);
  const both = Object.values(runs).flatMap(r => [r, JSON.parse(readFileSync(join(r, 'plan.json'), 'utf8')).scratch]); // the run folder and the scratch dir of each plan
  assert.deepEqual(scrub(outs.true, both), scrub(outs.false, both), 'stdout, stderr and exit codes');
  assert.deepEqual(outs.true.map(o => o[1]), [0, 0]);
  const g = { true: gates(runs.true), false: gates(runs.false) };
  assert.deepEqual(Object.keys(g.true), Object.keys(g.false));
  assert.deepEqual(scrub(g.true, both), scrub(g.false, both), 'gate JSON');
  const green = Object.entries(g.true).find(([f]) => /green/.test(f))[1];
  assert.equal(green.ok, true, JSON.stringify(green));
  assert.ok(green.mutation.score.total > 0, JSON.stringify(green.mutation));
  assert.deepEqual(scrub(ledger(runs.true), both).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    scrub(ledger(runs.false), both).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), 'the same ledger lines, ids and timestamps aside');
});

test('should stop plan and a gate with exit 2 and the fix when PTDD_INPROCESS_RUNNER_ENABLED is neither true nor false (RunnerFlag)', async t => {
  const fx = fixture(t);
  fx.runner = DIRECT_RUNNER;
  const bad = fx.cli('plan', ['--plan', join(fx.dir, 'plan.json')], { [FLAG]: 'yes' });
  assert.deepEqual([bad.status, bad.err.trim()], [2, 'tdd: PTDD_INPROCESS_RUNNER_ENABLED=yes is not valid: use true or false']);
  const ok = fx.cli('plan', ['--plan', join(fx.dir, 'plan.json'), '--skip-preflight']);
  assert.equal(ok.status, 0, ok.err);
  fx.run = lastJson(ok.out).runDir;
  const red = fx.cli('red', ['--group', 'a'], { [FLAG]: 'on' });
  assert.deepEqual([red.status, red.err.trim()], [2, 'tdd: PTDD_INPROCESS_RUNNER_ENABLED=on is not valid: use true or false']);
});
