// Keeps SKILL.md, the CLIs, the hook and the repo docs in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG } from './flags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = f => readFileSync(join(HERE, f), 'utf8');
const root = f => readFileSync(join(ROOT, f), 'utf8');
const skill = read('SKILL.md');
const SKILL_MAX_LINES = 150;

test('should keep SKILL.md short with a quoted description when it changes', () => {
  assert.match(skill, /^---\nname: retro\ndescription: "[^"]+"\n---/);
  assert.ok(skill.split('\n').length < SKILL_MAX_LINES, `${skill.split('\n').length} lines`);
});

test('should name only subcommands that exist when SKILL.md shows a command', () => {
  for (const [file, cmds] of [['retro.mjs', ['collect', 'check', 'applied-check', 'log']], ['ratchet.mjs', ['check', 'add', 'accept', 'install']]]) {
    const src = read(file);
    for (const [, cmd] of skill.matchAll(new RegExp(`${file.replace('.', '\\.')}"? ([a-z-]+)`, 'g'))) assert.ok(cmds.includes(cmd) && src.includes(`'${cmd}'`), `${file} ${cmd}`);
    for (const cmd of cmds) assert.ok(skill.includes(`${file}" ${cmd}`), `${file} ${cmd} documented`);
  }
});

test('should link files that exist when SKILL.md links a relative path', () => {
  for (const [, link] of skill.matchAll(/\]\((\.\.?\/[^)#]+)\)/g)) assert.ok(existsSync(join(HERE, link)), link);
});

test('should list every category, the evidence kinds and the low-tier subagent when SKILL.md describes the review (CCats, CMatt, RSrc, EProof)', () => {
  for (const re of [/Automated checks/, /Coding standards/, /Mechanical/, /Judgment/, /Tool economy/, /Steering file size/, /Navigation/, /Information access/, /Test gaps and flaky/, /Speed and bugs/, /magic strings/, /`as` casts/, /intersection/, /too many comments/, /docs coverage/, /no-op/, /low-tier subagent/, /redacted/, /passed`, `not-passed`/, /no-evidence/, /word for word/]) assert.match(skill, re, String(re));
  for (const kind of ['file', 'transcript', 'commit', 'pr', 'ci', 'metric']) assert.match(skill, new RegExp(`\`${kind}\``), kind);
});

test('should document every flag in SKILL.md and the README Flags table when flags change (FFlags)', () => {
  const readme = root('README.md');
  for (const name of Object.values(FLAG)) {
    assert.match(skill, new RegExp(name), name);
    assert.match(readme, new RegExp(`\\| \`${name}\` \\|`), name);
  }
  assert.match(readme, /\| `RETRO_STEERING_BYTES_MAX` \| a whole number above 0 \\\| `unlimited` \| `8000` \|/);
});

test('should list the skill, its hook and guardrails when the repo docs describe them', () => {
  assert.match(root('README.md'), /\[`retro`\]\(skills\/retro\)/);
  const rules = root('rules/README.md');
  assert.match(rules, /\.ratchet\.json[^\n]*ratchet\.mjs[^\n]*RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED=false/);
  assert.match(rules, /applied-check[^\n]*always/);
  assert.match(rules, /retro\.mjs check[^\n]*always/);
  assert.match(rules, /ask-dont-assume\.md[^\n]*retro/);
  assert.match(rules, /untrusted-input\.md[^\n]*retro/);
  const plugin = JSON.parse(root('.claude-plugin/plugin.json'));
  assert.match(plugin.description, /retro/);
  const [major, minor] = plugin.version.split('.').map(Number);
  assert.ok(major > 2 || (major === 2 && minor >= 1), `retro shipped in 2.1.0; plugin is ${plugin.version}`);
  assert.match(root('hooks/hooks.json'), /retro-collect\.mjs/);
});

test('should install ESLint and ruff in every CI job when the workflow runs the suite (TLint)', () => {
  const wf = root('.github/workflows/test.yml');
  const jobs = wf.split(/\n  (?=[a-z]+:\n)/).filter(j => /node --test/.test(j));
  assert.ok(jobs.length >= 3);
  for (const j of jobs) { assert.match(j, /eslint/, j.slice(0, 40)); assert.match(j, /ruff/, j.slice(0, 40)); }
});

test('should have an eval for each behavior the user cares most about when the evals change', () => {
  const evals = JSON.parse(read('evals.json')).flatMap(e => e.expected_behavior).join('\n');
  for (const re of [/collect --pr/, /low-tier/, /ratchet rule/, /standards file/, /no-evidence/, /word for word/, /applied-check/, /never overwrites a hook/, /accept with a reason/]) assert.match(evals, re);
});
