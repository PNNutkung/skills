// Offline checks for the gates: red, green, final, dod, verify, snapshots, coverage and mutants. tdd.mjs runs in-process through the shared fixture (test-fixture.mjs). Run: node --test tdd.gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasPython, git, put, PLAN, fixture, planned, TEST_ALPHA, TEST_BETA, dod, PY_TEST, RET, BETA_ROW, built, verify } from './test-fixture.mjs';

test('red: a new test that fails now is RED; one that already passes is not; a missing file is named', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  let r = await fx.tdd('red', ['--group', 'a']);
  assert.match(r.out, /^RED a ok=true/);
  assert.deepEqual(fx.gate('a.red.json').tests.map(x => [x.file, x.verdict, x.exit]), [['tests/test_alpha.sh', 'fails', 1]]);
  assert.ok(existsSync(join(fx.run, 'diff', 'a.red.patch')) && /test_alpha/.test(readFileSync(join(fx.run, 'diff', 'a.red.patch'), 'utf8')));
  put(fx.repo, { 'tests/test_alpha.sh': 'grep -q old src/alpha.txt\n' });
  r = await fx.tdd('red', ['--group', 'a']);
  assert.match(r.out, /ok=false/);
  assert.equal(fx.gate('a.red.json').tests[0].verdict, 'passes-already');
  r = await fx.tdd('red', ['--group', 'b']);
  assert.equal(fx.gate('b.red.json').tests[0].verdict, 'missing');
  assert.equal(fx.gate('b.red.json').ok, false);
});

test('red: the gate classifies a load error apart from an assertion failure', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': 'echo "ModuleNotFoundError: No module named alpha" >&2; exit 1\n' });
  await fx.tdd('red', ['--group', 'a']);
  const [x] = fx.gate('a.red.json').tests;
  assert.equal(x.verdict, 'fails-to-load');
  assert.match(x.tail, /ModuleNotFoundError/);
  assert.equal(fx.gate('a.red.json').ok, true);
});

test('red: no sandbox (86) is unverifiable, never a pass', async t => {
  const fx = await planned(t, { fake: { exit: 86 }, flags: ['--skip-preflight'] });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  const r = await fx.tdd('red', ['--group', 'a']);
  assert.match(r.out, /ok=false/);
  assert.equal(fx.gate('a.red.json').tests[0].verdict, 'unverifiable');
});

test('green: passing tests that fail once the group code is reverted are exercises-change, unchanged since RED, in scope', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  const r = await fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /^GREEN a ok=true/, r.out + r.err);
  const g = fx.gate('a.green.json');
  assert.deepEqual(g.tests.map(x => [x.verdict, x.head, x.base]), [['exercises-change', 0, 1]]);
  assert.deepEqual([g.frozen.changed, g.outOfScope], [[], []]);
  assert.match(g.mutation.reason, /no mutable changed lines/);
});

test('green: tests that pass without the change give no signal; tests edited after RED are named unless --retest', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n', 'tests/test_alpha.sh': `echo extra\n${TEST_ALPHA}` });
  let r = await fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /ok=false[\s\S]*tests changed since RED: tests\/test_alpha\.sh/);
  assert.match(r.out, /CHANGED tests\/test_alpha\.sh/);
  r = await fx.tdd('green', ['--group', 'a', '--retest']);
  assert.match(r.out, /ok=true/);
  put(fx.repo, { 'tests/test_alpha.sh': 'true\n' });
  r = await fx.tdd('green', ['--group', 'a', '--retest']);
  assert.match(r.out, /ok=false/);
  assert.equal(fx.gate('a.green.json').tests[0].verdict, 'no-signal');
});

test('green: no RED gate on record is a reason; a stray file outside the plan is a note, and blocks at final', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n' });
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /no RED gate on record/);
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'junk/stray.txt': 'x\n' });
  const r = await fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /note: files outside the plan exist in the shared tree: junk\/stray\.txt/);
  assert.match(r.out, /^GREEN a ok=true/, 'a stray file cannot be pinned on one group of a shared tree: it is a note here, a blocker at final');
  assert.deepEqual(fx.gate('a.green.json').outOfScope, ['junk/stray.txt']);
  assert.match((await fx.tdd('final')).out, /not ok:[^\n]*files outside the plan changed: junk\/stray\.txt/);
});

test('group snapshots hold the base plus only the group\'s own files: another group\'s half-written edit is invisible', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'src/beta.txt': 'half writ', 'tests/test_beta.sh': 'syntax error (((\n' });
  await fx.tdd('red', ['--group', 'a']);
  const files = git(fx.repo, 'ls-tree', '-r', '--name-only', fx.gate('a.red.json').snapshot).split('\n');
  assert.deepEqual(files.filter(f => /beta|alpha/.test(f)).sort(), ['src/alpha.txt', 'tests/existing_alpha.sh', 'tests/test_alpha.sh']);
  assert.equal(git(fx.repo, 'show', `${fx.gate('a.red.json').snapshot}:src/alpha.txt`), 'old');
});

test('a group that waits for another sees its finished files only once that group is green', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  await fx.tdd('red', ['--group', 'a']);
  await fx.tdd('red', ['--group', 'b']);
  assert.equal(fx.gate('b.red.json').tests[0].verdict, 'fails');
  assert.ok(!git(fx.repo, 'ls-tree', '-r', '--name-only', fx.gate('b.red.json').snapshot).includes('test_alpha'), 'a is not green: not in the world of b');
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /ok=true/);
  await fx.tdd('red', ['--group', 'b']);
  const snap = fx.gate('b.red.json').snapshot;
  assert.equal(git(fx.repo, 'show', `${snap}:src/alpha.txt`), 'new');
  put(fx.repo, { 'src/beta.txt': 'beta\n' });
  const r = await fx.tdd('green', ['--group', 'b']);
  assert.match(r.out, /^GREEN b ok=true/, r.out);
  assert.deepEqual(fx.gate('b.green.json').tests.map(x => [x.verdict, x.base]), [['exercises-change', 2]], 'b\'s own code reverted fails (no such file), with a\'s code in place');
});

test('a dependent group is judged on its OWN code: tests that pass with only the groups it waits for give no signal', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': 'grep -q new src/alpha.txt\n', 'src/beta.txt': 'beta\n' });
  await fx.tdd('red', ['--group', 'a']);
  assert.match((await fx.tdd('green', ['--group', 'a'])).out, /ok=true/);
  await fx.tdd('red', ['--group', 'b']);
  await fx.tdd('green', ['--group', 'b']);
  const g = fx.gate('b.green.json');
  assert.equal(g.tests[0].verdict, 'no-signal', 'b\'s test never needs b\'s code, even though it fails once a\'s code is gone');
  assert.equal(g.ok, false);
  assert.equal(git(fx.repo, 'rev-parse', `${g.snapshot}^`), g.base, 'the group snapshot is a child of its base');
});

test('snapshots never touch the user\'s repo and refuse a symlink in a group file', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  const state = () => [git(fx.repo, 'status', '--porcelain'), git(fx.repo, 'for-each-ref'), git(fx.repo, 'diff', '--cached'), git(fx.repo, 'rev-parse', 'HEAD')];
  const before = state();
  await fx.tdd('red', ['--group', 'a']);
  assert.deepEqual(state(), before);
  rmSync(join(fx.repo, 'tests/test_alpha.sh'));
  writeFileSync(join(fx.dir, 'outside.sh'), 'exit 0\n');
  symlinkSync(join(fx.dir, 'outside.sh'), join(fx.repo, 'tests/test_alpha.sh'));
  const r = await fx.tdd('red', ['--group', 'a']);
  assert.equal(r.status, 1);
  assert.match(r.err, /refusing to snapshot tests\/test_alpha\.sh/);
});

test('final: group tests together and the existing tests that mention a changed module', async t => {
  const fx = await planned(t, { files: { 'tests/unrelated.sh': 'exit 9\n' } });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n' });
  const r = await fx.tdd('final');
  assert.match(r.out, /^FINAL ok=true/m, r.out + r.err);
  const f = fx.gate('final.json');
  assert.deepEqual([f.together.map(x => x.exit), f.existing.ran], [[0, 0], ['tests/existing_alpha.sh']]);
});

test('final: an existing test that passed before the change and fails after is a regression; one that already failed is not', async t => {
  const fx = await planned(t, { files: { 'tests/existing_alpha.sh': 'grep -q old src/alpha.txt\n', 'tests/existing_beta.sh': 'grep -q nomatch src/beta.txt\n' } });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n' });
  const r = await fx.tdd('final');
  assert.match(r.out, /ok=false[^\n]*\n\s+not ok: existing tests broken by the change: tests\/existing_alpha\.sh/);
  const f = fx.gate('final.json');
  assert.deepEqual([f.existing.regressions.map(x => x.file), f.existing.preexisting], [['tests/existing_alpha.sh'], ['tests/existing_beta.sh']]);
});

test('dod: at RED a pair counts when its test is named in its file and the file failed; a row for a test that is not there does not', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.match((await dod(fx, 'red')).out, /^DOD a stage=red ok=false[\s\S]*no RED gate on record: run `tdd\.mjs red` first/);
  await fx.tdd('red', ['--group', 'a']);
  let r = await dod(fx, 'red');
  assert.match(r.out, /^DOD a stage=red ok=true covered 1\/1/);
  assert.match(r.out, /AC1: happy covered \(test_ac1_happy\)/);
  r = await dod(fx, 'red', ['AC1:happy:test_ac1_nowhere:tests/test_alpha.sh']);
  assert.match(r.out, /ok=false[\s\S]*rows with no such test: AC1\/happy: test_ac1_nowhere is not in tests\/test_alpha\.sh[\s\S]*DoD gaps: AC1\/happy: missing/);
  assert.match((await dod(fx, 'red', ['AC1:happy:test_ac1:tests/test_alpha.sh'])).out, /ok=false[\s\S]*test_ac1 is not in/, 'a name that is only the start of another test is not that test');
  assert.match((await dod(fx, 'red', ['nonsense'])).out, /ok=false[\s\S]*1 --row not in the form ID:kind:test:file/);
  assert.match((await dod(fx, 'red', [])).out, /ok=false[\s\S]*DoD gaps: AC1\/happy: missing/, 'no row, no pair');
  assert.doesNotMatch((await dod(fx, 'red', ['AC1:happy:test_ac1_nowhere:tests/test_alpha.sh'])).out, /not in the form/, 'a row that parses but names no test is a phantom, not an unreadable row');
  assert.equal((await fx.tdd('dod', ['--group', 'a'])).status, 2, 'dod needs --stage');
  assert.equal((await fx.tdd('dod', ['--stage', 'red'])).status, 2, 'dod needs --group');
  assert.equal((await fx.tdd('dod', ['--group', 'zzz', '--stage', 'red'])).status, 2);
  assert.equal((await fx.tdd('bogus')).status, 2, 'an unknown command is a usage error');
});

test('dod: a pair whose file passed already at RED is not covered; a gate file only speaks for the tree it ran on', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q old src/alpha.txt\n' });
  await fx.tdd('red', ['--group', 'a']);
  assert.match((await dod(fx, 'red')).out, /ok=false[\s\S]*DoD gaps: AC1\/happy: unproven/, 'passes-already proves nothing about the change');
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.match((await dod(fx, 'red')).out, /ok=false[\s\S]*the RED gate ran before tests\/test_alpha\.sh changed: run it again/, 'an old gate file cannot vouch for a file edited since');
  await fx.tdd('red', ['--group', 'a']);
  assert.match((await dod(fx, 'red')).out, /ok=true/);
});

test('dod: at GREEN the pair needs the GREEN gate ok and unchanged files; a gate that said not ok closes nothing', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a']);
  assert.match((await dod(fx, 'green')).out, /^DOD a stage=green ok=true covered 1\/1/);
  put(fx.repo, { 'src/alpha.txt': 'newer\n' });
  assert.match((await dod(fx, 'green')).out, /ok=false[\s\S]*the GREEN gate ran before src\/alpha\.txt changed/, 'the code changed after the gate ran');
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ntrue\n', 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a', '--retest']);
  assert.equal(fx.gate('a.green.json').ok, false, 'a test that passes without the code gives no signal');
  const r = await dod(fx, 'green');
  assert.match(r.out, /covered 0\/1[\s\S]*the GREEN gate said not ok[\s\S]*DoD gaps: AC1\/happy: unproven/);
});

test('final: the first run is the reviewer\'s view; --again (a re-run after fixes) never replaces it', async t => {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n' });
  assert.match((await fx.tdd('final', ['--again'])).out, /^FINAL ok=true/);
  assert.equal(existsSync(join(fx.run, 'gates', 'reviewed.json')), false, 'a re-run is never the reviewer\'s tree');
  await fx.tdd('final');
  const first = fx.gate('reviewed.json').snapshot;
  put(fx.repo, { 'src/beta.txt': 'beta two\n' });
  await fx.tdd('final', ['--again']);
  assert.equal(fx.gate('reviewed.json').snapshot, first);
  assert.notEqual(fx.gate('final.json').snapshot, first, 'final.json is the latest run');
});

test('config files are fine as group src: the GREEN probe reverts them too, so a test that needs the config exercises the change', async t => {
  const fx = fixture(t, { files: { 'config/alpha.json': '{"mode":"old"}\n' }, plan: p => ({ groups: [{ ...PLAN(p).groups[0], src: ['config/alpha.json'] }], dod: PLAN(p).dod.slice(0, 1) }) });
  const r = await fx.plan();
  assert.equal(r.status, 0, r.err);
  put(fx.repo, { 'tests/test_alpha.sh': '# test_ac1_happy\ngrep -q new config/alpha.json\n' });
  assert.match((await fx.tdd('red', ['--group', 'a'])).out, /RED a ok=true/);
  put(fx.repo, { 'config/alpha.json': '{"mode":"new"}\n' });
  const g = await fx.tdd('green', ['--group', 'a']);
  assert.match(g.out, /GREEN a ok=true/, g.out);
  assert.deepEqual([fx.gate('a.green.json').tests[0].verdict, fx.gate('a.green.json').outOfScope], ['exercises-change', []]);
});

test('coverage: changed lines covered below the minimum is a reason; the lcov file comes from the sandboxed command', async t => {
  const cover = hits => `printf 'SF:src/alpha.txt\\nDA:1,${hits}\\nend_of_record\\n' > {out}`;
  for (const [hits, ok] of [[0, false], [3, true]]) {
    const fx = await planned(t, { plan: { cover: cover(hits), coverMin: 80 } });
    put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
    await fx.tdd('red', ['--group', 'a']);
    put(fx.repo, { 'src/alpha.txt': 'new\n' });
    const r = await fx.tdd('green', ['--group', 'a']);
    assert.match(r.out, new RegExp(`ok=${ok}`), r.out);
    assert.equal(fx.gate('a.green.json').coverage.pct, hits ? 100 : 0);
    if (!ok) assert.match(r.out, /changed-line coverage 0% < 80%/);
  }
  const none = await planned(t, { plan: { cover: 'true {out}' } });
  put(none.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  await none.tdd('red', ['--group', 'a']);
  put(none.repo, { 'src/alpha.txt': 'new\n' });
  assert.match((await none.tdd('green', ['--group', 'a'])).out, /cover command wrote no zt-coverage\.lcov/);
});

test('green: a mutant the tests never pin survives, with a citable stamp, and makes the gate not ok', { skip: !hasPython && 'python3 not available' }, async t => {
  const fx = await planned(t, { plan: { groups: [{ id: 'a', tests: ['tests/test_calc.sh'], src: ['src/calc.py'], dod: ['AC1', 'AC2'], after: [] }] } });
  put(fx.repo, { 'tests/test_calc.sh': PY_TEST });
  await fx.tdd('red', ['--group', 'a']);
  put(fx.repo, { 'src/calc.py': 'def sign(x):\n    if x > 0:\n        return 1\n    return 0\n' });
  const r = await fx.tdd('green', ['--group', 'a']);
  assert.match(r.out, /ok=false/);
  const g = fx.gate('a.green.json');
  assert.ok(g.mutation.survivors.length >= 1, JSON.stringify(g.mutation));
  assert.match(g.mutation.survivors[0].quote, /^ZT-MUTANT X-[0-9a-f]{8} src\/calc\.py:\d+ \S+ exit=0$/);
  assert.match(r.out, /survivor X-[0-9a-f]{8} src\/calc\.py/);
  assert.match(g.reasons.join(), /mutant\(s\) survived/);
});

test('verify: the DoD closure comes from the gate files, not from what an agent said', async t => {
  const fx = await built(t);
  let v = await verify(fx, RET(BETA_ROW));
  assert.deepEqual([v.dod.covered, v.dod.total, v.dod.gaps, v.final, v.overridden, v.notDone], [2, 2, [], true, [], []]);
  assert.match(readFileSync(join(fx.run, 'dod-matrix.md'), 'utf8'), /DoD closure: 2\/2/);
  v = await verify(fx, RET([]));
  assert.deepEqual(v.dod.gaps, ['AC2/happy: missing']);
  v = await verify(fx, RET([{ dod: 'AC2', kind: 'happy', test: 'test_ac2_happy', file: 'tests/test_alpha.sh' }]));
  assert.deepEqual(v.dod.gaps, ['AC2/happy: missing'], 'a row naming a file that is not the group\'s test file does not count');
});

test('verify: a matrix row naming a test that is not in its file is a phantom, never coverage', async t => {
  const fx = await built(t);
  const v = await verify(fx, RET([{ dod: 'AC2', kind: 'happy', test: 'test_ac2_does_not_exist', file: 'tests/test_beta.sh' }]));
  assert.deepEqual(v.dod.phantom, ['AC2/happy: test_ac2_does_not_exist is not in tests/test_beta.sh']);
  assert.deepEqual(v.dod.gaps, ['AC2/happy: missing']);
});

test('verify: a PASS the gate contradicts is flagged, a group that is not done is listed', async t => {
  const fx = await built(t);
  rmSync(join(fx.run, 'gates', 'a.red.json'));
  const gate = fx.gate('b.green.json');
  writeFileSync(join(fx.run, 'gates', 'b.green.json'), JSON.stringify({ ...gate, ok: false, reasons: ['1 mutant(s) survived'] }));
  const v = await verify(fx, RET(BETA_ROW, { c: { state: 'blocked' } }));
  assert.deepEqual(v.overridden, ['a/red: PASS with no gate on record', 'b/green: PASS although the gate said not ok (1 mutant(s) survived)']);
  assert.deepEqual(v.notDone, ['c: blocked']);
});

test('verify: a reviewer finding whose code is still there after the fix is unfixed; a fixed one is not', async t => {
  const fx = await built(t);
  const cl = (id, file, quote) => ({ id, status: 'confirmed', severity: 'medium', file, startLine: 1, endLine: 1, title: `finding ${id}`, quote });
  const v = await verify(fx, { ...RET(BETA_ROW), clusters: [cl('C-1', 'src/alpha.txt', 'old'), cl('C-2', 'src/alpha.txt', 'new'), { ...cl('C-3', 'src/alpha.txt', 'new'), status: 'refuted' }] });
  assert.deepEqual(v.unfixed, ['C-2 medium src/alpha.txt:1 finding C-2']);
});

test('a non-ASCII path is judged like any other: names stay raw, so nothing reads as stray', async t => {
  const fx = await planned(t, { plan: p => ({ groups: [{ id: 'a', tests: ['tests/test_café.sh'], src: ['src/café.txt'], dod: ['AC1', 'AC2'], after: [] }] }) });
  put(fx.repo, { 'tests/test_café.sh': '# test_ac1_happy\ngrep -q new src/café.txt\n' });
  assert.match((await fx.tdd('red', ['--group', 'a'])).out, /RED a ok=true/);
  put(fx.repo, { 'src/café.txt': 'new\n' });
  const g = await fx.tdd('green', ['--group', 'a']);
  assert.match(g.out, /^GREEN a ok=true/, g.out);
  assert.deepEqual(fx.gate('a.green.json').outOfScope, []);
  const f = await fx.tdd('final');
  assert.match(f.out, /^FINAL ok=true/m, f.out);
});

test('the integration test is not run in the sandbox (it needs its real dependency); verify reads the exit code its agent reported', async t => {
  const integ = { file: 'tests/integration/test_flow.sh', goal: 'drive the full path' };
  const fx = await planned(t, { plan: { integration: integ } });
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'src/alpha.txt': 'new\n', 'tests/test_beta.sh': TEST_BETA, 'src/beta.txt': 'beta\n', [integ.file]: '# mentions alpha\nexit 1\n' });
  const f = await fx.tdd('final');
  assert.match(f.out, /^FINAL ok=true/m, f.out);
  assert.ok(!fx.gate('final.json').existing.ran.includes(integ.file) && fx.gate('final.json').outOfScope.length === 0);
  const ok = await verify(fx, { ...RET(BETA_ROW), integration: { file: integ.file, exit: 0 } });
  assert.deepEqual([ok.integration, ok.notDone], ['ok', []]);
  const bad = await verify(fx, { ...RET(BETA_ROW), integration: { file: integ.file, exit: 3 } });
  assert.deepEqual(bad.notDone, [`integration: ${integ.file} exited 3`]);
  assert.deepEqual((await verify(fx, RET(BETA_ROW))).notDone, [`integration: not run`]);
});

test('verify: a nit is reported, never "unfixed"; a matrix row whose name only starts with a real test name is a phantom', async t => {
  const fx = await built(t);
  const cl = (id, status) => ({ id, status, severity: 'nit', file: 'src/alpha.txt', startLine: 1, endLine: 1, title: `t ${id}`, quote: 'new' });
  const v = await verify(fx, { ...RET([{ dod: 'AC2', kind: 'happy', test: 'test_ac2', file: 'tests/test_beta.sh' }]), clusters: [cl('R-1', 'unverified-nit')] });
  assert.deepEqual(v.unfixed, []);
  assert.deepEqual(v.dod.phantom, ['AC2/happy: test_ac2 is not in tests/test_beta.sh']);
});

test('gates leave no scratch tree behind', async t => {
  const fx = await built(t);
  await fx.tdd('final');
  const args = JSON.parse(readFileSync(join(fx.run, 'args.json'), 'utf8'));
  assert.deepEqual(readdirSync(args.scratch).filter(n => /^(red|gp|gm|cov|fin|finb)-/.test(n)), []);
});
