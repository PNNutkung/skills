// Test helper, not part of the skill: a throwaway git repo with an ADR, a tiny CLI with one flag and a node test file.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const SLUG = 'demo';
export const DEMO_FLAG = 'DEMO_X_ENABLED';

const ADR = booked => `---
dod: ${SLUG}
---
# 1. Demo

## Definition of done

- [ ] AC1 (happy): the tool prints x (A1)
- [ ] Flag1 (happy, fail): ${DEMO_FLAG} turns x on and off (A2)

- feature flag: ${DEMO_FLAG}=true|false, default true (A2)
- verify env: ${booked}
`;

export const TOOL = `const v = String(process.env.${DEMO_FLAG} ?? '').trim().toLowerCase();
if (v && v !== 'true' && v !== 'false') { console.error('${DEMO_FLAG}=' + process.env.${DEMO_FLAG} + ' is not valid: use true or false'); process.exit(2); }
console.log('x=' + (v !== 'false'));
`;

const TOOL_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('should print x when the tool runs (AC1)', () => {
  assert.match(execFileSync(process.execPath, [new URL('./tool.mjs', import.meta.url).pathname], { encoding: 'utf8' }), /x=/);
});
`;

const write = (root, files) => { for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), t); } };

/** -> { base, repo, cache } with the repo committed on main. */
export function makeRepo({ booked = '[cloud] this container', files = {} } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'verify-fx-'));
  const repo = join(base, 'repo');
  mkdirSync(repo);
  write(repo, { 'docs/adr/0001-demo.md': ADR(booked), 'tool.mjs': TOOL, 'tool.test.mjs': TOOL_TEST, ...files });
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  return { base, repo, cache: join(base, 'cache') };
}

export const writeFiles = write;

/** A plan that covers the fixture ADR: a real node --test for AC1 and the three flag runs for Flag1. */
export const goodPlan = () => ({ items: [
  { id: 'AC1', env: 'cloud', run: 'node --test tool.test.mjs' },
  { id: 'Flag1', env: 'cloud', run: 'node tool.mjs', expect: '/^x=(true|false)$/m', flag: { name: DEMO_FLAG, default: 'true' } },
] });
