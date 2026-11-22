// Unit and fuzz tests for gatecache.mjs: the key changes with every input that changes a gate's result, and a missing, garbled or mismatched entry is never reused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CACHE_VERSION, cacheName, decodeEntry, encodeEntry, gateKey, readEntry, writeEntry } from './gatecache.mjs';

const KEYIN = { snapshot: 't'.repeat(40), files: [['src/a.mjs', Buffer.from('export const a = 1;\n')], ['tests/a.test.mjs', Buffer.from('test\n')]], args: ['green', 'node --test {file}', '{"max":12}'] };
const KEY = gateKey(KEYIN);
const RESULT = { probe: { tests: [{ file: 'tests/a.test.mjs', verdict: 'exercises-change', head: { exit: 0 } }] }, mutants: { score: { killed: 3 } }, cover: null };
let seed = 11;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const junk = () => Array.from({ length: rnd(80) }, () => String.fromCharCode(rnd(128))).join('');

test('should give the same 64-hex key for the same snapshot, files and args, whatever order the files come in', () => {
  assert.match(KEY, /^[0-9a-f]{64}$/);
  assert.equal(gateKey({ ...KEYIN, files: [...KEYIN.files].reverse() }), KEY);
  assert.equal(gateKey({ ...KEYIN, files: KEYIN.files.map(([p, b]) => [p, b.toString('utf8')]) }), KEY, 'a string and its utf8 bytes are the same content');
});

test('should change the key when the snapshot, any file byte or path, a missing file, or any gate argument changes', () => {
  const other = [
    { ...KEYIN, snapshot: 'u'.repeat(40) },
    { ...KEYIN, files: [['src/a.mjs', Buffer.from('export const a = 2;\n')], KEYIN.files[1]] },
    { ...KEYIN, files: [['src/b.mjs', KEYIN.files[0][1]], KEYIN.files[1]] },
    { ...KEYIN, files: [['src/a.mjs', null], KEYIN.files[1]] },
    { ...KEYIN, files: [['src/a.mjs', Buffer.alloc(0)], KEYIN.files[1]] },
    { ...KEYIN, files: [KEYIN.files[0]] },
    { ...KEYIN, args: ['green', 'node --test {file}', '{"max":11}'] },
    { ...KEYIN, args: ['green', 'node --test {file}'] },
    { ...KEYIN, args: [...KEYIN.args, '--quick'] },
    { ...KEYIN, args: ['green', 'node --test {file}{"max":12}', ''] },
  ].map(gateKey);
  assert.equal(new Set([KEY, ...other]).size, other.length + 1, 'every change gives a new key');
  assert.notEqual(gateKey({ ...KEYIN, files: [['a', Buffer.from('bc')]] }), gateKey({ ...KEYIN, files: [['ab', Buffer.from('c')]] }), 'fields are length-prefixed: no two inputs run together');
});

test('should refuse to build a key without a snapshot or with files or args that are not lists', () => {
  for (const bad of [{ ...KEYIN, snapshot: '' }, { ...KEYIN, snapshot: undefined }, { ...KEYIN, files: 'x' }, { ...KEYIN, args: 'green' }, { ...KEYIN, files: [['', Buffer.from('x')]] }]) assert.throws(() => gateKey(bad), TypeError);
});

test('should give the stored result back for the key it was stored under, and null for any other key', () => {
  const text = encodeEntry(KEY, RESULT);
  assert.deepEqual(decodeEntry(text, KEY), RESULT);
  assert.equal(decodeEntry(text, gateKey({ ...KEYIN, snapshot: 'v'.repeat(40) })), null);
  assert.equal(JSON.parse(text).version, CACHE_VERSION);
});

test('fuzz: a missing, garbled, truncated, mistyped or mismatched entry is no reuse and never throws', () => {
  const good = encodeEntry(KEY, RESULT), shapes = [undefined, null, '', '{', '[]', 'null', '42', '"x"', JSON.stringify({ key: KEY }), JSON.stringify({ version: CACHE_VERSION, key: KEY }), JSON.stringify({ version: CACHE_VERSION, key: KEY, result: null }),
    JSON.stringify({ version: CACHE_VERSION, key: KEY, result: [RESULT] }), JSON.stringify({ version: CACHE_VERSION, key: KEY, result: 'r' }), JSON.stringify({ version: CACHE_VERSION + 1, key: KEY, result: RESULT }), JSON.stringify({ version: CACHE_VERSION, key: [KEY], result: RESULT }), JSON.stringify([CACHE_VERSION, KEY, RESULT])];
  for (const s of shapes) assert.equal(decodeEntry(s, KEY), null, String(s));
  for (const k of [undefined, null, '', 42, KEY.slice(1), `${KEY} `]) assert.equal(decodeEntry(good, k), null, `key ${k}`);
  for (let i = 0; i < 2000; i++) {
    const kind = rnd(3), text = kind === 0 ? junk() : kind === 1 ? good.slice(0, rnd(good.length)) : (() => { const at = rnd(good.length); return good.slice(0, at) + String.fromCharCode(rnd(128)) + good.slice(at + 1); })();
    let r;
    assert.doesNotThrow(() => { r = decodeEntry(text, KEY); }, text);
    if (r !== null) assert.equal(JSON.parse(text).key, KEY, 'only an edit that leaves the key untouched can still be read');
  }
});

test('should read and write entries next to the gate files, and read a missing or unreadable file as no entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gatecache-'));
  try {
    const f = join(dir, cacheName('a.green'));
    assert.equal(f.endsWith('a.green.cache.json'), true);
    assert.equal(readEntry(f, KEY), null, 'missing');
    writeEntry(f, KEY, RESULT);
    assert.deepEqual(readEntry(f, KEY), RESULT);
    assert.equal(readEntry(f, KEY.replace(/^./, c => (c === '0' ? '1' : '0'))), null, 'mismatched');
    writeFileSync(f, readFileSync(f, 'utf8').slice(0, 20));
    assert.equal(readEntry(f, KEY), null, 'garbled');
    assert.equal(readEntry(dir, KEY), null, 'a directory is no entry');
    const seen = [];
    writeEntry(f, KEY, RESULT, (file, text) => seen.push([file, text]));
    assert.deepEqual(seen, [[f, encodeEntry(KEY, RESULT)]], 'the writer is the caller\'s (tdd.mjs passes its run-folder-safe one)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
