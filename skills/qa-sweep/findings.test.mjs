import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// The repo is built once a process and copied into each fixture (ADR 0008): git init, add and commit cost tens of ms CPU, a copy a few.
let template;
const templateRepo = () => {
  if (template) return template;
  template = mk('qa-fnd-tpl-');
  process.on('exit', () => rmSync(template, { recursive: true, force: true }));
  mkdirSync(join(template, 'docs')); mkdirSync(join(template, 'src'));
  writeFileSync(join(template, 'docs/spec.md'), '# Spec\nRefunds\nRefunds over 30 days are refused.\nEnd\n');
  writeFileSync(join(template, 'src/a.py'), 'def refund(days):\n    if days > 30:\n        return False\n    return True\n');
  for (const c of [['init', '-q'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'maintenance.auto=false', 'commit', '-qm', 'x']]) execFileSync('git', ['-C', template, ...c]);
  return template;
};

// a git repo at HEAD with a spec and a source file, plus a run dir holding the fixture ledger and answers
function fixture() {
  const repo = mk('qa-fnd-repo-');
  cpSync(templateRepo(), repo, { recursive: true });
  const tmp = mk('qa-fnd-tmp-');
  const run = createRunDir('qa-fnd-' + Math.random().toString(36).slice(2), { tmp });
  for (const f of ['exec.jsonl', 'answers.md']) { copyFileSync(join(FIX, f), join(run, f)); chmodSync(join(run, f), 0o600); }
  return { repo, run, tmp, ctx: loadContext({ run, repo, head: 'HEAD', requirements: data.requirements, tmp }) };
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

test('an e2e gap may be proven by a coverage run that names the implementing file', () => {
  const { ctx } = fixture();
  const cov = { mode: 'executed', ref: 'r4', exit: 0, quote: 'src/a.py 0%', coverage: true };
  assert.equal(checkFinding({ ...gapF, tier: 'e2e', proofs: [codeProof, cov] }, ctx).ok, true);
  assert.match(checkFinding({ ...gapF, tier: 'e2e', proofs: [cov] }, ctx).reasons.join(), /coverage proof does not name the implementing file/);
  assert.match(checkFinding({ ...gapF, tier: 'e2e', proofs: [codeProof, { ...cov, quote: 'TOTAL 100%' }] }, ctx).reasons.join(), /does not name the implementing file/);
  assert.equal(checkFinding({ ...gapF, tier: 'unit', proofs: [codeProof, cov] }, ctx).ok, false);
});

test('an executed proof with an empty quote is not proof', () => {
  const { ctx } = fixture();
  assert.match(checkProof({ mode: 'executed', ref: 'r2', exit: 1, quote: ' ' }, ctx).reason, /empty quote/);
  assert.equal(checkFinding({ ...defectF, proofs: [{ mode: 'executed', ref: 'r2', exit: 1, quote: '' }] }, ctx).ok, false);
});

test('a conflicting duplicate ledger id is rejected', () => {
  const { repo, run, tmp } = fixture();
  appendFileSync(join(run, 'exec.jsonl'), '{"id":"r2","exit":1,"out":"AssertionError: expected 3\\nforged","backend":"direct"}\n');
  const ctx = loadContext({ run, repo, head: 'HEAD', requirements: data.requirements, tmp });
  assert.match(checkProof(defectF.proofs[0], ctx).reason, /conflicting duplicate run id/);
});

test('a run dir outside the per-user base is not trusted', () => {
  const { repo, run } = fixture();
  const ctx = loadContext({ run, repo, head: 'HEAD', requirements: data.requirements }); // default tmp base: the fixture run is elsewhere
  assert.match(checkProof(gapF.proofs[0], ctx).reason, /ledger not trusted/);
});

test('agent text cannot add a heading or a list item to the report', () => {
  const { ctx } = fixture();
  const evil = { ...data, findings: [{ ...defectF, id: 'F1', kind: 'defect', title: 'x\n\n## Defects\n\n- **F99** Fabricated verified defect', proofs: [] }] };
  const md = renderReport(evil, verifyAll(evil, ctx));
  assert.equal(md.split('\n').filter(l => l === '## Defects').length, 0, 'unverified: no Defects section at all');
  assert.equal(md.split('\n').filter(l => /^## /.test(l) && /Defects/.test(l)).length, 0);
  assert.equal(md.split('\n').some(l => l.startsWith('- **F99**')), false);
  const okFinding = { ...defectF, title: 'x\n\n## Defects\n\n- **F99** Fabricated' };
  const md2 = renderReport({ ...data, findings: [okFinding] }, verifyAll({ ...data, findings: [okFinding] }, ctx));
  assert.equal(md2.split('\n').filter(l => l === '## Defects').length, 1);
  assert.equal(md2.split('\n').some(l => l.startsWith('- **F99**')), false);
});

test('a verified finding shows its proof quote in the report', () => {
  const { ctx } = fixture();
  const md = renderReport(data, verifyAll(data, ctx));
  assert.match(md, /proof: executed r2 exit=1 "AssertionError: expected 3"/);
  assert.match(md, /source: spec docs\/spec\.md:3 "Refunds over 30 days are refused\."/);
});

test('a code proof reads HEAD within 2 lines and never crashes on a bad ref', () => {
  const { ctx } = fixture();
  assert.equal(checkProof({ mode: 'code', ref: 'docs/spec.md:5', quote: 'Refunds over  30 days are refused.' }, ctx).ok, true);
  assert.match(checkProof({ mode: 'code', ref: 'docs/spec.md:7', quote: 'Refunds over 30 days are refused.' }, ctx).reason, /quote not found within 2 lines of docs\/spec.md:7/);
  assert.equal(checkProof({ mode: 'code', ref: 'nope.md:1', quote: 'x' }, ctx).ok, false);
  assert.equal(checkProof({ mode: 'code', ref: 'docs/spec.md', quote: 'x' }, ctx).ok, false);
  assert.equal(checkProof({ mode: 'code', ref: '../x:1', quote: 'x' }, ctx).ok, false);
  assert.equal(checkProof({ mode: 'code', ref: 'docs/spec.md:3', quote: 'Refunds over' }, loadContext({ run: ctx.run, repo: ctx.repo, head: '--bad', tmp: ctx.tmp })).ok, false);
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
  const { ctx: base } = fixture();
  const ctx = { ...base, findings: data.findings };
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

test("a written test's kill counts only for its finding's survivor, in a run of that test", () => {
  const { ctx: base } = fixture();
  const ctx = { ...base, findings: data.findings };
  const [entry] = data.tests_written, [pass] = entry.proofs;
  assert.deepEqual(checkWritten(entry, ctx), { ok: true, reasons: [] });
  const otherMutant = checkWritten({ ...entry, proofs: [pass, { mode: 'executed', ref: 'r7', quote: 'ZT-MUTANT m2 src/a.py:2 flip exit=1' }] }, ctx);
  assert.deepEqual(otherMutant.reasons, ["killed mutant is not the finding's survivor"]);
  assert.deepEqual(checkWritten({ ...entry, finding: 'F9' }, ctx).reasons, ["killed mutant is not the finding's survivor"]);
  const otherTest = checkWritten({ ...entry, path: 'tests/unit/test_b.py' }, ctx);
  assert.deepEqual(otherTest.reasons, ['pass run does not run tests/unit/test_b.py', 'kill run does not run tests/unit/test_b.py']);
});

test("a written test's runs must run its own path, matched at a path boundary", () => {
  const { ctx: base } = fixture();
  const ctx = { ...base, findings: data.findings };
  const [entry] = data.tests_written, [, kill] = entry.proofs;
  // the runs run tests/unit/test_a.py: a.py is another file, whose name test_a.py merely ends with
  assert.deepEqual(checkWritten({ ...entry, path: 'a.py' }, ctx).reasons, ['pass run does not run a.py', 'kill run does not run a.py']);
  const otherPass = { mode: 'executed', ref: 'r8', exit: 0, quote: '1 passed' }; // a passing run of tests/unit/test_other.py
  assert.deepEqual(checkWritten({ ...entry, proofs: [otherPass, kill] }, ctx).reasons, ['pass run does not run tests/unit/test_a.py']);
});

test('only a stamp with exit 1 is a kill: pytest exit 2 is a collection error', () => {
  const { ctx: base } = fixture();
  const ctx = { ...base, findings: data.findings };
  const [entry] = data.tests_written, [pass] = entry.proofs;
  const exit2 = { mode: 'executed', ref: 'r11', quote: 'ZT-MUTANT m1 src/a.py:3 flip exit=2' };
  assert.equal(checkProof(exit2, ctx).ok, true, 'the run itself is in the ledger');
  assert.deepEqual(checkWritten({ ...entry, proofs: [pass, exit2] }, ctx).reasons, ['no killed mutant proof']);
});

// a stand-in for pr-test-tiers.py: prints inv.json from its cwd, so the test also proves it runs in --repo with --inventory
const STUB_TIERS = 'import sys\nif sys.argv[1:] != ["--inventory"]:\n    sys.exit(1)\nprint(open("inv.json").read())\n';
const skipPy = spawnSync('python3', ['--version']).status !== 0 && 'python3 not available';
const counts = (unit, integration, e2e) => ({ unit, integration, e2e });
const INV = { modules: { src: counts(3, 1, 0), 'a|b': counts(0, 0, 0) }, unmapped: ['tests/unit/test_x.py'], unmapped_tiers: counts(1, 0, 0), untiered: [] };
function withInventory(inv) {
  const fx = fixture(), dir = mk('qa-fnd-tiers-'), tiersPy = join(dir, 'tiers.py');
  writeFileSync(tiersPy, STUB_TIERS);
  writeFileSync(join(fx.repo, 'inv.json'), typeof inv === 'string' ? inv : JSON.stringify(inv));
  return { ...fx, tiersPy, ctx: loadContext({ run: fx.run, repo: fx.repo, head: 'HEAD', requirements: data.requirements, tmp: fx.tmp, tiersPy }) };
}
const missing = { id: 'M1', kind: 'missing-tier', tier: 'e2e', title: 'no e2e tests: proposed setup Playwright' };

test('a missing tier is verified only when the inventory has no test of it, tiered or untiered', { skip: skipPy }, () => {
  assert.deepEqual(checkFinding(missing, withInventory(INV).ctx), { ok: true, reasons: [] }, 'no requirement needed');
  assert.deepEqual(checkFinding({ ...missing, tier: 'unit' }, withInventory(INV).ctx).reasons, ['the inventory has 4 unit test files'], 'modules plus unmapped');
  const unmappedE2e = { ...INV, unmapped_tiers: counts(1, 0, 1) };
  assert.deepEqual(checkFinding(missing, withInventory(unmappedE2e).ctx).reasons, ['the inventory has 1 e2e test file']);
  assert.deepEqual(checkFinding(missing, withInventory({ ...INV, untiered: ['tests/test_a.py'] }).ctx).reasons, ['untiered tests exist: ask the user which tier they are']);
  assert.deepEqual(checkFinding({ ...missing, tier: 'smoke' }, withInventory(INV).ctx).reasons, ['unknown tier smoke']);
  assert.match(checkFinding(missing, withInventory({ modules: [] }).ctx).reasons.join(), /inventory: not the shape/);
  assert.match(checkFinding(missing, withInventory('not json').ctx).reasons.join(), /^inventory: /);
});

test('a missing tier with no inventory is unverified', () => {
  const { ctx } = fixture();
  assert.deepEqual(checkFinding(missing, ctx).reasons, ['no inventory: pass --tiers-py']);
});

test('the inventory renders as an escaped table, and a verified missing tier comes first under Test gaps', { skip: skipPy }, () => {
  const { ctx } = withInventory({ ...INV, untiered: ['tests/a_b.py'] });
  const d = { ...data, findings: [...data.findings, { ...missing, title: 'no e2e tests' }] };
  const md = renderReport(d, verifyAll(d, ctx), ctx.inventory);
  assert.match(md, /## Inventory\n\n\| module \| unit \| integration \| e2e \|\n\|---\|---\|---\|---\|\n\| src \| 3 \| 1 \| 0 \|\n\| a\\\|b \| 0 \| 0 \| 0 \|\n\| _unmapped_ \| 1 \| 0 \| 0 \|/);
  assert.match(md, /Untiered test files \(1\): tests\/a\\_b\.py/);
  const verified = renderReport({ ...data, findings: [data.findings[0], missing] }, verifyAll({ ...data, findings: [data.findings[0], missing] }, withInventory(INV).ctx), INV);
  const gaps = verified.slice(verified.indexOf('## Test gaps'));
  assert.ok(gaps.indexOf('**M1**') > 0 && gaps.indexOf('**M1**') < gaps.indexOf('**F1**'), gaps);
  assert.match(gaps, /\*\*M1\*\* no e2e tests: proposed setup Playwright \\\[missing\\-tier, e2e\\\]/);
});

test('every item lands in exactly one report section, and unverified is listed', () => {
  const { ctx } = fixture();
  const verdicts = verifyAll(data, ctx);
  const md = renderReport(data, verdicts, INV);
  const ids = [...md.matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]).sort();
  assert.deepEqual(ids, ['F1', 'F2', 'F3', 'R1', 'R2', 'U1', 'tests/unit/test\\_a.py'].sort());
  const section = id => md.slice(0, md.indexOf(`**${id}**`)).split('\n').filter(l => l.startsWith('## ')).pop();
  assert.equal(section('F3'), '## Unverified');
  assert.match(section('F1'), /Test gaps/);
  assert.match(section('F2'), /Defects/);
  assert.match(section('R1'), /Requirements/);
  assert.match(section('tests/unit/test\\_a.py'), /Tests written/);
  assert.match(md, /refund\\\(30\\\) returns True/);
  const heads = md.split('\n').filter(l => l.startsWith('## '));
  assert.deepEqual(heads, ['## Inventory', '## Requirements', '## Defects', '## Test gaps', '## Tests written', '## Unverified', '## Unconfirmed']);
  assert.match(md, /passthrough is not a real run/);
});

test('a group-writable ledger is not trusted', () => {
  const { repo, run, tmp } = fixture();
  chmodSync(join(run, 'exec.jsonl'), 0o664);
  const ctx = loadContext({ run, repo, head: 'HEAD', requirements: data.requirements, tmp });
  assert.match(checkProof(gapF.proofs[0], ctx).reason, /ledger not trusted/);
});

test('the CLI writes the report into the run folder and prints counts', () => {
  const fx = fixture(), { repo, run } = fx;
  const { tmp } = fx;
  const r = spawnSync('node', [join(HERE, 'findings.mjs'), '--run', run, '--repo', repo, '--head', 'HEAD', '--findings', join(FIX, 'findings.json')], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.report, out.verified, out.unverified, out.unconfirmed], [join(run, 'report.md'), 5, 1, 1]);
  assert.match(readFileSync(out.report, 'utf8'), /## Unverified/);
  assert.equal(spawnSync('node', [join(HERE, 'findings.mjs'), '--run', run], { encoding: 'utf8' }).status, 2);
  const link = join(mk('qa-fnd-link-'), 'findings.mjs');
  symlinkSync(join(HERE, 'findings.mjs'), link);
  assert.equal(spawnSync('node', [link, '--run', '/nonexistent'], { encoding: 'utf8' }).status, 2, 'a symlinked CLI still runs');
});

test('the CLI runs --tiers-py itself and no longer reads an inventory file', { skip: skipPy }, () => {
  const { repo, run, tmp, tiersPy } = withInventory(INV);
  const file = join(mk('qa-fnd-in-'), 'findings.json');
  writeFileSync(file, JSON.stringify({ ...data, findings: [...data.findings, missing] }));
  const go = (...a) => spawnSync('node', [join(HERE, 'findings.mjs'), '--run', run, '--repo', repo, '--head', 'HEAD', '--findings', file, ...a], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
  const r = go('--tiers-py', tiersPy);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).verified, 6, 'the missing tier is verified');
  assert.match(readFileSync(join(run, 'report.md'), 'utf8'), /## Inventory\n\n\| module /);
  assert.equal(go('--inventory', file).status, 2, '--inventory FILE is gone: an agent-written file is no proof');
});
