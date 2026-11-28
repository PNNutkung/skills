// Unit tests for flag-defaults-e2e.mjs on small fixtures, and the check on this repo (the CI enforcement). Run: node --test flag-defaults-e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFile, checkRepo, isOn, ownerOf, parseFlags, scanSource } from './flag-defaults-e2e.mjs';
import { readFileSync } from 'node:fs';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'flag-defaults-e2e.mjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readme = rows => `# x\n\n## Flags\n\nSome text.\n\n| Flag | Values | Default | What it does |\n|---|---|---|---|\n${rows.map(r => `| \`${r[0]}\` | \`true\` \\| \`false\` | \`${r[1]}\` | it |`).join('\n')}\n\n## Next\n\n| Flag | Values | Default |\n|---|---|---|\n| \`NOPE_X\` | a | \`true\` |\n`;
const README = readme([['QA_FOO_ENABLED', 'true'], ['QA_BAR_ENABLED', 'false']]);

const file = ({ marker = true, prelude = '', spawn = true, blocks = ['  run({});'] } = {}) => [
  marker ? '// flags: defaults' : '// an e2e test',
  "import { test } from 'node:test';",
  "import { spawnSync } from 'node:child_process';",
  `const run = env => ${spawn ? "spawnSync('node', ['cli.mjs'], { env: { ...process.env, ...env } })" : 'env'};`,
  prelude,
  ...blocks.map((b, i) => `test('should do ${i} when run', () => {\n${b}\n});`),
].join('\n');
const check = text => checkRepo(README, { 'qa-sweep': [{ name: 'e2e.test.mjs', text }] });

test('should pass when a marked spawning file has one test block that sets none of the skill flags', () => {
  const r = check(file({ blocks: ["  run({ QA_FOO_ENABLED: 'false' });", '  run({});'] }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.skills['qa-sweep'], { flagsOn: ['QA_FOO_ENABLED'], ok: true, file: 'e2e.test.mjs' });
});

test('should report the missing marker when no test file carries flags: defaults', () => {
  const r = check(file({ marker: false }));
  assert.equal(r.ok, false);
  assert.match(r.violations.join('\n'), /qa-sweep: no test file carries the `flags: defaults` marker \(checked 1: e2e\.test\.mjs\)/);
});

test('should fail when the module prelude assigns an ON flag', () => {
  for (const prelude of ["process.env.QA_FOO_ENABLED = 'false';", "const ENV = { 'QA_FOO_ENABLED': 'true' };", 'const CMD = "QA_FOO_ENABLED=false node cli.mjs";']) {
    const r = check(file({ prelude }));
    assert.equal(r.ok, false, prelude);
    assert.match(r.violations.join('\n'), /qa-sweep: e2e\.test\.mjs: the module prelude assigns QA_FOO_ENABLED/, prelude);
  }
});

test('should fail when every top-level test block assigns an ON flag', () => {
  const r = check(file({ blocks: ["  run({ QA_FOO_ENABLED: 'false' });", '  run({ "QA_FOO_ENABLED": "true" });'] }));
  assert.equal(r.ok, false);
  assert.match(r.violations.join('\n'), /e2e\.test\.mjs: every top-level test block assigns one of QA_FOO_ENABLED/);
});

test('should fail when the marked file spawns no process', () => {
  const r = check(file({ spawn: false }));
  assert.equal(r.ok, false);
  assert.match(r.violations.join('\n'), /e2e\.test\.mjs: spawns no process/);
});

test('should report a violation when a README flag has an unknown prefix', () => {
  const r = checkRepo(readme([['QA_FOO_ENABLED', 'true'], ['NEWSKILL_X_ENABLED', 'false']]), { 'qa-sweep': [{ name: 'e2e.test.mjs', text: file() }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations, ['NEWSKILL_X_ENABLED: unknown prefix; add it to OWNERS in rules/checks/flag-defaults-e2e.mjs']);
});

test('should count a _MODE flag as ON when its default is not true', () => {
  assert.equal(isOn({ name: 'ZT_SANDBOX_MODE', default: 'auto' }), true);
  assert.equal(isOn({ name: 'ZT_AGENT_MAX', default: 'unlimited' }), false);
  const r = checkRepo(readme([['ZT_X_MODE', 'auto']]), { 'zero-trust-review': [] });
  assert.deepEqual(r.skills['zero-trust-review'].flagsOn, ['ZT_X_MODE']);
  assert.equal(r.ok, false, 'a skill with an ON flag and no test file fails');
});

test('should allow the flag name when it only appears as a value, in a comment or in a test name', () => {
  const r = check(file({
    prelude: "const SKIP = ['QA_FOO_ENABLED']; // QA_FOO_ENABLED=false is tested below\nconst keep = k => k !== 'QA_FOO_ENABLED';",
    blocks: ["  run({ QA_BAR_ENABLED: 'true' }); // not an ON flag", "  run({ QA_FOO_ENABLED: 'false' });"],
  }));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('should not count a test( inside a template string as a top-level block when a fixture holds test code', () => {
  const src = "const T = `test('x', () => {})\\n${'a'}`;\nconst re = /test\\(/;\ntest('should run when real', () => { const o = { a: `${1}` }; });\nfor (const c of [1]) test(`c ${c}`, () => {});\n";
  const tops = scanSource(src).tops.map(([a]) => src.slice(a, a + 6));
  assert.deepEqual(tops, ["test('", 'test(`']);
  assert.deepEqual(analyzeFile(`// flags: defaults\nconst X = \`test('a', () => run({ QA_FOO_ENABLED: 1 }))\`;\nspawnSync('x');\n`, ['QA_FOO_ENABLED']), ['no top-level test( or it( block']);
});

test('should read the escaped pipes of the Values column when parsing the Flags table', () => {
  assert.deepEqual(parseFlags(README), [
    { name: 'QA_FOO_ENABLED', values: '`true` | `false`', default: 'true' },
    { name: 'QA_BAR_ENABLED', values: '`true` | `false`', default: 'false' },
  ]);
});

test('should exit 2 with a usage line when the CLI gets an unknown argument', () => {
  const r = spawnSync(process.execPath, [CHECK, '--nope'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).error, /usage/);
});

test('should keep a defaults e2e test for every skill with an ON flag when the check runs on this repo', () => {
  const r = spawnSync(process.execPath, [CHECK, '--root', ROOT], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.violations, []);
  assert.equal(r.status, 0);
  assert.deepEqual(Object.keys(out.skills).sort(), ['branch-summary', 'definition-of-done', 'dev-workflow', 'hooks', 'paired-agent-tdd', 'qa-sweep', 'retro', 'ticket-writer', 'verify', 'zero-trust-review']);
});

// ADR 0011 phase 3: the two dev-workflow mutation flags
test('should give the two WORKFLOW_MUTATION flags to dev-workflow when their owner is looked up (Flags happy)', () => {
  assert.equal(ownerOf('WORKFLOW_MUTATION_CHECK_ENABLED'), 'dev-workflow');
  assert.equal(ownerOf('WORKFLOW_MUTATION_SCORE_MIN'), 'dev-workflow');
});

test('should hold dev-workflow to a defaults e2e test for WORKFLOW_MUTATION_CHECK_ENABLED when the README lists the mutation flags (Flags happy, Flags edge)', () => {
  const rows = parseFlags(readFileSync(join(ROOT, 'README.md'), 'utf8'));
  const check = rows.find(f => f.name === 'WORKFLOW_MUTATION_CHECK_ENABLED');
  const min = rows.find(f => f.name === 'WORKFLOW_MUTATION_SCORE_MIN');
  assert.ok(check && min, `README Flags rows: ${rows.map(f => f.name).filter(n => n.startsWith('WORKFLOW_')).join(', ')}`);
  assert.equal(check.default, 'true');
  assert.equal(isOn(check), true, 'on by default, so it needs a flags: defaults e2e test');
  assert.equal(min.default, '100');
  assert.equal(isOn(min), false, 'a number flag is not an ON flag');
  const r = spawnSync(process.execPath, [CHECK, '--root', ROOT], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.ok(out.skills['dev-workflow'].flagsOn.includes('WORKFLOW_MUTATION_CHECK_ENABLED'), JSON.stringify(out.skills['dev-workflow']));
  assert.equal(out.skills['dev-workflow'].ok, true, JSON.stringify(out.skills['dev-workflow']));
});

test('should refuse a dev-workflow defaults file when its only test sets WORKFLOW_MUTATION_CHECK_ENABLED (Flags fail)', () => {
  const on = ['WORKFLOW_GUARD_ENABLED', 'WORKFLOW_MUTATION_CHECK_ENABLED'];
  const src = "// flags: defaults\nimport { test } from 'node:test';\nimport { spawnSync } from 'node:child_process';\ntest('should run when on', () => spawnSync('node', ['workflow.mjs'], { env: { WORKFLOW_MUTATION_CHECK_ENABLED: 'true' } }));\n";
  assert.match(analyzeFile(src, on).join(), /every top-level test block assigns one of/);
});
