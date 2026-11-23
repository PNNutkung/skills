// Offline checks for the speed flags at the gates (quick, gate reuse, verify reuse, courier skip), the zero-trust-review flags and the process cap (zproc). tdd.mjs runs in-process through the shared fixture (test-fixture.mjs). Run: node --test tdd.speed.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEED_OFF_ENV } from './speed.mjs';
import { put, TEST_ALPHA, TEST_BETA, dod, RET, BETA_ROW, verify, ON_ENV, testRuns, plannedWith, redThenCode, ZT_OFF_ENV, ALL_OFF_ENV, BAD_ZT, crashingZt } from './test-fixture.mjs';

test('pquick: green --quick runs no mutants, says so, and marks its gate file quick; without it the gate mutates as before', async t => {
  const { fx } = await plannedWith(t, ON_ENV, { files: { 'src/calc.sh': 'echo 1\n' } });
  await redThenCode(fx);
  const q = await fx.tdd('green', ['--group', 'a', '--quick']);
  assert.match(q.out, /^GREEN a ok=true \(quick: no mutants; the last run and the navigator's run mutate\)/, q.out + q.err);
  assert.match(q.out, /mutation: skipped \(--quick\)/);
  assert.deepEqual([fx.gate('a.green.json').quick, fx.gate('a.green.json').mutation.reason], [true, 'skipped (--quick)']);
  assert.equal(existsSync(join(fx.run, 'gates', 'a.green.cache.json')), false, 'a quick run stores nothing to reuse');
  const ret = join(fx.dir, 'ret.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'done', red: { verdict: 'PASS' }, green: { verdict: 'PASS' }, matrix: [{ dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' }] } } }));
  await fx.tdd('resume', ['--ret', ret]);
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).groups.a.next, 'green-check', 'a quick gate is never the last word: the navigator judges a full run');
  const full = await fx.tdd('green', ['--group', 'a']);
  assert.match(full.out, /^GREEN a ok=true snapshot/);
  assert.equal('quick' in fx.gate('a.green.json'), false);
  assert.match(fx.gate('a.green.json').mutation.reason, /no mutable changed lines/);
});

test('preuse: a full run stores its result; green --reuse on byte-identical files reuses it and re-runs only the flake check; any change, or a garbled entry, runs in full', async t => {
  const { fx } = await plannedWith(t, ON_ENV);
  await redThenCode(fx);
  const first = await fx.tdd('green', ['--group', 'a']);
  assert.match(first.out, /^GREEN a ok=true/, first.out + first.err);
  const cache = join(fx.run, 'gates', 'a.green.cache.json');
  assert.ok(existsSync(cache), 'stored for the navigator');
  const before = testRuns(fx), again = await fx.tdd('green', ['--group', 'a', '--reuse']);
  assert.match(again.out, /^GREEN a ok=true/);
  assert.match(again.out, /reused: test probe, mutants and coverage of the last full run on these exact files; flake check re-run \(2 run\(s\) per test file\)/);
  assert.deepEqual([testRuns(fx) - before, fx.gate('a.green.json').reused, fx.gate('a.green.json').tests.map(x => [x.verdict, x.head, x.base, x.nondeterministic])], [2, true, [['exercises-change', 0, 1, false]]]);
  const fullRuns = await (async () => { const b = testRuns(fx); await fx.tdd('green', ['--group', 'a']); return testRuns(fx) - b; })();
  assert.ok(fullRuns > 2, `a full run tests more than the flake check (${fullRuns})`);
  put(fx.repo, { 'src/alpha.txt': 'new\nmore\n' });
  const changed = await fx.tdd('green', ['--group', 'a', '--reuse']);
  assert.doesNotMatch(changed.out, /reused:/, 'a changed file runs the gate in full');
  assert.equal('reused' in fx.gate('a.green.json'), false);
  writeFileSync(cache, '{"version":1,"key":');
  assert.doesNotMatch((await fx.tdd('green', ['--group', 'a', '--reuse'])).out, /reused:/, 'a garbled entry runs the gate in full');
  const retest = await fx.tdd('green', ['--group', 'a', '--retest', '--reuse']);
  assert.doesNotMatch(retest.out, /reused:/, 'other gate arguments are another key');
});

test('preuse, fcompat: with the flags off a full run stores nothing; an explicit --reuse still stores and reuses', async t => {
  const { fx } = await plannedWith(t, SPEED_OFF_ENV);
  await redThenCode(fx);
  await fx.tdd('green', ['--group', 'a']);
  assert.deepEqual(readdirSync(join(fx.run, 'gates')).filter(f => /cache/.test(f)), []);
  await fx.tdd('green', ['--group', 'a', '--reuse']);
  assert.match((await fx.tdd('green', ['--group', 'a', '--reuse'])).out, /reused:/);
});

test('pvreuse: verify takes final.json from the cache when the snapshot is unchanged since the last final run, and runs final again when it is not or the flag is off', async t => {
  const run = async env => {
    const { fx } = await plannedWith(t, env);
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA, 'src/alpha.txt': 'new\n', 'src/beta.txt': 'beta\n' });
    for (const g of ['a', 'b']) { await fx.tdd('red', ['--group', g]); await fx.tdd('green', ['--group', g]); }
    assert.match((await fx.tdd('final', ['--again'])).out, /^FINAL ok=true/m);
    return fx;
  };
  const on = await run(ON_ENV), b = testRuns(on), v = await verify(on, RET(BETA_ROW));
  assert.deepEqual([v.final, testRuns(on) - b, v.finalReused], [true, 0, true], 'no test ran again');
  put(on.repo, { 'notes.txt': 'stray\n' });
  const v3 = await verify(on, RET(BETA_ROW));
  assert.deepEqual([v3.final, v3.finalReused], [false, true], 'a stray file outside the snapshot is scanned again: reuse never hides it');
  put(on.repo, { 'notes.txt': null, 'src/beta.txt': 'beta\nmore\n' });
  const b2 = testRuns(on), v2 = await verify(on, RET(BETA_ROW));
  assert.ok(testRuns(on) - b2 > 0 && !('finalReused' in v2), 'a changed file runs final again');
  const off = await run(SPEED_OFF_ENV), b3 = testRuns(off), v4 = await verify(off, RET(BETA_ROW));
  assert.ok(testRuns(off) - b3 > 0 && !('finalReused' in v4), 'flag off: verify runs final again, as in v2.0.0');
  assert.equal(existsSync(join(off.run, 'gates', 'final.cache.json')), false);
});

test('preuse: with gate reuse on, the mutation probe takes its baseline from the test probe\'s head run of the same tree (no extra wait: it reads the file the last run left); off, neither option is passed', async t => {
  const calc = { plan: { dod: [{ id: 'AC1', text: 'f gives 2', source: 'assumed', kinds: ['happy'] }], groups: [{ id: 'a', tests: ['tests/test_calc.sh'], src: ['src/calc.mjs'], dod: ['AC1'], after: [] }] } };
  const run = async env => {
    const { fx } = await plannedWith(t, env, calc);
    put(fx.repo, { 'tests/test_calc.sh': `# test_ac1_happy\n${process.execPath} -e "import('./src/calc.mjs').then(m => process.exit(m.f() === 2 ? 0 : 1))"\n` });
    await fx.tdd('red', ['--group', 'a']);
    put(fx.repo, { 'src/calc.mjs': 'export const f = () => 1 + 1;\n' });
    return fx;
  };
  const on = await run(ON_ENV);
  assert.match((await on.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
  assert.deepEqual(on.gate('a.green.json').mutation.baseline, { reused: false, reason: 'no head run file' }, 'the first run has no head run to read yet');
  assert.ok(existsSync(join(on.run, 'gates', 'a.green.head.json')), 'the test probe left its head run for the next run');
  assert.match((await on.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
  assert.deepEqual(on.gate('a.green.json').mutation.baseline, { reused: true }, 'the same tree again: no baseline run');
  put(on.repo, { 'src/calc.mjs': 'export const f = () => 2 * 1;\n' });
  await on.tdd('green', ['--group', 'a']);
  assert.equal(on.gate('a.green.json').mutation.baseline.reused, false, 'another tree runs its own baseline');
  const off = await run(SPEED_OFF_ENV);
  await off.tdd('green', ['--group', 'a']); await off.tdd('green', ['--group', 'a']);
  assert.deepEqual(['baseline' in off.gate('a.green.json').mutation, existsSync(join(off.run, 'gates', 'a.green.head.json'))], [false, false]);
});

test('fstrict: a zero-trust-review flag that is not valid at gate time never gives a GREEN: green (and red, final) stop with the fix', async t => {
  const { fx } = await plannedWith(t, ON_ENV);
  await redThenCode(fx);
  for (const [k, v, re] of BAD_ZT) {
    for (const cmd of [['green', '--group', 'a'], ['red', '--group', 'a'], ['final']]) {
      const r = await fx.tdd(cmd[0], cmd.slice(1), { [k]: v });
      assert.equal(r.status, 2, `${cmd[0]} ${k}=${v}: ${r.out}`);
      assert.match(r.err, re);
      assert.doesNotMatch(r.out, /ok=true/);
    }
  }
});

test('green: a mutation probe that errors makes the gate not ok whenever mutation should have run; with every flag off it is ignored as in v2.0.0; off in the plan or --quick it never runs', async t => {
  const { fx } = await plannedWith(t, ON_ENV);
  await redThenCode(fx);
  const ZT_DIR = crashingZt(fx);
  const r = await fx.cli('green', ['--group', 'a'], { ZT_DIR }); // ZT_DIR is read when tdd.mjs loads: these runs need a fresh process
  assert.match(r.out, /^GREEN a ok=false/, r.out + r.err);
  assert.match(r.out, /not ok: .*mutation probe: mutate\.mjs exited 2: mutate: boom/);
  assert.equal(existsSync(join(fx.run, 'gates', 'a.green.cache.json')), false, 'an errored run is never stored for reuse');
  assert.match((await fx.cli('green', ['--group', 'a', '--quick'], { ZT_DIR })).out, /^GREEN a ok=true/, 'a quick run does not mutate');
  const off = (await plannedWith(t, ALL_OFF_ENV)).fx;
  await redThenCode(off);
  assert.match((await off.cli('green', ['--group', 'a'], { ...ZT_OFF_ENV, ZT_DIR: crashingZt(off) })).out, /^GREEN a ok=true/, 'every flag off: v2.0.0 ignored a mutation probe error');
  const planOff = (await plannedWith(t, ON_ENV, { plan: { mutation: { off: true } } })).fx;
  await redThenCode(planOff);
  assert.match((await planOff.cli('green', ['--group', 'a'], { ZT_DIR: crashingZt(planOff) })).out, /^GREEN a ok=true/, 'mutation off in the plan');
});

test('preuse: the gate cache key holds the resolved mutation policy: another ZT_MUTATION_BUDGET_STRICT_ENABLED, ZT_MUTATION_BASELINE_REUSE_ENABLED, ZT_TEST_PROCESS_MAX or ZT_SANDBOX_IMAGE runs in full', async t => {
  const { fx } = await plannedWith(t, ON_ENV);
  await redThenCode(fx);
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/);
  for (const env of [{ ZT_MUTATION_BUDGET_STRICT_ENABLED: 'false' }, { ZT_MUTATION_BASELINE_REUSE_ENABLED: 'false' }, { ZT_TEST_PROCESS_MAX: '3' }, { ZT_SANDBOX_IMAGE: 'other:1' }]) {
    assert.doesNotMatch((await fx.tdd('green', ['--group', 'a', '--reuse'], env)).out, /reused:/, JSON.stringify(env));
    await fx.tdd('green', ['--group', 'a']); // back to the stored default
  }
  assert.match((await fx.tdd('green', ['--group', 'a', '--reuse'], { ZT_MUTATION_BUDGET_STRICT_ENABLED: 'TRUE', ZT_TEST_PROCESS_MAX: 'unlimited' })).out, /reused:/, 'the same resolved values are the same key');
});

test('pquick: dod --stage green does not accept a quick GREEN gate: it ran no mutants and is not the final word', async t => {
  const { fx } = await plannedWith(t, ON_ENV);
  await redThenCode(fx);
  await fx.tdd('green', ['--group', 'a', '--quick']);
  const q = await dod(fx, 'green');
  assert.match(q.out, /^DOD a stage=green ok=false/, q.out);
  assert.match(q.out, /the GREEN gate is quick \(--quick: no mutants\), not final: run it without --quick/);
  await fx.tdd('green', ['--group', 'a']);
  assert.match((await dod(fx, 'green')).out, /^DOD a stage=green ok=true/);
});

test('pcourier: with the courier skip on, a failing final at verify puts the groups it breaks (or the run) into notDone and their stale GREEN gates close no DoD pair; flags off, v2.0.0 output', async t => {
  const strict = { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q new src/alpha.txt\n', 'tests/test_beta.sh': '# test_ac2_happy\ngrep -qx new src/alpha.txt && grep -q beta src/beta.txt\n' };
  const run = async env => {
    const { fx } = await plannedWith(t, env);
    put(fx.repo, strict);
    await fx.tdd('red', ['--group', 'a']); await fx.tdd('red', ['--group', 'b']);
    put(fx.repo, { 'src/alpha.txt': 'new\n' }); await fx.tdd('green', ['--group', 'a']);
    put(fx.repo, { 'src/beta.txt': 'beta\n' }); await fx.tdd('green', ['--group', 'b']);
    assert.ok(fx.gate('a.green.json').ok && fx.gate('b.green.json').ok);
    put(fx.repo, { 'src/alpha.txt': 'new stuff\n' }); // a fixer of group a: its own tests still pass, group b's do not
    assert.match((await fx.tdd('green', ['--group', 'a'])).out, /^GREEN a ok=true/, 'the fixer\'s own-group gate is ok');
    return fx;
  };
  const on = await run(ON_ENV), v = await verify(on, { ...RET(BETA_ROW), courierSkipped: true });
  assert.equal(v.final, false);
  assert.ok(v.notDone.some(n => /^b: final gate not ok/.test(n)), JSON.stringify(v.notDone));
  assert.ok(!v.notDone.some(n => /^a:/.test(n)), 'a group whose tests still pass together is not blamed');
  assert.deepEqual([v.dod.covered, v.dod.total, v.dod.gaps], [1, 2, ['AC2/happy: unproven']], 'group b\'s GREEN gate is stale: it covers nothing');
  put(on.repo, { 'notes.txt': 'stray\n', 'src/alpha.txt': 'new\n' });
  const v2 = await verify(on, { ...RET(BETA_ROW), courierSkipped: true });
  assert.equal(v2.final, false);
  assert.ok(v2.notDone.some(n => /^run: final gate not ok: files outside the plan changed: notes\.txt/.test(n)), JSON.stringify(v2.notDone));
  assert.deepEqual([v2.dod.covered, v2.dod.total, v2.notDone.length], [2, 2, 1], 'a stray file alone is work left for the run: every group test passes together, so no GREEN gate is voided');
  const off = await run(SPEED_OFF_ENV), v3 = await verify(off, RET(BETA_ROW));
  assert.deepEqual([v3.final, v3.notDone, v3.dod.covered, v3.dod.total], [false, [], 2, 2], 'flags off: what v2.0.0 reported');
});
