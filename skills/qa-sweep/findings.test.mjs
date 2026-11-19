import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { checkFinding, checkProof, checkSource, checkWritten, loadContext, renderReport, verifyAll } from './findings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');
const ZT = process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review');
const { createRunDir } = await import(pathToFileURL(join(ZT, 'runctx.mjs')).href);
const data = JSON.parse(readFileSync(join(FIX, 'findings.json'), 'utf8'));
const mk = p => mkdtempSync(join(tmpdir(), p));

// a git repo at HEAD with a spec and a source file, plus a run dir holding the fixture ledger and answers
function fixture() {
  const repo = mk('qa-fnd-repo-');
  mkdirSync(join(repo, 'docs')); mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'docs/spec.md'), '# Spec\nRefunds\nRefunds over 30 days are refused.\nEnd\n');
  writeFileSync(join(repo, 'src/a.py'), 'def refund(days):\n    if days > 30:\n        return False\n    return True\n');
  for (const c of [['init', '-q'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x']]) execFileSync('git', ['-C', repo, ...c]);
  const run = createRunDir('qa-fnd-' + Math.random().toString(36).slice(2), { tmp: mk('qa-fnd-tmp-') });
  for (const f of ['exec.jsonl', 'answers.md']) { copyFileSync(join(FIX, f), join(run, f)); chmodSync(join(run, f), 0o600); }
  return { repo, run, ctx: loadContext({ run, repo, head: 'HEAD', requirements: data.requirements }) };
}

const [gapF, defectF] = data.findings;
const codeProof = { mode: 'code', ref: 'src/a.py:2', quote: 'if days > 30:' };

test('a test gap with a quoted spec and a surviving mutant is verified', () => {
  const { ctx } = fixture();
  assert.equal(checkFinding(gapF, ctx).ok, true);
});

test('a test gap with only a search is unverified', () => {
  const { ctx } = fixture();
  const v = checkFinding({ ...gapF, proofs: [codeProof] }, ctx);
  assert.equal(v.ok, false);
  assert.match(v.reasons.join(), /surviving mutant/);
});

test('a defect needs a failing run', () => {
  const { ctx } = fixture();
  assert.equal(checkFinding(defectF, ctx).ok, true);
  assert.equal(checkFinding({ ...defectF, proofs: [{ mode: 'executed', ref: 'r1', exit: 0, quote: 'ZT-MUTANT' }] }, ctx).ok, false);
});

test('a passthrough run is not proof', () => {
  const { ctx } = fixture();
  const v = checkProof({ mode: 'executed', ref: 'r3', quote: '' }, ctx);
  assert.equal(v.ok, false);
  assert.match(v.reason, /passthrough is not a real run/);
  assert.match(checkProof({ mode: 'executed', ref: 'r9', quote: '' }, ctx).reason, /run r9 not in ledger/);
});

test('a user answer is a source only with its exact words', () => {
  const { ctx } = fixture();
  const src = quote => ({ source: { kind: 'user', ref: 'A1', quote } });
  assert.equal(checkSource(src('refunds over   30 days are refused'), ctx).ok, true);
  assert.equal(checkSource(src('refunds after a month are refused'), ctx).ok, false);
  assert.equal(checkSource(src('no'), ctx).ok, false, 'A2 words are not A1');
});

test('an e2e gap may be proven by a coverage run', () => {
  const { ctx } = fixture();
  const cov = { mode: 'executed', ref: 'r4', exit: 0, quote: 'TOTAL 100%', coverage: true };
  assert.equal(checkFinding({ ...gapF, tier: 'e2e', proofs: [cov] }, ctx).ok, true);
  assert.equal(checkFinding({ ...gapF, tier: 'unit', proofs: [cov] }, ctx).ok, false);
});

test('a code proof reads HEAD within 2 lines and never crashes on a bad ref', () => {
  const { ctx } = fixture();
  assert.equal(checkProof({ mode: 'code', ref: 'docs/spec.md:5', quote: 'Refunds over  30 days are refused.' }, ctx).ok, true);
  assert.match(checkProof({ mode: 'code', ref: 'docs/spec.md:7', quote: 'Refunds over 30 days are refused.' }, ctx).reason, /quote not found within 2 lines of docs\/spec.md:7/);
  assert.equal(checkProof({ mode: 'code', ref: 'nope.md:1', quote: 'x' }, ctx).ok, false);
  assert.equal(checkProof({ mode: 'code', ref: 'docs/spec.md', quote: 'x' }, ctx).ok, false);
  assert.equal(checkProof({ mode: 'code', ref: '../x:1', quote: 'x' }, ctx).ok, false);
  assert.equal(checkProof({ mode: 'code', ref: 'docs/spec.md:3', quote: 'Refunds over' }, loadContext({ run: ctx.run, repo: ctx.repo, head: '--bad' })).ok, false);
});

test('a weak test needs a code proof and a surviving mutant', () => {
  const { ctx } = fixture();
  const mut = gapF.proofs[0];
  assert.equal(checkFinding({ ...gapF, kind: 'weak-test', proofs: [codeProof, mut] }, ctx).ok, true);
  assert.match(checkFinding({ ...gapF, kind: 'weak-test', proofs: [codeProof] }, ctx).reasons.join(), /surviving mutant/);
  assert.match(checkFinding({ ...gapF, kind: 'weak-test', proofs: [mut] }, ctx).reasons.join(), /code proof/);
});

test('a finding with an unverifiable source is unverified', () => {
  const { ctx } = fixture();
  const bad = { ...ctx, requirements: [{ id: 'R1', source: { kind: 'ticket', ref: 'T-1', quote: 'x' } }] };
  assert.equal(checkFinding(gapF, bad).ok, false);
  assert.match(checkFinding({ ...gapF, requirement: 'R9' }, ctx).reasons.join(), /requirement R9 not found/);
});

test('a written test needs a passing run and a killed mutant', () => {
  const { ctx } = fixture();
  const [entry] = data.tests_written, [pass, kill] = entry.proofs;
  assert.equal(checkWritten(entry, ctx).ok, true);
  const missingKill = checkWritten({ ...entry, proofs: [pass] }, ctx);
  assert.equal(missingKill.ok, false);
  assert.match(missingKill.reasons.join(), /killed mutant/);
  const missingPass = checkWritten({ ...entry, proofs: [kill] }, ctx);
  assert.equal(missingPass.ok, false);
  assert.match(missingPass.reasons.join(), /passing run/);
  const survivor = checkWritten({ ...entry, proofs: [pass, gapF.proofs[0]] }, ctx);
  assert.match(survivor.reasons.join(), /killed mutant/);
});

test('every item lands in exactly one report section, and unverified is listed', () => {
  const { ctx } = fixture();
  const verdicts = verifyAll(data, ctx);
  const md = renderReport(data, verdicts, 'a1 inventory line');
  const ids = [...md.matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]).sort();
  assert.deepEqual(ids, ['F1', 'F2', 'F3', 'R1', 'R2', 'U1', 'tests/unit/test_a.py'].sort());
  const section = id => md.slice(0, md.indexOf(`**${id}**`)).split('\n').filter(l => l.startsWith('## ')).pop();
  assert.equal(section('F3'), '## Unverified');
  assert.match(section('F1'), /Test gaps/);
  assert.match(section('F2'), /Defects/);
  assert.match(section('R1'), /Requirements/);
  assert.match(section('tests/unit/test_a.py'), /Tests written/);
  assert.match(md, /refund\(30\) returns True/);
  const heads = md.split('\n').filter(l => l.startsWith('## '));
  assert.deepEqual(heads, ['## Inventory', '## Requirements', '## Defects', '## Test gaps', '## Tests written', '## Unverified', '## Unconfirmed']);
  assert.match(md, /passthrough is not a real run/);
});

test('a group-writable ledger is not trusted', () => {
  const { repo, run } = fixture();
  chmodSync(join(run, 'exec.jsonl'), 0o664);
  const ctx = loadContext({ run, repo, head: 'HEAD', requirements: data.requirements });
  assert.match(checkProof(gapF.proofs[0], ctx).reason, /ledger not trusted/);
});

test('the CLI writes the report into the run folder and prints counts', () => {
  const { repo, run } = fixture();
  const r = spawnSync('node', [join(HERE, 'findings.mjs'), '--run', run, '--repo', repo, '--head', 'HEAD', '--findings', join(FIX, 'findings.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.report, out.verified, out.unverified, out.unconfirmed], [join(run, 'report.md'), 5, 1, 1]);
  assert.match(readFileSync(out.report, 'utf8'), /## Unverified/);
  assert.equal(spawnSync('node', [join(HERE, 'findings.mjs'), '--run', run], { encoding: 'utf8' }).status, 2);
});
