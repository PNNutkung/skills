// Offline checks for gates.mjs (pure functions, no I/O). Run: node --test gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedCoverage, checkMatrix, classifyRed, closure, closureMarkdown, outOfScope, parseLcov, parseNumstat, pickAffected, redOk, validatePlan } from './gates.mjs';

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

test('checkMatrix: complete matrix has nothing missing or bad', () => {
  const rows = [row('AC1', 'happy'), row('AC1', 'fail'), row('AC1', 'edge'), row('AC2', 'happy')];
  assert.deepEqual(checkMatrix(items, rows, files), { missing: [], bad: [] });
});

test('checkMatrix: missing pairs and unusable rows are named', () => {
  const r = checkMatrix(items, [row('AC1', 'happy'), row('AC1', 'fail', 'test_boundary'), row('AC9', 'happy'), row('AC2', 'happy', 'test_ac2_x', 'tests/other.py'), row('AC2', 'sad')], files);
  assert.deepEqual(r.missing.map(m => `${m.dod}/${m.kind}`), ['AC1/fail', 'AC1/edge', 'AC2/happy']);
  assert.deepEqual(r.bad.map(b => b.why), ['test name must contain its DoD id', 'unknown DoD id', 'file is not one of the group test files', 'kind must be happy, fail or edge']);
  assert.deepEqual(checkMatrix(items, undefined, files).missing.length, 4);
});

test('checkMatrix: extra tests beyond the required kinds are fine, and ids match case-insensitively', () => {
  const rows = [row('AC2', 'happy', 'TEST_AC2_ok'), row('AC2', 'edge'), row('AC1', 'happy'), row('AC1', 'fail'), row('AC1', 'edge')];
  assert.deepEqual(checkMatrix(items, rows, files), { missing: [], bad: [] });
});

test('classifyRed: assertion failure, load error, no failure, no tests, no sandbox, timeout', () => {
  assert.equal(classifyRed({ exit: 1, tail: 'FAILED tests/t.py::test_x - AssertionError: 3 != 4' }), 'fails');
  assert.equal(classifyRed({ exit: 1, tail: "ERROR tests/t.py - ModuleNotFoundError: No module named 'a'" }), 'fails-to-load');
  assert.equal(classifyRed({ exit: 1, tail: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module './a.mjs'" }), 'fails-to-load');
  assert.equal(classifyRed({ exit: 0, tail: '2 passed' }), 'passes-already');
  assert.equal(classifyRed({ exit: 5, tail: 'no tests ran in 0.01s' }), 'no-tests');
  assert.equal(classifyRed({ exit: 5, tail: 'collected 0 items' }), 'no-tests');
  assert.equal(classifyRed({ exit: 86, tail: '' }), 'unverifiable');
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
