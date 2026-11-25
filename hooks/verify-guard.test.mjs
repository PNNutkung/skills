// Tests for the verify-guard hook (ADR 0008 Guard, A10). verdict() runs in-process; a few cases spawn the hook for stdin and the JSON output.
// The session marker is written where skills/verify/paths.mjs puts it, under VERIFY_CACHE_DIR in a temp dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verdict } from './verify-guard.mjs';
import { markerLine } from '../skills/verify/marker.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'verify-guard.mjs');
const CLOSE = /node "[^"]*verify\.mjs" close/;
const SESSION = 's1';
const AC1 = 'env: cloud (local shell)\nrun: node --test a.test.mjs\nresult: pass\n```\nok 1\n```';
const AC2 = 'env: cloud (local shell)\nrun: node cli.mjs\nresult: fail\n```\n## boom\n```';
const sec = (id, body) => `## ${id}\n${markerLine(body)}\n${body}\n`;
const VERIFY_MD = `# Verify: demo (ADR 0008)\n\nhand intro\n\n${sec('AC1', AC1)}\n## NOTE\nhand text\n\n${sec('AC2', AC2)}`;

function fixture({ open = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'vg-')));
  const repo = join(base, 'repo');
  const cache = join(base, 'cache');
  const run = join(cache, 'repo-0123456789ab', 'demo');
  const verifyFile = join(repo, 'docs', 'verify', 'demo.md');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(dirname(verifyFile), { recursive: true });
  mkdirSync(run, { recursive: true });
  writeFileSync(join(repo, 'src', 'app.js'), 'export const a = 1;\n');
  writeFileSync(verifyFile, VERIFY_MD);
  const env = { VERIFY_CACHE_DIR: cache };
  if (open) {
    mkdirSync(join(cache, 'sessions'), { recursive: true });
    writeFileSync(join(cache, 'sessions', `${SESSION}.json`), JSON.stringify({ run, repo, slug: 'demo', verifyFile, started: new Date().toISOString() }));
  }
  return { base, repo, run, verifyFile, env, done: () => rmSync(base, { recursive: true, force: true }) };
}
const call = (fx, tool_name, tool_input, extra = {}) => verdict({ session_id: SESSION, cwd: fx.repo, tool_name, tool_input, ...extra }, fx.env);
const edit = (fx, file_path, old_string, new_string, more = {}) => call(fx, 'Edit', { file_path, old_string, new_string, ...more });
const write = (fx, file_path, content) => call(fx, 'Write', { file_path, content });
const bash = (fx, command, extra) => call(fx, 'Bash', { command }, extra);
// the caller's own VERIFY_* flags must not leak into a test: each test sets the flags it means
const callerEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VERIFY_')));
const hook = (fx, input, envExtra = {}) => {
  const r = spawnSync(process.execPath, [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input), env: { ...callerEnv(), ...fx.env, ...envExtra }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
};

test('should deny edits to repo files outside docs/verify and name the close command when a run is open (Guard)', () => {
  const fx = fixture();
  try {
    for (const why of [
      edit(fx, join(fx.repo, 'src', 'app.js'), 'a = 1', 'a = 2'),
      edit(fx, 'src/app.js', 'a = 1', 'a = 2'),
      write(fx, join(fx.repo, 'src', 'new.js'), 'x'),
      write(fx, join(fx.repo, 'docs', 'adr', '0001.md'), 'x'),
      call(fx, 'MultiEdit', { file_path: join(fx.repo, 'src', 'app.js'), edits: [{ old_string: 'a', new_string: 'b' }] }),
      call(fx, 'NotebookEdit', { notebook_path: join(fx.repo, 'nb.ipynb'), new_source: 'x' }),
    ]) {
      assert.match(why ?? '', /verify run demo is open/);
      assert.match(why, CLOSE);
    }
  } finally { fx.done(); }
});

test('should allow edits under docs/verify, in the run folder and outside the repo when a run is open (Guard)', () => {
  const fx = fixture();
  try {
    assert.equal(write(fx, join(fx.repo, 'docs', 'verify', 'other.md'), '# notes\n'), null);
    assert.equal(write(fx, join(fx.run, 'plan.json'), '{}'), null);
    assert.equal(write(fx, join(fx.run, 'answers.md'), 'A1: yes'), null);
    assert.equal(write(fx, join(fx.base, 'elsewhere.txt'), 'x'), null);
    assert.equal(call(fx, 'NotebookEdit', { notebook_path: join(fx.base, 'nb.ipynb'), new_source: 'x' }), null);
  } finally { fx.done(); }
});

test('should allow an edit of the verify file when it touches only hand-written text (Guard)', () => {
  const fx = fixture();
  try {
    assert.equal(edit(fx, fx.verifyFile, 'hand intro', 'a longer hand intro'), null);
    assert.equal(edit(fx, fx.verifyFile, 'hand text', 'changed hand text\nmore'), null);
    assert.equal(write(fx, fx.verifyFile, VERIFY_MD.replace('hand intro', 'new intro').replace('## NOTE', '## NOTE2')), null);
    assert.equal(write(fx, fx.verifyFile, `${VERIFY_MD}## EXTRA\nnew hand section\n`), null);
    assert.equal(call(fx, 'MultiEdit', { file_path: fx.verifyFile, edits: [{ old_string: 'hand intro', new_string: 'x' }, { old_string: 'hand text', new_string: 'y' }] }), null);
  } finally { fx.done(); }
});

test('should deny an edit of the verify file when it changes the body of a code-written section (Guard)', () => {
  const fx = fixture();
  try {
    assert.match(edit(fx, fx.verifyFile, 'result: fail', 'result: pass') ?? '', /AC2.*written by verify\.mjs/s);
    assert.match(edit(fx, fx.verifyFile, 'ok 1', 'ok 2') ?? '', /AC1/);
    assert.match(edit(fx, fx.verifyFile, '```\n## boom', '```\n## fine') ?? '', /AC2/);
    assert.match(write(fx, fx.verifyFile, VERIFY_MD.replace('result: pass', 'result: fail')) ?? '', /AC1/);
    assert.match(call(fx, 'MultiEdit', { file_path: fx.verifyFile, edits: [{ old_string: 'hand intro', new_string: 'x' }, { old_string: 'node cli.mjs', new_string: 'true' }] }) ?? '', /AC2/);
    assert.match(edit(fx, fx.verifyFile, 'hand intro', 'x', { replace_all: true }) ?? 'allowed', /allowed/);
    assert.match(edit(fx, fx.verifyFile, 'env: cloud', 'env: ci', { replace_all: true }) ?? '', /AC1/);
    assert.match(edit(fx, fx.verifyFile, 'result: pass\n```\nok 1\n```\n', 'result: pass\n```\nok 1\n```\nhand note\n') ?? '', /AC1/, 'text appended inside a marked section');
  } finally { fx.done(); }
});

test('should deny an edit of the verify file when it removes a code-written section or its marker (Guard)', () => {
  const fx = fixture();
  try {
    assert.match(write(fx, fx.verifyFile, '# Verify: demo\n') ?? '', /AC1/);
    assert.match(edit(fx, fx.verifyFile, sec('AC2', AC2), '') ?? '', /AC2/);
    assert.match(edit(fx, fx.verifyFile, `${markerLine(AC1)}\n`, '') ?? '', /AC1/);
    assert.match(edit(fx, fx.verifyFile, '## AC1\n', '## AC9\n') ?? '', /AC1/);
    assert.match(edit(fx, fx.verifyFile, markerLine(AC1), markerLine('forged')) ?? '', /AC1/);
  } finally { fx.done(); }
});

test('should deny adding a code-written marker by hand when the edit forges a section (Guard)', () => {
  const fx = fixture();
  try {
    assert.match(write(fx, fx.verifyFile, `${VERIFY_MD}${sec('AC3', 'result: pass')}`) ?? '', /AC3/);
    assert.match(write(fx, join(fx.repo, 'docs', 'verify', 'new.md'), sec('AC1', 'result: pass')) ?? '', /AC1/);
  } finally { fx.done(); }
});

test('should allow an edit whose old_string is missing when the tool will fail by itself (Guard)', () => {
  const fx = fixture();
  try {
    assert.equal(edit(fx, fx.verifyFile, 'not in the file', 'x'), null);
    assert.equal(call(fx, 'MultiEdit', { file_path: fx.verifyFile, edits: [{ old_string: 'nope', new_string: 'x' }] }), null);
  } finally { fx.done(); }
});

test('should deny Bash commands that write into the repo outside docs/verify when a run is open (Guard)', () => {
  const fx = fixture();
  try {
    for (const c of [
      'echo x > src/app.js', 'echo x >> src/app.js', 'cat a | tee src/b.js', "sed -i 's/1/2/' src/app.js", 'cp /tmp/a src/app.js',
      'mv src/app.js /tmp/app.js', 'rm src/app.js', 'rm -rf src', 'touch src/new.js', `echo x > ${join(fx.repo, 'README.md')}`,
      'git checkout -- src/app.js', 'git checkout main', 'git restore src/app.js', 'git apply fix.patch', 'git reset --hard HEAD',
      'git commit -m x', 'git push', 'git -C . commit -am x', 'git stash', 'git clean -fd', "bash -c 'echo x > src/app.js'",
      'cd /tmp && echo ok; echo y > src/app.js', 'node x.mjs > out.txt',
    ]) {
      const why = bash(fx, c);
      assert.match(why ?? '', /verify run demo is open/, c);
      assert.match(why, CLOSE, c);
    }
  } finally { fx.done(); }
});

test('should allow Bash commands that read, write outside the repo or into docs/verify when a run is open (Guard)', () => {
  const fx = fixture();
  try {
    for (const c of [
      'git status', 'git diff HEAD', 'git log --oneline', 'node --test', 'cat src/app.js', 'echo x > /dev/null', 'ls 2>&1',
      `echo x > ${join(fx.run, 'out.txt')}`, `echo x > ${join(fx.base, 'x.txt')}`, 'echo x > docs/verify/notes.md',
      "node -e 'console.log(1 > 0)'", 'echo "a > b"', 'cp src/app.js /tmp/copy.js', 'git -C /tmp commit -m x',
      'cat <<EOF > /tmp/x\nsrc/app.js > y\nEOF', 'node skills/verify/verify.mjs run', 'node "/abs/skills/verify/verify.mjs" close',
    ]) assert.equal(bash(fx, c), null, c);
    assert.equal(bash(fx, 'git commit -m x', { cwd: fx.base }), null, 'git in a directory outside the repo');
  } finally { fx.done(); }
});

test('should deny a Bash overwrite or removal of a verify file when it holds code-written sections (Guard)', () => {
  const fx = fixture();
  try {
    assert.match(bash(fx, 'echo x > docs/verify/demo.md') ?? '', /demo\.md/);
    assert.match(bash(fx, 'rm docs/verify/demo.md') ?? '', /demo\.md/);
    assert.match(bash(fx, "sed -i 's/fail/pass/' docs/verify/demo.md") ?? '', /demo\.md/);
  } finally { fx.done(); }
});

test('should allow everything when no run is open for this session (Guard)', () => {
  const fx = fixture({ open: false });
  try {
    assert.equal(edit(fx, join(fx.repo, 'src', 'app.js'), 'a = 1', 'a = 2'), null);
    assert.equal(bash(fx, 'git commit -m x'), null);
    assert.equal(edit(fx, fx.verifyFile, 'result: fail', 'result: pass'), null);
  } finally { fx.done(); }
  const fx2 = fixture();
  try {
    assert.equal(verdict({ session_id: 'other', cwd: fx2.repo, tool_name: 'Bash', tool_input: { command: 'git push' } }, fx2.env), null, 'another session');
    assert.equal(verdict({ session_id: '../sessions/s1', cwd: fx2.repo, tool_name: 'Bash', tool_input: { command: 'git push' } }, fx2.env), null, 'a session id that is a path');
    assert.equal(call(fx2, 'Read', { file_path: join(fx2.repo, 'src', 'app.js') }), null, 'a tool the guard does not cover');
  } finally { fx2.done(); }
});

test('should take the session id from CLAUDE_CODE_SESSION_ID when the payload has none (Guard)', () => {
  const fx = fixture();
  try {
    assert.match(verdict({ cwd: fx.repo, tool_name: 'Bash', tool_input: { command: 'git push' } }, { ...fx.env, CLAUDE_CODE_SESSION_ID: SESSION }) ?? '', /verify run demo/);
    assert.equal(verdict({ cwd: fx.repo, tool_name: 'Bash', tool_input: { command: 'git push' } }, fx.env), null);
  } finally { fx.done(); }
});

test('should allow everything when VERIFY_GUARD_ENABLED is false in any case (Guard)', () => {
  const fx = fixture();
  try {
    for (const v of ['false', 'FALSE', ' False ']) {
      fx.env.VERIFY_GUARD_ENABLED = v;
      assert.equal(edit(fx, join(fx.repo, 'src', 'app.js'), 'a = 1', 'a = 2'), null, v);
      assert.equal(edit(fx, fx.verifyFile, 'result: fail', 'result: pass'), null, v);
      assert.equal(bash(fx, 'git push'), null, v);
    }
    fx.env.VERIFY_GUARD_ENABLED = 'true';
    assert.match(bash(fx, 'git push') ?? '', /verify run demo/);
  } finally { fx.done(); }
});

test('should deny every guarded tool with the fix when VERIFY_GUARD_ENABLED is invalid or VERIFY_FLAG_RUNS_ENABLED is set (Guard) (FlagRuns)', () => {
  for (const [name, value, want] of [['VERIFY_GUARD_ENABLED', 'maybe', /VERIFY_GUARD_ENABLED=maybe is not valid: use true or false/], ['VERIFY_FLAG_RUNS_ENABLED', 'true', /VERIFY_FLAG_RUNS_ENABLED was removed/]]) {
    for (const open of [true, false]) {
      const fx = fixture({ open });
      fx.env[name] = value;
      try {
        for (const why of [edit(fx, join(fx.base, 'outside.txt'), 'a', 'b'), bash(fx, 'ls'), write(fx, fx.verifyFile, VERIFY_MD)]) {
          assert.match(why ?? '', want, `${name} open=${open}`);
          assert.match(why, /settings\.json/);
        }
        assert.equal(bash(fx, 'node skills/verify/verify.mjs close'), null, 'the verify CLI itself is always allowed');
      } finally { fx.done(); }
    }
  }
});

test('should print the PreToolUse deny JSON and exit 0 when the hook runs as a process (Guard)', () => {
  const fx = fixture();
  try {
    const out = hook(fx, { session_id: SESSION, cwd: fx.repo, tool_name: 'Write', tool_input: { file_path: join(fx.repo, 'src', 'x.js'), content: 'x' } });
    assert.equal(out.hookEventName, 'PreToolUse');
    assert.equal(out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, CLOSE);
    assert.equal(hook(fx, { session_id: SESSION, cwd: fx.repo, tool_name: 'Bash', tool_input: { command: 'git status' } }), null);
    assert.match(hook(fx, { session_id: SESSION, cwd: fx.repo, tool_name: 'Bash', tool_input: { command: 'ls' } }, { VERIFY_GUARD_ENABLED: 'nope' }).permissionDecisionReason, /VERIFY_GUARD_ENABLED=nope/);
  } finally { fx.done(); }
});

test('should fail open with no output when the input or the session marker is broken (Guard)', () => {
  const fx = fixture();
  try {
    assert.equal(hook(fx, 'not json'), null);
    assert.equal(hook(fx, ''), null);
    writeFileSync(join(fx.env.VERIFY_CACHE_DIR, 'sessions', `${SESSION}.json`), '{broken');
    assert.equal(hook(fx, { session_id: SESSION, cwd: fx.repo, tool_name: 'Bash', tool_input: { command: 'git push' } }), null);
    writeFileSync(join(fx.env.VERIFY_CACHE_DIR, 'sessions', `${SESSION}.json`), JSON.stringify({ run: 1 }));
    assert.equal(bash(fx, 'git push'), null, 'a marker without a repo');
    assert.equal(readFileSync(fx.verifyFile, 'utf8'), VERIFY_MD, 'the hook never writes the verify file');
  } finally { fx.done(); }
});

// Fuzz: random commands and random verify-file edits never throw; a result is null or a deny string that names the close command.
test('should never throw and always name the close command when the tool input is random (Guard)', () => {
  const fx = fixture();
  let seed = 10;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const words = ['echo', 'x', '>', '>>', 'src/app.js', 'docs/verify/demo.md', '|', 'tee', '&&', ';', 'git', 'commit', 'rm', '-rf', "'", '"', 'bash', '-c', '$(', ')', '<<EOF', '\n', 'EOF', 'sed', '-i', 'mv', 'cp', '/tmp/x', '2>&1', 'node', 'skills/verify/verify.mjs'];
  const bits = ['## AC1', '## X', '```', 'result: pass', markerLine(AC1), AC1, 'text', ''];
  try {
    for (let i = 0; i < 800; i++) {
      const command = Array.from({ length: Math.floor(rand() * 10) }, () => pick(words)).join(pick([' ', '']));
      const content = Array.from({ length: Math.floor(rand() * 8) }, () => pick(bits)).join('\n');
      for (const why of [bash(fx, command), write(fx, fx.verifyFile, content), edit(fx, fx.verifyFile, pick(bits) || 'x', content)]) {
        assert.ok(why === null || (typeof why === 'string' && CLOSE.test(why)), `${JSON.stringify(command)} -> ${why}`);
      }
    }
    assert.ok(write(fx, fx.verifyFile, VERIFY_MD) === null, 'the unchanged file is allowed');
  } finally { fx.done(); }
});

test('should deny a write to a new file through a symlink to the repo when the path does not exist yet (Guard)', () => {
  const fx = fixture();
  try {
    const link = join(fx.base, 'link');
    symlinkSync(fx.repo, link);
    assert.match(write(fx, join(link, 'src', 'new', 'deep.js'), 'x') ?? '', /verify run demo/);
    assert.match(bash(fx, `echo x > ${join(link, 'src', 'new.js')}`) ?? '', /verify run demo/);
  } finally { fx.done(); }
});

test('should check a command that only names the verify CLI as an argument when it is not node running it (Guard)', () => {
  const fx = fixture();
  try {
    mkdirSync(join(fx.repo, 'skills', 'verify'), { recursive: true });
    writeFileSync(join(fx.repo, 'skills', 'verify', 'verify.mjs'), '');
    assert.match(bash(fx, 'rm skills/verify/verify.mjs') ?? '', /verify run demo/);
    fx.env.VERIFY_GUARD_ENABLED = 'maybe';
    assert.match(bash(fx, 'node x.mjs') ?? '', /VERIFY_GUARD_ENABLED=maybe/, 'plain node is not the verify CLI');
  } finally { fx.done(); }
});

test('should allow git stash list and show and recurse only into a shell -c when a run is open (Guard edge)', () => {
  const fx = fixture();
  try {
    for (const c of ['git stash list', 'git stash show -p', 'grep -c "rm src/app.js" log.txt', 'python -c "git push"']) assert.equal(bash(fx, c), null, c);
    assert.match(bash(fx, 'git stash push -m x') ?? '', /git stash changes the repo/);
  } finally { fx.done(); }
});

test('should allow writes into a run folder inside the repo when the marker names it (Guard edge)', () => {
  const fx = fixture();
  try {
    const run = join(fx.repo, '.cache', 'demo');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(fx.env.VERIFY_CACHE_DIR, 'sessions', `${SESSION}.json`), JSON.stringify({ run, repo: fx.repo, slug: 'demo' }));
    assert.equal(write(fx, join(run, 'out.txt'), 'x'), null);
    assert.equal(bash(fx, `echo x > ${join(run, 'out.txt')}`), null);
    assert.match(write(fx, join(fx.repo, '.cache', 'other.txt'), 'x') ?? '', /verify run demo/);
  } finally { fx.done(); }
});

test('should allow an empty file path and use the repo as cwd when the payload cwd is relative or not a string (Guard edge)', () => {
  const fx = fixture();
  try {
    assert.equal(write(fx, '', 'x'), null, 'the tool fails by itself on an empty path');
    for (const cwd of ['src', 5]) assert.match(bash(fx, 'echo x > src/app.js', { cwd }) ?? '', /verify run demo/, String(cwd));
  } finally { fx.done(); }
});

test('should deny a write hidden behind a variable, a wrapper, a second command or two nested shells when a run is open (Guard edge)', () => {
  const fx = fixture();
  try {
    for (const c of ['FOO=1 rm src/app.js', 'env rm src/app.js', 'cat x; rm src/app.js', 'git --version; rm src/app.js', 'bash -c; rm src/app.js',
      `bash -c 'bash -c "rm -rf src"'`]) assert.match(bash(fx, c) ?? '', /verify run demo/, c);
    assert.equal(bash(fx, 'git reset HEAD src/app.js'), null, 'reset without --hard keeps the work tree');
  } finally { fx.done(); }
});

test('should deny writing a verify file with one code-written section and allow overwriting one with none when a run is open (Guard edge)', () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.repo, 'docs', 'verify', 'one.md'), `# Verify: one\n\n${sec('AC1', AC1)}`);
    writeFileSync(join(fx.repo, 'docs', 'verify', 'notes.md'), '# notes by hand\n');
    assert.match(bash(fx, 'rm docs/verify/one.md') ?? '', /one\.md/);
    assert.equal(bash(fx, 'echo x > docs/verify/notes.md'), null);
  } finally { fx.done(); }
});

test('should allow a hand edit after a code-written section when the verify file starts with that section (Guard edge)', () => {
  const fx = fixture();
  try {
    writeFileSync(fx.verifyFile, `${sec('AC1', AC1)}## NOTE\nhand text\n`);
    assert.equal(edit(fx, fx.verifyFile, 'hand text', 'more hand text'), null);
  } finally { fx.done(); }
});

test('should ignore a session marker whose repo or run is not an absolute path when it was written by hand (Guard edge)', () => {
  const fx = fixture();
  const marker = join(fx.env.VERIFY_CACHE_DIR, 'sessions', `${SESSION}.json`);
  try {
    writeFileSync(marker, JSON.stringify({ repo: '.', run: fx.run, slug: 'demo' }));
    assert.equal(write(fx, join(process.cwd(), 'zz-not-written.js'), 'x'), null, 'a relative repo');
    for (const run of [5, '.']) {
      writeFileSync(marker, JSON.stringify({ repo: process.cwd(), run, slug: 'demo' }));
      assert.match(write(fx, join(process.cwd(), 'zz-not-written.js'), 'x') ?? '', /verify run demo/, `run ${run}`);
    }
  } finally { fx.done(); }
});

test('should still deny when the caller shell sets VERIFY_GUARD_ENABLED=false or the timeout flag, because each test sets its own flags (Guard)', () => {
  const saved = { g: process.env.VERIFY_GUARD_ENABLED, t: process.env.VERIFY_RUN_TIMEOUT_MAX };
  process.env.VERIFY_GUARD_ENABLED = 'false';
  process.env.VERIFY_RUN_TIMEOUT_MAX = 'maybe';
  const fx = fixture();
  try {
    assert.match(hook(fx, { session_id: SESSION, cwd: fx.repo, tool_name: 'Edit', tool_input: { file_path: join(fx.repo, 'src', 'app.js'), old_string: 'a', new_string: 'b' } })?.permissionDecision ?? '', /deny/);
  } finally {
    for (const [k, v] of [['VERIFY_GUARD_ENABLED', saved.g], ['VERIFY_RUN_TIMEOUT_MAX', saved.t]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    fx.done();
  }
});

test('should deny an edit, a write or a Bash append that adds a second heading of a code-written section id when the file has that section (Guard)', () => {
  const fx = fixture();
  const forged = '## AC2\nenv: cloud\nrun: node cli.mjs\nresult: pass\n```\nok\n```\n';
  try {
    assert.match(edit(fx, fx.verifyFile, 'hand text\n', `hand text\n\n${forged}`) ?? '', /second ## AC2 heading/, 'above the marked AC2');
    assert.match(edit(fx, fx.verifyFile, '## boom\n```\n', `## boom\n\`\`\`\n\n${forged}`) ?? '', /AC2/, 'after the marked AC2');
    assert.match(write(fx, fx.verifyFile, `${VERIFY_MD}\n${forged}`) ?? '', /second ## AC2 heading/);
    assert.match(call(fx, 'MultiEdit', { file_path: fx.verifyFile, edits: [{ old_string: 'hand intro', new_string: `hand intro\n\n## AC1\nresult: pass\n` }] }) ?? '', /AC1/);
    assert.match(bash(fx, `cat >> docs/verify/demo.md <<'X'\n${forged}X`) ?? '', /demo\.md/);
    assert.equal(edit(fx, fx.verifyFile, 'hand text\n', 'hand text\n\n## AC7\nnotes\n'), null, 'a heading of another id is hand text');
  } finally { fx.done(); }
});

test('should allow a hand edit when the file already had a duplicate heading of a code-written id and the edit adds none (Guard edge)', () => {
  const fx = fixture();
  try {
    writeFileSync(fx.verifyFile, `${VERIFY_MD}\n## AC1\nold hand copy\n`);
    assert.equal(edit(fx, fx.verifyFile, 'hand text', 'more hand text'), null);
    assert.match(edit(fx, fx.verifyFile, 'hand text', 'hand text\n\n## AC1\nthird\n') ?? '', /AC1/);
  } finally { fx.done(); }
});
