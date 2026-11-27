// End to end with the DEFAULT environment (no PTDD_* flag set: fast pipeline, quick driver gate, gate reuse, courier skip, parallel review, the test writer (ADR 0011)
// and the mutation gate at min 100 with no final cap all on), the way a real run starts. The plan reads its DoD from an ADR with an `## Interface` section (dodFile).
// The REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name; 3 independent groups, 6 DoD items, 18 pairs (test-e2e-default.mjs):
// a test writer writes each group's tests and proves RED, a code driver writes the code and proves GREEN, a judge marks the one survivor only the final gate finds.
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
import { INTERFACE_MARK, allDone, runDefault } from './test-e2e-default.mjs';

// the env a real run starts with: no PTDD_* flag and no ZT_* flag, whatever the shell running the tests has set
const DEFAULT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !Object.values(SPEED_ENV).includes(k) && !/^(ZT|PTDD)_/.test(k)));
const spawn = (file, args, fixtureEnv) => spawnSync(file, args, { encoding: 'utf8', env: { ...DEFAULT_ENV, ...fixtureEnv } });

// the name is kept from before ADR 0011 (a rename needs a rules/checks/test-merges.json entry): the body now proves the test writer, code driver and judge flow
test('default flags, 3 independent groups: one tdd-driver and one navigator each, the courier skipped, verify proves all 18 DoD pairs', async () => {
  const r = await runDefault(spawn, { survivor: true });
  const of = node => r.labels.filter(l => l.startsWith(`${node}:`)).map(l => l.split(':')[1]).sort();
  assert.deepEqual([of('test-writer'), of('code-driver')], [['a', 'b', 'c'], ['a', 'b', 'c']], r.labels.join(', '));
  assert.deepEqual(r.labels.filter(l => /^(tdd|red|green)-driver/.test(l)), [], 'no agent writes both the tests and the code');
  for (const c of r.calls.filter(x => x.label.startsWith('test-writer:'))) assert.ok(c.prompt.includes(INTERFACE_MARK), `${c.label} reads the ADR Interface`);
  assert.ok(r.outputs.some(([k]) => k === 'green-quick'), 'the code drivers ran a quick GREEN');
  // the judge: after the reviewer's final gate found the survivor of group c, it marked it through tdd.mjs equivalent, and final ran again with the mark
  const judges = r.labels.filter(l => /^judge\b/.test(l));
  assert.equal(judges.length, 1, r.labels.join(', '));
  assert.ok(r.events.indexOf(`start ${judges[0]}`) > r.events.indexOf('end reviewer'), 'the judge runs after the final gate');
  assert.deepEqual((r.equivalent?.marks ?? []).map(m => [m.file, m.line]), [['src/countWords.mjs', 5]], JSON.stringify(r.equivalent));
  allDone(r);
  assert.deepEqual([r.ARGS.mode, r.ARGS.speed?.courierSkip], ['fast', true]);
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.final, r.verify.notDone], [18, 18, true, []], JSON.stringify(r.verify));
});

test('SKILL.md has the lead keep its run files out of the repo: a file it writes there is a stray that fails final', () => {
  const md = readFileSync(join(HERE, 'SKILL.md'), 'utf8');
  assert.doesNotMatch(md, />\s*args\.json/, 'tdd.mjs plan already writes $RUN/args.json');
  assert.deepEqual([...md.matchAll(/(\S*)return\.json/g)].map(m => m[1]).filter(p => !/\$RUN\/$/.test(p)), [], 'every return.json is $RUN/return.json');
  assert.deepEqual([...md.matchAll(/--plan (\S+)/g)].map(m => m[1]).filter(p => !p.startsWith('$W/') && !p.startsWith('<')), [], 'plan.json is written outside the repo');
});
