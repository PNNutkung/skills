// Unit tests for test-time.mjs, its CLI, and the reporter run by a real node --test. Run: node --test test-time.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SECONDS, FLAG, FlagError, checkTimings, main, parseTimings, readCaps } from './test-time.mjs';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'test-time.mjs');
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
// a node --test started from inside a test sees NODE_TEST_CONTEXT (even empty) and runs no files of its own
const withoutTestContext = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));
const tmp = t => { const d = mkdtempSync(join(tmpdir(), 'tt-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const cli = (args, env = {}) => {
  const r = spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', env: { ...process.env, [FLAG.file]: '', [FLAG.suite]: '', ...env } });
  return { code: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop()) };
};

test('should use 30 s per file and 120 s for the suite when no flag is set', () => {
  assert.deepEqual(readCaps({}), { file: 30, suite: 120 });
  assert.deepEqual(DEFAULT_SECONDS, { file: 30, suite: 120 });
});

test('should read a number, unlimited in any case, and an empty value as the default when the flags are set', () => {
  assert.deepEqual(readCaps({ [FLAG.file]: ' 45 ', [FLAG.suite]: 'Unlimited' }), { file: 45, suite: null });
  assert.deepEqual(readCaps({ [FLAG.file]: '', [FLAG.suite]: '  ' }), { file: 30, suite: 120 });
});

test('should throw a FlagError naming the fix when a flag value is not valid', () => {
  for (const v of ['0', '-5', '1.5', 'thirty', 'true']) {
    assert.throws(() => readCaps({ [FLAG.file]: v }), e => e instanceof FlagError && e.message.includes(`${FLAG.file}=${v} is not valid`), v);
    assert.throws(() => readCaps({ [FLAG.suite]: v }), FlagError, v);
  }
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
  assert.deepEqual(over.out.caps, { file: 30, suite: 120 });
  assert.equal(cli([f], { [FLAG.file]: '40' }).code, 0);
  assert.equal(cli([f], { [FLAG.file]: 'unlimited' }).code, 0);
  const bad = cli([f], { [FLAG.suite]: 'fast' });
  assert.equal(bad.code, 2);
  assert.match(bad.out.error, /CHECKS_TEST_SUITE_SECONDS_MAX=fast is not valid/);
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
