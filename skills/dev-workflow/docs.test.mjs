// Keeps SKILL.md, the CLI, the hook registration and the repo docs in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG } from './flags.mjs';
import { NEVER_SKIP, STEPS } from './steps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = f => readFileSync(join(HERE, f), 'utf8');
const root = f => readFileSync(join(ROOT, f), 'utf8');
const skill = read('SKILL.md');
const SKILL_MAX_LINES = 150;
const CLI_COMMANDS = ['open', 'status', 'next', 'skip', 'tick', 'close'];

test('should keep SKILL.md short with the dev-workflow name and a quoted description (Skill, Name)', () => {
  assert.match(skill, /^---\nname: dev-workflow\ndescription: "[^"]+"\n---/);
  assert.ok(skill.split('\n').length < SKILL_MAX_LINES, `${skill.split('\n').length} lines`);
});

test('should document every CLI command and name only commands that exist when SKILL.md shows one', () => {
  const src = read('workflow.mjs');
  for (const [, cmd] of skill.matchAll(/workflow\.mjs"? ([a-z-]+)/g)) assert.ok(CLI_COMMANDS.includes(cmd), cmd);
  for (const cmd of CLI_COMMANDS) {
    assert.ok(src.includes(`'${cmd}'`), `${cmd} in workflow.mjs`);
    assert.ok(new RegExp(`workflow\\.mjs"? ${cmd}|\`${cmd}\``).test(skill), `${cmd} documented`);
  }
});

test('should describe the steps in order with the never-skipped ones when SKILL.md lists them (Order, ShortPath)', () => {
  const at = ['## 0. Intake', '## 1. Definition of done', '## 2. Concept board', '## 3. Lock', '## 4. TDD', '## 5. Verify and review', '## 6. Retro, then merge'].map(h => skill.indexOf(h));
  assert.ok(at.every(i => i > 0), String(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.equal(STEPS.length, 8);
  assert.match(skill, /DoD, verify and retro are never skipped/);
  assert.deepEqual(NEVER_SKIP, ['dod', 'verify', 'retro']);
});

test('should name the subagent for each kind of work when SKILL.md says who does what (Subagents)', () => {
  for (const re of [/low-tier, read-only/, /concept board page \| one subagent/, /TDD \| `paired-agent-tdd`/, /`zero-trust-review` in a new session, never the author/, /retro\.mjs collect/, /Judgment and every question to the user stay in this session/]) assert.match(skill, re, String(re));
});

test('should require a mermaid diagram when it fits and two or more variants when SKILL.md describes the board (Board, Variants)', () => {
  assert.match(skill, /mermaid diagram when the content can be drawn/);
  assert.match(skill, /At least two variants, each with a pro and a con, one recommended/);
});

test('should link files that exist when SKILL.md links a relative path', () => {
  for (const [, link] of skill.matchAll(/\]\((\.\.?\/[^)#]+)\)/g)) assert.ok(existsSync(join(HERE, link)), link);
});

test('should document the flag in SKILL.md, the README Flags table and rules/README when flags change', () => {
  const readme = root('README.md');
  for (const name of Object.values(FLAG)) {
    assert.ok(skill.includes(name), `${name} in SKILL.md`);
    assert.match(readme, new RegExp(`\\| \`${name}\` \\| \`true\` \\\\\\| \`false\` \\| \`false\` \\|`), `${name} README row`);
    assert.ok(root('rules/README.md').includes(name), `${name} in rules/README.md`);
  }
});

test('should register the hook and list the skill when the plugin ships it (Skill)', () => {
  const hooks = JSON.parse(root('hooks/hooks.json'));
  const pre = hooks.hooks.PreToolUse.flatMap(m => m.hooks.map(h => ({ matcher: m.matcher, command: h.command })));
  const mine = pre.find(h => h.command.includes('hooks/workflow-guard.mjs'));
  assert.ok(mine, 'workflow-guard registered');
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash']) assert.ok(mine.matcher.split('|').includes(tool), tool);
  assert.match(root('README.md'), /\[`dev-workflow`\]\(skills\/dev-workflow\)/);
  assert.match(root('README.md'), /--skill dev-workflow/);
  const plugin = JSON.parse(root('.claude-plugin/plugin.json'));
  assert.equal(plugin.version, '2.3.0');
  assert.match(plugin.description, /dev-workflow/);
  assert.match(JSON.parse(root('.claude-plugin/marketplace.json')).plugins[0].description, /dev-workflow/);
});

test('should keep evals for the main paths when evals.json lists them', () => {
  const evals = JSON.parse(read('evals.json'));
  assert.ok(evals.length >= 3);
  for (const e of evals) { assert.deepEqual(e.skills, ['dev-workflow']); assert.ok(e.expected_behavior.length > 0); }
});
