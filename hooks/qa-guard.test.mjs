// Tests for the qa-guard hook. Run: node --test hooks/qa-guard.test.mjs
// The hook runs as a child process with QA_MARKER_DIR pointing at a temp dir, so the real ~/.cache/qa-sweep is never read or written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAdditiveWrite } from './qa-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'qa-guard.mjs');
const RUN_MJS = join(HERE, '..', 'skills', 'qa-sweep', 'run.mjs');
const { start, readActive } = await import(RUN_MJS);

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'qa-guard-')));
const md = join(tmp, 'markers');
const env = { ...process.env, QA_MARKER_DIR: md };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'ignore' });
function makeRepo(name) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests', 'unit'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app.py'), 'def a():\n    return 1\n');
  writeFileSync(join(dir, 'tests', 'unit', 'test_app.py'), 'def test_a():\n    pass\n');
  git(dir, 'init', '-q');
  return dir;
}
const repo = makeRepo('repo');
const other = makeRepo('other');
const { run } = start({ repo, session: 's1', env, tmp: join(tmp, 'runs') });

const hookRaw = (raw) => {
  const r = spawnSync(process.execPath, [HOOK], { input: raw, env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout };
};
const hookOut = (input) => {
  const r = hookRaw(JSON.stringify(input));
  assert.equal(r.status, 0);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const call = (tool_name, tool_input, extra = {}) => hookOut({ session_id: 's1', cwd: repo, tool_name, tool_input, ...extra });
const hookBash = (command, extra) => call('Bash', { command }, extra);

test('a matching run denies a product-code edit and names the end command', () => {
  const out = call('Edit', { file_path: join(repo, 'src/app.py'), old_string: 'a', new_string: 'b' });
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, new RegExp(`qa-sweep run ${run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is active`));
  assert.match(out.permissionDecisionReason, /run\.mjs" end --session s1/);
});

test('an additive test edit is allowed; a changed line is denied', () => {
  const file_path = join(repo, 'tests/unit/test_app.py');
  const old_string = 'def test_a():\n    pass';
  assert.equal(call('Edit', { file_path, old_string, new_string: `${old_string}\n\ndef test_b():\n    pass` }), null);
  assert.equal(call('Edit', { file_path, old_string, new_string: 'def test_x():\n    pass' }).permissionDecision, 'deny');
});

test('a Write that keeps every old line in order is allowed, also with CRLF', () => {
  assert.equal(isAdditiveWrite('a\r\nb\r\n', 'a\nb\nc\n'), true);
  assert.equal(isAdditiveWrite('a\nb\n', 'b\na\n'), false);
  const file_path = join(repo, 'tests/unit/test_app.py');
  assert.equal(call('Write', { file_path, content: 'def test_a():\n    pass\n\ndef test_b():\n    pass\n' }), null);
  assert.equal(call('Write', { file_path, content: 'def test_other():\n    pass\n' }).permissionDecision, 'deny');
});

test('a new test file is allowed, also in a directory that does not exist yet', () => {
  assert.equal(call('Write', { file_path: join(repo, 'tests/unit/test_new.py'), content: 'x' }), null);
  assert.equal(call('Write', { file_path: join(repo, 'tests/brand/new/test_deep.py'), content: 'x' }), null);
});

test('a write inside the run folder is allowed and a new product file is denied', () => {
  assert.equal(call('Write', { file_path: join(run, 'notes.md'), content: 'x' }), null);
  assert.equal(call('Write', { file_path: join(repo, 'src/new_dir/mod.py'), content: 'x' }).permissionDecision, 'deny');
});

test('git commit, git -C x push and a redirect into src are denied; run.mjs end is allowed', () => {
  for (const c of ['git commit -m x', 'cd x && git -C . push', 'echo x > src/app.py', 'FOO=1 git -c a=b commit', 'ls | tee src/app.py', 'sed -i s/a/b/ src/app.py']) {
    assert.equal(hookBash(c)?.permissionDecision, 'deny', c);
  }
  assert.equal(hookBash(`node ${RUN_MJS} end`), null);
  assert.match(hookBash('git commit -m x').permissionDecisionReason, /--session s1/);
});

test('an Edit is judged on the file after the edit: a partial-line change is denied, an addition and a replace_all addition are allowed', () => {
  const file_path = join(repo, 'tests/unit/test_eq.py');
  writeFileSync(file_path, 'def test_a():\n    assert a() == 1\n\ndef test_b():\n    assert a() == 1\n');
  assert.equal(call('Edit', { file_path, old_string: '1', new_string: '2\n1' }).permissionDecision, 'deny');
  assert.equal(call('Edit', { file_path, old_string: 'assert a() == 1\n\ndef test_b', new_string: 'assert a() == 1\n\ndef test_new():\n    pass\n\ndef test_b' }), null);
  assert.equal(call('Edit', { file_path, old_string: 'assert a() == 1', new_string: 'assert a() == 1\n    assert True', replace_all: true }), null);
  assert.equal(call('Edit', { file_path, old_string: 'assert a() == 1', new_string: 'assert a() == 3', replace_all: true }).permissionDecision, 'deny');
});

test('a redirect or tee outside the repo is allowed', () => {
  for (const c of ['pytest -q > /tmp/x.log 2>&1', 'echo x | tee /tmp/out.log', 'make 2> /tmp/err', 'sed -i s/a/b/ /tmp/f.txt']) assert.equal(hookBash(c), null, c);
});

test('truncating or rewriting an existing test file from Bash is denied; appending and a new test file are allowed', () => {
  for (const c of ['echo x > tests/unit/test_app.py', 'sed -i s/1/2/ tests/unit/test_app.py', 'echo x | tee tests/unit/test_app.py', 'sed -i s/1/2/ src/app.py tests/unit/test_app.py', 'sed -i s/1/2/ tests/unit/test_app.py src/app.py']) {
    assert.equal(hookBash(c)?.permissionDecision, 'deny', c);
  }
  for (const c of ['echo x >> tests/unit/test_app.py', 'echo x | tee -a tests/unit/test_app.py', 'echo x > tests/unit/test_brand_new.py']) assert.equal(hookBash(c), null, c);
});

test('the quoted end command is allowed, also followed by a pipe', () => {
  assert.equal(hookBash(`node "${RUN_MJS}" end --session s1 2>&1 | tee end.log`), null);
});

test('harmless commands, test and run-folder redirects and stderr merges are allowed', () => {
  for (const c of ['git status', 'git log -1', 'ls 2>&1', 'echo x > /dev/null', 'echo x >> tests/unit/test_app.py', `echo x > ${run}/out.txt`, 'git diff && ls']) {
    assert.equal(hookBash(c), null, c);
  }
});

test('a > inside quotes is not a redirect, but a quoted target right after > is', () => {
  for (const c of [`node -e 'x > 2'`, 'python3 -c "print(1 > 0)"', 'echo "a > src/app.py"']) assert.equal(hookBash(c), null, c);
  for (const c of ['echo x > "src/app.py"', "echo 'a' > 'src/app.py'"]) assert.equal(hookBash(c)?.permissionDecision, 'deny', c);
});

test('git commands that discard uncommitted work are denied; stash list and show are allowed', () => {
  for (const c of ['git checkout -- src/app.py', 'git checkout HEAD -- tests/unit/test_app.py', 'git restore src/app.py', 'git restore --staged .',
    'git reset --hard', 'git -C . reset --hard HEAD~1', 'git stash', 'git stash push -m x', 'git stash pop', 'git stash drop', 'git clean -fd']) {
    assert.equal(hookBash(c)?.permissionDecision, 'deny', c);
  }
  for (const c of ['git stash list', 'git stash show -p', 'git checkout -b qa', 'git reset --soft HEAD~1']) assert.equal(hookBash(c), null, c);
});

test('a crash of the test-file check (python3 exits 1) is unknown, so the edit is allowed', () => {
  const bin = mkdtempSync(join(tmp, 'bin-'));
  writeFileSync(join(bin, 'python3'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const input = { session_id: 's1', cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/app.py'), old_string: 'a', new_string: 'b' } };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env: { ...env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
  assert.deepEqual([r.status, r.stdout], [0, '']);
});

test('another session, another repo, a stale marker and no session_id are all inactive', () => {
  const edit = { file_path: join(repo, 'src/app.py'), old_string: 'a', new_string: 'b' };
  assert.equal(hookOut({ session_id: 's2', cwd: repo, tool_name: 'Edit', tool_input: edit }), null);
  assert.equal(hookOut({ cwd: repo, tool_name: 'Edit', tool_input: edit }), null);
  const edit2 = { ...edit, file_path: join(other, 'src/app.py') };
  assert.equal(hookOut({ session_id: 's1', cwd: other, tool_name: 'Edit', tool_input: edit2 }), null);
  assert.equal(hookOut({ session_id: 's1', cwd: other, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }), null);
  // a marker idle for longer than IDLE_MS is not active, so the same edit passes
  assert.equal(readActive({ session: 's1', env, now: Date.now() + 3 * 3600e3 }), null);
  const stale = spawnSync(process.execPath, ['-e', `
    import('${RUN_MJS}').then(async (m) => {
      const { utimesSync } = await import('node:fs');
      const t = new Date(Date.now() - 3 * 3600e3);
      utimesSync(m.markerPath('s1', process.env), t, t);
    });`], { env });
  assert.equal(stale.status, 0);
  assert.equal(call('Edit', edit), null);
});

test('malformed input fails open', () => {
  for (const raw of ['not json', '{}', '{"tool_name":"Edit"}', '', 'null', '{"session_id":"s1","tool_name":"Edit","tool_input":null}']) {
    assert.deepEqual(hookRaw(raw), { status: 0, stdout: '' }, raw);
  }
});
