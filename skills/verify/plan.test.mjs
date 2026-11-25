import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlan, flipped } from './plan.mjs';

const items = [{ id: 'AC1', text: 't' }, { id: 'AC2', text: 't' }];
const ctx = { items, booked: ['cloud', 'ci'], newFlags: [], answers: { A1: 'ok', A4: 'run it on my box' } };
const good = { items: [{ id: 'AC1', env: 'cloud', run: 'node --test a.test.mjs' }, { id: 'AC2', env: 'ci', ci: 'test' }] };
const errs = (plan, c = ctx) => checkPlan(plan, c).errors.join('\n');

test('should accept a plan that covers every item and booked env and fill the preset expect when it is complete (Plan)', () => {
  const r = checkPlan(good, ctx);
  assert.equal(r.ok, true, r.errors.join());
  assert.deepEqual(r.entries.map(e => e.kind), ['run', 'ci']);
  assert.match(r.entries[0].expectLine, /node --test preset/);
  assert.deepEqual(r.needsAsk, []);
});

test('should refuse a plan that misses a DoD item or a booked env and list every error when it is incomplete (Plan fail)', () => {
  const e = errs({ items: [{ id: 'AC1', env: 'cloud', run: 'node --test' }] });
  assert.match(e, /AC2: no plan entry/);
  assert.match(e, /booked env \[ci\] has no entry/);
});

test('should refuse an unknown id, a duplicate, an unbooked env and a missing env when entries are wrong (Plan edge)', () => {
  const e = errs({ items: [...good.items, { id: 'AC1', env: 'cloud', run: 'x' }, { id: 'ZZ', env: 'staging', run: 'node a.mjs' }] });
  assert.match(e, /duplicate entry AC1/);
  assert.match(e, /ZZ is not a DoD item/);
  assert.match(e, /env "staging" is not booked/);
  assert.match(errs({ items: [{ id: 'AC1', run: 'node a.mjs' }] }, { ...ctx, booked: [] }), /AC1: no env/);
  assert.match(errs(null), /plan.json must be an object with items/);
  assert.match(errs({ items: [] }, { ...ctx, items: [] }), /no items to verify/);
});

test('should accept any env name when the ADR books none (Envs edge)', () => {
  assert.equal(checkPlan({ items: [{ id: 'AC1', env: 'laptop', run: 'node a.mjs' }, { id: 'AC2', env: 'x', run: 'node b.mjs' }] }, { ...ctx, booked: [] }).ok, true);
});

test('should refuse a weak expect with the reason when the plan has one (ExpectLint)', () => {
  assert.match(errs({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node a.mjs', expect: 'ok' }] }), /bare word/);
  assert.match(errs({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'npm test' }] }), /looks like a test run/);
});

test('should need an entry with the flag for every new flag and work out the flipped value when flags are added (FlagRuns)', () => {
  const c = { ...ctx, newFlags: ['DEMO_X_ENABLED'] };
  assert.match(errs(good, c), /new flag DEMO_X_ENABLED has no entry/);
  const plan = { items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node tool.mjs', expect: '/x=/', flag: { name: 'DEMO_X_ENABLED', default: 'true' } }] };
  assert.equal(checkPlan(plan, c).ok, true, errs(plan, c));
  assert.equal(flipped({ name: 'A_ENABLED', default: 'TRUE' }), 'false');
  assert.equal(flipped({ name: 'A_ENABLED', default: 'false' }), 'true');
  assert.equal(flipped({ name: 'A_MAX', default: 'unlimited', flipped: '5' }), '5');
});

test('should refuse a flag entry with a bad name, no flipped value, or not run locally when the flag part is wrong (FlagRuns fail)', () => {
  const mk = flag => ({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node t.mjs', expect: 'x=1', ...flag }] });
  assert.match(errs(mk({ flag: { name: 'lower', default: 'true' } })), /flag name/);
  assert.match(errs(mk({ flag: { name: 'A_MAX', default: 'unlimited' } })), /flipped/);
  assert.match(errs(mk({ flag: { name: 'A_ENABLED', default: 'true' }, remote: true, approved: 'A4' })), /flag runs need a local run/);
});

test('should refuse a remote entry with no approved answer and list it in needsAsk when the user was not asked (Ask)', () => {
  const plan = { items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node a.mjs', remote: true }] };
  const r = checkPlan(plan, ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /AC2: remote run needs the user's approval/);
  assert.deepEqual(r.needsAsk, ['AC2']);
  const ok = checkPlan({ items: [good.items[0], { ...plan.items[1], approved: 'A4' }] }, ctx);
  assert.equal(ok.ok, true, ok.errors.join());
  assert.equal(ok.entries[1].kind, 'remote');
  assert.match(errs({ items: [good.items[0], { ...plan.items[1], approved: 'A7' }] }), /A7 is not in answers.md/);
});

test('should refuse an entry with no command, ci, remote or accepted answer and accept an image or an accepted answer when the plan has them (Image)', () => {
  assert.match(errs({ items: [good.items[0], { id: 'AC2', env: 'ci', image: 'shot.png' }] }), /AC2: no command, no ci, no remote and no accepted answer/);
  const r = checkPlan({ items: [good.items[0], { id: 'AC2', env: 'ci', accepted: 'A1' }] }, ctx);
  assert.equal(r.ok, true, r.errors.join());
  assert.equal(r.entries[1].kind, 'accept');
  assert.match(errs({ items: [good.items[0], { id: 'AC2', env: 'ci', accepted: 'A2' }] }), /A2 is not in answers.md/);
  assert.equal(checkPlan({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node shot.mjs', image: 'out/s.png' }] }, ctx).ok, true);
  assert.match(errs({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node s.mjs', image: '/abs.png' }] }), /image must be a path inside the repo/);
});

test('should refuse an exit that is not a whole number from 0 to 255 when the plan names one (Expect edge)', () => {
  assert.match(errs({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node a.mjs', exit: 'x' }] }), /exit must be a whole number/);
});

test('should accept exit 0 and exit 255 when the plan names a must-pass or must-fail code (Expect edge)', () => {
  for (const exit of [0, 255]) assert.equal(checkPlan({ items: [good.items[0], { id: 'AC2', env: 'ci', run: 'node a.mjs', exit, expect: 'failed: no input' }] }, ctx).ok, true, String(exit));
});

test('should refuse an entry with no id and not throw when an entry is an object without id or not an object (Plan edge)', () => {
  assert.match(errs({ items: [...good.items, { env: 'cloud', run: 'node a.mjs' }] }), /\{"env":"cloud","run":"node a.mjs"\} has no id/);
  assert.match(errs({ items: [...good.items, null] }), /entry null has no id/);
});

test('should accept a flag name with digits 2 to 9 when the flag entry names one (FlagRuns edge)', () => {
  const r = checkPlan({ items: [{ id: 'AC1', env: 'cloud', run: 'node --test a.test.mjs', flag: { name: 'V2_ENABLED', default: true } }, good.items[1]] }, { ...ctx, newFlags: ['V2_ENABLED'] });
  assert.equal(r.ok, true, r.errors.join());
});
