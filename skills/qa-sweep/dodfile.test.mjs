// Tests for dodfile.mjs and findings.mjs with "dodFile": requirements come from an ADR of the definition-of-done skill.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { renderAdr } from '../definition-of-done/adr.mjs';
import { requirementsFromDod } from './dodfile.mjs';
import { checkSource, loadContext, renderReport, verifyAll } from './findings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZT = process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review');
const { createRunDir } = await import(pathToFileURL(join(ZT, 'runctx.mjs')).href);
const mk = p => mkdtempSync(join(tmpdir(), p));
const QUESTIONS = 'Q1: Which pages?\n(A) both\n  + consistent\n  - two pages to test\n(B) sales\n  + smaller\n  - stock users ask again\nrecommended: A\n';
const u = { kind: 'user', ref: 'A1', quote: 'A', question: 'Q1' };
const adr = (n, slug = 'refunds', touches = ['src/**']) => renderAdr({
  dod: {
    slug, touches,
    items: [{ id: 'AC1', text: 'refund button on both pages', source: u }, { id: 'AC2', text: 'refunds over 30 days are refused', source: { kind: 'spec', ref: 'docs/spec.md:3', quote: 'Refunds over 30 days are refused.' } }],
    required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: u }])),
  }, answers: 'A1: A\ntime: t\n', questions: QUESTIONS, ticket: '', number: n, date: '2026-11-22',
}).text;
const FILE = 'docs/adr/0001-refunds.md';

function fixture(extra = {}) {
  const repo = mk('qa-dod-repo-');
  const files = { 'docs/spec.md': '# Spec\nRefunds\nRefunds over 30 days are refused.\nEnd\n', 'src/a.py': 'def refund(days):\n    return days <= 30\n', [FILE]: adr(1), ...extra };
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), t); }
  for (const c of [['init', '-q'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'x']]) execFileSync('git', ['-C', repo, ...c]);
  const tmp = mk('qa-dod-tmp-');
  return { repo, tmp, run: createRunDir('qa-dod-' + Math.random().toString(36).slice(2), { tmp }) };
}
const env = (over = {}) => ({ DOD_AUTO: '', ...over });

test('should leave findings with requirements[] exactly as they are', async () => {
  const data = { requirements: [{ id: 'R1' }], findings: [] };
  const r = await requirementsFromDod(data, { repo: '/nowhere', head: 'HEAD', env: env(), here: HERE });
  assert.equal(r.data, data);
});

test('should build spec requirements from the ADR that checkSource verifies at HEAD, with the dod ref for the report', async () => {
  const { repo, run, tmp } = fixture();
  const r = await requirementsFromDod({ dodFile: FILE, findings: [] }, { repo, head: 'HEAD', env: env(), here: HERE });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.data.requirements.map(q => [q.id, q.dod, q.source.kind]), [['AC1', 'A1', 'spec'], ['AC2', 'S1', 'spec']]);
  const ctx = loadContext({ run, repo, head: 'HEAD', requirements: r.data.requirements, tmp });
  for (const q of r.data.requirements) assert.deepEqual(checkSource(q, ctx), { ok: true }, q.id);
  const report = renderReport(r.data, verifyAll(r.data, ctx));
  assert.match(report, /\*\*AC1\*\* refund button on both pages \\\(dod:A1 · docs\/adr\/0001\\-refunds\.md:\d+\\\)/);
});

test('should refuse both dodFile and requirements, a dodFile that is not an ADR, and an edited ADR', async () => {
  const { repo } = fixture({ 'docs/dod/refunds.json': '{}' });
  const go = data => requirementsFromDod(data, { repo, head: 'HEAD', env: env(), here: HERE });
  assert.match((await go({ dodFile: FILE, requirements: [] })).error, /use dodFile or requirements\[\], not both/);
  assert.match((await go({ dodFile: 'docs/dod/refunds.json' })).error, /not an ADR/);
  writeFileSync(join(repo, FILE), adr(1) + 'x\n');
  assert.match((await go({ dodFile: FILE })).error, /differs from HEAD/);
});

test('should find the ADR by the files the findings name when there is no requirements[] or dodFile, and keep today\'s behavior otherwise', async () => {
  const { repo } = fixture({ 'docs/adr/0002-other.md': adr(2, 'other', ['lib/**']) });
  const data = { findings: [{ id: 'F1', proofs: [{ mode: 'code', ref: 'src/a.py:2', quote: 'x' }] }], tests_written: [] };
  const found = await requirementsFromDod(data, { repo, head: 'HEAD', env: env(), here: HERE });
  assert.equal(found.data.requirements.length, 2);
  assert.match(found.note, /found by touches/);
  const off = await requirementsFromDod(data, { repo, head: 'HEAD', env: env({ DOD_AUTO: '0' }), here: HERE });
  assert.equal(off.data, data);
  const none = await requirementsFromDod({ findings: [{ proofs: [{ mode: 'code', ref: 'elsewhere.py:1' }] }] }, { repo, head: 'HEAD', env: env(), here: HERE });
  assert.equal(none.data.requirements, undefined, 'no ADR: as today, no requirements');
});

test('should warn and keep today\'s behavior when several ADRs touch the files the findings name', async () => {
  const { repo } = fixture({ 'docs/adr/0002-again.md': adr(2, 'again', ['src/a.py']) });
  const data = { findings: [{ proofs: [{ mode: 'code', ref: 'src/a.py:2', quote: 'x' }] }] };
  const r = await requirementsFromDod(data, { repo, head: 'HEAD', env: env(), here: HERE });
  assert.equal(r.data, data);
  assert.match(r.warning, /2 ADRs touch.*set dodFile/);
});

test('the CLI reads requirements from dodFile and writes dod refs in the report', () => {
  const { repo, run, tmp } = fixture();
  const file = join(mk('qa-dod-in-'), 'findings.json');
  writeFileSync(file, JSON.stringify({ dodFile: FILE, findings: [] }));
  const r = spawnSync(process.execPath, [join(HERE, 'findings.mjs'), '--run', run, '--repo', repo, '--head', 'HEAD', '--findings', file], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp, DOD_AUTO: '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).verified, 2);
  assert.match(readFileSync(join(run, 'report.md'), 'utf8'), /dod:S1/);
  writeFileSync(file, JSON.stringify({ dodFile: FILE, requirements: [], findings: [] }));
  const both = spawnSync(process.execPath, [join(HERE, 'findings.mjs'), '--run', run, '--repo', repo, '--head', 'HEAD', '--findings', file], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
  assert.equal(both.status, 2);
  assert.match(both.stderr, /not both/);
});

test('should warn about touches globs that match no file at --head', async () => {
  const { repo } = fixture({ [FILE]: renderAdr({ dod: { slug: 'refunds', touches: ['src/**', 'lib/gone/**'], items: [{ id: 'AC1', text: 't', source: u }], required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: u }])) }, answers: 'A1: A\ntime: t\n', questions: QUESTIONS, ticket: '', number: 1, date: '2026-11-22' }).text });
  const r = await requirementsFromDod({ dodFile: FILE, findings: [] }, { repo, head: 'HEAD', env: env(), here: HERE });
  assert.equal(r.error, undefined);
  assert.match(r.warning, /lib\/gone\/\*\* matches no file/);
});
