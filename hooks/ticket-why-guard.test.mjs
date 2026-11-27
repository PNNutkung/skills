// Tests for the ticket-why-guard hook. verdict() runs in-process; the e2e cases with the flag unset are in skills/ticket-writer/e2e.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verdict } from './ticket-why-guard.mjs';

const GOOD = '## Why\n\nCI is red.\n\n## Expected outcome\n\n| Metric | Today | Target |\n|---|---|---|\n| red runs | 3 | 0 |\n\n## If we do nothing\n\nMore reruns.\n\n## How we know\n\n5 CI runs.\n';
const ON = { TICKET_WHY_GUARD_ENABLED: 'true' };
const bash = (command, env = ON, cwd) => verdict({ tool_name: 'Bash', tool_input: { command }, cwd }, env);

test('should allow a create command when the body has the 4 sections (Guard)', () => {
  assert.equal(bash(`gh issue create -t t --body "${GOOD}"`), null);
  assert.equal(bash(`gh pr create --title t --body "$(cat <<'EOF'\n${GOOD}\nEOF\n)"`), null);
});

test('should deny a create command and name the missing sections when the body lacks them (Guard)', () => {
  const r = bash('gh issue create -t t --body "## Summary\nfix"');
  assert.match(r, /missing section "Why"/);
  assert.match(r, /template\.md/);
  assert.match(r, /TICKET_WHY_GUARD_ENABLED=false/);
  assert.match(bash('glab mr create -d "nothing"'), /pull request body/);
});

test('should read a body file relative to cwd and deny it when the file is missing (Guard)', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'twg-')));
  try {
    writeFileSync(join(dir, 'ok.md'), GOOD);
    writeFileSync(join(dir, 'bad.md'), 'just a line');
    assert.equal(bash('gh pr create -F ok.md', ON, dir), null);
    assert.match(bash('gh pr create -F bad.md', ON, dir), /missing section/);
    assert.match(bash('gh pr create -F nope.md', ON, dir), /does not exist/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('should deny with the --body-file fix when it cannot read the body (Guard)', () => {
  for (const c of ['gh pr create --fill', 'gh issue create -t t', 'gh pr create --body "$BODY"']) assert.match(bash(c), /cannot be checked.*--body-file/, c);
});

test('should let a command through when it creates no issue or pull request (Guard)', () => {
  for (const c of ['gh issue edit 3 --body x', 'gh pr view', 'git push', 'echo "gh issue create"']) assert.equal(bash(c), null, c);
});

test('should check the body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)', () => {
  const mcp = (name, input) => verdict({ tool_name: name, tool_input: input }, ON);
  assert.match(mcp('mcp__github__create_issue', { title: 't', body: 'x' }), /missing section/);
  assert.equal(mcp('mcp__github__create_pull_request', { body: GOOD }), null);
  assert.match(mcp('mcp__github__issue_write', { method: 'create', body: '' }), /missing section/);
  assert.equal(mcp('mcp__github__issue_write', { method: 'update', body: '' }), null);
  assert.equal(mcp('mcp__gitlab__create_merge_request', { description: GOOD }), null);
});

test('should let everything through when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)', () => {
  assert.equal(bash('gh issue create -t t --body x', { TICKET_WHY_GUARD_ENABLED: 'false' }), null);
});

test('should deny only create calls with the fix when TICKET_WHY_GUARD_ENABLED is not true or false (GuardFlag)', () => {
  const bad = { TICKET_WHY_GUARD_ENABLED: 'yes' };
  assert.match(bash(`gh issue create --body "${GOOD}"`, bad), /TICKET_WHY_GUARD_ENABLED=yes is not valid: use true or false/);
  assert.equal(bash('ls', bad), null);
});
