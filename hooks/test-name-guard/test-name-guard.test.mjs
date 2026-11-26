// End-to-end tests for test-name-guard.py, driven as a hook with stdin fixtures in throwaway git repos. Run: node --test hooks/test-name-guard
// Needs python3 and git. TEST_NAME_GUARD_MODE: warn (default) warns at `git commit` and denies `gh pr create` / `glab mr create`;
// deny blocks both; off turns the hook off.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'test-name-guard.py');
const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_GLOBAL: '/dev/null' };
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

/** A repo on branch `feature` off `main`, with tests/test_a.py holding `body` (staged, and committed when `commit` is true). */
// The base (main with one commit, then branch feature) is built once and copied into each repo (ADR 0008): fewer git processes, each repo still its own.
let base;
function repo(body, { commit = false } = {}) {
  if (!base) {
    base = mkdtempSync(join(tmpdir(), 'tng-base-'));
    made.push(base);
    git(base, 'init', '-q', '-b', 'main');
    writeFileSync(join(base, 'README.md'), 'x\n');
    git(base, 'add', '-A'); git(base, '-c', 'maintenance.auto=false', 'commit', '-qm', 'base');
    git(base, 'checkout', '-qb', 'feature');
  }
  const dir = mkdtempSync(join(tmpdir(), 'tng-'));
  made.push(dir);
  cpSync(base, dir, { recursive: true });
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests', 'test_a.py'), body);
  git(dir, 'add', '-A');
  if (commit) git(dir, '-c', 'maintenance.auto=false', 'commit', '-qm', 'tests');
  return dir;
}
const hook = (command, cwd, mode) => {
  const env = { ...process.env, ...GIT_ENV, TEST_NAME_GUARD_SCOPE: '' };
  delete env.TEST_NAME_GUARD_MODE;
  if (mode !== undefined) env.TEST_NAME_GUARD_MODE = mode;
  const r = spawnSync('python3', [GUARD], { input: JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } }), encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const BAD = 'def test_ac1_bad():\n    pass\n';
const GOOD = 'def test_should_pass_when_named():\n    pass\n';

test('should warn but not block a commit with a badly named test when the mode is the default', () => {
  const out = hook('git commit -m x', repo(BAD));
  assert.equal(out.permissionDecision, undefined);
  assert.match(out.additionalContext, /test_ac1_bad/);
  assert.match(out.additionalContext, /rename/i);
  assert.match(out.additionalContext, /pull request|merge request/i);
});

test('should block a commit with a badly named test when TEST_NAME_GUARD_MODE=deny', () => {
  const out = hook('git commit -m x', repo(BAD), 'deny');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /test_ac1_bad/);
});

test('should deny creating a change request when the branch adds a badly named test, in warn and deny modes', () => {
  for (const mode of [undefined, 'warn', 'deny', 'WARN', 'bogus']) {
    for (const cmd of ['gh pr create --title t', 'glab mr create -b main', 'cd . && gh pr create']) {
      const out = hook(cmd, repo(BAD, { commit: true }), mode);
      assert.equal(out?.permissionDecision, 'deny', `${mode} ${cmd}`);
      assert.match(out.permissionDecisionReason, /test_ac1_bad/);
    }
  }
});

test('should allow creating a change request when the badly named test was renamed in a later commit', () => {
  const dir = repo(BAD, { commit: true });
  writeFileSync(join(dir, 'tests', 'test_a.py'), GOOD);
  git(dir, 'commit', '-qam', 'rename');
  assert.equal(hook('gh pr create --title t', dir), null);
});

test('should stay quiet for good names, and for everything when the mode is off or the escape is used', () => {
  assert.equal(hook('git commit -m x', repo(GOOD)), null);
  assert.equal(hook('gh pr create', repo(GOOD, { commit: true })), null);
  assert.equal(hook('git commit -m x', repo(BAD), 'off'), null);
  assert.equal(hook('gh pr create', repo(BAD, { commit: true }), 'off'), null);
  assert.equal(hook('TEST_NAME_GUARD=off gh pr create', repo(BAD, { commit: true })), null);
  assert.equal(hook('TEST_NAME_GUARD=off git commit -m x', repo(BAD)), null);
});

test('should pass its own self-test', () => {
  const r = spawnSync('python3', [GUARD, '--self-test'], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
