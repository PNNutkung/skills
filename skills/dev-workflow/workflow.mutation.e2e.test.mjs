// E2E for the dev-workflow mutation gate (ADR 0011 phase 3): the real workflow.mjs CLI as a child process on a fixture git repo whose run sits at tdd,
// with WORKFLOW_MUTATION_CHECK_ENABLED and WORKFLOW_MUTATION_SCORE_MIN unset, on, off and invalid. "next blocks then passes" is the verify env [cloud] check.
// Run: node --test skills/dev-workflow/workflow.mutation.e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CALC, CALC_SRC, CALC_TEST, CLI, PR, STRONG, TEST_CMD, WEAK, mrepo, mutationJson, names, survivorsOf, toTdd } from './fixtures/mutation.mjs';

/** fixture repo + cli(...args) spawning workflow.mjs with fx.env and `more` on top; the run is opened and put at tdd */
function atTdd(branch, more = {}) {
  const fx = mrepo({ branch });
  fx.cli = (...a) => {
    const r = spawnSync(process.execPath, [CLI, ...a], { cwd: fx.repo, env: { ...fx.env, ...more }, encoding: 'utf8' });
    let out = null;
    try { out = JSON.parse(r.stdout); } catch { out = { raw: r.stdout, err: r.stderr }; }
    return { code: r.status, out };
  };
  const opened = spawnSync(process.execPath, [CLI, 'open', '--slug', 'demo'], { cwd: fx.repo, env: fx.env, encoding: 'utf8' });
  fx.run = JSON.parse(opened.stdout).run;
  toTdd(fx.run);
  return fx;
}

/** weak tests block next with the survivors named; stronger tests on a new commit then pass with the kept test command */
function blocksThenPasses(more) {
  const fx = atTdd({ [CALC]: CALC_SRC, [CALC_TEST]: WEAK }, more);
  try {
    const shut = fx.cli('next', '--pr', PR, '--pr-body', fx.body, '--test-cmd', TEST_CMD);
    assert.equal(shut.code, 1, JSON.stringify(shut.out));
    const surv = survivorsOf(mutationJson(fx.run));
    assert.ok(surv.length >= 2, JSON.stringify(mutationJson(fx.run)));
    for (const s of surv) assert.ok(names(shut.out.errors ?? [], s), `${s.id} not named: ${JSON.stringify(shut.out)}`);
    assert.equal(fx.cli('status').out.step, 'tdd');
    fx.commit({ [CALC_TEST]: STRONG });
    const open = fx.cli('next');
    assert.equal(open.code, 0, JSON.stringify(open.out));
    assert.equal(open.out.step, 'verify');
    assert.equal(mutationJson(fx.run).pass, true);
  } finally { fx.done(); }
}

// flags: defaults: this test sets no flag, so the mutation check runs as a fresh install has it (on, min 100)
test('should block next from tdd on a survivor and pass once the tests kill it when the flags are unset (flags: defaults) (WorkflowGate happy, WorkflowGate fail, WorkflowRuns happy)', () => blocksThenPasses({}));

test('should block next from tdd on a survivor and pass once the tests kill it when the check is on with min 100 (flags: on) (WorkflowGate happy, WorkflowRuns happy, Flags happy)', () => blocksThenPasses({ WORKFLOW_MUTATION_CHECK_ENABLED: 'true', WORKFLOW_MUTATION_SCORE_MIN: '100' }));

test('should move from tdd to verify with survivors and no mutation run when the check is off (flags: off) (WorkflowGate edge, Flags happy)', () => {
  const fx = atTdd({ [CALC]: CALC_SRC, [CALC_TEST]: WEAK }, { WORKFLOW_MUTATION_CHECK_ENABLED: 'false' });
  try {
    const r = fx.cli('next', '--pr', PR, '--pr-body', fx.body);
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.equal(r.out.step, 'verify');
    assert.equal(existsSync(join(fx.run, 'mutation.json')), false);
  } finally { fx.done(); }
});

test('should exit 2 with the fix when a mutation flag value is not valid (flags: invalid) (Flags fail)', () => {
  for (const [name, value, fix] of [['WORKFLOW_MUTATION_CHECK_ENABLED', 'on', /use true or false/], ['WORKFLOW_MUTATION_SCORE_MIN', '-1', /use a whole number from 0 to 100/], ['WORKFLOW_MUTATION_SCORE_MIN', '99.5', /use a whole number from 0 to 100/]]) {
    const fx = atTdd({ [CALC]: CALC_SRC, [CALC_TEST]: STRONG }, { [name]: value });
    try {
      const r = fx.cli('next', '--pr', PR, '--pr-body', fx.body, '--test-cmd', TEST_CMD);
      assert.equal(r.code, 2, `${name}=${value}: ${JSON.stringify(r.out)}`);
      assert.match(r.out.errors[0], new RegExp(`${name}=${value.replace('.', '\\.')} is not valid`));
      assert.match(r.out.errors[0], fix);
      assert.equal(mutationJson(fx.run), null, 'nothing ran');
    } finally { fx.done(); }
  }
});
