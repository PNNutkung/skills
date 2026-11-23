// Fuzz: random text never makes a parser throw, and random evidence never opens a gate that has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adrItems, checkBoard, checkVerify, parseAnswers, parseVerify } from './check.mjs';
import { NEVER_SKIP, STEPS, advance, gate, skip } from './steps.mjs';

let seed = 0x9e3779b9;
const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32; };
const pick = a => a[Math.floor(rand() * a.length)];
const PIECES = ['## ', 'A1: ', 'time: ', 'result: pass', 'result: accepted A2', 'env: e', 'run: r', '```', '\n', ' ', '- [ ] X1 (h): t', '## Definition of done', '|', 'Q3', '\u0000', 'é', '{', '}'];
const text = () => Array.from({ length: Math.floor(rand() * 40) }, () => pick(PIECES)).join('');
const RUNS = 500;

test('should never throw and always return a result when parsers get random text', () => {
  for (let i = 0; i < RUNS; i++) {
    const t = text();
    assert.equal(typeof parseAnswers(t), 'object');
    assert.ok(Array.isArray(adrItems(t)));
    assert.equal(typeof parseVerify(t), 'object');
    const v = checkVerify(t, adrItems(t), parseAnswers(t));
    assert.equal(v.ok, v.errors.length === 0);
    let json;
    try { json = JSON.parse(t); } catch { json = t; }
    assert.equal(typeof checkBoard(json).ok, 'boolean');
  }
});

test('should open a gate only when its own evidence is there when the evidence is random (Gate)', () => {
  const bit = () => rand() < 0.5;
  for (let i = 0; i < RUNS; i++) {
    const ev = {
      facts: bit(), measure: bit(), dod: { ok: bit(), errors: [] }, board: { ok: bit(), errors: [], choice: bit() ? 'A' : null },
      adr: bit(), pr: bit() ? 'u' : null, verify: { ok: bit(), errors: [] }, retro: bit(),
    };
    const step = pick(STEPS.slice(0, -1));
    const measure = bit();
    const r = advance({ step, measure, skipped: {} }, ev);
    const want = { intake: ev.facts && (!measure || ev.measure), dod: ev.dod.ok, board: ev.board.ok && Boolean(ev.board.choice), lock: ev.adr, tdd: Boolean(ev.pr), verify: ev.verify.ok, retro: ev.retro }[step];
    assert.equal(r.ok, want, `${step} ${JSON.stringify(ev)}`);
    assert.equal(gate(step, ev, measure).length === 0, want);
    if (r.ok) assert.equal(STEPS.indexOf(r.state.step), STEPS.indexOf(step) + 1, 'one step at a time');
  }
});

test('should never skip DoD, verify or retro whatever the answer says (ShortPath)', () => {
  for (let i = 0; i < RUNS; i++) {
    const step = pick(NEVER_SKIP);
    assert.equal(skip({ step, skipped: {} }, { A1: text() || 'x y' }, 'A1').ok, false);
  }
});
