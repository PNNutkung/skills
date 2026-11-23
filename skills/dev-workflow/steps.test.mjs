// The step table and its gates (pure): advance, skip, infer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEVER_SKIP, STEPS, advance, gate, inferStep, skip } from './steps.mjs';
import { boardChoice } from './check.mjs';

const none = { facts: false, measure: false, dod: { ok: false, errors: ['no dod'] }, board: { ok: false, errors: ['no board'], choice: null }, adr: false, pr: null, verify: { ok: false, errors: ['no verify'], tickable: [] }, retro: false };
const all = { facts: true, measure: true, dod: { ok: true, errors: [] }, board: { ok: true, errors: [], choice: 'A' }, adr: true, pr: 'https://github.com/o/r/pull/1', verify: { ok: true, errors: [], tickable: [] }, retro: true };
const at = (step, over = {}) => ({ slug: 'demo', step, measure: false, skipped: {}, ...over });

test('should list the steps in the agreed order when the table is read (Order)', () => {
  assert.deepEqual(STEPS, ['intake', 'dod', 'board', 'lock', 'tdd', 'verify', 'retro', 'done']);
});

test('should move one step at a time when each gate has its evidence (Order, Gate)', () => {
  let s = at('intake');
  const seen = [];
  while (s.step !== 'done') { const r = advance(s, all); assert.equal(r.ok, true, r.errors.join('; ')); s = r.state; seen.push(s.step); }
  assert.deepEqual(seen, STEPS.slice(1));
});

test('should refuse to move on and name the missing evidence when a gate has none (Gate)', () => {
  const want = { intake: /facts\.md/, dod: /no dod/, board: /no board/, lock: /ADR/, tdd: /pull request/, verify: /no verify/, retro: /retro log/ };
  for (const [step, re] of Object.entries(want)) {
    const r = advance(at(step), none);
    assert.equal(r.ok, false, step);
    assert.ok(r.errors.some(e => re.test(e)), `${step}: ${r.errors}`);
  }
  assert.equal(advance(at('done'), all).ok, false);
});

test('should need measure.md too when the run was opened for speed or size work (Facts)', () => {
  assert.equal(advance(at('intake', { measure: true }), { ...all, measure: false }).ok, false);
  assert.equal(advance(at('intake', { measure: false }), { ...all, measure: false }).ok, true);
});

test('should need the user choice on the board when the board itself is valid (Board)', () => {
  const r = advance(at('board'), { ...all, board: { ok: true, errors: [], choice: null } });
  assert.ok(r.errors.some(e => /user's choice/.test(e)));
});

test('should skip the board only with a user answer that gives a reason (ShortPath, Gate)', () => {
  const answers = { A5: 'skip: one-line doc fix', A6: 'B' };
  const ok = skip(at('board'), answers, 'A5');
  assert.equal(ok.ok, true);
  assert.equal(ok.state.step, 'lock');
  assert.deepEqual(ok.state.skipped, { board: 'A5' });
  assert.ok(skip(at('board'), answers, 'A6').errors.some(e => /reason/.test(e)));
  assert.ok(skip(at('board'), answers, 'A9').errors.some(e => /A9 not in answers/.test(e)));
});

test('should never skip the DoD, verify or retro steps when asked to (ShortPath)', () => {
  assert.deepEqual(NEVER_SKIP, ['dod', 'verify', 'retro']);
  for (const step of NEVER_SKIP) assert.ok(skip(at(step), { A1: 'skip it, no time' }, 'A1').errors.some(e => /never skipped/.test(e)), step);
  assert.equal(skip(at('done'), { A1: 'skip it now' }, 'A1').ok, false);
});

test('should infer the step from repo evidence when the run folder is gone (Resume)', () => {
  assert.equal(inferStep(none), 'intake');
  assert.equal(inferStep({ ...none, adr: true }), 'tdd');
  assert.equal(inferStep({ ...none, adr: true, pr: 'x' }), 'verify');
  assert.equal(inferStep({ ...none, adr: true, pr: 'x', verify: { ok: true } }), 'retro');
  assert.equal(inferStep({ ...none, retro: true }), 'done');
});

test('should report the gate of each step without moving when gate is asked', () => {
  assert.deepEqual(gate('lock', all, false), []);
  assert.equal(gate('nope', all, false).length, 1);
});

test('should read the chosen variant id when the board answer starts with it (Board)', () => {
  const board = { question: 'Q24', variants: [{ id: 'A' }, { id: 'B' }] };
  assert.equal(boardChoice(board, { A24: 'B, with mermaid' }), 'B');
  assert.equal(boardChoice(board, { A24: 'C' }), null);
  assert.equal(boardChoice(board, {}), null);
  assert.equal(boardChoice({ question: 'x' }, { A24: 'A' }), null);
});
