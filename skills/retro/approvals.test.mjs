import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliedCheck, checkProposals, parseApprovals } from './approvals.mjs';

const answers = 'A1: P1 ok, P2 ok, P3 ok, P4 no\ntime: t\n\nA2: P2: ไม่เอา\ntime: t\n\nA3: P5 อนุมัติ\ntime: t\n';

test('should read each proposal decision word for word with the last one winning when answers repeat an id (RAppr)', () => {
  assert.deepEqual(Object.fromEntries(parseApprovals(answers)), { P1: true, P2: false, P3: true, P4: false, P5: true });
  assert.equal(parseApprovals('A1: looks fine\n').size, 0);
});

test('should refuse a proposal for a finding that did not pass when proposals are checked (RProp)', () => {
  const findings = [{ id: 'F1', verify: 'passed' }, { id: 'F2', verify: 'not-passed' }, { id: 'F3', verify: 'no-evidence' }];
  const errors = checkProposals([{ id: 'P1', finding: 'F1', files: ['a'] }, { id: 'P2', finding: 'F2', files: ['b'] }, { id: 'P3', finding: 'F3', files: ['c'] }, { id: 'P4', finding: 'F9', files: ['d'] }, { id: 'bad', finding: 'F1', files: [] }], findings);
  assert.deepEqual(errors.map(e => e.split(':')[0]), ['P2', 'P3', 'P4', 'bad']);
});

test('should fail with the file when a change belongs to no approved proposal (RAppr)', () => {
  const proposals = [{ id: 'P1', finding: 'F1', files: ['.github/workflows/*.yml', '.ratchet.json'] }, { id: 'P4', finding: 'F4', files: ['CODING_STANDARDS.md'] }];
  const approvals = parseApprovals('A1: P1 ok, P4 no\n');
  assert.deepEqual(appliedCheck({ proposals, approvals, changed: ['.github/workflows/test.yml', '.ratchet.json'] }), { ok: true, unapproved: [] });
  assert.deepEqual(appliedCheck({ proposals, approvals, changed: ['CODING_STANDARDS.md', 'src/x.ts'] }).unapproved, [{ file: 'CODING_STANDARDS.md', proposal: 'P4' }, { file: 'src/x.ts', proposal: null }]);
  assert.equal(appliedCheck({ proposals, approvals, changed: ['docs/retro/log.md'] }).ok, true);
});

test('should never approve anything by accident when answer text is random (RAppr fuzz)', () => {
  const words = ['P1', 'ok', 'no', ' ', ':', 'P12', 'okay', 'not ok', 'ไม่', 'ใช่', '\n', 'XP1', 'P1ok'];
  let seed = 9;
  for (let i = 0; i < 400; i++) {
    const text = Array.from({ length: 8 }, () => words[(seed = (seed * 48271) % 2147483647) % words.length]).join('');
    for (const [id, yes] of parseApprovals(text)) {
      assert.match(id, /^P\d+$/);
      if (yes) assert.ok(new RegExp(`(?<![A-Za-z0-9])${id}\\s*[:=-]?\\s*(?:ok|yes|approved?|agree|อนุมัติ|ได้)`, 'i').test(text), text);
    }
  }
});
