// Unit tests for rule-enforcers.mjs on small fixture repos, the CLI exit codes, and the check on this repo (the CI enforcement, ADR 0013).
// Run: node --test rules/checks/rule-enforcers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkEnforcer, checkRepo } from './rule-enforcers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = join(HERE, 'rule-enforcers.mjs');
const ROOT = join(HERE, '..', '..');

const ALPHA = '# Alpha\n\nLead paragraph - not a rule.\n\n- one <!-- rule: alpha/one -->\n- two <!-- rule: alpha/two -->\n  - nested, belongs to two\n';
const ENTRIES = {
  'alpha/one': { status: 'enforced', enforcers: ['rules/checks/a.mjs', 'rules/checks/a.mjs#checkA', 'ratchet:r1', 'rules/checks'], reason: '' },
  'alpha/two': { status: 'judgment', enforcers: [], reason: 'only a person can judge it' },
};

/** A clean fixture repo; over maps a repo path to new text (null deletes it). */
function fixture(over = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rule-enforcers-'));
  const files = {
    'rules/README.md': '# Rules\n\n- a README bullet with no id\n',
    'rules/alpha.md': ALPHA,
    'rules/sub/notes.md': '- a nested folder bullet with no id\n',
    'rules/enforcers.json': JSON.stringify(ENTRIES, null, 2),
    'rules/checks/a.mjs': 'export function checkA() { return []; }\n',
    '.ratchet.json': JSON.stringify({ version: 1, rules: { r1: {} }, patterns: {} }),
    ...over,
  };
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}
const withEntries = patch => fixture({ 'rules/enforcers.json': { ...ENTRIES, ...patch } });
const cli = args => {
  const r = spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8' });
  return { code: r.status, lines: r.stdout.trim().split('\n'), out: JSON.parse(r.stdout.trim().split('\n').at(-1) || 'null'), err: r.stderr };
};

// checkEnforcer

test('should accept a path, a folder, a path#symbol and a ratchet id when each exists (EnfRef)', () => {
  const root = fixture();
  const ratchet = { r1: {} };
  assert.equal(checkEnforcer(root, 'rules/checks/a.mjs', ratchet), null);
  assert.equal(checkEnforcer(root, 'rules/checks', ratchet), null);
  assert.equal(checkEnforcer(root, 'rules/checks/a.mjs#checkA', ratchet), null);
  assert.equal(checkEnforcer(root, 'ratchet:r1', ratchet), null);
});

test('should give a reason when the enforcer path does not exist', () => {
  const why = checkEnforcer(fixture(), 'rules/checks/missing.mjs', { r1: {} });
  assert.equal(typeof why, 'string');
  assert.ok(why.length > 0);
});

test('should give a reason when the symbol is not in the file or the file is missing', () => {
  const root = fixture();
  for (const ref of ['rules/checks/a.mjs#checkB', 'rules/checks/gone.mjs#checkA']) {
    const why = checkEnforcer(root, ref, { r1: {} });
    assert.equal(typeof why, 'string', ref);
    assert.ok(why.length > 0, ref);
  }
});

test('should give a reason when the ratchet id is not in .ratchet.json rules (EnfRef)', () => {
  const why = checkEnforcer(fixture(), 'ratchet:zzz', { r1: {} });
  assert.equal(typeof why, 'string');
  assert.ok(why.length > 0);
  assert.equal(typeof checkEnforcer(fixture(), 'ratchet:constructor', {}), 'string');
});

test('should give a reason when the enforcer is not a string, is absolute or leaves the repo', () => {
  const root = fixture();
  for (const ref of [42, null, '', join(root, 'rules', 'checks', 'a.mjs'), '../outside.mjs', 'rules/../../outside.mjs']) {
    assert.equal(typeof checkEnforcer(root, ref, { r1: {} }), 'string', String(ref));
  }
});

// checkRepo

test('should find no violations when every bullet has an id and every entry is valid', () => {
  assert.deepEqual(checkRepo(fixture()), { violations: [] });
});

test('should report the line when a rule bullet has no id', () => {
  const { violations } = checkRepo(fixture({ 'rules/alpha.md': `${ALPHA}- three with no id\n` }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^rules\/alpha\.md:8: /);
});

test('should report the line when an id is not lowercase kebab or has another stem', () => {
  const { violations } = checkRepo(fixture({ 'rules/alpha.md': `${ALPHA}- bad <!-- rule: alpha/Bad_Slug -->\n- other <!-- rule: beta/x -->\n` }));
  assert.ok(violations.some(v => /^rules\/alpha\.md:8: /.test(v)), JSON.stringify(violations));
  assert.ok(violations.some(v => /^rules\/alpha\.md:9: /.test(v)), JSON.stringify(violations));
});

test('should report the line when one id is used twice in a file', () => {
  const { violations } = checkRepo(fixture({ 'rules/alpha.md': `${ALPHA}- again <!-- rule: alpha/one -->\n` }));
  assert.ok(violations.some(v => /^rules\/alpha\.md:8: /.test(v)), JSON.stringify(violations));
});

test('should report an id with no entry when a rule file has an id rules/enforcers.json lacks (PerBullet, CheckRefuse)', () => {
  const { violations } = checkRepo(fixture({ 'rules/alpha.md': `${ALPHA}- three <!-- rule: alpha/three -->\n` }));
  assert.deepEqual(violations, ['alpha/three: no entry in rules/enforcers.json']);
});

test('should report an entry with no bullet when rules/enforcers.json names an id no rule file has (PerBullet, CheckRefuse)', () => {
  const { violations } = checkRepo(withEntries({ 'alpha/gone': { status: 'judgment', enforcers: [], reason: 'r' } }));
  assert.deepEqual(violations, ['rules/enforcers.json: alpha/gone has no rule bullet']);
});

test('should report the status when it is not enforced, partial or judgment (EnfFile, CheckRefuse)', () => {
  const { violations } = checkRepo(withEntries({ 'alpha/two': { status: 'maybe', enforcers: [], reason: 'r' } }));
  assert.ok(violations.includes('rules/enforcers.json: alpha/two: status maybe is not enforced, partial or judgment'), JSON.stringify(violations));
});

test('should report an enforced entry when it lists no enforcer (EnfFile, CheckRefuse)', () => {
  const { violations } = checkRepo(withEntries({ 'alpha/one': { status: 'enforced', enforcers: [], reason: '' } }));
  assert.deepEqual(violations, ['rules/enforcers.json: alpha/one: enforced needs at least one enforcer']);
});

test('should report a judgment or partial entry when it has no reason (EnfFile, CheckRefuse)', () => {
  assert.deepEqual(checkRepo(withEntries({ 'alpha/two': { status: 'judgment', enforcers: [], reason: '' } })).violations,
    ['rules/enforcers.json: alpha/two: judgment needs a reason']);
  assert.deepEqual(checkRepo(withEntries({ 'alpha/two': { status: 'partial', enforcers: ['rules/checks/a.mjs'] } })).violations,
    ['rules/enforcers.json: alpha/two: partial needs a reason']);
});

test('should report each bad enforcer ref with its reason when a path, symbol or ratchet id is missing (EnfRef, CheckRefuse)', () => {
  const refs = ['rules/checks/missing.mjs', 'rules/checks/a.mjs#nope', 'ratchet:zzz'];
  const { violations } = checkRepo(withEntries({ 'alpha/one': { status: 'enforced', enforcers: ['rules/checks/a.mjs', ...refs], reason: '' } }));
  assert.equal(violations.length, 3, JSON.stringify(violations));
  for (const ref of refs) {
    const esc = ref.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert.ok(violations.some(v => new RegExp(`^rules/enforcers\\.json: alpha/one: ${esc}: \\S`).test(v)), `${ref}: ${JSON.stringify(violations)}`);
  }
});

test('should report a missing rules/enforcers.json when a rule file exists', () => {
  assert.ok(checkRepo(fixture({ 'rules/enforcers.json': null })).violations.includes('rules/enforcers.json is missing'));
});

test('should return the violations sorted when there are several', () => {
  const root = fixture({
    'rules/alpha.md': `${ALPHA}- no id\n- three <!-- rule: alpha/three -->\n`,
    'rules/enforcers.json': { ...ENTRIES, 'alpha/gone': { status: 'judgment', enforcers: [], reason: '' }, 'alpha/two': { status: 'x', enforcers: [], reason: 'r' } },
  });
  const { violations } = checkRepo(root);
  assert.ok(violations.length >= 4, JSON.stringify(violations));
  assert.deepEqual(violations, [...violations].sort());
});

test('should find the same violations when the repo root is reached through a symlinked folder', () => {
  const real = fixture({ 'rules/alpha.md': `${ALPHA}- three <!-- rule: alpha/three -->\n` });
  const links = mkdtempSync(join(tmpdir(), 'rule-enforcers-link-'));
  const linked = join(links, 'repo');
  symlinkSync(real, linked, 'dir');
  assert.deepEqual(checkRepo(linked), checkRepo(real));
  assert.deepEqual(checkRepo(linked).violations, ['alpha/three: no entry in rules/enforcers.json']);
  rmSync(join(real, 'rules', 'alpha.md'));
  writeFileSync(join(real, 'rules', 'alpha.md'), ALPHA);
  assert.deepEqual(checkRepo(linked), { violations: [] });
});

// CLI

test('should exit 0 with one JSON line and no violations when the CLI runs on a clean fixture', () => {
  const r = cli(['--root', fixture()]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.out, { ok: true, violations: [] });
});

test('should exit 1 with one JSON line listing the violations when the fixture is broken (CheckRefuse)', () => {
  const r = cli(['--root', withEntries({ 'alpha/one': { status: 'enforced', enforcers: [], reason: '' } })]);
  assert.equal(r.code, 1, r.err);
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.out, { ok: false, violations: ['rules/enforcers.json: alpha/one: enforced needs at least one enforcer'] });
});

test('should exit 2 with a usage error when an argument is unknown or --root has no value (CheckRefuse)', () => {
  for (const args of [['--nope'], ['--root']]) {
    const r = cli(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.lines.length, 1);
    assert.equal(r.out.ok, false);
    assert.equal(typeof r.out.error, 'string');
  }
});

test('should still run the CLI when the script is started through a symlinked folder', () => {
  const links = mkdtempSync(join(tmpdir(), 'rule-enforcers-cli-link-'));
  const linkedRepo = join(links, 'repo');
  symlinkSync(ROOT, linkedRepo, 'dir');
  const r = spawnSync(process.execPath, [join(linkedRepo, 'rules', 'checks', 'rule-enforcers.mjs'), '--root', fixture()], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { ok: true, violations: [] });
});

test('should check the current folder when the CLI runs with no arguments', () => {
  const r = spawnSync(process.execPath, [CHECK], { cwd: withEntries({ 'alpha/one': { status: 'enforced', enforcers: [], reason: '' } }), encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).violations, ['rules/enforcers.json: alpha/one: enforced needs at least one enforcer']);
});

test('should print nothing when the module is imported instead of started', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(CHECK).href)});`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  const dir = mkdtempSync(join(tmpdir(), 'rule-enforcers-import-'));
  const script = join(dir, 'importer.mjs');
  writeFileSync(script, `await import(${JSON.stringify(pathToFileURL(CHECK).href)});\n`);
  const s = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.stdout, '');
});

test('should give a reason when a ../ path leaves the repo even though the file exists there', () => {
  const root = fixture();
  const name = `outside-${process.pid}-${Date.now()}.mjs`;
  writeFileSync(join(root, '..', name), 'export const x = 1;\n');
  try {
    assert.equal(typeof checkEnforcer(root, `../${name}`, {}), 'string');
    assert.equal(typeof checkEnforcer(root, `../${name}#x`, {}), 'string');
  } finally { rmSync(join(root, '..', name), { force: true }); }
});

test('should give a reason when a path inside the repo is a symlink to a file outside it (EnfRef)', () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'rule-enforcers-out-'));
  writeFileSync(join(outside, 'x.mjs'), 'export const x = 1;\n');
  symlinkSync(join(outside, 'x.mjs'), join(root, 'escape.mjs'));
  symlinkSync(outside, join(root, 'escape-dir'), 'dir');
  assert.equal(typeof checkEnforcer(root, 'escape.mjs', {}), 'string');
  assert.equal(typeof checkEnforcer(root, 'escape.mjs#x', {}), 'string');
  assert.equal(typeof checkEnforcer(root, 'escape-dir/x.mjs', {}), 'string');
  mkdirSync(join(root, 'lib'));
  writeFileSync(join(root, 'lib', 'y.mjs'), 'export const y = 1;\n');
  symlinkSync(join(root, 'lib', 'y.mjs'), join(root, 'inside.mjs'));
  assert.equal(checkEnforcer(root, 'inside.mjs#y', {}), null);
});

test('should exit 0 with no violations when the check runs on this repo (CheckCI, Rows, BulletIds, EnfFile)', () => {
  const r = cli(['--root', ROOT]);
  assert.deepEqual(r.out.violations, []);
  assert.equal(r.code, 0);
});
