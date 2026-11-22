// Tests for the self-review guard (opt-in with ZT_SELF_REVIEW_GUARD_ENABLED=true): zt-authors.mjs records who edited which file, and zt-guard.mjs
// denies a review verdict (gh pr review, glab mr approve) from the session or agent that wrote any file the branch changes.
// Run: node --test hooks/zt-self-review.test.mjs. Each test uses a throwaway git repo and a private ZT_MARKER_DIR.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELF_REVIEW_ENV, isReviewVerdict } from './zt-self-review.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'zt-guard.mjs'), AUTHORS = join(HERE, 'zt-authors.mjs');
const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_GLOBAL: '/dev/null' };
const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

/** A repo on branch feature (off main) that changes src/a.py; untouched.py exists on main only. */
function fixture() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'zt-self-')));
  made.push(tmp);
  const repo = join(tmp, 'repo'), md = join(tmp, 'marker');
  mkdirSync(join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'src', 'a.py'), 'a = 1\n');
  writeFileSync(join(repo, 'untouched.py'), 'u = 1\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  git(repo, 'checkout', '-qb', 'feature');
  writeFileSync(join(repo, 'src', 'a.py'), 'a = 2\n');
  git(repo, 'commit', '-qam', 'change');
  return { tmp, repo, md };
}
const env = (fx, flag = 'true', extra = {}) => ({ ...process.env, ...GIT_ENV, ZT_MARKER_DIR: fx.md, TMPDIR: fx.tmp, ZT_POST_GUARD: '', ZT_POST_GUARD_ENABLED: '', ZT_SELF_REVIEW_GUARD: '', [SELF_REVIEW_ENV]: flag, ...extra });
const record = (fx, file, { session = 's1', agent, tool = 'Edit', flag } = {}) => {
  const input = { hook_event_name: 'PostToolUse', tool_name: tool, session_id: session, ...(agent && { agent_id: agent }), cwd: fx.repo, tool_input: { file_path: join(fx.repo, file) } };
  const r = spawnSync(process.execPath, [AUTHORS], { input: JSON.stringify(input), encoding: 'utf8', env: env(fx, flag) });
  assert.deepEqual([r.status, r.stdout], [0, ''], r.stderr);
};
const review = (fx, command, { session = 's1', agent, flag } = {}) => {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session, ...(agent && { agent_id: agent }), cwd: fx.repo, tool_input: { command } };
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(input), encoding: 'utf8', env: env(fx, flag) });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
};

test('should recognise review verdict commands and nothing else', () => {
  for (const c of ['gh pr review 3 --approve', 'gh pr review --request-changes -b x', 'gh pr review 3 -c -b "ok"', 'glab mr approve 7', 'cd x && gh pr review', 'GH_TOKEN=t gh pr review 1 -a']) {
    assert.equal(isReviewVerdict(c), true, c);
  }
  for (const c of ['gh pr view 3', 'gh pr comment 3 -b x', 'glab mr view 7', 'echo "gh pr review"', 'git log', 'gh pr create']) assert.equal(isReviewVerdict(c), false, c);
});

test('should deny a review verdict from the session that edited a file the branch changes', () => {
  const fx = fixture();
  record(fx, 'src/a.py');
  const out = review(fx, 'gh pr review 3 --approve');
  assert.equal(out?.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /src\/a\.py/);
  assert.match(out.permissionDecisionReason, /never reviews its own code/);
});

test('should allow a review verdict from another session, or from a fresh subagent of the authoring session', () => {
  const fx = fixture();
  record(fx, 'src/a.py');
  assert.equal(review(fx, 'gh pr review 3 --approve', { session: 's2' }), null);
  assert.equal(review(fx, 'glab mr approve 3', { agent: 'fresh-reviewer' }), null, 'Nut: a fresh subagent with a clean context is not the author');
});

test('should deny a subagent that edited a changed file, but not its parent session', () => {
  const fx = fixture();
  record(fx, 'src/a.py', { agent: 'driver-1' });
  assert.equal(review(fx, 'gh pr review 3 -a', { agent: 'driver-1' })?.permissionDecision, 'deny');
  assert.equal(review(fx, 'gh pr review 3 -a'), null);
});

test('should allow a review verdict when the session edited only files the branch does not change', () => {
  const fx = fixture();
  record(fx, 'untouched.py');
  record(fx, '../outside.txt');
  assert.equal(review(fx, 'gh pr review 3 --approve'), null);
});

test('should count uncommitted edits of the working tree as part of the change', () => {
  const fx = fixture();
  writeFileSync(join(fx.repo, 'untouched.py'), 'u = 2\n');
  record(fx, 'untouched.py');
  assert.equal(review(fx, 'gh pr review 3 --approve')?.permissionDecision, 'deny');
});

test('should record nothing and deny nothing when ZT_SELF_REVIEW_GUARD_ENABLED is unset or false', () => {
  const fx = fixture();
  record(fx, 'src/a.py', { flag: '' });
  assert.equal(existsSync(join(fx.md, 'authors.jsonl')), false);
  record(fx, 'src/a.py');
  assert.equal(review(fx, 'gh pr review 3 --approve', { flag: 'false' }), null);
});

test('should stop, naming the fix, when ZT_SELF_REVIEW_GUARD_ENABLED is not true or false or the old ZT_SELF_REVIEW_GUARD is set', () => {
  const fx = fixture();
  for (const [flag, extra, re] of [['1', {}, /ZT_SELF_REVIEW_GUARD_ENABLED=1 is not valid: use true or false/], ['', { ZT_SELF_REVIEW_GUARD: '1' }, /ZT_SELF_REVIEW_GUARD was renamed: use ZT_SELF_REVIEW_GUARD_ENABLED=true/]]) {
    const g = spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 's1', cwd: fx.repo, tool_input: { command: 'ls' } }), encoding: 'utf8', env: env(fx, flag, extra) });
    assert.equal(g.status, 0, g.stderr);
    const h = JSON.parse(g.stdout).hookSpecificOutput;
    assert.equal(h.permissionDecision, 'deny');
    assert.match(h.permissionDecisionReason, re);
    const a = spawnSync(process.execPath, [AUTHORS], { input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 's1', cwd: fx.repo, tool_input: { file_path: join(fx.repo, 'src/a.py') } }), encoding: 'utf8', env: env(fx, flag, extra) });
    assert.equal(a.status, 0, a.stderr);
    assert.equal(JSON.parse(a.stdout).decision, 'block');
    assert.match(JSON.parse(a.stdout).reason, re);
  }
});

test('should keep the authors ledger private: 0600 in a 0700 dir', () => {
  const fx = fixture();
  record(fx, 'src/a.py');
  assert.equal(statSync(join(fx.md, 'authors.jsonl')).mode & 0o777, 0o600);
  assert.equal(statSync(fx.md).mode & 0o777, 0o700);
  const row = JSON.parse(readFileSync(join(fx.md, 'authors.jsonl'), 'utf8').trim());
  assert.deepEqual([row.s, row.a, row.f], ['s1', '', join(fx.repo, 'src', 'a.py')]);
});

test('should ignore an authors ledger that others can write', () => {
  const fx = fixture();
  record(fx, 'src/a.py');
  chmodSync(join(fx.md, 'authors.jsonl'), 0o666);
  assert.equal(review(fx, 'gh pr review 3 --approve'), null);
});
