// Unit and fuzz tests for equivalent.mjs (ADR 0011 Interface, A16): the file mutation-equivalent.json = {"schema": 1, "marks": [{id, file, line, reason, judge}]}.
// API these tests fix (the Interface names only addMarks): parseMarks(text) -> marks (throws on anything else), readMarks(path) -> marks ([] when the file
// is missing), addMarks(path, marks, result) adds marks to the file or throws and leaves the file as it was, applyMarks(mutants, marks) -> new mutant list where
// a survivor whose id has a mark is `equivalent`. Each may be sync or async.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { attempt, pick, rng, tempDir } from './fixtures/repo.mjs';
import { addMarks, applyMarks, parseMarks, readMarks } from './equivalent.mjs';

const REASON = 'no input can tell the two regexes apart here';
const mutant = (id, result, line = 3) => ({ id, file: 'src/a.mjs', line, op: 'const-inc', before: 'x = 1', after: 'x = 2', result });
const RESULT = { available: 3, mutants: [mutant('X-aaaaaaaa', 'survived', 3), mutant('X-bbbbbbbb', 'killed', 4), mutant('X-cccccccc', 'survived', 5)] };
const mark = (id, line, more = {}) => ({ id, file: 'src/a.mjs', line, reason: REASON, judge: 'judge', ...more });
const fileOf = t => join(tempDir(t).dir, 'mutation-equivalent.json');
const doc = path => JSON.parse(readFileSync(path, 'utf8'));

test('should write a schema 1 file holding the mark when a survivor is marked with a long enough reason (EquivJudge happy)', async t => {
  const path = fileOf(t);
  await addMarks(path, [mark('X-aaaaaaaa', 3)], RESULT);
  assert.deepEqual(doc(path), { schema: 1, marks: [mark('X-aaaaaaaa', 3)] });
  assert.deepEqual(await readMarks(path), [mark('X-aaaaaaaa', 3)]);
});

test('should refuse and leave the file unchanged when a marked id is not a survivor of the result (EquivJudge fail)', async t => {
  const path = fileOf(t);
  await addMarks(path, [mark('X-aaaaaaaa', 3)], RESULT);
  const before = readFileSync(path, 'utf8');
  for (const id of ['X-bbbbbbbb', 'X-deadbeef']) { // killed, and not in the result at all
    const r = await attempt(() => addMarks(path, [mark('X-cccccccc', 5), mark(id, 4)], RESULT));
    assert.equal(r.ok, false, `${id} must be refused`);
    assert.match(r.error.message, new RegExp(id));
    assert.equal(readFileSync(path, 'utf8'), before, 'a refused call writes nothing, not even its valid marks');
  }
});

test('should refuse a reason of 19 characters and accept one of 20 when the reason is checked (EquivJudge edge)', async t => {
  const path = fileOf(t);
  const short = await attempt(() => addMarks(path, [mark('X-aaaaaaaa', 3, { reason: 'x'.repeat(19) })], RESULT));
  assert.equal(short.ok, false);
  assert.match(short.error.message, /20/);
  assert.equal(existsSync(path), false, 'nothing written on refusal');
  await addMarks(path, [mark('X-aaaaaaaa', 3, { reason: 'y'.repeat(20) })], RESULT);
  assert.equal(doc(path).marks[0].reason, 'y'.repeat(20));
});

test('should keep earlier marks when a second call adds more (EquivJudge)', async t => {
  const path = fileOf(t);
  await addMarks(path, [mark('X-aaaaaaaa', 3)], RESULT);
  await addMarks(path, [mark('X-cccccccc', 5)], RESULT);
  assert.deepEqual(doc(path).marks.map(m => m.id).sort(), ['X-aaaaaaaa', 'X-cccccccc']);
});

test('should give no marks when the file does not exist (EquivJudge)', async t => {
  assert.deepEqual(await readMarks(fileOf(t)), []);
});

test('should throw when the file is not a schema 1 marks document (EquivJudge)', async t => {
  const path = fileOf(t);
  for (const text of ['not json', '[]', '{"schema":2,"marks":[]}', '{"schema":1}', '{"schema":1,"marks":[{"id":"X-1"}]}']) {
    writeFileSync(path, text);
    assert.equal((await attempt(() => readMarks(path))).ok, false, text);
  }
});

test('should mark a survivor equivalent only while its id matches when marks are applied (EquivJudge)', () => {
  const marks = [mark('X-aaaaaaaa', 3), mark('X-bbbbbbbb', 4), mark('X-0ld0ld00', 5)]; // X-0ld0ld00: a mark from before the line changed (its id no longer exists)
  const out = applyMarks(RESULT.mutants, marks);
  assert.deepEqual(out.map(m => m.result), ['equivalent', 'killed', 'survived'], 'a killed mutant stays killed; a stale mark marks nothing');
  assert.equal(RESULT.mutants[0].result, 'survived', 'the input list is not changed');
});

// A random JSON value, biased toward near-valid mark documents so both branches are exercised.
function randomDoc(rand) {
  const scalar = () => pick(rand, [0, 1, -1, 2.5, '', 'X-12345678', 'src/a.mjs', REASON, 'judge', true, false, null]);
  const value = depth => (depth > 2 || rand() < 0.5 ? scalar() : rand() < 0.5 ? Array.from({ length: Math.floor(rand() * 3) }, () => value(depth + 1)) : {});
  const goodMark = () => ({ id: `X-${Math.floor(rand() * 1e8).toString(16).padStart(8, '0')}`, file: pick(rand, ['src/a.mjs', 'b.py']), line: 1 + Math.floor(rand() * 50), reason: REASON, judge: pick(rand, ['judge', 'j2']) });
  const markish = () => {
    const m = goodMark();
    if (rand() < 0.4) { const k = pick(rand, ['id', 'file', 'line', 'reason', 'judge']); if (rand() < 0.5) delete m[k]; else m[k] = value(2); }
    return m;
  };
  const d = { schema: rand() < 0.85 ? 1 : value(1), marks: rand() < 0.9 ? Array.from({ length: Math.floor(rand() * 4) }, markish) : value(1) };
  if (rand() < 0.1) delete d.schema;
  if (rand() < 0.1) delete d.marks;
  return rand() < 0.1 ? value(0) : d;
}
const validMark = m => typeof m === 'object' && m !== null && !Array.isArray(m) && typeof m.id === 'string' && m.id !== '' && typeof m.file === 'string' && m.file !== ''
  && Number.isInteger(m.line) && m.line >= 1 && typeof m.reason === 'string' && typeof m.judge === 'string';

test('should return exactly the marks of a valid document and throw on any other when it parses random JSON (EquivJudge fuzz)', async () => {
  const rand = rng(7);
  let valid = 0;
  for (let k = 0; k < 1500; k++) {
    const d = randomDoc(rand), text = JSON.stringify(d);
    const ok = typeof d === 'object' && d !== null && !Array.isArray(d) && d.schema === 1 && Array.isArray(d.marks) && d.marks.every(validMark);
    const r = await attempt(() => parseMarks(text));
    assert.equal(r.ok, ok, `case ${k}: ${text}`);
    if (ok) { valid++; assert.deepEqual(r.value, d.marks, `case ${k}`); } else assert.ok(r.error instanceof Error, `case ${k}: throws an Error`);
  }
  assert.ok(valid > 100 && valid < 1400, `both branches exercised (${valid} valid)`);
});

test('should return every mark in the file when marks are added (EquivJudge happy)', async t => {
  const path = fileOf(t);
  assert.deepEqual(await addMarks(path, [mark('X-aaaaaaaa', 3)], RESULT), [mark('X-aaaaaaaa', 3)]);
  assert.deepEqual(await addMarks(path, [mark('X-cccccccc', 5), mark('X-aaaaaaaa', 3)], RESULT), [mark('X-aaaaaaaa', 3), mark('X-cccccccc', 5)]);
});

test('should name the expected shape when the document or a mark is null (EquivJudge fail)', async t => {
  assert.throws(() => parseMarks('null'), /^Error: equivalent file: want \{"schema": 1, "marks": \[\.\.\.\]\}$/);
  assert.throws(() => parseMarks('{"schema":1,"marks":[null]}'), /^Error: equivalent file: mark 0 needs id, file, line/);
  const r = await attempt(() => addMarks(fileOf(t), [null], RESULT));
  assert.match(r.error.message, /^addMarks: a mark needs id, file, line, reason and judge: null$/);
});
