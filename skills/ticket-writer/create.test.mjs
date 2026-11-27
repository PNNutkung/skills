import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCall, mcpCreate } from './create.mjs';

test('should find no create call when the command does not create an issue or a pull request', () => {
  for (const c of ['gh issue view 4', 'gh pr list', 'gh issue edit 4 --body-file x.md', 'glab mr merge 3', 'echo gh issue create', 'git commit -m "gh pr create"', 'ls'])
    assert.equal(createCall(c), null, c);
});

test('should read an inline body for gh issue create and gh pr create when --body or -b is given (Guard)', () => {
  assert.deepEqual(createCall('gh issue create --title t --body "## Why\nx"'), { prog: 'gh', kind: 'issue', body: '## Why\nx' });
  assert.deepEqual(createCall("gh pr create -t t -b 'hi'"), { prog: 'gh', kind: 'pr', body: 'hi' });
  assert.deepEqual(createCall('gh pr create --body=hello --draft'), { prog: 'gh', kind: 'pr', body: 'hello' });
});

test('should read a body file when --body-file or -F is given (Guard)', () => {
  assert.deepEqual(createCall('gh issue create -t t --body-file /tmp/b.md'), { prog: 'gh', kind: 'issue', bodyFile: '/tmp/b.md' });
  assert.deepEqual(createCall('cd x && gh pr create -F body.md -R o/r'), { prog: 'gh', kind: 'pr', bodyFile: 'body.md' });
});

test('should read the heredoc when the body is $(cat <<EOF ...) or the body file is stdin (Guard)', () => {
  const sub = `gh pr create --title t --body "$(cat <<'EOF'\n## Why\n\nreason\nEOF\n)"`;
  assert.deepEqual(createCall(sub), { prog: 'gh', kind: 'pr', body: '## Why\n\nreason' });
  const stdin = `gh issue create -t t --body-file - <<'EOF'\n## Why\nline\nEOF`;
  assert.deepEqual(createCall(stdin), { prog: 'gh', kind: 'issue', body: '## Why\nline' });
});

test('should read the description when glab issue create or glab mr create gets it inline or from $(cat file) (Guard)', () => {
  assert.deepEqual(createCall('glab issue create -t t -d "text"'), { prog: 'glab', kind: 'issue', body: 'text' });
  assert.deepEqual(createCall('glab mr create --description "$(cat body.md)"'), { prog: 'glab', kind: 'pr', bodyFile: 'body.md' });
  assert.deepEqual(createCall('glab mr create --description="$(< body.md)"'), { prog: 'glab', kind: 'pr', bodyFile: 'body.md' });
});

test('should mark the body unreadable when it comes from the editor, --fill, --web, a template or a variable (Guard)', () => {
  for (const c of ['gh issue create -t t', 'gh pr create --fill', 'gh pr create -w', 'gh issue create --template bug.md', 'gh pr create --body "$BODY"', 'glab mr create --fill', 'gh pr create -F -'])
    assert.ok(createCall(c)?.unreadable, c);
});

test('should find the create call when it sits inside sh -c or after env prefixes (Guard)', () => {
  assert.equal(createCall('GH_TOKEN=x gh issue create -b y')?.body, 'y');
  assert.equal(createCall(`bash -c "gh pr create -b z"`)?.body, 'z');
});

test('should return the kind and body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)', () => {
  assert.deepEqual(mcpCreate('mcp__github__create_issue', { title: 't', body: 'b' }), { kind: 'issue', body: 'b' });
  assert.deepEqual(mcpCreate('mcp__github__issue_write', { method: 'create', body: 'b' }), { kind: 'issue', body: 'b' });
  assert.deepEqual(mcpCreate('mcp__github__create_pull_request', { body: 'p' }), { kind: 'pr', body: 'p' });
  assert.deepEqual(mcpCreate('mcp__gitlab__create_merge_request', { description: 'd' }), { kind: 'pr', body: 'd' });
  assert.deepEqual(mcpCreate('mcp__github__create_issue', { title: 't' }), { kind: 'issue', body: '' });
});

test('should return null when an MCP tool does not create an issue or pull request (GuardMcp)', () => {
  assert.equal(mcpCreate('mcp__github__issue_write', { method: 'update', body: 'b' }), null);
  assert.equal(mcpCreate('mcp__github__get_issue', { issue_number: 1 }), null);
  assert.equal(mcpCreate('mcp__slack__create_message', { body: 'b' }), null);
  assert.equal(mcpCreate('mcp__github__add_issue_comment', { body: 'b' }), null);
  assert.equal(mcpCreate('Bash', {}), null);
});
