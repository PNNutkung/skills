// End to end with the DEFAULT environment (no PTDD_* flag set: fast pipeline, quick driver gate, gate reuse, courier skip, parallel review all on), the way a real run starts.
// The REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name; 3 independent groups, 6 DoD items, 18 pairs (test-e2e-default.mjs).
// e2e.default.strays.test.mjs runs the same fixture with files outside the plan left in the repo.
// flags: defaults. This file is the model for rules/flag-defaults-e2e.md.
//   node --test e2e.default.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEED_ENV } from './speed.mjs';
import { HERE } from './test-e2e-run.mjs';
import { allDone, runDefault } from './test-e2e-default.mjs';

// the env a real run starts with: no PTDD_* speed flag and no ZT_* flag, whatever the shell running the tests has set
const DEFAULT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !Object.values(SPEED_ENV).includes(k) && !/^ZT_/.test(k)));
const spawn = (file, args, fixtureEnv) => spawnSync(file, args, { encoding: 'utf8', env: { ...DEFAULT_ENV, ...fixtureEnv } });

test('default flags, 3 independent groups: one tdd-driver and one navigator each, the courier skipped, verify proves all 18 DoD pairs', async () => {
  const r = await runDefault(spawn);
  allDone(r);
  assert.deepEqual([r.ARGS.mode, r.ARGS.speed?.courierSkip, r.out.courierSkipped], ['fast', true, true]);
  assert.deepEqual(r.labels.filter(l => /^(tdd|red|green)-/.test(l)).sort(), ['green-navigator:a', 'green-navigator:b', 'green-navigator:c', 'tdd-driver:a', 'tdd-driver:b', 'tdd-driver:c']);
  assert.ok(r.outputs.some(([k]) => k === 'green-quick'), 'the drivers ran a quick GREEN');
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, cmd, o]) => /--reuse/.test(cmd) && /reused:/.test(o)), 'the navigators reused the drivers\' full runs');
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.final, r.verify.notDone], [18, 18, true, []], JSON.stringify(r.verify));
});

test('SKILL.md has the lead keep its run files out of the repo: a file it writes there is a stray that fails final', () => {
  const md = readFileSync(join(HERE, 'SKILL.md'), 'utf8');
  assert.doesNotMatch(md, />\s*args\.json/, 'tdd.mjs plan already writes $RUN/args.json');
  assert.deepEqual([...md.matchAll(/(\S*)return\.json/g)].map(m => m[1]).filter(p => !/\$RUN\/$/.test(p)), [], 'every return.json is $RUN/return.json');
  assert.deepEqual([...md.matchAll(/--plan (\S+)/g)].map(m => m[1]).filter(p => !p.startsWith('$W/') && !p.startsWith('<')), [], 'plan.json is written outside the repo');
});
