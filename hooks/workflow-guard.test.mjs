// Tests for the workflow-guard hook. verdict() runs in-process; a few cases spawn the hook to cover stdin, flags and the JSON output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCommand, verdict, writeTargets } from './workflow-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'workflow-guard.mjs');
const { writeState, runDir, currentBranch } = await import(join(HERE, '..', 'skills', 'dev-workflow', 'io.mjs'));

function fixture(step = 'intake') {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wg-')));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'feat/x', repo]);
  const env = { XDG_CACHE_HOME: join(base, 'cache'), WORKFLOW_GUARD_ENABLED: 'true' };
  if (step) writeState(runDir(env, repo, 'demo'), { slug: 'demo', repo, branch: currentBranch(repo), step, skipped: {} });
  return { base, repo, env, done: () => rmSync(base, { recursive: true, force: true }) };
}
const edit = (fx, p) => verdict({ tool_name: 'Edit', tool_input: { file_path: p }, cwd: fx.repo }, fx.env);
const bash = (fx, command) => verdict({ tool_name: 'Bash', tool_input: { command }, cwd: fx.repo }, fx.env);

test('should deny a product-code edit and allow docs and outside files when the design is not locked (GuardEdit)', () => {
  for (const step of ['intake', 'dod', 'board', 'lock']) {
    const fx = fixture(step);
    try {
      assert.match(edit(fx, join(fx.repo, 'src', 'app.js')), /design is not locked/, step);
      assert.match(edit(fx, 'src/new.js'), /design is not locked/, `${step} relative path`);
      assert.equal(edit(fx, join(fx.repo, 'docs', 'adr', '0001-demo.md')), null);
      assert.equal(edit(fx, join(fx.base, 'elsewhere.txt')), null);
    } finally { fx.done(); }
  }
});

test('should allow product-code edits when the run is at tdd or later (GuardEdit)', () => {
  for (const step of ['tdd', 'verify', 'retro', 'done']) {
    const fx = fixture(step);
    try { assert.equal(edit(fx, join(fx.repo, 'src', 'app.js')), null, step); } finally { fx.done(); }
  }
});

test('should deny a Bash write into product code when the design is not locked and allow it after (GuardEdit)', () => {
  const fx = fixture('board');
  try {
    assert.match(bash(fx, 'echo x > src/app.js'), /design is not locked/);
    assert.match(bash(fx, "sed -i 's/a/b/' src/app.js"), /design is not locked/);
    assert.match(bash(fx, 'cat a | tee src/b.js'), /design is not locked/);
    assert.equal(bash(fx, 'echo x > docs/verify/demo.md'), null);
    assert.equal(bash(fx, 'echo x > /dev/null && node --test'), null);
  } finally { fx.done(); }
});

test('should deny gh pr merge and glab mr merge when verify or retro is not done (GuardMerge)', () => {
  for (const step of ['tdd', 'verify', 'retro']) {
    const fx = fixture(step);
    try {
      assert.match(bash(fx, 'gh pr merge 12 --squash'), /merge waits for verify and retro/, step);
      assert.match(bash(fx, 'GH_TOKEN=x gh pr merge'), /merge waits/);
      assert.match(bash(fx, 'git status && glab mr merge 3'), /merge waits/);
      assert.equal(bash(fx, 'gh pr view 12'), null);
      assert.equal(bash(fx, 'echo "gh pr merge"'), null, 'quoted text is data');
    } finally { fx.done(); }
  }
  const fx = fixture('done');
  try { assert.equal(bash(fx, 'gh pr merge 12'), null); } finally { fx.done(); }
});

test('should block nothing when no workflow is open on this branch (GuardIdle)', () => {
  const fx = fixture(null);
  try {
    assert.equal(edit(fx, join(fx.repo, 'src', 'app.js')), null);
    assert.equal(bash(fx, 'gh pr merge 1'), null);
    writeState(runDir(fx.env, fx.repo, 'other'), { slug: 'other', repo: fx.repo, branch: 'another-branch', step: 'intake', skipped: {} });
    assert.equal(bash(fx, 'gh pr merge 1'), null, 'a run on another branch');
    writeState(runDir(fx.env, fx.repo, 'closed'), { slug: 'closed', repo: fx.repo, branch: 'feat/x', step: 'intake', skipped: {}, closed: 'now' });
    assert.equal(edit(fx, join(fx.repo, 'src', 'app.js')), null, 'a closed run');
    assert.equal(verdict({ tool_name: 'Edit', tool_input: { file_path: '/x' }, cwd: fx.base }, fx.env), null, 'outside a repo');
  } finally { fx.done(); }
});

test('should find merges and write targets only in real commands when parsing Bash', () => {
  assert.equal(mergeCommand('gh pr merge'), 'gh pr merge');
  assert.equal(mergeCommand('sudo glab mr merge 1'), 'glab mr merge');
  assert.equal(mergeCommand('gh pr list'), null);
  assert.equal(mergeCommand("git commit -m 'gh pr merge'"), null);
  assert.deepEqual(writeTargets('a > b; c >> "d e" | tee f g; sed -i s/x/y/ h; echo 2>&1'), ['b', 'd e', 'f', 'g', 'h']);
});

test('should catch merges behind -R, --repo and sh -c when the command hides them (GuardMerge)', () => {
  assert.equal(mergeCommand('gh -R o/r pr merge 1'), 'gh pr merge');
  assert.equal(mergeCommand('gh --repo o/r pr merge 1'), 'gh pr merge');
  assert.equal(mergeCommand("bash -c 'gh pr merge 1'"), 'gh pr merge');
  assert.equal(mergeCommand('glab -R g/p mr merge 2'), 'glab mr merge');
});

test('should treat heredoc bodies as data and see unspaced, cp and touch writes when parsing Bash (GuardEdit)', () => {
  assert.deepEqual(writeTargets("cat > /tmp/run/facts.md <<'EOF'\n> src/a.js:1 is the entry\nif a > b then\nEOF"), ['/tmp/run/facts.md']);
  assert.deepEqual(writeTargets('echo x>src/a.js'), ['src/a.js']);
  assert.deepEqual(writeTargets('cp /tmp/a src/a.js && mv x src/b.js; touch src/c.js'), ['src/a.js', 'src/b.js', 'src/c.js']);
  assert.deepEqual(writeTargets('node -e "x => x" 2>&1'), []);
  const fx = fixture('intake');
  try { assert.equal(bash(fx, `cat > ${join(fx.base, 'facts.md')} <<'EOF'\n> src/a.js:1 entry\nEOF`), null); } finally { fx.done(); }
});

function spawnHook(input, env) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

test('should print a deny decision and always exit 0 when run as a hook with the flag on (GuardEdit, flags: on)', () => {
  const fx = fixture('intake');
  try {
    const out = spawnHook({ tool_name: 'Write', tool_input: { file_path: join(fx.repo, 'src', 'a.js') }, cwd: fx.repo }, fx.env);
    assert.equal(out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, /WORKFLOW_GUARD_ENABLED=false turns this guard off/);
    assert.equal(spawnSync(process.execPath, [HOOK], { input: 'not json', env: fx.env, encoding: 'utf8' }).stdout, '', 'fail open on bad input');
  } finally { fx.done(); }
});

test('should deny when the flag is unset and do nothing when it is false (flags: defaults, flags: off)', () => {
  const fx = fixture('intake');
  try {
    const input = { tool_name: 'Write', tool_input: { file_path: join(fx.repo, 'src', 'a.js') }, cwd: fx.repo };
    assert.equal(spawnHook(input, { XDG_CACHE_HOME: fx.env.XDG_CACHE_HOME }).permissionDecision, 'deny');
    assert.equal(spawnHook(input, { XDG_CACHE_HOME: fx.env.XDG_CACHE_HOME, WORKFLOW_GUARD_ENABLED: 'false' }), null);
  } finally { fx.done(); }
});

test('should deny every guarded tool with the fix when the flag value is not valid', () => {
  const fx = fixture(null);
  try {
    const out = spawnHook({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: fx.repo }, { WORKFLOW_GUARD_ENABLED: '1' });
    assert.equal(out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, /use true or false/);
  } finally { fx.done(); }
});
