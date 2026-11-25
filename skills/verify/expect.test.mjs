import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeExpect, judge, lintExpect, parseExpect, presetOf } from './expect.mjs';

const NODE_SPEC = '✔ should plan when items are there (Plan) (1ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0\n';
const NODE_TAP = 'ok 1 - should plan when items are there (Plan)\n# tests 1\n# pass 1\n# fail 0\n';
const ok = (entry, output, code = 0) => judge(entry, { code, output, timedOut: false });

test('should pass when the exit is 0 and the output holds the text or matches the regex the plan gives (Expect)', () => {
  assert.equal(ok({ id: 'X', run: 'node a.mjs', expect: 'saved 3 rows' }, 'x\nsaved 3 rows\n').pass, true);
  assert.equal(ok({ id: 'X', run: 'node a.mjs', expect: '/saved \\d+ ROWS/i' }, 'saved 12 rows').pass, true);
  assert.equal(ok({ id: 'X', run: 'node a.mjs' }, '').pass, true);
});

test('should fail and say why when the exit code or the expected text is wrong (Expect fail)', () => {
  const r = ok({ id: 'X', run: 'node a.mjs', expect: 'saved' }, 'nothing', 1);
  assert.equal(r.pass, false);
  assert.match(r.why.join('\n'), /exit 1, expected 0/);
  assert.match(r.why.join('\n'), /does not contain "saved"/);
  assert.match(ok({ id: 'X', run: 'node a.mjs', expect: '/^done$/m' }, 'undone').why.join(), /does not match/);
});

test('should pass a must-fail check only when it exits with the code the plan names (Expect edge)', () => {
  assert.equal(ok({ id: 'X', run: 'node a.mjs', exit: 2, expect: 'X_ENABLED' }, 'X_ENABLED=maybe is not valid', 2).pass, true);
  assert.equal(ok({ id: 'X', run: 'node a.mjs', exit: 2, expect: 'X_ENABLED' }, 'X_ENABLED', 0).pass, false);
  assert.equal(judge({ id: 'X', run: 'sleep 9' }, { code: null, output: '', timedOut: true, seconds: 1 }).pass, false);
  assert.match(judge({ id: 'X', run: 'sleep 9' }, { code: null, output: '', timedOut: true, seconds: 1 }).why.join(), /timeout after 1s/);
});

test('should know each preset runner when the command runs it directly or through npx or npm exec (Presets)', () => {
  const cases = { 'node --test a.test.mjs': 'node', 'node --experimental-x --test': 'node', 'cd x && node --test': 'node', 'pytest -v t.py': 'pytest', 'python -m pytest -v': 'pytest',
    'npx vitest run': 'vitest', 'npm exec jest -- --verbose': 'jest', 'jest': 'jest', 'go test -v ./...': 'go', 'npm test': null, 'node a.mjs': null, 'node --testx': null };
  for (const [run, want] of Object.entries(cases)) assert.equal(presetOf(run), want, run);
});

test('should pass a node --test run only when nothing failed, a test ran and a passing test names the item (Presets)', () => {
  const e = { id: 'Plan', run: 'node --test a.test.mjs' };
  assert.equal(ok(e, NODE_SPEC).pass, true);
  assert.equal(ok(e, NODE_TAP).pass, true);
  assert.equal(ok(e, NODE_SPEC.replace('fail 0', 'fail 1')).pass, false);
  assert.equal(ok(e, 'ℹ tests 0\nℹ pass 0\nℹ fail 0\n').pass, false);
  assert.equal(ok(e, NODE_SPEC.replace('(Plan)', '(Planning)')).pass, false);
  assert.equal(ok({ id: 'Run', run: 'node --test' }, NODE_SPEC).pass, false);
});

test('should check pytest, vitest, jest and go output the same way when those runners ran (Presets)', () => {
  assert.equal(ok({ id: 'Plan', run: 'pytest -v' }, 't.py::test_should_x_when_y_plan PASSED\n=== 3 passed in 0.1s ===').pass, true);
  assert.equal(ok({ id: 'Plan', run: 'pytest -v' }, 't.py::test_plan PASSED\n=== 1 failed, 3 passed ===').pass, false);
  assert.equal(ok({ id: 'Plan', run: 'npx vitest run' }, ' ✓ should x when y (Plan)\n      Tests  3 passed (3)').pass, true);
  assert.equal(ok({ id: 'Plan', run: 'npx jest --verbose' }, '  ✓ should x (Plan)\nTests:       1 failed, 2 passed, 3 total').pass, false);
  assert.equal(ok({ id: 'Plan', run: 'go test -v ./...' }, '--- PASS: TestPlanHappy (0.00s)\nPASS\nok  x 0.1s').pass, true);
  assert.equal(ok({ id: 'Plan', run: 'go test -v ./...' }, '--- PASS: TestPlanning (0.00s)\nok  x').pass, false);
  assert.equal(ok({ id: 'Plan', run: 'go test -v ./...' }, '--- PASS: TestPlan (0.00s)\n--- FAIL: TestOther\nFAIL').pass, false);
});

test('should hold both the preset and the agent expect when the plan adds an expect to a preset command (Presets edge)', () => {
  const e = { id: 'Plan', run: 'node --test', expect: 'extra line' };
  assert.equal(ok(e, NODE_SPEC).pass, false);
  assert.equal(ok(e, `${NODE_SPEC}extra line\n`).pass, true);
  assert.match(describeExpect(e), /node --test preset.*"extra line"/);
});

test('should refuse a bare word, an expect that matches empty output and a test command with no expect when the plan has them (ExpectLint)', () => {
  for (const w of ['ok', 'PASS', ' passed ', 'Done', 'success', 'true', '✔', '/ok/i']) assert.match(lintExpect({ id: 'X', run: 'node a.mjs', expect: w }).join(), /bare word/, w);
  for (const w of ['', '/.*/', '/x?/', '/^/m']) assert.match(lintExpect({ id: 'X', run: 'node a.mjs', expect: w }).join(), /matches empty output/, w);
  assert.match(lintExpect({ id: 'X', run: 'npm test' }).join(), /looks like a test run/);
  assert.match(lintExpect({ id: 'X', run: './e2e.sh' }).join(), /looks like a test run/);
  assert.match(lintExpect({ id: 'X', run: 'node a.mjs', expect: '/(/' }).join(), /not a valid regex/);
  assert.match(lintExpect({ id: 'X', run: 'node a.mjs', expect: 3 }).join(), /must be text/);
});

test('should accept a specific expect, a preset command and a plain command with no expect when each is strong enough (ExpectLint happy)', () => {
  assert.deepEqual(lintExpect({ id: 'X', run: 'node a.mjs', expect: 'wrote 3 rows' }), []);
  assert.deepEqual(lintExpect({ id: 'X', run: 'node --test a.test.mjs' }), []);
  assert.deepEqual(lintExpect({ id: 'X', run: 'node build.mjs' }), []);
});

test('should refuse pytest or go test without -v when the preset needs the per-test lines (ExpectLint edge)', () => {
  assert.match(lintExpect({ id: 'X', run: 'pytest t.py' }).join(), /-v/);
  assert.match(lintExpect({ id: 'X', run: 'go test ./...' }).join(), /-v/);
  assert.deepEqual(lintExpect({ id: 'X', run: 'python -m pytest --verbose' }), []);
});

test('should parse text and /regex/flags and report a bad regex when the expect is given (Expect)', () => {
  assert.deepEqual(parseExpect('abc'), { kind: 'text', text: 'abc' });
  assert.equal(parseExpect('/a+/g').re.flags, 'g');
  assert.equal(parseExpect(undefined).kind, 'none');
  assert.ok(parseExpect('/[/').error);
});
