// End to end: the hook and the CLI run as processes, the way Claude Code and an agent start them.
// flags: defaults -- the first tests set no ticket-writer flag, so they run with TICKET_WHY_GUARD_ENABLED unset (rules/flag-defaults-e2e.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, '..', '..', 'hooks', 'ticket-why-guard.mjs');
const CLI = join(HERE, 'ticket.mjs');
const GOOD = '## Why\n\nCI is red.\n\n## Expected outcome\n\n| Metric | Today | Target |\n|---|---|---|\n| red runs | 3 | 0 |\n\n## If we do nothing\n\nMore reruns.\n\n## How we know\n\n5 CI runs.\n';
const clean = () => { const e = { ...process.env }; for (const k of Object.keys(e)) if (k.startsWith('TICKET_')) delete e[k]; return e; };
const hook = (payload, env = clean()) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), env, encoding: 'utf8' });

test('should deny gh issue create without the 4 sections when the flag is unset (Guard)', () => {
  const r = hook({ tool_name: 'Bash', tool_input: { command: 'gh issue create -t t -b "fix it"' }, cwd: HERE });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /missing section "Why"/);
});

test('should allow gh pr create with a body file that passes issue-check when the flag is unset (Guard)', () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'twe-')));
  try {
    writeFileSync(join(d, 'body.md'), GOOD);
    const check = spawnSync(process.execPath, [CLI, 'issue-check', '--body', 'body.md'], { cwd: d, env: clean(), encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout);
    const r = hook({ tool_name: 'Bash', tool_input: { command: 'gh pr create -t t --body-file body.md' }, cwd: d });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('should stay silent when the tool is not guarded or stdin is not JSON (fail open)', () => {
  assert.equal(hook({ tool_name: 'Edit', tool_input: { file_path: 'x' } }).stdout, '');
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', env: clean(), encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('should allow the call when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)', () => {
  const r = hook({ tool_name: 'Bash', tool_input: { command: 'gh issue create -b x' } }, { ...clean(), TICKET_WHY_GUARD_ENABLED: 'false' });
  assert.equal(r.stdout, '');
});
