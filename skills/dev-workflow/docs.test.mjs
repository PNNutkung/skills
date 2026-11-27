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

test('should keep SKILL.md short with the dev-workflow name and a quoted description when SKILL.md changes (Skill, Name)', () => {
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
    // a true|false flag defaults on; a number flag (WORKFLOW_MUTATION_SCORE_MIN) needs only its row
    if (name.endsWith('_ENABLED')) assert.match(readme, new RegExp(`\\| \`${name}\` \\| \`true\` \\\\\\| \`false\` \\| \`true\` \\|`), `${name} README row`);
    else assert.ok(readme.includes(`| \`${name}\` |`), `${name} README row`);
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
  const [major, minor] = plugin.version.split('.').map(Number);
  assert.ok(major > 2 || (major === 2 && minor >= 3), `dev-workflow shipped in 2.3.0; plugin is ${plugin.version}`);
  assert.match(plugin.description, /dev-workflow/);
  assert.match(JSON.parse(root('.claude-plugin/marketplace.json')).plugins[0].description, /dev-workflow/);
});

test('should keep evals for the main paths when evals.json lists them', () => {
  const evals = JSON.parse(read('evals.json'));
  assert.ok(evals.length >= 3);
  for (const e of evals) { assert.deepEqual(e.skills, ['dev-workflow']); assert.ok(e.expected_behavior.length > 0); }
});

test('should list a test tagged with the item when docs/verify/dev-workflow.md has a section for it (Verify)', () => {
  const doc = root('docs/verify/dev-workflow.md');
  const items = [...doc.matchAll(/^## (\w+)$/gm)].map(m => m[1]).filter(id => id !== 'Dogfood');
  assert.ok(items.length >= 18, String(items.length));
  for (const id of items) {
    const body = doc.slice(doc.indexOf(`## ${id}\n`) + id.length + 4).split(/^## /m)[0];
    const tagged = body.split('\n').filter(l => /^ok - should /.test(l) && new RegExp(`\\((?:[^()]*, )?${id}(?:, [^()]*)?\\)$`).test(l));
    assert.ok(tagged.length > 0, `${id}: no ok - should ... (${id}) line`);
  }
});

// ---------------------------------------------------------------- ADR 0011 phase 3
const section = (from, to) => skill.slice(skill.indexOf(from), skill.indexOf(to));

test('should tell the agent to write an Interface section with a diagram into the ADR when SKILL.md describes step 3 (Interface happy)', () => {
  const lock = section('## 3. Lock', '## 4. TDD');
  assert.ok(lock.length > 0);
  assert.match(lock, /`## Interface`/);
  assert.match(lock, /diagram/);
  assert.match(lock, /names, inputs, outputs(,)? (and )?errors/);
  assert.match(skill, /^- \[ \] 3 lock:.*Interface/m, 'the progress checklist line of step 3 names the Interface section');
});

test('should document next --test-cmd and the mutation gate when SKILL.md describes step 4 (WorkflowGate happy, WorkflowRuns happy)', () => {
  const tdd = section('## 4. TDD', '## 5. Verify and review');
  assert.match(tdd, /--test-cmd/);
  assert.match(tdd, /\{file\}/);
  assert.match(tdd, /mutation\.json/);
  assert.match(tdd, /mutation-equivalent\.json/);
  assert.match(tdd, /--ptdd-run/);
  assert.match(skill, /^- \[ \] 4 .*--test-cmd/m, 'the progress checklist line of step 4 gives the test command');
});

test('should document both mutation flags with their defaults in SKILL.md and the README Flags table when the flags exist (Flags happy)', () => {
  const readme = root('README.md');
  for (const name of ['WORKFLOW_MUTATION_CHECK_ENABLED', 'WORKFLOW_MUTATION_SCORE_MIN']) assert.ok(skill.includes(name), `${name} in SKILL.md`);
  assert.match(readme, /\| `WORKFLOW_MUTATION_CHECK_ENABLED` \| `true` \\\| `false` \| `true` \|/);
  assert.match(readme, /\| `WORKFLOW_MUTATION_SCORE_MIN` \| [^|]*0[^|]*100[^|]* \| `100` \|/);
});
