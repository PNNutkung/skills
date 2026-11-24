// Offline checks for resume (continue.json from the gate files) and fast mode (one driver per group, the frozen first RED). tdd.mjs runs in-process through the shared fixture (test-fixture.mjs). Run: node --test tdd.resume.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { put, fixture, planned, TEST_ALPHA, dod, resumeOf, continueOf, ROW } from './test-fixture.mjs';

test('resume: from the gate files alone each group says where it stands; the matrix survives in rows.json; nothing is trusted from an agent', async t => {
  const fx = await planned(t);
  await resumeOf(fx);
  assert.deepEqual(Object.values(continueOf(fx)).map(g => g.next), ['red', 'red'], 'no gate on record: a normal start');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).base, fx.head, 'the file is tied to the base it was made for');
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  await dod(fx, 'red');
  assert.deepEqual(fx.gate('a.rows.json').rows, [ROW], 'every dod call persists its rows: an agent that dies takes nothing with it');
  await resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.matrix], ['red-check', [ROW]], 'the RED gate is ok but no navigator has passed it: one check, never a free pass to GREEN');
  const redPass = join(fx.dir, 'red-pass.json');
  writeFileSync(redPass, JSON.stringify({ groups: { a: { red: { verdict: 'PASS' } } } }));
  await resumeOf(fx, ['--ret', redPass]);
  assert.equal(continueOf(fx).a.next, 'green', 'RED passed (a navigator said so) and there is no code yet');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await resumeOf(fx);
  assert.match(JSON.stringify(continueOf(fx).a), /"next":"green-check".*code exists, no fresh GREEN gate/);
  await fx.tdd('green', ['--group', 'a']);
  await resumeOf(fx);
  assert.match(JSON.stringify(continueOf(fx).a), /"next":"green-check".*gates fresh and ok, not judged yet/, 'gates ok but no navigator judged them: one check, no maker');
  const ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'done', matrix: [ROW], files: ['src/alpha.txt'] } } }));
  await resumeOf(fx, ['--ret', ret]);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.files], ['done', ['src/alpha.txt']], 'judged PASS last run, gates fresh and ok, DoD pair closed');
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  await resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.next, 'green-check', 'an edit after the gate ran: the old verdict no longer counts');
});

test('resume: a gate that is fresh and not ok gives its defects, read off the gate; a stale RED gate is looked at again', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q old src/alpha.txt\n' });
  await fx.tdd('red', ['--group', 'a']);
  await resumeOf(fx);
  const red = continueOf(fx).a;
  assert.equal(red.next, 'red-fix');
  assert.match(red.defects[0].what, /RED gate: tests\/test_alpha\.sh is passes-already/);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await resumeOf(fx);
  assert.equal(continueOf(fx).a.next, 'red', 'tests edited since the gate and no rows to hand over: start RED again');
  await dod(fx, 'red');
  await resumeOf(fx);
  assert.equal(continueOf(fx).a.next, 'red-check', 'with rows, a navigator looks at what is on disk');
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ntrue\n', 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a', '--retest']);
  await resumeOf(fx);
  const green = continueOf(fx).a;
  assert.equal(green.next, 'green-fix');
  assert.deepEqual(green.defects.map(d => d.cls), ['gap'], 'a test that passes without the code pins nothing: strengthen it');
});

test('resume: tests that only GREW since RED are a strengthening (retest); tests that lost lines are not', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  await dod(fx, 'red');
  put(fx.repo, { 'tests/test_alpha.sh': `echo extra\n${TEST_ALPHA}`, 'src/alpha.txt': 'new\n' }); // a line ADDED in front: the last command still decides the exit
  await fx.tdd('green', ['--group', 'a']);
  assert.equal(fx.gate('a.green.json').ok, false, 'changed since RED without --retest');
  await resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.retest, continueOf(fx).a.defects], [true, []], 'additions only: sanctioned, and the "changed" reason is not made a defect');
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ntrue\n' });
  await fx.tdd('green', ['--group', 'a']);
  await resumeOf(fx);
  assert.equal(continueOf(fx).a.retest, false, 'a line was removed: that is a weakening, not a strengthening');
  assert.match(continueOf(fx).a.defects.map(d => d.what).join(' | '), /tests changed since RED/);
  const ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', retest: true } } }));
  await resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.retest, true, 'the last run knew it strengthened the tests');
});

test('resume: what the last navigator said stands while the files are unchanged; a gate that is ok does not erase it', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  await dod(fx, 'red');
  const ret = join(fx.dir, 'return.json'), tautology = { cls: 'test', file: 'tests/test_alpha.sh', what: 'asserts the implementation, not the DoD' };
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'paused', red: { verdict: 'FAIL', defects: [tautology] } } } }));
  await resumeOf(fx, ['--ret', ret]);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.defects], ['red-fix', [tautology]], 'a defect only a navigator can see (the gate is ok) is not forgotten: RED is not carried as PASS');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a']);
  const weak = { cls: 'gap', what: 'the edge test only checks truthiness' };
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', green: { verdict: 'FAIL', defects: [weak] } } } }));
  await resumeOf(fx, ['--ret', ret]);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.defects], ['green-fix', [weak]], 'GREEN gate ok, navigator FAIL: a repair, not a navigator that pays to find the same thing again');
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  await resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.next, 'green-check', 'the code changed since: the old verdict is stale, look again');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', reason: 'GREEN made no progress: the same defects came back after repair round 1: x', green: { verdict: 'FAIL', defects: [weak] } } } }));
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a']);
  await resumeOf(fx, ['--ret', ret]);
  assert.match(continueOf(fx).a.why, /STALLED last run/);
});

test('resume: the gate records whether it ran with --retest; the saved rows only ever grow with real tests; a missing snapshot is a stale gate, not a crash; the file names its run', async t => {
  const fx = await planned(t);
  const three = '# test_ac1_happy\n# test_ac1_fail\n# test_ac1_edge\ngrep -q new src/alpha.txt\n';
  put(fx.repo, { 'tests/test_alpha.sh': three });
  await fx.tdd('red', ['--group', 'a']);
  const rows3 = ['happy', 'fail', 'edge'].map(k => `AC1:${k}:test_ac1_${k}:tests/test_alpha.sh`);
  await dod(fx, 'red', rows3);
  await dod(fx, 'red', [rows3[0], 'AC1:happy:test_ac1_typo:tests/test_alpha.sh']);
  assert.deepEqual(fx.gate('a.rows.json').rows.map(r => r.test), ['test_ac1_happy', 'test_ac1_fail', 'test_ac1_edge'], 'a partial call with a phantom row neither shrinks the matrix nor adds the phantom');
  put(fx.repo, { 'tests/test_alpha.sh': three.replace('grep -q new src/alpha.txt', 'grep -q new src/alpha.txt && true'), 'src/alpha.txt': 'new\n' }); // a line REPLACED: a sharpening
  await fx.tdd('green', ['--group', 'a', '--retest']);
  assert.deepEqual([fx.gate('a.green.json').ok, fx.gate('a.green.json').retest], [true, true]);
  await resumeOf(fx);
  assert.deepEqual([continueOf(fx).a.retest, continueOf(fx).a.next], [true, 'green-check'], 'a sanctioned sharpening (a line removed) is still sanctioned after a restart');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).run, fx.run, 'the file names the run folder it was made for');
  const g = fx.gate('a.green.json');
  writeFileSync(join(fx.run, 'gates', 'a.green.json'), JSON.stringify({ ...g, snapshot: '0'.repeat(40) }));
  const r = await resumeOf(fx);
  assert.match(r.out, /a: green-check \(code exists, no fresh GREEN gate\)/, 'a pruned snapshot makes the gate stale for that group only');
});

test('resume: a gate that says unverifiable is the sandbox, not the code: the group is on env and no agent is spent; once a gate runs again it routes normally', async t => {
  const fx = await planned(t, { fake: { exit: 86 }, flags: ['--skip-preflight'] });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  const r = await resumeOf(fx);
  assert.match(r.out, /a: env \(the RED gate says unverifiable or timeout: the sandbox, not the code\. Fix it, then run `node [^`]*tdd\.mjs red --run [^`]* --group a` again; no agent is spent until a gate has run\)/);
  const c = JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8'));
  assert.deepEqual([c.groups.a.next, c.groups.b.next, c.warnings.length, c.maxRepairs], ['env', 'red', 1, 2], 'a group on env gets no budget: only b can spend (2 for one group)');
  writeFileSync(join(fx.stub, 'config.json'), '{}'); // the sandbox is fixed
  await fx.tdd('red', ['--group', 'a']);
  await resumeOf(fx);
  assert.equal(continueOf(fx).a.next, 'red-check', 'the fresh gate speaks: RED holds, one navigator looks at it');
});

test('resume: a timeout is the code when plan proved the sandbox, the environment when it did not', async t => {
  const proven = await planned(t);
  put(proven.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  writeFileSync(join(proven.stub, 'config.json'), JSON.stringify({ exit: 124 }));
  await proven.tdd('red', ['--group', 'a']);
  await resumeOf(proven);
  assert.deepEqual([continueOf(proven).a.next, continueOf(proven).a.defects[0].what], ['red-fix', 'RED gate: tests/test_alpha.sh is timeout: it timed out'], 'a test that hangs after a passing preflight is a test defect');
  const bare = fixture(t);
  assert.equal((await bare.plan(['--skip-preflight'])).status, 0);
  put(bare.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  writeFileSync(join(bare.stub, 'config.json'), JSON.stringify({ exit: 124 }));
  await bare.tdd('red', ['--group', 'a']);
  await resumeOf(bare);
  assert.equal(continueOf(bare).a.next, 'env', 'nothing proved the sandbox: a timeout may be the machine');
});

test('resume: the GREEN probe says a timeout as unverifiable (timeout): the code\'s after a proven sandbox, the environment otherwise; an exit 127 is the environment at GREEN too', async t => {
  const hang = async (fx, flags = []) => {
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
    await fx.tdd('red', ['--group', 'a']);
    put(fx.repo, { 'src/alpha.txt': 'new\n' });
    writeFileSync(join(fx.stub, 'config.json'), JSON.stringify({ exit: 124 }));
    await fx.tdd('green', ['--group', 'a', ...flags]);
    assert.deepEqual([fx.gate('a.green.json').tests[0].verdict, fx.gate('a.green.json').tests[0].reason], ['unverifiable', 'timeout']);
    await resumeOf(fx);
    return continueOf(fx).a;
  };
  const proven = await hang(await planned(t));
  assert.equal(proven.next, 'green-fix', 'plan proved the sandbox: a hanging test or code is a defect for a maker');
  assert.match(proven.defects[0].what, /unverifiable \(timeout\)/);
  const bare = fixture(t);
  assert.equal((await bare.plan(['--skip-preflight'])).status, 0);
  assert.equal((await hang(bare)).next, 'env', 'nothing proved the sandbox');
  const gone = await planned(t);
  put(gone.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await gone.tdd('red', ['--group', 'a']);
  put(gone.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\nexit 127\n', 'src/alpha.txt': 'new\n' });
  await gone.tdd('green', ['--group', 'a', '--retest']);
  assert.deepEqual([gone.gate('a.green.json').tests[0].verdict, gone.gate('a.green.json').tests[0].reason], ['unverifiable', 'the test command cannot start (exit 127)']);
  await resumeOf(gone);
  assert.equal(continueOf(gone).a.next, 'env', 'a command that cannot start is the environment, never a test to repair');
  const failing = await planned(t);
  put(failing.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await failing.tdd('red', ['--group', 'a']);
  await failing.tdd('green', ['--group', 'a']); // the code is still the old one: the test fails with the group's code, with a plain exit 1
  assert.equal(failing.gate('a.green.json').tests[0].verdict, 'fails-on-head', 'only exit 127 is relabelled: an ordinary failure stays a failure');
  await resumeOf(failing);
  assert.equal(continueOf(failing).a.next, 'green-fix');
});

test('resume: the repair budget of the next run is decided here and travels in continue.json; the plan\'s own maxRepairs no longer applies', async t => {
  const fx = await planned(t, { plan: { maxRepairs: 0 } });
  const r = await resumeOf(fx);
  assert.match(r.out, /next run: repair budget 4 \(2 for each of the 2 group\(s\) that still work\), at most 20 build agents; the plan's own maxRepairs no longer applies; change it: --max-repairs N/, 'worst(2 groups, 3 rounds, 4 repairs) = min(2 x 20, 4 x 2 + 3 x 4)');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).maxRepairs, 4);
  assert.match((await resumeOf(fx, ['--max-repairs', '1'])).out, /next run: repair budget 1, at most 11 build agents/, 'an explicit budget is not described as the default: 4 x 2 + 3 x 1');
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).maxRepairs, 1);
  assert.match((await resumeOf(fx, ['--max-repairs=40'])).out, /next run: repair budget 40,/, '40 is the top of the range');
  for (const bad of ['-1', '41', 'x', '1.5']) assert.equal((await fx.tdd('resume', [`--max-repairs=${bad}`])).status, 2, bad);
});

test('resume: a group that stalled and is unchanged since is on hold (no agent); --retry, --hint and --escalate spend on purpose; an edit clears the hold', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  await dod(fx, 'red');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a']);
  const weak = { cls: 'gap', what: 'the edge test only checks truthiness' }, ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'blocked', reason: 'GREEN made no progress: the same defects came back after repair round 1: x', green: { verdict: 'FAIL', defects: [weak] } } } }));
  const r = await resumeOf(fx, ['--ret', ret]);
  assert.match(r.out, /a: hold \(STALLED last run \(made no progress\): the same defects came back after a repair and no file was touched since[\s\S]*--hint a="\.\.\."[\s\S]*--escalate a[\s\S]*--retry a\)/);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.defects, JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).maxRepairs], ['hold', [weak], 2], 'a held group gets no budget: only b works');
  await resumeOf(fx, ['--ret', ret, '--retry', 'b', '--retry', 'a']);
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.stalled, continueOf(fx).a.hint, continueOf(fx).a.escalate], ['green-fix', true, undefined, undefined], 'a forced retry is told the last repair changed nothing');
  await resumeOf(fx, ['--ret', ret, '--hint', 'a=use grep -c, not -q', '--hint', 'b=check the other file', '--escalate', 'a', '--escalate', 'b']);
  assert.deepEqual([continueOf(fx).b.hint, continueOf(fx).b.escalate], ['check the other file', true], 'the flags repeat: one per group');
  assert.deepEqual([continueOf(fx).a.next, continueOf(fx).a.hint, continueOf(fx).a.escalate], ['green-fix', 'use grep -c, not -q', true]);
  const srcTime = statSync(join(fx.repo, 'src/alpha.txt')).mtime;
  utimesSync(ret, srcTime, srcTime); // the return was saved at the very moment of the last edit: nothing is later than it
  for (const f of ['tests/test_alpha.sh', 'src/alpha.txt']) utimesSync(join(fx.repo, f), srcTime, srcTime);
  assert.equal((await resumeOf(fx, ['--ret', ret])).out.includes('a: hold'), true, 'a file as old as the return is not an edit made after it');
  const longAgo = new Date(Date.now() - 60000);
  utimesSync(ret, longAgo, longAgo); // the return was saved a minute ago: every edit below is later
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  await resumeOf(fx, ['--ret', ret]);
  assert.equal(continueOf(fx).a.next, 'green-check', 'the code changed since: the gate is stale and a navigator looks again, nothing is held');
  await fx.tdd('green', ['--group', 'a']); // the lead re-ran the gate after the edit: it is fresh again
  const again = await resumeOf(fx, ['--ret', ret]);
  assert.match(again.out, /a: green-fix \(the last navigator reported defects the gate cannot see; STALLED last run, but files were edited since: a repair may work now\)/, 'a fresh gate does not hide the edit: the hold is lifted by a file touched after the return, not by the gate');
  assert.equal((await fx.tdd('resume', ['--hint', 'a='])).status, 2);
  assert.equal((await fx.tdd('resume', ['--retry', 'zzz'])).status, 2);
});

test('resume: the same row or the same defect from two sources is kept once', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q old src/alpha.txt\n' });
  await fx.tdd('red', ['--group', 'a']);
  await dod(fx, 'red');
  const fromGate = 'RED gate: tests/test_alpha.sh is passes-already: it passes without new code, so it pins no new behavior';
  const ret = join(fx.dir, 'return.json');
  writeFileSync(ret, JSON.stringify({ groups: { a: { state: 'paused', matrix: [ROW, { ...ROW, kind: 'fail', test: 'not_in_the_file' }], red: { verdict: 'FAIL', defects: [{ cls: 'test', what: fromGate }, { cls: 'test', what: 'tautology' }] } } } }));
  await resumeOf(fx, ['--ret', ret]);
  assert.deepEqual(continueOf(fx).a.matrix, [ROW], 'rows.json and the return both name the test once; a row whose test is gone from its file is dropped');
  assert.deepEqual(continueOf(fx).a.defects.map(d => d.what), [fromGate, 'tautology'], 'the navigator and the gate said the same thing once');
});

test('resume --group prints one group and writes no file: it is what a replacement for a dead agent runs instead of exploring the tree', async t => {
  const fx = await planned(t);
  const r = await resumeOf(fx, ['--group', 'b']);
  assert.match(r.out, /^RESUME b: 1 of 1 group\(s\) need work\n  b: red \(no RED gate on record\)/);
  assert.equal(existsSync(join(fx.run, 'continue.json')), false);
  assert.equal((await fx.tdd('resume', ['--group', 'zzz'])).status, 2);
  assert.equal((await fx.tdd('resume', ['--ret', join(fx.dir, 'nope.json')])).status, 2);
});
