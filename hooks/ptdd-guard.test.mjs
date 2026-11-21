// Tests for the paired-agent-tdd file fence (hooks/ptdd-guard.mjs + skills/paired-agent-tdd/fence.mjs). Run: node --test hooks/ptdd-guard.test.mjs
// The hook runs as a child process with a private ZT_MARKER_DIR, so a real marker on this host never takes part.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER_NAME, clearFence, writeFence } from '../skills/paired-agent-tdd/fence.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'ptdd-guard.mjs');
const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));

function fixture() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'ptdd-fence-')));
  made.push(tmp);
  const repo = join(tmp, 'repo'), run = join(tmp, 'run'), md = join(tmp, 'marker');
  for (const d of [repo, run, md]) { mkdirSync(d); chmodSync(d, 0o700); }
  const plan = {
    repo, groups: [{ id: 'a', tests: ['tests/test_a.py'], src: ['src/a.py'] }, { id: 'b', tests: ['tests/test_b.py'], src: ['src/b.py'] }],
    integration: { file: 'tests/integration/test_flow.py' },
  };
  writeFence(run, plan, md);
  return { tmp, repo, run, md };
}
const drive = (fx, tool, toolInput, agent = 'agent-1') => {
  const input = { hook_event_name: 'PreToolUse', tool_name: tool, cwd: fx.repo, tool_input: toolInput, ...(agent && { agent_id: agent }) };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ZT_MARKER_DIR: fx.md } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
};
const edit = (fx, rel, agent) => drive(fx, 'Edit', { file_path: join(fx.repo, rel), old_string: 'a', new_string: 'b' }, agent);

test('should allow an agent its own group files and deny another group after its first write pins it', () => {
  const fx = fixture();
  assert.equal(edit(fx, 'tests/test_a.py'), 'allow');
  assert.equal(edit(fx, 'src/a.py'), 'allow');
  assert.equal(edit(fx, 'src/b.py'), 'deny');
  assert.equal(edit(fx, 'src/b.py', 'agent-2'), 'allow', 'another agent pins to its own group');
  assert.equal(edit(fx, 'src/a.py', 'agent-2'), 'deny');
});

test('should deny a repo file that belongs to no group', () => {
  const fx = fixture();
  for (const rel of ['README.md', 'src/other.py', '.github/workflows/ci.yml']) assert.equal(edit(fx, rel), 'deny', rel);
  assert.equal(drive(fx, 'Write', { file_path: join(fx.repo, 'src/new.py'), content: 'x' }), 'deny');
});

test('should allow the integration test, the run folder and files outside the repo for any agent', () => {
  const fx = fixture();
  assert.equal(edit(fx, 'tests/integration/test_flow.py'), 'allow');
  assert.equal(drive(fx, 'Write', { file_path: join(fx.run, 'notes.md'), content: 'x' }), 'allow');
  assert.equal(drive(fx, 'Write', { file_path: join(fx.tmp, 'scratch', 'x.txt'), content: 'x' }), 'allow');
});

test('should never fence the lead session', () => {
  const fx = fixture();
  assert.equal(edit(fx, 'README.md', null), 'allow');
  assert.equal(drive(fx, 'Bash', { command: 'sed -i s/a/b/ src/a.py' }, null), 'allow');
});

test('should deny Bash writes into the repo by a subagent and allow reads and writes elsewhere', () => {
  const fx = fixture();
  for (const command of ['sed -i s/a/b/ src/a.py', 'perl -pi -e s/a/b/ src/a.py', 'cat > src/a.py <<EOF\nx\nEOF', 'echo x >> tests/test_a.py', 'echo x | tee src/a.py',
    `printf x > "${join(fx.repo, 'src/a.py')}"`]) {
    assert.equal(drive(fx, 'Bash', { command }), 'deny', command);
  }
  for (const command of ['pytest -q tests/test_a.py', 'git diff', "node -e 'console.log(1 > 0)'", 'grep -n x src/a.py', `echo x > ${join(fx.tmp, 'out.txt')}`, 'echo x > /dev/null', 'ls 2>&1']) {
    assert.equal(drive(fx, 'Bash', { command }), 'allow', command);
  }
});

test('should do nothing when no fence is active, when the marker is stale or planted, or after clearFence', () => {
  const off = fixture();
  clearFence(off.run, off.md);
  assert.equal(existsSync(join(off.md, MARKER_NAME)), false);
  assert.equal(edit(off, 'README.md'), 'allow');
  const stale = fixture();
  const old = new Date(Date.now() - 13 * 3600e3);
  utimesSync(join(stale.md, MARKER_NAME), old, old);
  assert.equal(edit(stale, 'README.md'), 'allow');
  const planted = fixture();
  rmSync(join(planted.md, MARKER_NAME));
  symlinkSync(join(fixture().md, MARKER_NAME), join(planted.md, MARKER_NAME));
  assert.equal(edit(planted, 'README.md'), 'allow');
  const open = fixture();
  chmodSync(join(open.md, MARKER_NAME), 0o666);
  assert.equal(edit(open, 'README.md'), 'allow');
});

test('should fail open on malformed input', () => {
  const fx = fixture();
  for (const raw of ['', 'not json', '{}', '{"agent_id":"a","tool_name":"Edit"}']) {
    const r = spawnSync(process.execPath, [HOOK], { input: raw, encoding: 'utf8', env: { ...process.env, ZT_MARKER_DIR: fx.md } });
    assert.deepEqual([r.status, r.stdout], [0, ''], raw);
  }
});
