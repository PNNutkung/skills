// triage.py's env flags (ZT_AGENT_MAX, ZT_SELF_REVIEW_GUARD_ENABLED): run with node --test. Needs python3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRIAGE = join(dirname(fileURLToPath(import.meta.url)), 'triage.py');
// -> { value } or { error }: the function's result, or the message of the FlagError it raised
const call = (fn, env) => {
  const py = `import importlib.util,sys,json\ns=importlib.util.spec_from_file_location("t",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\ntry: print(json.dumps({"value": m.${fn}(json.loads(sys.argv[2]))}))\nexcept m.FlagError as e: print(json.dumps({"error": str(e)}))`;
  const r = spawnSync('python3', ['-I', '-c', py, TRIAGE, JSON.stringify(env)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('should read ZT_AGENT_MAX as a whole number above 0, and as no limit when unset or unlimited', () => {
  for (const [raw, want] of [['25', 25], ['1', 1], ['', null], ['unlimited', null], ['Unlimited', null]]) {
    assert.deepEqual(call('agent_max', { ZT_AGENT_MAX: raw }), { value: want }, JSON.stringify(raw));
  }
  assert.deepEqual(call('agent_max', {}), { value: null });
});

test('should stop with the fix when ZT_AGENT_MAX is not valid or the old ZT_AGENT_CAP is set', () => {
  for (const raw of ['0', '-1', 'abc', '2.5', '1e3']) {
    assert.deepEqual(call('agent_max', { ZT_AGENT_MAX: raw }), { error: `ZT_AGENT_MAX=${raw} is not valid: use a whole number above 0, or unlimited` }, raw);
  }
  assert.match(call('agent_max', { ZT_AGENT_CAP: '5' }).error, /ZT_AGENT_CAP was renamed: use ZT_AGENT_MAX=<number> or ZT_AGENT_MAX=unlimited/);
});

test('should turn on blue/red only when ZT_SELF_REVIEW_GUARD_ENABLED is true, and stop on any other value or the old name', () => {
  for (const [raw, want] of [['true', true], ['TRUE', true], ['false', false], ['', false]]) {
    assert.deepEqual(call('blue_red', { ZT_SELF_REVIEW_GUARD_ENABLED: raw }), { value: want }, JSON.stringify(raw));
  }
  for (const raw of ['1', '0', 'yes']) assert.deepEqual(call('blue_red', { ZT_SELF_REVIEW_GUARD_ENABLED: raw }), { error: `ZT_SELF_REVIEW_GUARD_ENABLED=${raw} is not valid: use true or false` }, raw);
  assert.match(call('blue_red', { ZT_SELF_REVIEW_GUARD: '1' }).error, /ZT_SELF_REVIEW_GUARD was renamed: use ZT_SELF_REVIEW_GUARD_ENABLED=true/);
});

test('should exit 2 with the fix when triage.py runs with a flag that is not valid', () => {
  const r = spawnSync('python3', ['-I', TRIAGE, '--self-test'], { encoding: 'utf8', env: { ...process.env, ZT_AGENT_MAX: 'lots' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ZT_AGENT_MAX=lots is not valid/);
});
