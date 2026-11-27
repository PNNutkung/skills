// Keeps SKILL.md, the CLI, the hook registration and the repo docs in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG } from './flags.mjs';
import { HEADINGS } from './why.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const SKILL = readFileSync(join(HERE, 'SKILL.md'), 'utf8');

test('should name every section heading and the flag in SKILL.md when the docs are read (SkillDocs)', () => {
  for (const h of Object.values(HEADINGS.en)) assert.ok(SKILL.includes(`**${h}**`), h);
  assert.match(SKILL, new RegExp(FLAG.guard));
  assert.ok(Buffer.byteLength(SKILL) <= 8000, `SKILL.md is ${Buffer.byteLength(SKILL)} bytes`);
});

test('should register the hook for Bash and MCP tools when hooks.json is read (Guard)', () => {
  const pre = JSON.parse(read('hooks/hooks.json')).hooks.PreToolUse;
  const entry = pre.find(e => e.hooks.some(h => h.command.includes('ticket-why-guard.mjs')));
  assert.ok(entry);
  assert.equal(entry.matcher, 'Bash|mcp__.*');
  assert.ok(existsSync(join(ROOT, 'hooks', 'ticket-why-guard.mjs')));
});

test('should list the flag and the guard when README.md and rules/README.md are read (Docs)', () => {
  assert.match(read('README.md'), new RegExp(`\\| \`${FLAG.guard}\` \\|`));
  assert.match(read('rules/README.md'), /ticket-why-guard\.mjs/);
});

test('should keep evals for the skill when evals.json is read', () => {
  const evals = JSON.parse(readFileSync(join(HERE, 'evals.json'), 'utf8'));
  assert.ok(evals.length >= 3 && evals.every(e => e.skills.includes('ticket-writer')));
});
