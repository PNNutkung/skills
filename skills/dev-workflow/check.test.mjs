// Pure checks: answers.md, board.json, verify.md against the ADR's DoD items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adrItems, checkBoard, checkVerify, parseAnswers, parseVerify } from './check.mjs';

const ANSWERS = 'A5: skip the board, one-line fix in a doc\ntime: 2026-11-23T10:00:00Z\n\nA24: A\ntime: 2026-11-23T16:21:58Z\n';

test('should map each answer id to its text when answers.md has several answers', () => {
  assert.deepEqual(parseAnswers(ANSWERS), { A5: 'skip the board, one-line fix in a doc', A24: 'A' });
});

test('should keep a multi-line answer and ignore stray lines when an answer spans lines', () => {
  assert.deepEqual(parseAnswers('noise\nA1: first line\nsecond line\ntime: x\nA2: B\n'), { A1: 'first line\nsecond line', A2: 'B' });
  assert.deepEqual(parseAnswers(''), {});
});

const board = (over = {}) => ({
  slug: 'demo', question: 'Q24', concept: 'one entry point for the steps',
  variants: [
    { id: 'A', title: 'pure core', pros: ['fast tests'], cons: ['some duplicate checks'] },
    { id: 'B', title: 'delegate', pros: ['no duplicates'], cons: ['needs siblings'] },
  ],
  recommended: 'A', ...over,
});

test('should accept a board when it has two variants with a pro, a con and a recommended one (Variants)', () => {
  assert.deepEqual(checkBoard(board()), { ok: true, errors: [] });
});

test('should accept more than three variants when the board lists them (Variants: no upper limit)', () => {
  const four = ['A', 'B', 'C', 'D'].map(id => ({ id, title: id, pros: ['p'], cons: ['c'] }));
  assert.equal(checkBoard(board({ variants: four })).ok, true);
});

test('should list every problem when a board breaks the rules (Variants)', () => {
  const r = checkBoard(board({ variants: [{ id: 'A', title: 'only', pros: [], cons: ['c'] }], recommended: 'Z', question: 'x' }));
  assert.equal(r.ok, false);
  for (const re of [/at least 2 variants/, /A has no pro/, /recommended Z is not a variant/, /question must be Q<n>/]) assert.ok(r.errors.some(e => re.test(e)), String(re));
});

test('should refuse duplicate ids and a missing concept when the board repeats a variant', () => {
  const v = { id: 'A', title: 't', pros: ['p'], cons: ['c'] };
  const r = checkBoard(board({ variants: [v, v], concept: ' ' }));
  assert.ok(r.errors.some(e => /duplicate variant A/.test(e)));
  assert.ok(r.errors.some(e => /concept/.test(e)));
});

test('should refuse a board when it is not an object', () => {
  for (const bad of [null, [], 'x', 3]) assert.equal(checkBoard(bad).ok, false);
});

const ADR = `# 4. Demo\n\n## Definition of done\n\n<!-- dod: written by dod.mjs adr -->\n\n- [ ] Skill (happy, fail, edge): a skill\n- [ ] Gate (happy): a gate (A7)\n\n## Other\n- [ ] NotAnItem (x): ignored\n`;

test('should read the item ids when the ADR has a Definition of done section', () => {
  assert.deepEqual(adrItems(ADR), ['Skill', 'Gate']);
  assert.deepEqual(adrItems('# no section'), []);
});

const VERIFY = `# Verify: demo

## Skill
env: cloud container
run: node --test skills/demo
result: pass
\`\`\`
# pass 12
\`\`\`

## Gate
env: cloud container
result: accepted A9
`;

test('should parse each section fields and evidence when verify.md lists items', () => {
  const v = parseVerify(VERIFY);
  assert.deepEqual(Object.keys(v), ['Skill', 'Gate']);
  assert.equal(v.Skill.result, 'pass');
  assert.equal(v.Skill.run, 'node --test skills/demo');
  assert.equal(v.Skill.output, '# pass 12');
  assert.equal(v.Gate.result, 'accepted A9');
});

test('should pass and tick only items with a passing real run when every item has evidence or an accepted answer (Verify, TicketTick)', () => {
  const r = checkVerify(VERIFY, ['Skill', 'Gate'], { A9: 'accept Gate, needs a real merge' });
  assert.deepEqual(r, { ok: true, errors: [], tickable: ['Skill'] });
});

test('should fail when an item is missing, failed, has no evidence or names an answer that does not exist (Verify)', () => {
  const md = '## Skill\nenv: cloud\nrun: x\nresult: pass\n\n## Gate\nresult: fail\n\n## Extra\nenv: e\nrun: y\nresult: accepted A99\n';
  const r = checkVerify(md, ['Skill', 'Gate', 'Order', 'Extra'], {});
  assert.equal(r.ok, false);
  for (const re of [/Skill: no evidence/, /Gate: result fail/, /Order: missing/, /Extra: answer A99 not in answers.md/]) assert.ok(r.errors.some(e => re.test(e)), String(re));
  assert.deepEqual(r.tickable, []);
});

test('should fail closed when the ADR yields no DoD items whatever verify.md says (Verify)', () => {
  const r = checkVerify('', [], {});
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no DoD items/);
  assert.deepEqual(adrItems('## Definition of done\n\n- [X] Works (happy): x\n'), ['Works'], 'an uppercase tick still counts');
});

test('should accept an image as evidence and require the env when a section shows a screenshot', () => {
  const ok = checkVerify('## Skill\nenv: staging\nrun: open /reports\nresult: pass\nimage: docs/verify/skill.png\n', ['Skill'], {});
  assert.deepEqual(ok.tickable, ['Skill']);
  const noEnv = checkVerify('## Skill\nrun: x\nresult: pass\nimage: a.png\n', ['Skill'], {});
  assert.ok(noEnv.errors.some(e => /Skill: no env/.test(e)));
});
