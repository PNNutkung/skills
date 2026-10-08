// Offline checks for gates.mjs (pure functions, no I/O). Run: node --test gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedCoverage, checkMatrix, classifyRed, closure, closureMarkdown, defectsFromGreen, defectsFromRed, groupClosure, outOfScope, parseLcov, parseNumstat, parseRow, pickAffected, redOk, validatePlan } from './gates.mjs';

const plan = () => ({
  repo: '/r', cmd: 'pytest -q {file}',
  dod: [{ id: 'AC1', text: 'parse ISO dates', source: 'must parse ISO dates' }, { id: 'AC2', text: 'reject trailing Z', source: 'assumed', kinds: ['happy', 'fail'] }],
  groups: [{ id: 'a', tests: ['tests/test_a.py'], src: ['src/a.py'], dod: ['AC1'], after: [] }, { id: 'b', tests: ['tests/test_b.py'], src: ['src/b.py'], dod: ['AC2'], after: ['a'] }],
});
const bad = (mutate, ticket) => { const p = plan(); mutate(p); return validatePlan(p, ticket); };

test('validatePlan: a good plan has no errors, and quotes are checked against the ticket when given', () => {
  assert.deepEqual(validatePlan(plan()), []);
  assert.deepEqual(validatePlan(plan(), 'The service   must parse\nISO dates always.'), []);
  assert.match(validatePlan(plan(), 'nothing relevant').join(), /AC1: source quote not found/);
});

test('validatePlan: ids, kinds, sources and the command are required and well formed', () => {
  assert.match(bad(p => { p.cmd = 'pytest'; }).join(), /cmd must contain \{file\}/);
  assert.match(bad(p => { p.dod[0].id = 'AC-1'; }).join(), /DoD id "AC-1"/);
  assert.match(bad(p => { p.dod[1].id = 'AC1'; }).join(), /AC1 is repeated/);
  assert.match(bad(p => { p.dod[0].kinds = ['happy', 'sad']; }).join(), /AC1: kinds/);
  assert.match(bad(p => { p.dod[0].source = ' '; }).join(), /AC1: source is required/);
  assert.match(bad(p => { p.groups[0].id = 'a b'; }).join(), /group id/);
});

test('validatePlan: probe options are checked: cover needs {out}, link is relative, ro absolute, env K=V', () => {
  assert.match(bad(p => { p.cover = 'pytest --cov'; }).join(), /cover must be a command containing \{out\}/);
  assert.deepEqual(bad(p => { p.cover = 'pytest --cov-report=lcov:{out} {files}'; p.link = ['.venv']; p.ro = ['/opt/py']; p.env = ['A=1']; }), []);
  assert.match(bad(p => { p.link = ['../venv']; }).join(), /link "\.\.\/venv"/);
  assert.match(bad(p => { p.ro = ['rel']; }).join(), /ro "rel" must be an absolute path/);
  assert.match(bad(p => { p.env = ['NOPE']; }).join(), /env "NOPE" must be K=V/);
});

test('validatePlan: one owner per file, relative normalized paths only', () => {
  assert.match(bad(p => { p.groups[1].src.push('src/a.py'); }).join(), /src\/a\.py is owned by both a and b/);
  for (const f of ['/etc/passwd', '../x.py', 'a/../b.py', './a.py', 'a//b.py', '', 'a,b.py']) assert.match(bad(p => { p.groups[0].src = [f]; }).join(), /normalized relative path/, f);
  assert.match(bad(p => { p.groups[0].tests = []; }).join(), /a: tests must list/);
});

test('validatePlan: every DoD item is covered, every group names known items and groups, no cycles', () => {
  assert.match(bad(p => { p.groups[1].dod = ['AC1']; }).join(), /DoD AC2 is covered by no group/);
  assert.match(bad(p => { p.groups[0].dod = ['AC9']; }).join(), /unknown DoD id AC9/);
  assert.match(bad(p => { p.groups[1].after = ['zzz']; }).join(), /after names unknown/);
  assert.match(bad(p => { p.groups[0].after = ['a']; }).join(), /own group/);
  assert.match(bad(p => { p.groups[0].after = ['b']; }).join(), /cycle/);
});

const items = [{ id: 'AC1', kinds: ['happy', 'fail', 'edge'] }, { id: 'AC2', kinds: ['happy'] }];
const files = ['tests/test_a.py'];
const row = (dod, kind, test = `test_${dod.toLowerCase()}_${kind}`, file = 'tests/test_a.py') => ({ dod, kind, test, file });
const verdict = (rows, f = files, it = items) => { const { good, ...r } = checkMatrix(it, rows, f); return r; };

test('checkMatrix: complete matrix has nothing missing or bad', () => {
  const rows = [row('AC1', 'happy'), row('AC1', 'fail'), row('AC1', 'edge'), row('AC2', 'happy')];
  assert.deepEqual(verdict(rows), { missing: [], bad: [] });
  assert.equal(checkMatrix(items, rows, files).good.length, 4);
});

test('checkMatrix: missing pairs and unusable rows are named', () => {
  const r = verdict([row('AC1', 'happy'), row('AC1', 'fail', 'test_boundary'), row('AC9', 'happy'), row('AC2', 'happy', 'test_ac2_x', 'tests/other.py'), row('AC2', 'sad')]);
  assert.deepEqual(r.missing.map(m => `${m.dod}/${m.kind}`), ['AC1/fail', 'AC1/edge', 'AC2/happy']);
  assert.deepEqual(r.bad.map(b => b.why.slice(0, 28)), ['test name must carry its DoD', 'unknown DoD id', 'file is not one of the group', 'kind must be happy, fail or ']);
  assert.equal(verdict(undefined).missing.length, 4);
});

test('checkMatrix: extra tests beyond the required kinds are fine, and ids match case-insensitively', () => {
  const rows = [row('AC2', 'happy', 'TEST_AC2_ok'), row('AC2', 'edge'), row('AC1', 'happy'), row('AC1', 'fail'), row('AC1', 'edge')];
  assert.deepEqual(verdict(rows), { missing: [], bad: [] });
});

test('checkMatrix: an id must be set apart in the name: ac10 never serves ac1, a one-letter id never matches a word, an empty name never counts', () => {
  const ten = [{ id: 'AC1', kinds: ['happy'] }, { id: 'AC10', kinds: ['happy'] }];
  const r = verdict([row('AC1', 'happy', 'test_ac10_happy'), row('AC10', 'happy', 'test_ac10_happy')], files, ten);
  assert.deepEqual(r.missing, [{ dod: 'AC1', kind: 'happy' }], 'AC1 is not covered by the test of AC10');
  assert.equal(r.bad.length, 1);
  const a = [{ id: 'A', kinds: ['happy'] }];
  assert.equal(verdict([row('A', 'happy', 'test_parser_happy')], files, a).missing.length, 1, 'the letter a inside parser is not the id');
  assert.equal(verdict([row('A', 'happy', 'test_a_happy')], files, a).missing.length, 0);
  assert.equal(verdict([row('AC1', 'happy', '')], files, ten).bad.length, 1);
  assert.equal(verdict([row('AC1', 'happy', 'testAc1Happy')], files, ten).bad.length, 1, 'camelCase with no separator is refused: the brief says test_ac1_happy');
});

test('checkMatrix: one test stands for one (item, kind): a name listed three times is not three tests', () => {
  const one = row('AC1', 'happy', 'test_ac1_x');
  const r = verdict([one, { ...one, kind: 'fail' }, { ...one, kind: 'edge' }]);
  assert.deepEqual(r.missing.map(m => `${m.dod}/${m.kind}`), ['AC1/fail', 'AC1/edge', 'AC2/happy'], 'only the happy pair is credited');
  assert.equal(r.bad.length, 2);
  assert.match(r.bad[0].why, /already stands for AC1\/happy/);
  assert.deepEqual(verdict([one, one]).bad.length, 0, 'the same row twice is harmless');
});

test('classifyRed: assertion failure, load error, no failure, no tests, no sandbox, timeout', () => {
  assert.equal(classifyRed({ exit: 1, tail: 'FAILED tests/t.py::test_x - AssertionError: 3 != 4' }), 'fails');
  assert.equal(classifyRed({ exit: 1, tail: "ERROR tests/t.py - ModuleNotFoundError: No module named 'a'" }), 'fails-to-load');
  assert.equal(classifyRed({ exit: 1, tail: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module './a.mjs'" }), 'fails-to-load');
  assert.equal(classifyRed({ exit: 0, tail: '2 passed' }), 'passes-already');
  assert.equal(classifyRed({ exit: 5, tail: 'no tests ran in 0.01s' }), 'no-tests');
  assert.equal(classifyRed({ exit: 5, tail: 'collected 0 items' }), 'no-tests');
  assert.equal(classifyRed({ exit: 86, tail: '' }), 'unverifiable');
  assert.equal(classifyRed({ exit: 127, tail: 'sh: pytest: command not found' }), 'unverifiable', 'a command that cannot start says nothing about the test: it is not a RED');
  assert.equal(classifyRed({ exit: 124, tail: '' }), 'timeout');
  assert.equal(classifyRed({ exit: 1 }), 'fails');
});

test('redOk: every file must fail now; a passing, empty or unverifiable file is not RED', () => {
  assert.ok(redOk([{ verdict: 'fails' }, { verdict: 'fails-to-load' }]));
  for (const v of ['passes-already', 'no-tests', 'unverifiable', 'timeout']) assert.ok(!redOk([{ verdict: 'fails' }, { verdict: v }]), v);
  assert.ok(!redOk([]));
});

test('parseNumstat and outOfScope', () => {
  const n = parseNumstat('3\t1\ttests/a.py\n-\t-\timg.png\n0\t5\ttests/b.py\n');
  assert.deepEqual(n, { changed: ['tests/a.py', 'img.png', 'tests/b.py'], removed: 6 });
  assert.deepEqual(parseNumstat(''), { changed: [], removed: 0 });
  assert.deepEqual(outOfScope(['a.py', 'x/y.py', 'z.md'], new Set(['a.py', 'z.md'])), ['x/y.py']);
});

const LCOV = ['SF:/abs/repo/src/a.py', 'DA:1,3', 'DA:2,0', 'DA:5,1', 'end_of_record', 'SF:src/b.py', 'DA:1,0', 'end_of_record', ''].join('\n');

test('parseLcov and changedCoverage: only instrumented changed lines count, suffix match, noData listed', () => {
  const lcov = parseLcov(LCOV);
  assert.deepEqual([...lcov.get('src/b.py')], [[1, 0]]);
  const c = changedCoverage(lcov, new Map([['src/a.py', [1, 2, 3, 5]], ['src/b.py', [1]], ['src/c.py', [1]]]));
  assert.deepEqual(c, { covered: 2, total: 4, pct: 50, uncovered: { 'src/a.py': [2], 'src/b.py': [1] }, noData: ['src/c.py'] });
  assert.equal(changedCoverage(lcov, new Map()).pct, null);
});

test('pickAffected: tests that mention a changed module by name, own tests excluded, capped', () => {
  const tests = { 'tests/test_x.py': 'from src.parser import parse', 'tests/test_y.py': 'import other', 'tests/test_own.py': 'parser', 'tests/test_z.py': 'parser_extra only' };
  const r = pickAffected(Object.keys(tests), p => tests[p], ['src/parser.py', 'src/__init__.py'], new Set(['tests/test_own.py']));
  assert.deepEqual(r, { run: ['tests/test_x.py'], more: 0 });
  const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`t${i}.py`, 'parser']));
  const capped = pickAffected(Object.keys(many), p => many[p], ['a/parser.py'], new Set());
  assert.deepEqual([capped.run.length, capped.more], [12, 3]);
  assert.deepEqual(pickAffected(['t.py'], () => 'x', ['a/__init__.py'], new Set()), { run: [], more: 0 });
});

const rows = { a: [row('AC1', 'happy'), row('AC1', 'fail'), row('AC1', 'edge')], b: [row('AC2', 'happy', 'test_ac2_ok', 'tests/test_b.py')] };
const red = { a: { 'tests/test_a.py': 'fails' }, b: { 'tests/test_b.py': 'fails-to-load' } };
const green = { a: { 'tests/test_a.py': 'exercises-change' }, b: { 'tests/test_b.py': 'exercises-change' } };

test('closure: a pair is covered only by a test file that failed at RED and passes at GREEN', () => {
  const p = plan();
  p.dod[1].kinds = ['happy'];
  const c = closure(p, rows, red, green);
  assert.deepEqual([c.covered, c.total, c.gaps], [4, 4, []]);
  assert.equal(c.items[1].reduced, true);
  assert.equal(c.items[1].source, 'assumed');
});

test('closure: missing rows, tests that never failed, and tests that do not pass are named gaps', () => {
  const p = plan();
  p.dod[1].kinds = ['happy', 'edge'];
  const c = closure(p, rows, { ...red, a: { 'tests/test_a.py': 'passes-already' } }, { ...green, b: { 'tests/test_b.py': 'no-signal' } });
  assert.deepEqual(c.gaps.sort(), ['AC1/edge: unproven', 'AC1/fail: unproven', 'AC1/happy: unproven', 'AC2/edge: missing', 'AC2/happy: unproven']);
  const md = closureMarkdown(c);
  assert.match(md, /DoD closure: 0\/5/);
  assert.match(md, /\| AC2 .*\| UNPROVEN test_ac2_ok \| - \| MISSING \|/);
  assert.match(md, /Gaps: /);
});

test('checkMatrix: the same test name in two different files is two tests', () => {
  const two = ['tests/a.py', 'tests/b.py'];
  const r = verdict([row('AC1', 'happy', 'test_ac1_x', 'tests/a.py'), row('AC1', 'fail', 'test_ac1_x', 'tests/b.py')], two, [{ id: 'AC1', kinds: ['happy', 'fail'] }]);
  assert.deepEqual(r, { missing: [], bad: [] });
});

test('closure: a row that checkMatrix would refuse never credits a pair, even when its file passed', () => {
  const p = plan();
  p.dod[1].kinds = ['happy'];
  p.dod.push({ id: 'AC10', text: 'x', source: 'assumed', kinds: ['happy'] }); p.groups[0].dod.push('AC10');
  const dup = row('AC1', 'happy', 'test_ac10_happy');                       // AC10's test claimed for AC1
  const same = { ...row('AC1', 'fail', 'test_ac1_x'), }, again = { ...same, kind: 'edge' };  // one test claimed for two kinds
  const c = closure(p, { ...rows, a: [dup, row('AC10', 'happy', 'test_ac10_happy'), row('AC1', 'happy', 'test_ac1_h'), same, again] }, red, green);
  assert.deepEqual(c.gaps.sort(), ['AC1/edge: missing']);
  const empty = closure(p, { ...rows, a: [row('AC1', 'happy', ''), row('AC1', 'fail'), row('AC1', 'edge'), row('AC10', 'happy')] }, red, green);
  assert.ok(empty.gaps.includes('AC1/happy: missing'));
});

test('closure: a late row (a strengthening pass after GREEN) never credits a pair; a group whose last GREEN gate was not ok credits nothing', () => {
  const p = plan();
  p.dod[1].kinds = ['happy'];
  const onlyLate = { ...rows, a: rows.a.map(r => (r.kind === 'edge' ? { ...r, late: true } : r)) };
  assert.deepEqual(closure(p, onlyLate, red, green).gaps, ['AC1/edge: missing']);
  const bad = closure(p, rows, red, green, { a: false, b: true });
  assert.deepEqual(bad.gaps.sort(), ['AC1/edge: unproven', 'AC1/fail: unproven', 'AC1/happy: unproven']);
  assert.deepEqual(closure(p, rows, red, green, { a: true, b: true }).gaps, []);
});

test('validatePlan: smoke lists 1 to 3 relative test files', () => {
  for (const v of [['tests/test_ok.py'], ['a', 'b', 'c']]) assert.deepEqual(bad(p => { p.smoke = v; }), [], `${v.length} file(s) is valid: both ends of the range count`);
  for (const v of [[], ['a', 'b', 'c', 'd'], ['/abs.py'], ['../x.py'], 'tests/x.py', [3]]) assert.match(bad(p => { p.smoke = v; }).join(), /smoke must list 1 to 3 relative test files/, JSON.stringify(v));
});

test('validatePlan: rounds is an integer from 1 to 4', () => {
  for (const v of [1, 2, 4]) assert.deepEqual(bad(p => { p.rounds = v; }), [], `rounds ${v} is valid: both ends of the range count`);
  for (const v of [0, 5, 1.5, '2', null]) assert.match(bad(p => { p.rounds = v; }).join(), /rounds must be an integer from 1 to 4/, String(v));
});

test('parseRow: ID:kind:test:file, the file after the LAST colon so a test name may hold one', () => {
  assert.deepEqual(parseRow('AC1:happy:test_ac1_happy:tests/test_a.py'), { dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_a.py' });
  assert.deepEqual(parseRow('AC1:fail:ac1 rejects: empty:tests/t.py'), { dod: 'AC1', kind: 'fail', test: 'ac1 rejects: empty', file: 'tests/t.py' });
  assert.deepEqual(parseRow('A:happy:t:f'), { dod: 'A', kind: 'happy', test: 't', file: 'f' }, 'a one-character id is a valid id');
  assert.deepEqual(parseRow('AC1::t:f'), { dod: 'AC1', kind: '', test: 't', file: 'f' }, 'an empty kind is still a row: checkMatrix is what refuses it');
  for (const s of ['', 'nonsense', 'AC1:happy', 'AC1:happy:file.py', ':happy:t:f']) assert.equal(parseRow(s), null, JSON.stringify(s));
});

test('groupClosure: a group is judged on its own items; at RED a failing file is enough; at GREEN the verdict and the gate are needed', () => {
  const p = plan();
  p.dod[1].kinds = ['happy'];
  const full = groupClosure(p, 'a', rows.a, red.a, green.a, true, 'green');
  assert.deepEqual([full.covered, full.total, full.gaps, full.shared], [3, 3, [], []]);
  assert.deepEqual(full.items.map(i => i.id), ['AC1'], 'AC2 belongs to b');
  const early = groupClosure(p, 'a', rows.a, red.a, {}, undefined, 'red');
  assert.deepEqual([early.covered, early.gaps], [3, []], 'GREEN does not exist yet at RED');
  assert.deepEqual(groupClosure(p, 'a', rows.a, red.a, {}, true, 'green').gaps.sort(), ['AC1/edge: unproven', 'AC1/fail: unproven', 'AC1/happy: unproven']);
  assert.deepEqual(groupClosure(p, 'a', rows.a, red.a, green.a, false, 'green').gaps.length, 3, 'a GREEN gate that was not ok credits nothing');
  assert.equal(groupClosure(p, 'a', rows.a, { 'tests/test_a.py': 'passes-already' }, {}, undefined, 'red').gaps.length, 3, 'a file that did not fail at RED proves nothing');
  assert.deepEqual(groupClosure(p, 'a', [row('AC1', 'happy')], red.a, {}, undefined, 'red').gaps.sort(), ['AC1/edge: missing', 'AC1/fail: missing']);
});

test('groupClosure: an item another group also owns can be closed there, so its gaps are listed apart and do not block', () => {
  const p = plan();
  p.dod[1].kinds = ['happy'];
  p.groups[1].dod.push('AC1'); // b covers AC1 too
  const b = groupClosure(p, 'b', rows.b, red.b, green.b, true, 'green');
  assert.deepEqual(b.gaps, [], 'b alone does not have to close AC1');
  assert.deepEqual(b.shared.sort(), ['AC1/edge: missing', 'AC1/fail: missing', 'AC1/happy: missing']);
  assert.equal(groupClosure(p, 'a', rows.a, red.a, green.a, true, 'green').gaps.length, 0);
});

test('validatePlan: maxRepairs is an integer from 0 to 40', () => {
  for (const v of [0, 1, 6, 40]) assert.deepEqual(bad(p => { p.maxRepairs = v; }), [], `maxRepairs ${v} is valid: 0 means no repair at all, 40 is the top`);
  for (const v of [-1, 41, 1.5, '3', null]) assert.match(bad(p => { p.maxRepairs = v; }).join(), /maxRepairs must be an integer from 0 to 40/, String(v));
});

test('defectsFromRed: every test file that did not fail now is a defect named by its verdict; failing files are not', () => {
  const gate = { tests: [{ file: 'a.py', verdict: 'fails' }, { file: 'b.py', verdict: 'fails-to-load' }, { file: 'c.py', verdict: 'passes-already' }, { file: 'd.py', verdict: 'missing' }, { file: 'e.py', verdict: 'weird' }] };
  const d = defectsFromRed(gate);
  assert.deepEqual(d.map(x => [x.cls, x.file]), [['test', 'c.py'], ['test', 'd.py'], ['test', 'e.py']]);
  assert.match(d[0].what, /passes-already: it passes without new code/);
  assert.match(d[1].what, /missing: the file does not exist/);
  assert.match(d[2].what, /weird: it must fail now for the right reason/);
  assert.deepEqual(defectsFromRed(null), []);
  assert.equal(defectsFromRed({ tests: Array.from({ length: 9 }, (_, i) => ({ file: `t${i}.py`, verdict: 'passes-already' })) }).length, 6, 'capped like a navigator report');
});

test('defectsFromGreen: classed like the green navigator is told to (impl, then test, then gap), from structure first and reasons only as a last resort', () => {
  const gate = {
    ok: false, reasons: ['a test file does not pass and exercise the change', 'flaky', 'tests changed since RED: t.py', '2 mutant(s) survived: x', 'changed-line coverage 40% < 80%'],
    tests: [{ file: 't.py', verdict: 'fails-on-head', reason: 'exit 1' }, { file: 'u.py', verdict: 'no-signal', nondeterministic: true }, { file: 'v.py', verdict: 'exercises-change' }],
    frozen: { changed: ['t.py', 'w.py'], removed: 2 }, mutation: { survivors: [{ id: 'X-1', file: 's.py', line: 4, op: 'gt-ge', before: 'if x > 0:', after: 'if x >= 0:' }] },
    coverage: { pct: 40, min: 80, uncovered: { 's.py': [3, 4, 9] } },
  };
  const d = defectsFromGreen(gate);
  assert.deepEqual(d.map(x => x.cls), ['impl', 'impl', 'test', 'gap', 'gap', 'gap']);
  assert.match(d[1].what, /flaky: the 3 runs disagree: make the code under test deterministic/, 'a flaky run goes to the code maker: the restore maker cannot fix it');
  assert.match(d[0].what, /t\.py is fails-on-head \(exit 1\): it does not pass with the group's code/);
  assert.deepEqual([d[2].file, d[2].what], ['t.py', 'tests changed since RED: t.py, w.py'], 'the first changed file is the anchor, every one is named');
  assert.deepEqual([d[4].file, d[4].line, /mutant X-1 survived \(gt-ge\): if x > 0: -> if x >= 0:; no test pins that code/.test(d[4].what)], ['s.py', 4, true]);
  assert.match(d[5].what, /changed-line coverage 40% < 80%; uncovered s\.py:3,4,9/);
  assert.ok(!defectsFromGreen({ ...gate, coverage: { pct: 80, min: 80, uncovered: {} } }).some(x => /coverage/.test(x.what)), 'coverage exactly at the minimum is enough');
  const sanctioned = defectsFromGreen({ ...gate, reasons: gate.reasons.filter(r => !r.startsWith('tests changed')) });
  assert.ok(!sanctioned.some(x => /tests changed since RED/.test(x.what)), 'a --retest run reports no changed-tests reason, so none is made up');
  assert.deepEqual(defectsFromGreen({ ok: false, reasons: ['test probe: boom'], tests: [{ file: 't.py', verdict: 'exercises-change' }] }), [{ cls: 'impl', what: 'test probe: boom' }], 'a reason the structure does not name still becomes a defect');
  assert.deepEqual(defectsFromGreen({ ok: true, reasons: [], tests: [{ file: 't.py', verdict: 'exercises-change' }] }), []);
  assert.deepEqual(defectsFromGreen(undefined), []);
});
