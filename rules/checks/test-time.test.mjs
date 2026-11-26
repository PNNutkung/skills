// Unit tests for test-time.mjs, its CLI, and the reporter run by a real node --test. Run: node --test test-time.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SECONDS, FLAG, FlagError, checkTimings, main, parseTimings, readCaps, warnLines } from './test-time.mjs';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'test-time.mjs');
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
// a node --test started from inside a test sees NODE_TEST_CONTEXT (even empty) and runs no files of its own
const withoutTestContext = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));
const tmp = t => { const d = mkdtempSync(join(tmpdir(), 'tt-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const cli = (args, env = {}) => {
  const r = spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', env: { ...process.env, [FLAG.file]: '', [FLAG.suite]: '', [FLAG.fileWarn]: '', [FLAG.suiteWarn]: '', ...env } });
  return { code: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop()), stderr: r.stderr };
};
const CAPS = { file: 30, suite: 120, fileWarn: 20, suiteWarn: 100 };

test('should use 30 s per file, 120 s for the suite and warn over 20 s a file when no flag is set', () => {
  assert.deepEqual(readCaps({}), { file: 30, suite: 120, fileWarn: 20, suiteWarn: 100 });
  assert.deepEqual(DEFAULT_SECONDS, { file: 30, suite: 120, fileWarn: 20, suiteWarn: 100 });
  assert.equal(FLAG.fileWarn, 'CHECKS_TEST_FILE_WARN_SECONDS_MAX');
});

test('should read a number, unlimited in any case, and an empty value as the default when the flags are set', () => {
  assert.deepEqual(readCaps({ [FLAG.file]: ' 45 ', [FLAG.suite]: 'Unlimited', [FLAG.fileWarn]: 'UNLIMITED' }), { file: 45, suite: null, fileWarn: null, suiteWarn: 100 });
  assert.deepEqual(readCaps({ [FLAG.file]: '', [FLAG.suite]: '  ', [FLAG.fileWarn]: '' }), { file: 30, suite: 120, fileWarn: 20, suiteWarn: 100 });
  assert.equal(readCaps({ [FLAG.fileWarn]: '15' }).fileWarn, 15);
});

test('should throw a FlagError naming the fix when a flag value is not valid', () => {
  for (const v of ['0', '-5', '1.5', 'thirty', 'true']) {
    assert.throws(() => readCaps({ [FLAG.file]: v }), e => e instanceof FlagError && e.message.includes(`${FLAG.file}=${v} is not valid`), v);
    assert.throws(() => readCaps({ [FLAG.suite]: v }), FlagError, v);
  }
  for (const v of ['0', '-1', '1.5', 'abc', ' 20x']) assert.throws(() => readCaps({ [FLAG.fileWarn]: v }), e => e instanceof FlagError && e.message.includes(`${FLAG.fileWarn}=${v} is not valid`), v);
});

test('should never throw anything but a FlagError when the warn level is random (WarnFlag fuzz)', () => {
  const chars = 'aZ09 -_.+eUnLiMiTeDก\0\n';
  for (let i = 0; i < 500; i++) {
    const v = Array.from({ length: i % 9 }, (_, j) => chars[(i * 7 + j * 13) % chars.length]).join('');
    let w;
    try { w = readCaps({ [FLAG.fileWarn]: v }).fileWarn; } catch (e) { assert.ok(e instanceof FlagError, String(e)); continue; }
    assert.ok(w === null || (Number.isInteger(w) && w > 0), JSON.stringify([v, w]));
    assert.equal(w, !v.trim() ? 20 : v.trim().toLowerCase() === 'unlimited' ? null : Number(v.trim()), JSON.stringify(v));
  }
});

test('should warn about a file over the warn level and not one at it when every file is under the cap', () => {
  const t = parseTimings(jsonl([{ file: 'at.test.mjs', ms: 20000 }, { file: 'over.test.mjs', ms: 20100 }, { file: 'cap.test.mjs', ms: 31000 }]));
  const r = checkTimings(t, CAPS);
  assert.deepEqual(r.warn, [{ file: 'over.test.mjs', sec: 20.1, max: 20 }, { file: 'cap.test.mjs', sec: 31, max: 20 }]);
  assert.deepEqual(checkTimings(parseTimings(jsonl([{ file: 'just.test.mjs', ms: 20001 }])), CAPS).warn, [{ file: 'just.test.mjs', sec: 20, max: 20 }], 'one ms over is over');
  assert.deepEqual(checkTimings(t, { ...CAPS, file: null }).ok, true, 'a warning never fails the check');
  assert.deepEqual(checkTimings(t, { ...CAPS, fileWarn: null }).warn, [], 'unlimited turns the warning off');
  assert.deepEqual(warnLines(r.warn, CAPS), [
    '::warning file=over.test.mjs::over.test.mjs took 20.1 s, over the warn level of 20 s (cap 30 s)',
    '::warning file=cap.test.mjs::cap.test.mjs took 31 s, over the warn level of 20 s (cap 30 s)',
  ]);
  assert.match(warnLines(r.warn, { ...CAPS, file: null })[0], /over the warn level of 20 s \(no cap\)$/);
});

test('should escape the file name the way GitHub reads workflow commands when it holds %, :, a comma or a line break (WarnFlag)', () => {
  const [line] = warnLines([{ file: 'a%b::c,d\n::error::x.test.mjs', sec: 21, max: 20 }], CAPS);
  assert.equal(line, '::warning file=a%25b%3A%3Ac%2Cd%0A%3A%3Aerror%3A%3Ax.test.mjs::a%25b::c,d%0A::error::x.test.mjs took 21 s, over the warn level of 20 s (cap 30 s)');
  assert.equal(line.split('\n').length, 1, 'one line, so the name cannot start its own command');
});

test('should pass and list the slowest files when every file and the suite are under their caps', () => {
  const r = checkTimings(parseTimings(jsonl([{ file: 'a.test.mjs', ms: 1000 }, { file: 'b.test.mjs', ms: 29999 }, { suite: 90000 }])), { file: 30, suite: 120 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.over, []);
  assert.deepEqual(r.slowest, [{ file: 'b.test.mjs', sec: 30 }, { file: 'a.test.mjs', sec: 1 }]);
  assert.equal(r.suiteSec, 90);
});

test('should fail naming the file and the suite when either takes longer than its cap', () => {
  const r = checkTimings(parseTimings(jsonl([{ file: 'slow.test.mjs', ms: 72000 }, { file: 'ok.test.mjs', ms: 30000 }, { suite: 121000 }])), { file: 30, suite: 120 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.over, [{ file: 'slow.test.mjs', sec: 72, max: 30 }, { suite: true, sec: 121, max: 120 }]);
});

test('should never fail when both caps are unlimited, and skip the suite cap when the run line is missing', () => {
  const t = parseTimings(jsonl([{ file: 'slow.test.mjs', ms: 999999 }]));
  assert.equal(t.suiteMs, null);
  assert.equal(checkTimings(t, { file: null, suite: null }).ok, true);
  assert.equal(checkTimings(t, { file: null, suite: 1 }).ok, true);
});

test('should throw when a timings line is not JSON, and ignore blank lines and lines of another shape', () => {
  assert.throws(() => parseTimings('{"file":"a","ms":1}\nnot json\n'), /line 2 is not JSON/);
  assert.deepEqual(parseTimings('\n{"other":1}\n{"file":"a","ms":"x"}\n{"file":"a","ms":5}\n'), { files: [{ file: 'a', ms: 5 }], suiteMs: null });
});

test('should exit 0, 1 or 2 when the CLI reads timings under the caps, over a cap, or with a flag that is not valid', t => {
  const d = tmp(t), f = join(d, 't.jsonl');
  writeFileSync(f, jsonl([{ file: 'a.test.mjs', ms: 31000 }, { suite: 40000 }]));
  const over = cli([f]);
  assert.equal(over.code, 1);
  assert.deepEqual(over.out.over, [{ file: 'a.test.mjs', sec: 31, max: 30 }]);
  assert.deepEqual(over.out.caps, CAPS);
  assert.equal(cli([f], { [FLAG.file]: '40' }).code, 0);
  assert.equal(cli([f], { [FLAG.file]: 'unlimited' }).code, 0);
  const bad = cli([f], { [FLAG.suite]: 'fast' });
  assert.equal(bad.code, 2);
  assert.match(bad.out.error, /CHECKS_TEST_SUITE_SECONDS_MAX=fast is not valid/);
});

test('should exit 0 with a warning on stderr when a file is over the warn level, and 1 when another is over the cap', t => {
  const d = tmp(t), warnOnly = join(d, 'w.jsonl'), both = join(d, 'b.jsonl');
  writeFileSync(warnOnly, jsonl([{ file: 'a.test.mjs', ms: 25000 }, { file: 'b.test.mjs', ms: 1000 }, { suite: 40000 }]));
  const w = cli([warnOnly]);
  assert.equal(w.code, 0, w.stderr);
  assert.equal(w.out.ok, true);
  assert.deepEqual(w.out.warn, [{ file: 'a.test.mjs', sec: 25, max: 20 }]);
  assert.deepEqual(w.out.caps, CAPS);
  assert.equal(w.stderr, '::warning file=a.test.mjs::a.test.mjs took 25 s, over the warn level of 20 s (cap 30 s)\n');
  const off = cli([warnOnly], { [FLAG.fileWarn]: 'unlimited' });
  assert.deepEqual([off.code, off.out.warn, off.stderr], [0, [], '']);
  writeFileSync(both, jsonl([{ file: 'a.test.mjs', ms: 25000 }, { file: 'slow.test.mjs', ms: 31000 }, { suite: 40000 }]));
  const b = cli([both]);
  assert.equal(b.code, 1);
  assert.deepEqual(b.out.over, [{ file: 'slow.test.mjs', sec: 31, max: 30 }]);
  assert.equal(b.out.warn.length, 2);
  for (const v of ['0', '-1', '1.5', 'abc', ' 20x']) {
    const bad = cli([warnOnly], { [FLAG.fileWarn]: v });
    assert.equal(bad.code, 2, v);
    assert.ok(bad.out.error.includes(`${FLAG.fileWarn}=${v} is not valid: use a whole number of seconds above 0, or unlimited`), bad.out.error);
  }
});

test('should exit 2 when the timings file is missing, empty or the arguments are wrong', t => {
  const d = tmp(t), empty = join(d, 'empty.jsonl');
  writeFileSync(empty, '');
  assert.match(cli([empty]).out.error, /no test file timings/);
  assert.equal(cli([empty]).code, 2);
  assert.equal(cli([join(d, 'nope.jsonl')]).code, 2);
  assert.equal(cli([]).code, 2);
  assert.equal(cli(['--help']).code, 2);
  assert.equal(main(['a', 'b'], {}).code, 2);
});

test('should write one line per test file and one for the run when node --test runs it as a reporter', t => {
  const d = tmp(t);
  writeFileSync(join(d, 'a.test.mjs'), "import { test } from 'node:test';\ntest('a', () => new Promise(r => setTimeout(r, 200)));\n");
  writeFileSync(join(d, 'b.test.mjs'), "import { test } from 'node:test';\nawait new Promise(r => setTimeout(r, 300));\ntest('b', () => {});\n");
  const r = spawnSync(process.execPath, ['--test', '--test-reporter', CHECK, '--test-reporter-destination', 'out.jsonl', 'a.test.mjs', 'b.test.mjs'], { cwd: d, encoding: 'utf8', env: withoutTestContext() });
  assert.equal(r.status, 0, r.stderr);
  const { files, suiteMs } = parseTimings(readFileSync(join(d, 'out.jsonl'), 'utf8'));
  assert.deepEqual(files.map(f => f.file).sort(), ['a.test.mjs', 'b.test.mjs']);
  assert.ok(files.find(f => f.file === 'a.test.mjs').ms >= 150, JSON.stringify(files));
  assert.ok(files.find(f => f.file === 'b.test.mjs').ms >= 250, 'a file time includes its top-level await: ' + JSON.stringify(files));
  assert.ok(suiteMs >= 250, String(suiteMs));
});

test('should warn about the suite over 100 s by default, and read a number or unlimited when the suite warn level is set (SuiteWarn)', () => {
  assert.equal(FLAG.suiteWarn, 'CHECKS_TEST_SUITE_WARN_SECONDS_MAX');
  assert.equal(readCaps({ [FLAG.suiteWarn]: ' 90 ' }).suiteWarn, 90);
  assert.equal(readCaps({ [FLAG.suiteWarn]: 'Unlimited' }).suiteWarn, null);
  const t = parseTimings(jsonl([{ file: 'a.test.mjs', ms: 1000 }, { suite: 104500 }]));
  const r = checkTimings(t, CAPS);
  assert.equal(r.ok, true, 'a warning never fails the check');
  assert.deepEqual(r.suiteWarn, { sec: 104.5, max: 100 });
  assert.deepEqual(warnLines(r.warn, CAPS, r.suiteWarn), ['::warning::the test suite took 104.5 s, over the warn level of 100 s (cap 120 s)']);
  assert.deepEqual(warnLines([], { ...CAPS, suite: null }, r.suiteWarn), ['::warning::the test suite took 104.5 s, over the warn level of 100 s (no cap)']);
});

test('should throw a FlagError naming the fix when the suite warn level is not a whole number above 0 or unlimited (SuiteWarn)', () => {
  for (const v of ['0', '-1', '1.5', 'abc', ' 100s', 'true']) {
    assert.throws(() => readCaps({ [FLAG.suiteWarn]: v }), e => e instanceof FlagError && e.message === `${FLAG.suiteWarn}=${v} is not valid: use a whole number of seconds above 0, or unlimited`, v);
  }
});

test('should not warn when the suite is exactly at the warn level, has no run line, or the level is unlimited (SuiteWarn)', () => {
  assert.equal(checkTimings(parseTimings(jsonl([{ file: 'a', ms: 1 }, { suite: 100000 }])), CAPS).suiteWarn, null, 'at the level is not over it');
  assert.deepEqual(checkTimings(parseTimings(jsonl([{ file: 'a', ms: 1 }, { suite: 100001 }])), CAPS).suiteWarn, { sec: 100, max: 100 }, 'one ms over is over');
  assert.equal(checkTimings(parseTimings(jsonl([{ file: 'a', ms: 1 }])), CAPS).suiteWarn, null);
  assert.equal(checkTimings(parseTimings(jsonl([{ file: 'a', ms: 1 }, { suite: 999999 }])), { ...CAPS, suiteWarn: null }).suiteWarn, null);
  assert.equal(checkTimings(parseTimings(jsonl([{ file: 'a', ms: 1 }, { suite: 999999 }])), { file: 30, suite: 120 }).suiteWarn, null, 'caps without the key: no warning');
});

test('should exit with the same code and print the suite warning on stderr when the CLI reads a suite over the warn level (SuiteWarn)', t => {
  const d = tmp(t), slow = join(d, 's.jsonl'), over = join(d, 'o.jsonl');
  writeFileSync(slow, jsonl([{ file: 'a.test.mjs', ms: 1000 }, { suite: 110000 }]));
  const w = cli([slow]);
  assert.deepEqual([w.code, w.out.ok, w.out.suiteWarn, w.out.caps], [0, true, { sec: 110, max: 100 }, CAPS]);
  assert.equal(w.stderr, '::warning::the test suite took 110 s, over the warn level of 100 s (cap 120 s)\n');
  const off = cli([slow], { [FLAG.suiteWarn]: 'unlimited' });
  assert.deepEqual([off.code, off.out.suiteWarn, off.stderr], [0, null, '']);
  assert.deepEqual([cli([slow], { [FLAG.suiteWarn]: '110' }).stderr], [''], 'exactly at the level');
  writeFileSync(over, jsonl([{ file: 'a.test.mjs', ms: 1000 }, { suite: 121000 }]));
  const b = cli([over]);
  assert.equal(b.code, 1, 'over the cap still fails');
  assert.match(b.stderr, /^::warning::the test suite took 121 s, over the warn level of 100 s \(cap 120 s\)\n$/);
  const bad = cli([slow], { [FLAG.suiteWarn]: 'soon' });
  assert.equal(bad.code, 2);
  assert.equal(bad.out.error, `${FLAG.suiteWarn}=soon is not valid: use a whole number of seconds above 0, or unlimited`);
});
