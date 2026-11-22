// Keeps SKILL.md, the CLI, the hook and the repo docs in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = f => readFileSync(join(HERE, f), 'utf8');
const skill = read('SKILL.md');
const SKILL_MAX_LINES = 150;

test('should keep SKILL.md short with a quoted description when it changes', () => {
  assert.match(skill, /^---\nname: definition-of-done\ndescription: "[^"]+"\n---/);
  assert.ok(skill.split('\n').length < SKILL_MAX_LINES, `${skill.split('\n').length} lines`);
});

test('should name only dod.mjs subcommands that exist when SKILL.md shows a command', () => {
  const header = read('dod.mjs');
  const named = new Set([...skill.matchAll(/dod\.mjs"? ([a-z-]+)/g)].map(m => m[1]));
  for (const cmd of named) assert.match(header, new RegExp(`'${cmd}'`), cmd);
  for (const cmd of ['open', 'check', 'render', 'ticket-check', 'tools', 'export', 'adr', 'adr-check', 'adrs', 'approve', 'close']) assert.ok(skill.includes(cmd), cmd);
});

test('should link files that exist when SKILL.md links a relative path', () => {
  for (const [, link] of skill.matchAll(/\]\((\.\.?\/[^)#]+)\)/g)) assert.ok(existsSync(join(HERE, link)), link);
});

test('should list the skill and its guardrail when the repo docs describe them', () => {
  assert.match(readFileSync(join(ROOT, 'README.md'), 'utf8'), /\[`definition-of-done`\]\(skills\/definition-of-done\)/);
  const rules = readFileSync(join(ROOT, 'rules', 'README.md'), 'utf8');
  assert.match(rules, /hooks\/dod-guard\.mjs[^\n]*DOD_GUARD=1/);
  assert.match(rules, /hooks\/dod-adr-sync\.mjs[^\n]*DOD_ADR_TOUCHES_SYNC_ENABLED=false/);
  assert.match(rules, /pre-commit[^\n]*DOD_ADR_PRECOMMIT_HOOK_ENABLED=false/);
  assert.match(rules, /ask-dont-assume\.md[^\n]*definition-of-done/);
  assert.match(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'), /definition-of-done/);
});

test('should have an eval for each behavior the user cares most about when the evals change', () => {
  const evals = JSON.parse(read('evals.json')).flatMap(e => e.expected_behavior).join('\n');
  for (const re of [/unconfirmed/, /never runs approve/, /never creates a ticket/, /A, B, C/, /required sections|five required/, /questions\.md/, /adr-check/, /only the ADR/]) assert.match(evals, re);
});

test('should explain the ADR path when SKILL.md describes the grill and the hand-off', () => {
  for (const re of [/questions\.md/, /one pro and one con/, /touches/, /<run>\/dod\.json/, /DOD_ADR_PRECOMMIT_HOOK_ENABLED=false/, /dodFile/, /do not edit/i]) assert.match(skill, re, String(re));
});
