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
