// Tests for dodfile.mjs: plan.json reads its DoD from an ADR (dodFile, or found by touches) and the real validatePlan accepts the result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAdr } from '../definition-of-done/adr.mjs';
import { resolveDod } from './dodfile.mjs';
import { validatePlan } from './gates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS = 'Q1: Which pages?\n(A) both\n  + consistent\n  - two pages to test\n(B) sales\n  + smaller\n  - stock users ask again\nrecommended: A\nQ2: Cap?\n(A) cap\n  + fast\n  - partial\n(B) stream\n  + complete\n  - timeout\n';
const ANSWERS = 'A1: A\ntime: t\nA2: A\ntime: t\n';
const u = ref => ({ kind: 'user', ref, quote: 'A', question: 'Q' });
const DOD = (slug, touches) => ({
  slug, touches,
  items: [{ id: 'AC1', text: 'button on both pages', source: u('A1') }, { id: 'AC2', text: 'cap at 10,000 rows', kinds: ['happy', 'edge'], source: u('A2') }],
  required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: u('A1') }])),
});
const adr = (n, slug = 'report-export', touches = ['src/reports/**']) => renderAdr({ dod: DOD(slug, touches), answers: ANSWERS, questions: QUESTIONS, ticket: '', number: n, date: '2026-11-22' }).text;

function repoWith(files) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'ptdd-dod-')));
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), t); }
  const g = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'base');
  return repo;
}
const FILE = 'docs/adr/0001-report-export.md';
const plan = (repo, extra = {}) => ({ repo, cmd: 'node --test {file}', groups: [{ id: 'g1', tests: ['t/a.test.mjs'], src: ['src/reports/export.mjs'], dod: ['AC1', 'AC2'] }], ...extra });
const env = (over = {}) => ({ DOD_AUTO: '', ...over });

test('should leave a plan with dod[] exactly as it is, the same object', async () => {
  const p = { repo: '/nowhere', dod: [{ id: 'AC1' }], groups: [] };
  const r = await resolveDod(p, { env: env(), here: HERE });
  assert.equal(r.plan, p);
  assert.equal(r.fromAdr, false);
});

test('should read the DoD from the ADR that dodFile names, and the real validatePlan accepts it', async () => {
  const repo = repoWith({ [FILE]: adr(1) });
  const r = await resolveDod(plan(repo, { dodFile: FILE }), { env: env(), here: HERE });
  assert.equal(r.error, undefined);
  assert.equal(r.fromAdr, true);
  assert.deepEqual(r.plan.dod.map(d => [d.id, d.kinds]), [['AC1', ['happy', 'fail', 'edge']], ['AC2', ['happy', 'edge']]]);
  assert.equal(r.plan.dodFile, FILE);
  assert.match(r.plan.dodBlob, /^[0-9a-f]{40}$/);
  assert.match(r.note, /2 DoD item\(s\) from docs\/adr\/0001-report-export\.md @ [0-9a-f]{8}$/);
  assert.deepEqual(validatePlan(r.plan, undefined), []);
});

test('should refuse a plan that has both dodFile and dod[]', async () => {
  const r = await resolveDod(plan('/x', { dodFile: FILE, dod: [] }), { env: env(), here: HERE });
  assert.match(r.error, /use dodFile or dod\[\], not both/);
});

test('should refuse a dodFile that is not an ADR, is not committed, or was edited after the commit', async () => {
  const repo = repoWith({ [FILE]: adr(1), 'docs/dod/report-export.json': '{"slug":"report-export"}' });
  assert.match((await resolveDod(plan(repo, { dodFile: 'docs/dod/report-export.json' }), { env: env(), here: HERE })).error, /not an ADR with a "## Definition of done" section.*dod\.mjs adr/s);
  assert.match((await resolveDod(plan(repo, { dodFile: 'docs/adr/0002-none.md' }), { env: env(), here: HERE })).error, /not committed at HEAD/);
  writeFileSync(join(repo, FILE), adr(1).replace('cap at 10,000 rows', 'cap at 20,000 rows'));
  assert.match((await resolveDod(plan(repo, { dodFile: FILE }), { env: env(), here: HERE })).error, /differs from HEAD; commit it first/);
});

test('should refuse a committed ADR whose Definition of done section was edited by hand', async () => {
  const repo = repoWith({ [FILE]: adr(1).replace('cap at 10,000 rows', 'cap at 20,000 rows') });
  assert.match((await resolveDod(plan(repo, { dodFile: FILE }), { env: env(), here: HERE })).error, /edited by hand/);
});

test('should say where the definition-of-done skill is missing when dodFile is set and DOD_DIR points nowhere', async () => {
  const r = await resolveDod(plan('/x', { dodFile: FILE }), { env: env({ DOD_DIR: '/nowhere/dod' }), here: HERE });
  assert.match(r.error, /dodFile needs the definition-of-done skill, not found at \/nowhere\/dod \(set DOD_DIR\)/);
});

test('should find the one ADR whose touches match the groups\' src when the plan has neither dod[] nor dodFile', async () => {
  const repo = repoWith({ [FILE]: adr(1), 'docs/adr/0002-other.md': adr(2, 'other', ['src/other/**']) });
  const r = await resolveDod(plan(repo), { env: env(), here: HERE });
  assert.equal(r.error, undefined);
  assert.equal(r.plan.dodFile, FILE);
  assert.match(r.note, /found by touches/);
  assert.deepEqual(validatePlan(r.plan, undefined), []);
});

test('should list the candidates when several ADRs touch the groups\' src, and say so when none does', async () => {
  const repo = repoWith({ [FILE]: adr(1), 'docs/adr/0002-again.md': adr(2, 'again', ['src/**']) });
  assert.match((await resolveDod(plan(repo), { env: env(), here: HERE })).error, /2 ADRs touch.*0001-report-export\.md.*0002-again\.md.*set dodFile/s);
  const none = repoWith({ 'docs/adr/0002-other.md': adr(2, 'other', ['src/other/**']) });
  assert.match((await resolveDod(plan(none), { env: env(), here: HERE })).error, /no dod\[\], no dodFile, and no ADR with a Definition of done touches src\/reports\/export\.mjs/);
});

test('should not look for an ADR when DOD_AUTO is 0, leaving validatePlan to report the missing DoD as today', async () => {
  const repo = repoWith({ [FILE]: adr(1) });
  const p = plan(repo);
  const r = await resolveDod(p, { env: env({ DOD_AUTO: '0' }), here: HERE });
  assert.equal(r.plan, p);
  assert.ok(validatePlan(r.plan, undefined).includes('at least one DoD item is required'));
});

test('should warn about touches globs that match no file at HEAD, and stay quiet when they all match', async () => {
  const stale = repoWith({ [FILE]: adr(1, 'report-export', ['src/reports/**', 'src/gone/**']), 'src/reports/export.mjs': 'x\n' });
  const r = await resolveDod(plan(stale, { dodFile: FILE }), { env: env(), here: HERE });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.warnings, [`${FILE}: src/gone/** matches no file; update the ADR's touches`]);
  const fine = repoWith({ [FILE]: adr(1), 'src/reports/export.mjs': 'x\n' });
  assert.deepEqual((await resolveDod(plan(fine, { dodFile: FILE }), { env: env(), here: HERE })).warnings, []);
});
