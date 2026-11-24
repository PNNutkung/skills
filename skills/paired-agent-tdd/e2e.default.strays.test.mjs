// End to end with the DEFAULT environment, as e2e.default.test.mjs: a real run left files outside the plan in the repo (an args file, a hook cache).
// The final gate fails on them alone, which is work left for the run, never a void of every group's proven pairs.
// flags: defaults (rules/flag-defaults-e2e.md).
//   node --test e2e.default.strays.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SPEED_ENV } from './speed.mjs';
import { allDone, runDefault } from './test-e2e-default.mjs';

// the env a real run starts with: no PTDD_* speed flag and no ZT_* flag, whatever the shell running the tests has set
const DEFAULT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !Object.values(SPEED_ENV).includes(k) && !/^ZT_/.test(k)));
const spawn = (file, args, fixtureEnv) => spawnSync(file, args, { encoding: 'utf8', env: { ...DEFAULT_ENV, ...fixtureEnv } });

test('default flags, files outside the plan left in the repo: final fails on them alone; verify names them as work left for the run and still proves all 18 pairs', async () => {
  const r = await runDefault(spawn, { strays: { 'args.json': '{"runDir":"x"}\n', '.hook-cache/state.json': '{}\n' } });
  allDone(r);
  assert.equal(r.out.courierSkipped, true);
  assert.equal(r.verify.final, false, JSON.stringify(r.verify));
  assert.deepEqual(r.verify.notDone.length, 1, JSON.stringify(r.verify.notDone));
  assert.match(r.verify.notDone[0], /^run: final gate not ok: files outside the plan changed: (\.hook-cache\/state\.json, args\.json|args\.json, \.hook-cache\/state\.json)$/);
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.dod.gaps], [18, 18, []], 'a stray file is no group\'s failure: every group\'s GREEN gate still proves its pairs');
});
