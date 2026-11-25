// e2e: the CLI as a started process on a fixture git repo, running a real node --test and a tiny CLI with a flag.
// flags: defaults (the first test sets no VERIFY_ flag, the way a real run starts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUG, goodPlan, makeRepo } from './fixture.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'verify.mjs');
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VERIFY_') && k !== 'NODE_TEST_CONTEXT'));

function fixture() {
  const fx = makeRepo();
  const env = { ...clean, VERIFY_CACHE_DIR: fx.cache, CLAUDE_CODE_SESSION_ID: `e2e-${Math.random().toString(16).slice(2)}` };
  const cli = (args, extra = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: fx.repo, env: { ...env, ...extra }, encoding: 'utf8' });
    return { code: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop() || '{}'), stderr: r.stderr };
  };
  return { ...fx, cli };
}

function openWithPlan(fx, plan = goodPlan(), extra = {}) {
  const o = fx.cli(['open', '--slug', SLUG], extra);
  assert.equal(o.code, 0, JSON.stringify(o));
  writeFileSync(join(o.out.run, 'plan.json'), JSON.stringify(plan));
  return o.out;
}

test('should run the real node --test and the three flag runs and write passing sections when no VERIFY_ flag is set (flags: defaults) (Run, FlagRuns, Presets)', () => {
  const fx = fixture();
  const o = openWithPlan(fx);
  const p = fx.cli(['plan']);
  assert.equal(p.code, 0, JSON.stringify(p.out));
  const r = fx.cli(['run']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  const md = readFileSync(o.verifyFile, 'utf8');
  assert.match(md, /## AC1\n[^\n]*\nenv: cloud \(local shell\)\nrun: node --test tool\.test\.mjs\nresult: pass\n/);
  assert.match(md, /should print x when the tool runs \(AC1\)/);
  assert.match(md, /--- 3\/3 DEMO_X_ENABLED=maybe \(invalid\): exit 2 ---/);
  assert.equal(fx.cli(['status']).out.items.every(i => i.result === 'pass' && i.intact), true);
  assert.equal(fx.cli(['close']).code, 0);
});

test('should fail the item and write the real output when the node test fails (flags: defaults) (Fail, Presets)', () => {
  const fx = fixture();
  writeFileSync(join(fx.repo, 'tool.test.mjs'), "import { test } from 'node:test';\ntest('should break when run (AC1)', () => { throw new Error('boom'); });\n");
  const o = openWithPlan(fx);
  const r = fx.cli(['run']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.out.failed.map(f => f.id), ['AC1']);
  assert.deepEqual(r.out.passed, ['Flag1']);
  assert.match(readFileSync(o.verifyFile, 'utf8'), /## AC1\n[\s\S]*result: fail\n[\s\S]*boom/);
});

test('should run the same with the guard flag true or false when VERIFY_GUARD_ENABLED is set (flags: on, off) (Guard)', () => {
  for (const v of ['true', 'FALSE']) {
    const fx = fixture();
    openWithPlan(fx, goodPlan(), { VERIFY_GUARD_ENABLED: v });
    assert.equal(fx.cli(['run', '--only', 'Flag1'], { VERIFY_GUARD_ENABLED: v }).code, 0, v);
  }
});

test('should stop a slow command and write a timeout fail when VERIFY_RUN_TIMEOUT_MAX is set (Timeout)', () => {
  const fx = fixture();
  const plan = goodPlan();
  plan.items[0] = { id: 'AC1', env: 'cloud', run: 'echo begun; sleep 20', expect: 'begun' };
  const o = openWithPlan(fx, plan);
  const t0 = Date.now();
  const r = fx.cli(['run'], { VERIFY_RUN_TIMEOUT_MAX: '1' });
  assert.ok(Date.now() - t0 < 10000);
  assert.equal(r.code, 1);
  assert.deepEqual(r.out.failed.map(f => f.id), ['AC1']);
  assert.match(readFileSync(o.verifyFile, 'utf8'), /why: timeout after 1s/);
  assert.equal(fx.cli(['run', '--only', 'Flag1'], { VERIFY_RUN_TIMEOUT_MAX: 'unlimited' }).code, 0);
});

test('should exit 2 and name the fix when a VERIFY_ flag is invalid or removed (flags: invalid) (Timeout, Guard)', () => {
  const fx = fixture();
  for (const [k, v] of [['VERIFY_RUN_TIMEOUT_MAX', '0'], ['VERIFY_RUN_TIMEOUT_MAX', 'abc'], ['VERIFY_GUARD_ENABLED', 'yes'], ['VERIFY_FLAG_RUNS_ENABLED', 'false']]) {
    const r = fx.cli(['open', '--slug', SLUG], { [k]: v });
    assert.equal(r.code, 2, `${k}=${v}`);
    assert.match(r.out.errors[0], new RegExp(k));
  }
});
