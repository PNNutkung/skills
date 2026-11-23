// Unit and fuzz tests for the pure DoD checks. Run: node --test skills/definition-of-done/dodcheck.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, checkDod, checkTimeFloors, exportPtdd, exportQa, renderMarkdown, renderTicket, sentences, ticketCheck, timeTargets } from './dodcheck.mjs';

const ANSWERS = 'A1: A\ntime: 2026-11-21T13:20:04Z\nA2: B\ntime: 2026-11-21T13:20:04Z\nA3: REPORT_CSV_EXPORT, default off\ntime: t\nA4: ไม่เปลี่ยน API เดิม\ntime: t\nA5: ไม่ทำ xlsx\ntime: t\nA6: staging\ntime: t\nA7: unit, integration, e2e\ntime: t\nA8: accept AC9\ntime: t\n';
const TICKET = 'title: Export reports\nผู้ใช้อยาก export รายงานเป็น CSV\nเพื่อเอาไปเปิดใน Excel\n-- comment --\nต้องมีชื่อคอลัมน์ภาษาไทยด้วยนะ\n';
const SPEC = { 'docs/reports.md': 'line one\nReports list sales and stock.\nline three\n' };
const ctx = (over = {}) => ({ answers: ANSWERS, ticket: TICKET, show: p => SPEC[p] ?? null, ...over });
const user = (ref, quote, question = 'Q? ...') => ({ kind: 'user', ref, quote, question });
const req = (value, ref) => ({ value, source: user(ref, ANSWERS.split('\n').find(l => l.startsWith(`${ref}: `)).slice(ref.length + 2)) });

function goodDod() {
  return {
    slug: 'report-csv-export',
    ticket: { system: 'github', ref: 'acme/web#42' },
    items: [
      { id: 'AC1', text: 'Export button on sales and stock', source: user('A1', 'A', 'Q1 where is the button? (A) both (B) sales') },
      { id: 'AC2', text: 'CSV opens in Excel', source: { kind: 'ticket', ref: 'acme/web#42', quote: 'เพื่อเอาไปเปิดใน Excel' } },
      { id: 'AC3', text: 'reports cover sales and stock', kinds: ['happy'], kindsReason: 'read-only listing', source: { kind: 'spec', ref: 'docs/reports.md:2', quote: 'Reports list sales and stock.' } },
    ],
    required: {
      featureFlag: req('REPORT_CSV_EXPORT, default off', 'A3'),
      backwardCompat: req('no API change', 'A4'),
      nonGoals: req(['xlsx export'], 'A5'),
      verifyEnv: req('staging', 'A6'),
      testTiers: req(['unit', 'integration', 'e2e'], 'A7'),
    },
    unconfirmed: [],
  };
}

// ---------- checkDod ----------
test('should pass when every item and required section has a verbatim quote', () => {
  assert.deepEqual(checkDod(goodDod(), ctx()), []);
});

test('should list all five required sections when the required block is missing', () => {
  const d = goodDod(); delete d.required;
  const errs = checkDod(d, ctx());
  for (const k of REQUIRED) assert.ok(errs.some(e => e.startsWith(k)), `${k} in ${errs}`);
});

test('should refuse a required section when it has no source, even if its value is "not relevant"', () => {
  const d = goodDod(); d.required.verifyEnv = { value: 'not relevant' };
  assert.match(checkDod(d, ctx()).join('\n'), /verifyEnv: source/);
});

test('should refuse an item when its user quote is not in that answer', () => {
  const d = goodDod(); d.items[0].source.quote = 'B';
  assert.match(checkDod(d, ctx()).join('\n'), /AC1: quote not found in answer A1/);
});

test('should refuse an item when its ticket quote is not in ticket.md', () => {
  const d = goodDod(); d.items[1].source.quote = 'เปิดใน Excel ได้';
  assert.match(checkDod(d, ctx()).join('\n'), /AC2: quote not found in ticket/);
});

test('should refuse a spec quote when it is more than two lines from its ref', () => {
  const d = goodDod(); d.items[2].source.ref = 'docs/reports.md:9';
  assert.match(checkDod(d, ctx()).join('\n'), /AC3: quote not found within 2 lines/);
});

test('should refuse a user source when it carries no question, since a bare "A" means nothing alone', () => {
  const d = goodDod(); delete d.items[0].source.question;
  assert.match(checkDod(d, ctx()).join('\n'), /AC1: question/);
});

test('should refuse an assumed item when the user never accepted it in writing', () => {
  const d = goodDod(); d.items.push({ id: 'AC9', text: 'x', source: { kind: 'assumed' } });
  assert.match(checkDod(d, ctx()).join('\n'), /AC9: assumed/);
});

test('should refuse an assumed item when the accepting answer does not name the item', () => {
  const d = goodDod(); d.items.push({ id: 'AC10', text: 'x', source: { kind: 'assumed' }, accepted: 'A8' });
  assert.match(checkDod(d, ctx()).join('\n'), /AC10: answer A8 does not accept AC10/);
});

test('should pass an assumed item when the user accepted it by id in an answer', () => {
  const d = goodDod(); d.items.push({ id: 'AC9', text: 'x', source: { kind: 'assumed' }, accepted: 'A8' });
  assert.deepEqual(checkDod(d, ctx()), []);
});

test('should fail when a question is left unconfirmed, so a stopped grill cannot export', () => {
  const d = goodDod(); d.unconfirmed = [{ question: 'Q8 what about 10,000 rows?' }];
  assert.match(checkDod(d, ctx()).join('\n'), /unconfirmed: Q8/);
});

test('should refuse narrowed kinds when no reason is given', () => {
  const d = goodDod(); delete d.items[2].kindsReason;
  assert.match(checkDod(d, ctx()).join('\n'), /AC3: kinds narrowed/);
});

test('should refuse ids that paired-agent-tdd cannot put in a test name, and repeated ids', () => {
  const d = goodDod(); d.items[0].id = 'ac-1'; d.items[2].id = 'AC2';
  const errs = checkDod(d, ctx()).join('\n');
  assert.match(errs, /id "ac-1"/);
  assert.match(errs, /AC2 is repeated/);
});

test('should refuse a slug when it could escape docs/dod', () => {
  for (const slug of ['../x', 'a/b', '', 'A B']) assert.match(checkDod({ ...goodDod(), slug }, ctx()).join('\n'), /slug/, slug);
});

test('should refuse an empty items list when nothing is defined', () => {
  assert.match(checkDod({ ...goodDod(), items: [] }, ctx()).join('\n'), /at least one item/);
});

// ---------- export ----------
test('should export paired-agent-tdd dod[] when the DoD passes, with every source found in the source text', () => {
  const { dod, sourceText } = exportPtdd(goodDod(), ctx());
  assert.deepEqual(dod.map(d => d.id), ['AC1', 'AC2', 'AC3']);
  assert.deepEqual(dod[2].kinds, ['happy']);
  for (const d of dod) assert.ok(sourceText.replace(/\s+/g, ' ').includes(d.source.replace(/\s+/g, ' ')), d.id);
  assert.match(dod[0].source, /A1: A/);
});

test('should export "accepted" as the source of an accepted assumption, never "assumed"', () => {
  const d = goodDod(); d.items.push({ id: 'AC9', text: 'x', source: { kind: 'assumed' }, accepted: 'A8' });
  const { dod } = exportPtdd(d, ctx());
  assert.doesNotMatch(JSON.stringify(dod), /"assumed"/);
});

test('should refuse to export when the DoD does not pass check', () => {
  const d = goodDod(); d.unconfirmed = [{ question: 'Q8' }];
  assert.throws(() => exportPtdd(d, ctx()), /check failed/);
  assert.throws(() => exportQa(d, ctx()), /check failed/);
});

test('should export qa-sweep requirements when the DoD passes, keeping kind, ref and quote', () => {
  const { requirements, answers } = exportQa(goodDod(), ctx());
  assert.deepEqual(requirements[1], { id: 'AC2', text: 'CSV opens in Excel', source: { kind: 'ticket', ref: 'acme/web#42', quote: 'เพื่อเอาไปเปิดใน Excel' } });
  assert.equal(answers, ANSWERS);
});

// ---------- sentences and the ticket rewrite ----------
test('should split sentences on line breaks and sentence ends when text mixes Thai and English', () => {
  assert.deepEqual(sentences('Hello world. Second one!\nไทย บรรทัดนี้\n\n- bullet'), ['Hello world.', 'Second one!', 'ไทย บรรทัดนี้', 'bullet']);
});

test('should report a missing sentence when the rewrite dropped it', () => {
  const r = ticketCheck(TICKET, '## Goal\nผู้ใช้อยาก export รายงานเป็น CSV\n', goodDod());
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('เพื่อเอาไปเปิดใน Excel'));
});

test('should report missing DoD checklist lines when the rewrite left items out', () => {
  const r = ticketCheck('', '## Definition of Done\n- [ ] AC1 Export button on sales and stock\n', goodDod());
  assert.deepEqual(r.missingItems, ['AC2', 'AC3']);
});

test('should pass its own check when a ticket is rendered from scratch, in Thai and in English', () => {
  for (const lang of ['en', 'th']) {
    const text = renderTicket(goodDod(), TICKET, { lang });
    const r = ticketCheck(TICKET, text, goodDod());
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(text, /- \[ \] AC1 /);
    assert.match(text, /REPORT_CSV_EXPORT/);
  }
});

test('should keep a checklist box ticked when the item was already ticked in the original', () => {
  const text = renderTicket(goodDod(), '- [x] AC2 CSV opens in Excel\n', { lang: 'en' });
  assert.match(text, /- \[x\] AC2 /);
});

test('should render the DoD markdown with every item, source and required section when the DoD passes', () => {
  const md = renderMarkdown(goodDod());
  for (const s of ['AC1', 'AC2', 'AC3', 'acme/web#42', 'docs/reports.md:2', 'REPORT_CSV_EXPORT', 'staging', 'xlsx export']) assert.ok(md.includes(s), s);
});

// ---------- fuzz ----------
let seed = 11;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const ALPHABET = ['a', 'Z', ' ', '\n', '\t', '.', '!', '?', 'ไ', 'ท', 'ย', '-', '*', '[', ']', 'x', '\r', ' ', '😀', '"', '\\', '0'];
const junk = (n = 40) => Array.from({ length: rnd(n) }, () => ALPHABET[rnd(ALPHABET.length)]).join('');
const shapes = () => [undefined, null, 0, 'x', [], {}, junk(), [junk()], { kind: junk() }][rnd(9)];

test('should never throw and always return string errors when the DoD is random junk', () => {
  for (let i = 0; i < 500; i++) {
    const d = { slug: shapes(), items: [shapes(), { id: shapes(), text: shapes(), source: shapes(), kinds: shapes() }], required: shapes(), unconfirmed: shapes() };
    const errs = checkDod(d, ctx({ answers: rnd(2) ? junk() : null, ticket: rnd(2) ? junk() : undefined }));
    assert.ok(Array.isArray(errs) && errs.length > 0 && errs.every(e => typeof e === 'string'), JSON.stringify(d));
  }
});

test('should keep every original sentence when the rewrite is the original plus random extra text', () => {
  for (let i = 0; i < 300; i++) {
    const original = junk(80);
    const rewritten = `${junk()}\n${original}\n${junk()}`;
    const r = ticketCheck(original, rewritten, { items: [] });
    assert.deepEqual(r.missing, [], JSON.stringify({ original, rewritten }));
  }
});

test('should pass its own ticket check when a random original is rendered', () => {
  for (let i = 0; i < 200; i++) {
    const original = junk(120);
    const r = ticketCheck(original, renderTicket(goodDod(), original, { lang: rnd(2) ? 'th' : 'en' }), goodDod());
    assert.equal(r.ok, true, JSON.stringify({ original, r }));
  }
});

// time targets need their measured floor (rules/performance.md; retro of issue #19: a 60 s target was set before the ~84 s CPU floor was known)
const timed = (text, timeFloor) => ({ items: [{ id: 'T1', text, ...(timeFloor !== undefined && { timeFloor }) }] });

test('should read seconds and minutes in English and Thai when an item text sets a wall-time target', () => {
  assert.deepEqual(timeTargets('full suite <= 80 s and all tdd.test files <= 40 s'), [80, 40]);
  assert.deepEqual(timeTargets('ไม่เกิน 60 วิ; under 2 min; at most 1.5 seconds; ≤ 3 นาที'), [60, 120, 1.5, 180]);
});

test('should find no target when a number has no time unit or a longer unit word follows', () => {
  assert.deepEqual(timeTargets('within 2 lines, under 3 sessions, < 5 ms, 80 s without a bound, capped at 10,000 rows'), []);
});

test('should pass when the largest target is at or above cpuSeconds / cores', () => {
  assert.deepEqual(checkTimeFloors(timed('suite <= 80 s and tdd files <= 40 s', { cpuSeconds: 230, cores: 4 })), []);
  assert.deepEqual(checkTimeFloors(timed('<= 57.5 s', { cpuSeconds: 230, cores: 4 })), [], 'exactly at the floor');
});

test('should name the target, the floor and the measurement when the largest target is below cpuSeconds / cores', () => {
  assert.deepEqual(checkTimeFloors(timed('suite <= 60 s', { cpuSeconds: 335, cores: 4 })),
    ['T1: target 60 s is below its floor 83.8 s (335 CPU-seconds / 4 cores); only less work can meet it, not more parallelism']);
});

test('should refuse a time target with no floor or a malformed one, and accept none with a reason when it is a limit', () => {
  for (const f of [undefined, {}, { cpuSeconds: 0, cores: 4 }, { cpuSeconds: 100, cores: 0 }, { cpuSeconds: 100, cores: 1.5 }, { cpuSeconds: 'x', cores: 4 }, { none: '  ' }, 'fast'])
    assert.match(checkTimeFloors(timed('<= 80 s', f)).join('\n'), /^T1: sets a time target \(80 s\) without timeFloor/, JSON.stringify(f));
  assert.deepEqual(checkTimeFloors(timed('the probe times out within 30 s', { none: 'a timeout, not a speed target' })), []);
});

test('should check nothing and never throw when no item sets a time target or the DoD is malformed', () => {
  assert.deepEqual(checkTimeFloors(timed('the CSV opens in Excel')), []);
  for (const dod of [null, 'x', {}, { items: 'x' }, { items: [null, 7, { id: 'A' }] }]) assert.deepEqual(checkTimeFloors(dod), [], JSON.stringify(dod));
});

test('should leave checkDod as before when an item sets a time target without a floor (the floor is a separate check)', () => {
  const dod = timed('<= 80 s');
  assert.ok(!checkDod(dod, ctx()).some(e => /timeFloor/.test(e)));
});
