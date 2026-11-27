import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, HEADINGS, sectionsOf, checkBody, renderSections } from './why.mjs';

const GOOD = `## Why

Suite takes 122 s, over the 120 s cap.

## Expected outcome

| Metric | Today | Target |
|---|---|---|
| suite median | 122 s | <= 90 s |

## If we do nothing

CI goes red at random.

## How we know

5 CI runs, median in docs/verify.

## Original notes

old text
`;

test('should list the 4 sections in order when the module loads (Skill)', () => {
  assert.deepEqual(SECTIONS, ['why', 'outcome', 'cost', 'how']);
  assert.equal(HEADINGS.en.why, 'Why');
  assert.equal(HEADINGS.en.cost, 'If we do nothing');
  assert.match(HEADINGS.th.why, /ทำไม/);
});

test('should pass when a body has the 4 sections in order with an outcome table', () => {
  assert.deepEqual(checkBody(GOOD), []);
});

test('should pass when the headings are in Thai', () => {
  const th = GOOD.replace('## Why', '## ทำไม (Why)').replace('## Expected outcome', '## ผลที่คาดหวัง (Expected outcome)')
    .replace('## If we do nothing', '## ถ้าไม่ทำจะเสียอะไร').replace('## How we know', '## รู้ได้อย่างไรว่าสำเร็จ (How we know)')
    .replace('| Metric | Today | Target |', '| ตัววัด | วันนี้ | เป้า |');
  assert.deepEqual(checkBody(th), []);
});

test('should pass when a preamble such as PR attribution lines comes before the first section', () => {
  assert.deepEqual(checkBody(`<!-- attribution -->\n_Requested by Nut_\n\n${GOOD}`), []);
});

test('should name each missing section when the body has none of them', () => {
  const errors = checkBody('## Summary\n\nsome change\n');
  for (const h of ['Why', 'Expected outcome', 'If we do nothing', 'How we know']) assert.ok(errors.some(e => e.includes(`"${h}"`)), h);
});

test('should report an empty section when a heading has no text under it', () => {
  const errors = checkBody(GOOD.replace('CI goes red at random.', '<!-- fill -->'));
  assert.ok(errors.some(e => /If we do nothing.*empty/.test(e)), errors.join('\n'));
});

test('should report the order when the sections are not first or not in order', () => {
  const swapped = GOOD.replace('## Why', '## TMP').replace('## How we know', '## Why').replace('## TMP', '## How we know');
  assert.ok(checkBody(swapped).some(e => /order/.test(e)));
  assert.ok(checkBody(`## Summary\n\nx\n\n${GOOD}`).some(e => /order|first/.test(e)));
});

test('should fail the outcome when it has no table and no not-measurable line', () => {
  const vague = GOOD.replace(/\| Metric[\s\S]*?<= 90 s \|/, 'It will be faster.');
  assert.ok(checkBody(vague).some(e => /Expected outcome.*metric/.test(e)));
});

test('should fail the outcome when a table row leaves today or target empty', () => {
  assert.ok(checkBody(GOOD.replace('| suite median | 122 s | <= 90 s |', '| suite median |  | <= 90 s |')).some(e => /today/i.test(e)));
});

test('should pass the outcome when it says not measurable with a reason in either language', () => {
  const nm = GOOD.replace(/\| Metric[\s\S]*?<= 90 s \|/, 'not measurable: wording of the docs only');
  assert.deepEqual(checkBody(nm), []);
  assert.deepEqual(checkBody(GOOD.replace(/\| Metric[\s\S]*?<= 90 s \|/, 'วัดไม่ได้: เป็นงานเอกสาร')), []);
  assert.ok(checkBody(GOOD.replace(/\| Metric[\s\S]*?<= 90 s \|/, 'not measurable:')).some(e => /reason/.test(e)));
});

test('should ignore headings inside a fenced code block when it reads sections', () => {
  const fenced = `\`\`\`\n## Why\n\`\`\`\n${GOOD}`;
  assert.deepEqual(checkBody(fenced), []);
  assert.equal(sectionsOf(fenced).filter(s => s.key === 'why').length, 1);
});

test('should not crash and return errors when the body is not a string', () => {
  for (const bad of [undefined, null, 42, {}]) assert.ok(checkBody(bad).length > 0);
});

test('should render 4 sections that pass the check when it gets the fields', () => {
  const md = renderSections({
    why: 'Suite 122 s over the cap.',
    outcomes: [{ id: 'O1', metric: 'suite median', baseline: '122 s', target: '<= 90 s', provenBy: ['CiMedian'] },
      { id: 'O2', metric: 'docs read well', notMeasurable: 'wording only', provenBy: ['Docs'] }],
    cost: 'Random red CI.',
    how: ['CiMedian: 5 CI runs, docs/verify/x.md'],
  }, { lang: 'en' });
  assert.deepEqual(checkBody(md), []);
  assert.match(md, /\| suite median \| 122 s \| <= 90 s \| CiMedian \|/);
  assert.match(md, /not measurable: wording only/);
});

test('should add a result column when results are given', () => {
  const md = renderSections({ why: 'w', outcomes: [{ id: 'O1', metric: 'm', baseline: '1', target: '2', provenBy: ['A'] }], cost: 'c', how: ['h'] },
    { lang: 'th', results: { O1: 'met' } });
  assert.match(md, /ผลจริง/);
  assert.match(md, /\| met \|/);
  assert.deepEqual(checkBody(md), []);
});

test('should escape a pipe inside a cell when it renders the table', () => {
  const md = renderSections({ why: 'w', outcomes: [{ id: 'O1', metric: 'a|b', baseline: '1', target: '2', provenBy: ['A'] }], cost: 'c', how: ['h'] });
  assert.match(md, /a\\\|b/);
  assert.deepEqual(checkBody(md), []);
});
