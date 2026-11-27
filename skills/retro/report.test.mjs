import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_FILE, appendLog, renderReport } from './report.mjs';

const findings = [
  { id: 'F1', title: 'CI ไม่ได้รัน lint', category: 'automated-checks', verify: 'passed', reasons: [], evidence: [{ kind: 'metric', ref: 'guardrail.ci.lint', quote: 'false' }] },
  { id: 'F2', title: 'AD20 เกือบหลุด', category: 'test-gaps', verify: 'not-passed', reasons: ['quote not on line 902'], evidence: [] },
  { id: 'F3', title: 'suite ช้า', category: 'speed', verify: 'no-evidence', reasons: ['no evidence cited'] },
];
const proposals = [{ id: 'P1', finding: 'F1', text: 'เพิ่ม lint ใน CI', files: ['.github/workflows/test.yml'] }];

test('should write headings in the user\'s language and ids in English when the report is rendered (OLang)', () => {
  const th = renderReport({ work: 'PR #17', findings, proposals, lang: 'th' });
  assert.match(th, /^# Retro: PR #17/m);
  assert.match(th, /## ข้อเสนอ/);
  assert.match(th, /F1 · passed · automated-checks/);
  assert.match(th, /F2 · not-passed/);
  assert.match(th, /P1 \(F1\): เพิ่ม lint ใน CI/);
  const en = renderReport({ work: 'PR #17', findings, proposals, lang: 'en' });
  assert.match(en, /## Proposals/);
  assert.match(en, /1 passed · 1 not-passed · 1 no-evidence/);
});

test('should create the log with a header and append one line when a retro is logged (OLog)', () => {
  assert.equal(LOG_FILE, 'docs/retro/log.md');
  const row = { date: '2026-11-22', work: 'PR #17', sessions: 3, tokens: 1840000, findings: 6, passed: 4, approved: 3, ratchetRules: 2 };
  const first = appendLog(null, row);
  assert.match(first, /^# Retro log\n/);
  assert.match(first, /\| 2026-11-22 \| PR #17 \| 3 \| 1840000 \| 6 \| 4 \| 3 \| 2 \|\n$/);
  const second = appendLog(first, { ...row, date: '2026-11-23', work: 'PR | 18' });
  assert.equal(second.split('\n').filter(l => l.startsWith('| 2026')).length, 2);
  assert.match(second, /PR \\\| 18/);
  assert.ok(second.startsWith(first));
});

test('should count one finding as 1 and give reasons only for findings that did not pass when the report is rendered', () => {
  const out = renderReport({ work: 'w', findings: [{ id: 'F1', verify: 'passed', reasons: ['hidden reason'] }, { id: 'F2', verify: 'no-evidence', reasons: ['shown reason'] }], proposals: [] });
  assert.match(out, /1 passed · 0 not-passed · 1 no-evidence/);
  assert.ok(!out.includes('hidden reason'));
  assert.ok(out.includes('shown reason'));
});

test('should print none under the proposals heading only when there are no proposals', () => {
  assert.match(renderReport({ work: 'w', findings: [], proposals: [] }), /## Proposals\n\nnone\n/);
  assert.ok(!renderReport({ work: 'w', findings: [], proposals }).includes('none'));
});

test('should list only repeats of unenforced rules when some repeats are of enforced rules (Report)', () => {
  const hit = { rule: 'paths/a', date: '2026-11-22', branch: 'old', finding: 'F9' };
  const out = renderReport({ work: 'w', proposals: [{ id: 'P1', finding: 'F1', text: 't', files: ['x'], noLevel: 'a person must judge it' }], findings: [
    { id: 'F1', verify: 'passed', rule: 'paths/a', repeat: true, unenforced: true, earlierHits: [hit] },
    { id: 'F2', verify: 'passed', rule: 'paths/b', repeat: true, unenforced: false, earlierHits: [] },
    { id: 'F3', verify: 'passed', rule: 'paths/c', repeat: false, unenforced: true },
  ] });
  const section = out.slice(out.indexOf('## Repeats of unenforced rules'), out.indexOf('## Proposals'));
  assert.match(section, /- F1 paths\/a: earlier 2026-11-22 old; noLevel "a person must judge it"/);
  assert.ok(!section.includes('F2') && !section.includes('F3'), section);
});

test('should list the answer letters when a proposal offers options (RLetter)', () => {
  const out = renderReport({ work: 'w', findings: [], proposals: [{ id: 'P1', finding: 'F1', text: 't', files: ['a'], options: { A: 'apply', B: 'skip', C: 'apply' } }, { id: 'P2', finding: 'F1', text: 'u', files: ['b'] }] });
  assert.match(out, /- P1 \(F1\): t \[a\] options: A apply, B skip, C apply\n/);
  assert.match(out, /- P2 \(F1\): u \[b\] options: A apply, B skip\n/);
});
