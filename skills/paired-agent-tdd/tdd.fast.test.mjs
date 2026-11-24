// Offline checks for fast mode (plan.mode "fast": one driver per group, the frozen first RED, merged groups at resume and verify). tdd.mjs runs in-process through the shared fixture (test-fixture.mjs). Run: node --test tdd.fast.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { put, fixture, planned, TEST_ALPHA, TEST_BETA, dod, resumeOf, continueOf, RET, BETA_ROW, built, verify, FAST } from './test-fixture.mjs';

test('dod: a fast plan prints exactly what a default plan prints, at both stages (no navigator decision of any kind)', async t => {
  const run = async opts => {
    const fx = await planned(t, opts);
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
    await fx.tdd('red', ['--group', 'a']);
    const red = (await dod(fx, 'red')).out, redGap = (await dod(fx, 'red', [])).out;
    put(fx.repo, { 'src/alpha.txt': 'new\n' });
    await fx.tdd('green', ['--group', 'a']);
    return [red, redGap, (await dod(fx, 'green')).out];
  };
  const [fastRed, fastGap, fastGreen] = await run(FAST), [red, gap, green] = await run({});
  assert.deepEqual([fastRed, fastGap, fastGreen], [red, gap, green]);
  assert.doesNotMatch(red + gap + green, /navigator|skip/);
  assert.match(red, /^DOD a stage=red ok=true covered 1\/1\n  AC1: happy covered \(test_ac1_happy\)\n?$/);
});

test('red: in a fast plan a RED re-run after a GREEN gate keeps the first RED as the frozen reference; a default plan lets the re-run replace it', async t => {
  const weakened = '# test_ac1_happy\ngrep -q new src/alpha.txt || grep -q n src/alpha.txt\n'; // still fails at the base ("old" has no n), passes with the code: the classic edit-the-test-to-get-green
  for (const [opts, kept] of [[FAST, true], [{}, false]]) {
    const fx = await planned(t, opts);
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
    await fx.tdd('red', ['--group', 'a']);
    const first = fx.gate('a.red.json');
    assert.equal(first.firstSnapshot, opts === FAST ? first.snapshot : undefined, 'before any GREEN gate the reference is the RED just run');
    put(fx.repo, { 'tests/test_alpha.sh': `echo reworked\n${TEST_ALPHA}` });
    await fx.tdd('red', ['--group', 'a']);
    if (opts === FAST) assert.equal(fx.gate('a.red.json').firstSnapshot, fx.gate('a.red.json').snapshot, 'with no GREEN gate yet, a RED rework moves the reference');
    put(fx.repo, { 'src/alpha.txt': 'new\n' });
    assert.match((await fx.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
    const ref = fx.gate('a.red.json').snapshot;
    put(fx.repo, { 'tests/test_alpha.sh': weakened });
    assert.match((await fx.tdd('red', ['--group', 'a'])).out, /^RED a ok=true/, 'the weakened test still fails at the base');
    if (opts === FAST) assert.equal(fx.gate('a.red.json').firstSnapshot, ref, 'the RED the code was built against stays the reference');
    const r = await fx.tdd('green', ['--group', 'a']);
    assert.match(r.out, kept ? /ok=false[\s\S]*tests changed since RED: tests\/test_alpha\.sh/ : /^GREEN a ok=true/, kept ? 'a re-blessed edit is caught' : 'the default pipeline is unchanged: its green driver is never given the RED command');
  }
});

test('red: a fast plan keeps a green-gated group\'s first RED across any number of re-runs, and a gate file without it behaves as before', async t => {
  const fx = await planned(t, FAST);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n' });
  await fx.tdd('red', ['--group', 'a']);
  const ref = fx.gate('a.red.json').firstSnapshot;
  await fx.tdd('green', ['--group', 'a']);
  for (const extra of ['one', 'two', 'three']) { put(fx.repo, { 'tests/test_alpha.sh': `echo ${extra}\n${TEST_ALPHA}` }); await fx.tdd('red', ['--group', 'a']); }
  assert.equal(fx.gate('a.red.json').firstSnapshot, ref);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/, 'tests back to what the reference saw: unchanged since RED');
  const plain = await planned(t);
  put(plain.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await plain.tdd('red', ['--group', 'a']);
  assert.equal('firstSnapshot' in plain.gate('a.red.json'), false, 'a default gate file has exactly the keys it always had');
});

test('red: in a fast plan the reference freezes at the first source edit, not at the first GREEN run: a test weakened after the code was written is caught even when RED was re-run before any GREEN', async t => {
  const weakened = '# test_ac1_happy\ngrep -q new src/alpha.txt || grep -q n src/alpha.txt\n'; // still fails at the base, passes with the code
  const fx = await planned(t, FAST);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.match((await fx.tdd('red', ['--group', 'a'])).out, /^RED a ok=true/);
  const ref = fx.gate('a.red.json').firstSnapshot;
  put(fx.repo, { 'tests/test_alpha.sh': `echo iterate\n${TEST_ALPHA}` }); // STEP 1 may iterate: no source yet, so the reference moves with the RED run
  await fx.tdd('red', ['--group', 'a']);
  const iterated = fx.gate('a.red.json').firstSnapshot;
  assert.notEqual(iterated, ref);
  put(fx.repo, { 'src/beta.txt': 'beta\n', 'tests/test_alpha.sh': `echo again\n${TEST_ALPHA}` }); // ANOTHER group's source does not freeze this group
  await fx.tdd('red', ['--group', 'a']);
  assert.notEqual(fx.gate('a.red.json').firstSnapshot, iterated, 'only the group\'s own src counts');
  const sealed = fx.gate('a.red.json').firstSnapshot;
  put(fx.repo, { 'src/alpha.txt': 'new\n' }); // the group's source now exists; no GREEN gate has run
  assert.equal(existsSync(join(fx.run, 'gates', 'a.green.json')), false);
  put(fx.repo, { 'tests/test_alpha.sh': weakened });
  assert.match((await fx.tdd('red', ['--group', 'a'])).out, /^RED a ok=true/, 'the weakened test still fails at the base: RED cannot tell');
  assert.equal(fx.gate('a.red.json').firstSnapshot, sealed, 'the RED the code was built against is still the reference');
  const r = await fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /ok=false[\s\S]*tests changed since RED: tests\/test_alpha\.sh/, 'red ok -> source -> weakened test -> red again -> green says the tests changed');
  // the default plan has no firstSnapshot and no such guard: its green driver is never given the RED command
  const plain = await planned(t);
  put(plain.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await plain.tdd('red', ['--group', 'a']);
  put(plain.repo, { 'src/alpha.txt': 'new\n' });
  put(plain.repo, { 'tests/test_alpha.sh': weakened });
  await plain.tdd('red', ['--group', 'a']);
  assert.match((await plain.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
});

test('red: in a fast plan a GREEN gate alone freezes the reference: a source reverted to the base afterwards does not let a weakened test be re-blessed', async t => {
  const weakened = '# test_ac1_happy\ngrep -q new src/alpha.txt || grep -q n src/alpha.txt\n';
  const fx = await planned(t, FAST);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
  const ref = fx.gate('a.red.json').firstSnapshot;
  put(fx.repo, { 'src/alpha.txt': 'old\n', 'tests/test_alpha.sh': weakened }); // no src file differs from the base any more; the GREEN gate file still exists
  assert.match((await fx.tdd('red', ['--group', 'a'])).out, /^RED a ok=true/);
  assert.equal(fx.gate('a.red.json').firstSnapshot, ref);
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /tests changed since RED: tests\/test_alpha\.sh/);
});

test('verify: a fast plan names its one-driver groups and carries the one navigator\'s RED notes; a default plan gets no fast key', async t => {
  const plain = await built(t);
  const ret = (a, b, extra = {}) => RET(BETA_ROW, { a: { state: 'done', red: a, green: { verdict: 'PASS', ...extra }, matrix: [{ dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' }] }, b: { state: 'done', red: b, green: { verdict: 'PASS' }, matrix: BETA_ROW } });
  assert.equal((await verify(plain, ret({ verdict: 'PASS' }, { verdict: 'PASS' }))).fast, undefined, 'a default plan reports no fast section');
  const fx = await planned(t, FAST);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  await fx.tdd('red', ['--group', 'a']); await fx.tdd('red', ['--group', 'b']);
  put(fx.repo, { 'src/alpha.txt': 'new\n', 'src/beta.txt': 'beta\n' });
  await fx.tdd('green', ['--group', 'a']); await fx.tdd('green', ['--group', 'b']);
  let v = await verify(fx, ret({ verdict: 'merged', merged: true }, { verdict: 'PASS' }));
  assert.deepEqual(v.fast, { merged: ['a'] });
  assert.deepEqual([v.dod.gaps, v.notDone], [[], []]);
  v = await verify(fx, ret({ verdict: 'merged', merged: true }, { verdict: 'PASS' }, { redNotes: ['test_ac1_edge asserts truthiness only'] }));
  assert.deepEqual(v.fast, { merged: ['a'], redNotes: { a: ['test_ac1_edge asserts truthiness only'] } }, 'the navigator\'s words about RED tests reach the verify output');
  assert.deepEqual((await verify(fx, ret({ verdict: 'PASS' }, { verdict: 'PASS' }))).fast, { merged: [] }, 'a fast plan whose groups all took the default path');
});

test('resume: with no --ret a no-after group of a fast plan sent to green-check or green-fix carries merged: true (it never had a RED navigator); a group with after, a default plan and a return that says otherwise do not', async t => {
  const fx = await planned(t, FAST);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  await fx.tdd('red', ['--group', 'a']); await fx.tdd('red', ['--group', 'b']);
  put(fx.repo, { 'src/alpha.txt': 'new\n', 'src/beta.txt': 'beta\n' });
  await fx.tdd('green', ['--group', 'a']); await fx.tdd('green', ['--group', 'b']);
  await resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.merged, continueOf(fx).b.next, 'merged' in continueOf(fx).b], ['green-check', true, 'green-check', false], 'green-check: a is a one-driver group, b waits for a');
  put(fx.repo, { 'src/alpha.txt': 'bad\n' });
  await fx.tdd('green', ['--group', 'a']);
  await resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.merged], ['green-fix', true], 'green-fix too');
  const retA = red => { const f = join(fx.dir, 'ret-a.json'); writeFileSync(f, JSON.stringify({ groups: { a: { state: 'blocked', red, green: { verdict: 'FAIL' }, matrix: [] } }, clusters: [] })); return f; };
  await resumeOf(fx, ['--ret', retA({ verdict: 'PASS' })]);
  assert.equal('merged' in continueOf(fx).a, false, 'a return that knows the group and does not call it merged (it went through the default RED stage) is believed');
  await resumeOf(fx, ['--ret', retA({ verdict: 'merged', merged: true })]);
  assert.equal(continueOf(fx).a.merged, true);
  const plain = await built(t);
  await resumeOf(plain);
  assert.equal(['a', 'b'].some(g => 'merged' in continueOf(plain)[g]), false, 'a default plan never gets the flag');
  const fresh = await planned(t, FAST);
  await resumeOf(fresh);
  assert.deepEqual([continueOf(fresh).a.next, 'merged' in continueOf(fresh).a], ['red', false], 'a group that has not started is started by the script, which decides the path itself');
});

test('resume: a one-driver group of the last (fast) run keeps merged: true in its continue entry, so its green navigator keeps judging RED; a default return never does', async t => {
  const fx = await built(t);
  const retWith = red => { const f = join(fx.dir, 'ret.json'); writeFileSync(f, JSON.stringify(RET(BETA_ROW, { a: { state: 'done', red, green: { verdict: 'PASS' }, matrix: [{ dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' }] } }))); return f; };
  await resumeOf(fx, ['--ret', retWith({ verdict: 'merged', merged: true })]);
  assert.equal(continueOf(fx).a.merged, true);
  assert.equal('merged' in continueOf(fx).b, false, 'a group the return does not call merged carries no flag');
  await resumeOf(fx, ['--ret', retWith({ verdict: 'PASS' })]);
  assert.equal('merged' in continueOf(fx).a, false, 'a default return gives the same continue file as before');
  await resumeOf(fx);
  assert.equal('merged' in continueOf(fx).a, false);
});
