// Integration: what dod.mjs exports is accepted, unchanged, by the real gates of the two skills that consume it:
// paired-agent-tdd's validatePlan (gates.mjs) and qa-sweep's checkSource (findings.mjs). If either skill changes its input, this fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlan } from '../paired-agent-tdd/gates.mjs';
import { checkSource } from '../qa-sweep/findings.mjs';
import { exportPtdd, exportQa } from './dodcheck.mjs';

const ANSWERS = 'A1: both pages\ntime: 2026-11-21T13:20:04Z\nA2: B\ntime: t\nA3: REPORT_CSV_EXPORT default off\ntime: t\nA4: none\ntime: t\nA5: xlsx\ntime: t\nA6: staging\ntime: t\nA7: unit and e2e\ntime: t\nA8: yes, accept AC5 as assumed\ntime: t\n';
const TICKET = 'Export reports\nผู้ใช้อยาก export รายงานเป็น CSV\nเพื่อเอาไปเปิดใน Excel\n';

// a real git repo, so qa-sweep reads the spec quote through git show at HEAD exactly as it does in a run
const repo = realpathSync(mkdtempSync(join(tmpdir(), 'dod-int-')));
mkdirSync(join(repo, 'docs'));
writeFileSync(join(repo, 'docs', 'reports.md'), 'Reports\n\nA report export is capped at 10,000 rows.\n');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8' }).trim();
git('init', '-q'); git('add', '.'); git('commit', '-qm', 'spec');
const show = p => { try { return execFileSync('git', ['-C', repo, 'show', `HEAD:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const ctx = { answers: ANSWERS, ticket: TICKET, show };

const u = (ref, quote, question) => ({ kind: 'user', ref, quote, question });
const dod = {
  slug: 'report-csv-export',
  items: [
    { id: 'AC1', text: 'Export button on both report pages', source: u('A1', 'both pages', 'Q1 Which pages get the button?') },
    { id: 'AC2', text: 'CSV opens in Excel', source: { kind: 'ticket', ref: 'acme/web#42', quote: 'เพื่อเอาไปเปิดใน Excel' } },
    { id: 'AC3', text: 'Cap at 10,000 rows', kinds: ['happy', 'edge'], kindsReason: 'no failure path', source: { kind: 'spec', ref: 'docs/reports.md:3', quote: 'capped at 10,000 rows' } },
    { id: 'AC4', text: 'Warn when capped', source: u('A2', 'B', 'Q2 Over 10,000 rows? (A) stream all (B) cap and warn') },
    { id: 'AC5', text: 'UTF-8 with BOM', source: { kind: 'assumed' }, accepted: 'A8' },
  ],
  required: Object.fromEntries([['featureFlag', 'A3'], ['backwardCompat', 'A4'], ['nonGoals', 'A5'], ['verifyEnv', 'A6'], ['testTiers', 'A7']]
    .map(([k, ref]) => [k, { value: k, source: u(ref, ANSWERS.split('\n').find(l => l.startsWith(`${ref}: `)).slice(ref.length + 2), `Q ${k}?`) }])),
  unconfirmed: [],
};

test('should pass paired-agent-tdd validatePlan when its dod[] and ticket text come from the export', () => {
  const { dod: items, sourceText } = exportPtdd(dod, ctx);
  const plan = { repo, cmd: 'node --test {file}', dod: items, groups: [{ id: 'g1', tests: ['t/a.test.mjs'], src: ['src/a.mjs'], dod: items.map(i => i.id) }] };
  assert.deepEqual(validatePlan(plan, sourceText), []);
});

test('should fail paired-agent-tdd validatePlan when the export is checked against the bare ticket alone', () => {
  // proves the source text is needed: answers and spec quotes are not in ticket.md
  const { dod: items } = exportPtdd(dod, ctx);
  const plan = { repo, cmd: 'node --test {file}', dod: items, groups: [{ id: 'g1', tests: ['t/a.test.mjs'], src: ['src/a.mjs'], dod: items.map(i => i.id) }] };
  assert.ok(validatePlan(plan, TICKET).some(e => /source quote not found/.test(e)));
});

test('should pass qa-sweep checkSource for every requirement when the export feeds its run files', () => {
  const { requirements, answers } = exportQa(dod, ctx);
  const qaCtx = { answers, ticket: TICKET, show, head: 'HEAD' };
  for (const r of requirements) assert.deepEqual(checkSource(r, qaCtx), { ok: true }, r.id);
  assert.deepEqual(requirements.map(r => r.source.kind), ['user', 'ticket', 'spec', 'user', 'user']);
});

test('should fail qa-sweep checkSource when the spec changes after the DoD was written', () => {
  writeFileSync(join(repo, 'docs', 'reports.md'), 'Reports\n\nNo cap.\n');
  git('commit', '-qam', 'spec changed');
  const { requirements } = exportQa({ ...dod, items: dod.items.filter(i => i.source.kind !== 'spec') }, ctx);
  const spec = { id: 'AC3', text: 'cap', source: { kind: 'spec', ref: 'docs/reports.md:3', quote: 'capped at 10,000 rows' } };
  assert.equal(checkSource(spec, { answers: ANSWERS, ticket: TICKET, show, head: 'HEAD' }).ok, false);
  assert.equal(requirements.length, 4);
});
