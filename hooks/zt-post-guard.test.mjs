// Tests for the zero-trust-review post guard (opt-in with ZT_POST_GUARD=1). Run: node --test hooks/zt-post-guard.test.mjs
// postVerdict is tested directly; the wiring is tested through zt-guard.mjs as a child process with a private TMPDIR and ZT_MARKER_DIR,
// so a real marker on this host never takes part.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POST_GUARD_ENV, postApproved, postVerdict } from './zt-post-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'zt-guard.mjs');
const NOTE = join(dirname(HERE), 'skills', 'zero-trust-review', 'note.mjs');

const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));
function fixture({ approved = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'zt-post-'));
  made.push(tmp);
  const md = join(tmp, 'marker'), run = join(tmp, 'run-1');
  for (const d of [md, run]) { mkdirSync(d, { recursive: true }); chmodSync(d, 0o700); }
  writeFileSync(join(md, '.active'), `${run}\n`, { mode: 0o600 });
  if (approved) writeFileSync(join(run, '.post-ok'), 'approved\n', { mode: 0o600 });
  return { tmp, md, run };
}

const POSTS = [
  'gh pr comment 12 --body "blocker: x"',
  'gh pr review 12 --request-changes -b "x"',
  'gh pr review --approve',
  'gh issue comment 12 -b x',
  'gh api repos/o/r/pulls/12/comments -f body=x -f path=a.py -F line=3',
  'gh api -X POST repos/o/r/issues/12/comments --input body.json',
  'gh api --method PATCH repos/o/r/pulls/comments/9 -f body=y',
  'gh api repos/o/r/pulls/12/reviews -f event=COMMENT',
  "gh api graphql -f query='mutation { addPullRequestReview(input: {}) { clientMutationId } }'",
  'glab mr note 7 -m "x"',
  'glab mr comment 7 -m x',
  'glab mr approve 7',
  'glab api -X POST projects/1/merge_requests/7/discussions -f body=x',
  'glab api projects/1/merge_requests/7/notes -f body=x',
  'cd /work/repo && gh pr comment 12 -b x',
  'GH_TOKEN=x gh pr comment 12 -b x',
  'env GH_HOST=h /usr/bin/gh pr comment 12 -b x',
  'true; gh pr review 12 -c -b x',
];
const READS = [
  'gh pr view 12 --json title,body', 'gh pr diff 12', 'gh api repos/o/r/pulls/12/comments', 'gh api -X GET repos/o/r/pulls/12/reviews',
  "gh api graphql -f query='query { viewer { login } }'", 'glab mr view 7 --output json', 'glab api projects/1/merge_requests/7/notes',
  'gh api repos/o/r/pulls/12 -q .head.sha', 'git log -1', 'echo "gh pr comment 12"', 'grep -r "gh pr review" docs',
];

test('should deny every posting command when posting is not approved', () => {
  const { run } = fixture();
  for (const c of POSTS) assert.match(postVerdict(c, { run }) ?? 'allowed', /would post to the review host/, c);
});

test('should allow reads and unrelated commands when posting is not approved', () => {
  const { run } = fixture();
  for (const c of READS) assert.equal(postVerdict(c, { run }), null, c);
});

test('should allow posting when the user approved it with note.mjs allow-post', () => {
  const { run } = fixture({ approved: true });
  for (const c of POSTS) assert.equal(postVerdict(c, { run }), null, c);
});

test('should deny note.mjs allow-post when the agent runs it, approved or not', () => {
  for (const approved of [false, true]) {
    const { run } = fixture({ approved });
    for (const c of [`node ${NOTE} allow-post`, 'node ~/.claude/skills/zero-trust-review/note.mjs allow-post', `cd /x && node "${NOTE}" allow-post`]) {
      assert.match(postVerdict(c, { run }) ?? 'allowed', /only the user approves posting/, c);
    }
  }
});

test('should name the approve command and the reason when it denies', () => {
  const { run } = fixture();
  const why = postVerdict('gh pr comment 1 -b x', { run });
  assert.match(why, /gh pr comment/);
  assert.match(why, /note\.mjs allow-post/);
  assert.match(why, /Ask the user/);
});

test('should not count a symlinked or group-writable approval file when it checks approval', () => {
  const a = fixture(), b = fixture();
  symlinkSync(join(fixture({ approved: true }).run, '.post-ok'), join(a.run, '.post-ok'));
  writeFileSync(join(b.run, '.post-ok'), 'x\n');
  chmodSync(join(b.run, '.post-ok'), 0o666);
  assert.equal(postApproved(a.run), false);
  assert.equal(postApproved(b.run), false);
});

// fuzz: random wrappers, spacing and separators around a posting command never slip past, and never break the parse of a read
test('should deny posting commands when they are wrapped in random prefixes, spacing and separators', () => {
  const { run } = fixture();
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const pre = ['', 'A=1 ', 'env ', 'command ', 'time ', 'nohup ', 'git status && ', 'ls; ', 'echo hi | '];
  const gap = [' ', '  ', '\t'];
  for (let i = 0; i < 300; i++) {
    const words = POSTS[rnd(POSTS.length)].split(' ');
    const cmd = pre[rnd(pre.length)] + words.join(gap[rnd(gap.length)]);
    assert.match(postVerdict(cmd, { run }) ?? 'allowed', /would post|only the user/, JSON.stringify(cmd));
    const read = pre[rnd(pre.length)] + READS[rnd(READS.length)];
    assert.equal(postVerdict(read, { run }), null, JSON.stringify(read));
  }
});

// ---------- wiring through zt-guard.mjs ----------
const lead = (command, fx, env = {}) => spawnSync(process.execPath, [GUARD], {
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: '/work/repo', tool_input: { command } }),
  env: { ...process.env, TMPDIR: fx.tmp, ZT_MARKER_DIR: fx.md, [POST_GUARD_ENV]: '', ...env }, encoding: 'utf8',
});
const decision = r => { assert.equal(r.status, 0, r.stderr); return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow'; };

test('should deny a lead-session post when ZT_POST_GUARD=1 and a review run is active', () => {
  assert.equal(decision(lead('gh pr comment 1 -b x', fixture(), { [POST_GUARD_ENV]: '1' })), 'deny');
});

test('should allow a lead-session post when the flag is off, so current installs keep their behavior', () => {
  assert.equal(decision(lead('gh pr comment 1 -b x', fixture())), 'allow');
  assert.equal(decision(lead('gh pr comment 1 -b x', fixture(), { [POST_GUARD_ENV]: '0' })), 'allow');
});

test('should allow a lead-session post when no review run is active', () => {
  const fx = fixture();
  rmSync(join(fx.md, '.active'));
  assert.equal(decision(lead('gh pr comment 1 -b x', fx, { [POST_GUARD_ENV]: '1' })), 'allow');
});

test('should allow a lead-session post when the user approved posting', () => {
  assert.equal(decision(lead('gh pr comment 1 -b x', fixture({ approved: true }), { [POST_GUARD_ENV]: '1' })), 'allow');
});

test('should write the approval file when the user runs note.mjs allow-post, and refuse with no active run', () => {
  const fx = fixture();
  const env = { PATH: process.env.PATH, TMPDIR: fx.tmp, ZT_MARKER_DIR: fx.md };
  const r = spawnSync(process.execPath, [NOTE, 'allow-post'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(postApproved(fx.run), true);
  rmSync(join(fx.md, '.active'));
  assert.equal(spawnSync(process.execPath, [NOTE, 'allow-post'], { env, encoding: 'utf8' }).status, 3);
});

test('should deny a review subagent running note.mjs allow-post, so only the user approves posting', () => {
  const fx = fixture();
  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', cwd: '/work/repo', tool_input: { command: `node ${NOTE} allow-post` } }),
    env: { ...process.env, TMPDIR: fx.tmp, ZT_MARKER_DIR: fx.md }, encoding: 'utf8',
  });
  assert.equal(decision(r), 'deny');
});
