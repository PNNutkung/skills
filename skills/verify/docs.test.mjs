// Keeps SKILL.md, the CLI, evals and the repo docs in step with the verify skill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWNERS } from '../../rules/checks/flag-defaults-e2e.mjs';
import { FLAG } from './flags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = f => readFileSync(join(HERE, f), 'utf8');
const root = f => readFileSync(join(ROOT, f), 'utf8');
const skill = read('SKILL.md');
const SKILL_MAX_BYTES = 16000;
const CLI_COMMANDS = ['open', 'claims', 'plan', 'run', 'record', 'status', 'close'];
const STEP5_SENTENCE = 'Use the verify skill to run the items and write this file when it is installed; else write it by hand.';

test('should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)', () => {
  assert.match(skill, /^---\nname: verify\ndescription: "[^"]+"\n---/);
  assert.ok(Buffer.byteLength(skill) < SKILL_MAX_BYTES, `${Buffer.byteLength(skill)} bytes`);
  for (const h of ['## Paths', '## Progress checklist', '## Flags', '## Guard']) assert.ok(skill.includes(h), h);
});

test('should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)', () => {
  const src = read('verify.mjs');
  for (const [, cmd] of skill.matchAll(/verify\.mjs"? ([a-z-]+)/g)) assert.ok(CLI_COMMANDS.includes(cmd), cmd);
  for (const cmd of CLI_COMMANDS) {
    assert.ok(src.includes(`'${cmd}'`), `${cmd} in verify.mjs`);
    assert.match(skill, new RegExp(`verify\\.mjs"? ${cmd}`), `${cmd} documented`);
  }
});

test('should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)', () => {
  assert.match(skill, /never edit product code to make an item pass/i);
  assert.match(skill, /adds no tests/i);
  assert.match(skill, /ask the user before/i);
  for (const name of Object.values(FLAG)) assert.ok(skill.includes(name), name);
  assert.ok(!skill.includes('VERIFY_FLAG_RUNS_ENABLED=true'));
});

test('should link only files that exist when SKILL.md links a relative path (Docs edge)', () => {
  for (const [, link] of skill.matchAll(/\]\((\.\.?\/[^)#]+)\)/g)) assert.ok(existsSync(join(HERE, link)), link);
});

test('should import nothing outside its own folder when the skill code loads (Standalone)', () => {
  for (const f of readdirSync(HERE).filter(n => n.endsWith('.mjs') && !n.endsWith('.test.mjs'))) {
    for (const [, spec] of read(f).matchAll(/from '([^']+)'/g)) assert.ok(spec.startsWith('node:') || /^\.\/[\w-]+\.mjs$/.test(spec), `${f} imports ${spec}`);
  }
});

test('should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)', () => {
  const readme = root('README.md');
  assert.match(readme, /\| \[`verify`\]\(skills\/verify\) \|/);
  assert.match(readme, /--skill verify\b/);
  assert.match(readme, /\| `VERIFY_GUARD_ENABLED` \| `true` \\\| `false` \| `true` \|/);
  assert.match(readme, /\| `VERIFY_RUN_TIMEOUT_MAX` \| a whole number above 0 \\\| `unlimited` \| `unlimited` \|/);
  assert.doesNotMatch(readme, /VERIFY_FLAG_RUNS_ENABLED/);
});

test('should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)', () => {
  const dw = root('skills/dev-workflow/SKILL.md');
  const step5 = dw.slice(dw.indexOf('## 5. Verify and review'), dw.indexOf('## 6.'));
  assert.ok(step5.includes(STEP5_SENTENCE));
  assert.equal(OWNERS.VERIFY, 'verify');
});

test('should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)', () => {
  const plugin = JSON.parse(root('.claude-plugin/plugin.json'));
  const [major, minor] = plugin.version.split('.').map(Number);
  assert.ok(major > 2 || (major === 2 && minor >= 8), `verify shipped in 2.8.0; plugin is ${plugin.version}`);
  assert.match(plugin.description, /\bverify\b/);
  assert.match(JSON.parse(root('.claude-plugin/marketplace.json')).plugins[0].description, /\bverify\b/);
});

test('should keep evals for the main paths when evals.json lists them (Docs)', () => {
  const evals = JSON.parse(read('evals.json'));
  assert.ok(evals.length >= 3);
  for (const e of evals) { assert.deepEqual(e.skills, ['verify']); assert.ok(typeof e.query === 'string' && e.expected_behavior.length > 0); }
});
