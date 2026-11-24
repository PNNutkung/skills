// Tests for the dod-guard hook. Run: node --test hooks/dod-guard.test.mjs
// The hook runs as a child process with DOD_MARKER_DIR, DOD_RUN_BASE and DOD_CONFIG_DIR in a temp dir, so nothing real is read or written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answersAfter, bashVerdict, mcpVerdict } from './dod-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'dod-guard.mjs');
const { approve, open, recordAdr, trust } = await import(join(HERE, '..', 'skills', 'definition-of-done', 'session.mjs'));

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dod-guard-')));
let n = 0;
function fixture() {
  const dir = join(tmp, `f${n++}`), repo = join(dir, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'docs', 'dod'), { recursive: true });
  writeFileSync(join(repo, 'src', 'app.js'), 'x\n');
  execFileSync('git', ['-C', repo, 'init', '-q']);
  const env = { DOD_MARKER_DIR: join(dir, 'm'), DOD_RUN_BASE: join(dir, 'r'), DOD_CONFIG_DIR: join(dir, 'c') };
  const session = `s${n}`;
  const { run } = open({ repo, slug: 'csv', session, env });
  return { repo, env, session, run };
}

function hook(fx, tool, input, extraEnv = { DOD_GUARD_ENABLED: 'true' }) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: fx.session, cwd: fx.repo, tool_name: tool, tool_input: input }),
    env: { ...process.env, DOD_GUARD: '', DOD_GUARD_ENABLED: '', ...fx.env, ...extraEnv }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : { permissionDecision: 'allow' };
}
const decision = (...a) => hook(...a).permissionDecision;

// ---------- the flag ----------
test('should allow everything when DOD_GUARD_ENABLED is unset or false', () => {
  const fx = fixture();
  for (const v of [{}, { DOD_GUARD_ENABLED: 'false' }, { DOD_GUARD_ENABLED: 'FALSE' }]) assert.equal(decision(fx, 'Edit', { file_path: join(fx.repo, 'src', 'app.js') }, v), 'allow');
});

test('should deny every tool, naming the fix, when DOD_GUARD_ENABLED is not true or false or the old DOD_GUARD is set', () => {
  const fx = fixture();
  for (const [v, re] of [[{ DOD_GUARD_ENABLED: '1' }, /DOD_GUARD_ENABLED=1 is not valid: use true or false/], [{ DOD_GUARD: '1' }, /DOD_GUARD was renamed: use DOD_GUARD_ENABLED=true/]]) {
    for (const [tool, input] of [['Edit', { file_path: join(fx.repo, 'docs', 'dod', 'x.json') }], ['Bash', { command: 'ls' }], ['mcp__x__read', {}]]) {
      const h = hook({ ...fx, session: 'no-session-needed' }, tool, input, v);
      assert.equal(h.permissionDecision, 'deny', `${tool} ${JSON.stringify(v)}`);
      assert.match(h.permissionDecisionReason, re);
    }
  }
});

test('should allow everything when no DoD session is active', () => {
  const fx = fixture();
  assert.equal(decision({ ...fx, session: 'other' }, 'Write', { file_path: join(fx.repo, 'src', 'app.js'), content: '' }), 'allow');
});

// ---------- file edits ----------
test('should deny editing product code when a DoD session is open, and name the close command', () => {
  const fx = fixture();
  const out = hook(fx, 'Edit', { file_path: join(fx.repo, 'src', 'app.js'), old_string: 'x', new_string: 'y' });
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /dod\.mjs" close --session s\d+/);
});

test('should allow writing under docs/dod and the run folder when a DoD session is open', () => {
  const fx = fixture();
  assert.equal(decision(fx, 'Write', { file_path: join(fx.repo, 'docs', 'dod', 'csv.json'), content: '{}' }), 'allow');
  assert.equal(decision(fx, 'Write', { file_path: join(fx.run, 'answers.md'), content: 'A1: x' }), 'allow');
});

test('should allow editing the ADR and index that dod.mjs adr wrote, and no other ADR or product file', () => {
  const fx = fixture();
  const adr = join(fx.repo, 'docs', 'adr', '0002-csv.md'), index = join(fx.repo, 'docs', 'adr', 'README.md');
  mkdirSync(dirname(adr), { recursive: true });
  assert.equal(decision(fx, 'Edit', { file_path: adr }), 'deny', 'not recorded yet');
  recordAdr({ session: fx.session, env: fx.env, files: [adr, index] });
  assert.equal(decision(fx, 'Edit', { file_path: adr }), 'allow');
  assert.equal(decision(fx, 'Write', { file_path: index, content: '' }), 'allow');
  assert.equal(decision(fx, 'Edit', { file_path: join(fx.repo, 'docs', 'adr', '0001-other.md') }), 'deny');
  assert.equal(decision(fx, 'Edit', { file_path: join(fx.repo, 'src', 'app.js') }), 'deny');
  assert.equal(decision(fx, 'Bash', { command: `echo x >> ${adr}` }), 'allow');
});

test('should deny a path that only looks like docs/dod when it escapes with ..', () => {
  const fx = fixture();
  assert.equal(decision(fx, 'Write', { file_path: join(fx.repo, 'docs', 'dod', '..', '..', 'src', 'app.js'), content: '' }), 'deny');
});

test('should deny MultiEdit and NotebookEdit outside the allowed folders', () => {
  const fx = fixture();
  assert.equal(decision(fx, 'MultiEdit', { file_path: join(fx.repo, 'src', 'app.js'), edits: [] }), 'deny');
  assert.equal(decision(fx, 'NotebookEdit', { notebook_path: join(fx.repo, 'n.ipynb') }), 'deny');
});

// ---------- Bash ----------
test('should deny a shell write to product code when a DoD session is open', () => {
  const fx = fixture();
  for (const command of ['echo y > src/app.js', 'echo y | tee -a src/app.js', 'sed -i s/x/y/ src/app.js'])
    assert.equal(decision(fx, 'Bash', { command }), 'deny', command);
});

test('should allow reads and writes into the run folder when a DoD session is open', () => {
  const fx = fixture();
  for (const command of ['git status', 'cat src/app.js', `gh issue view 42 --comments > ${fx.run}/ticket.md`, 'echo "a > b"'])
    assert.equal(decision(fx, 'Bash', { command }), 'allow', command);
});

test('should always allow the close command, even next to other commands', () => {
  const fx = fixture();
  assert.equal(decision(fx, 'Bash', { command: 'node ~/.claude/skills/definition-of-done/dod.mjs close' }), 'allow');
});

test('should deny the agent running approve or trust, because only the user approves', () => {
  const fx = fixture();
  for (const command of ['node dod.mjs approve', 'cd x && node "/a/b/dod.mjs" trust --cli jira']) {
    const out = hook(fx, 'Bash', { command });
    assert.equal(out.permissionDecision, 'deny', command);
    assert.match(out.permissionDecisionReason, /only the user/);
  }
});

const WRITES = ['gh issue edit 42 --body-file x.md', 'glab issue update 7 --description x', 'acli jira workitem edit --key ABC-1 --description x',
  'gh api -X PATCH repos/a/b/issues/42 -f body=x', 'gh api graphql -f query="mutation { updateIssue }"'];

test('should deny a ticket write when the user has not approved the rendered text', () => {
  const fx = fixture();
  for (const command of WRITES) assert.match(hook(fx, 'Bash', { command }).permissionDecisionReason ?? '', /not approved/, command);
});

test('should allow a ticket write when the user approved the rendered text, and deny it again after the text changes', () => {
  const fx = fixture();
  writeFileSync(join(fx.run, 'ticket-new.md'), 'v1\n');
  approve({ session: fx.session, env: fx.env });
  for (const command of WRITES) assert.equal(decision(fx, 'Bash', { command }), 'allow', command);
  writeFileSync(join(fx.run, 'ticket-new.md'), 'v2\n');
  assert.equal(decision(fx, 'Bash', { command: WRITES[0] }), 'deny');
});

test('should deny creating a ticket even when approved, since the skill only updates the linked one', () => {
  const fx = fixture();
  writeFileSync(join(fx.run, 'ticket-new.md'), 'v1\n');
  approve({ session: fx.session, env: fx.env });
  for (const command of ['gh issue create -t x', 'glab issue create', 'acli jira workitem create --summary x'])
    assert.match(hook(fx, 'Bash', { command }).permissionDecisionReason ?? '', /never creates/, command);
});

test('should deny an untrusted third-party CLI write and allow it once the user trusts it', () => {
  const fx = fixture();
  writeFileSync(join(fx.run, 'ticket-new.md'), 'v1\n');
  approve({ session: fx.session, env: fx.env });
  assert.match(hook(fx, 'Bash', { command: 'jira issue edit ABC-1 -b x' }).permissionDecisionReason, /third-party/);
  trust({ cli: 'jira', env: fx.env });
  assert.equal(decision(fx, 'Bash', { command: 'jira issue edit ABC-1 -b x' }), 'allow');
});

// ---------- MCP ----------
test('should deny an MCP ticket write when not approved and allow MCP reads', () => {
  const fx = fixture();
  assert.equal(decision(fx, 'mcp__atlassian__editJiraIssue', { issueIdOrKey: 'A-1' }), 'deny');
  assert.equal(decision(fx, 'mcp__asana__asana_update_task', {}), 'deny');
  assert.equal(decision(fx, 'mcp__atlassian__getJiraIssue', {}), 'allow');
  assert.equal(decision(fx, 'mcp__slack__post_message', {}), 'allow');
});

test('should allow an MCP ticket update when approved but never an MCP create', () => {
  const fx = fixture();
  writeFileSync(join(fx.run, 'ticket-new.md'), 'v1\n');
  approve({ session: fx.session, env: fx.env });
  assert.equal(decision(fx, 'mcp__linear__update_issue', {}), 'allow');
  assert.equal(decision(fx, 'mcp__github__issue_write', { method: 'update' }), 'allow');
  assert.equal(decision(fx, 'mcp__github__issue_write', { method: 'create' }), 'deny');
  assert.equal(decision(fx, 'mcp__trello__trelloWriteCard', { action: 'create' }), 'deny');
});

// ---------- fail open ----------
test('should allow and exit 0 when the input is not JSON', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', env: { ...process.env, DOD_GUARD: '', DOD_GUARD_ENABLED: 'true' }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

// ---------- fuzz ----------
test('should deny a ticket write when it is wrapped in random prefixes, spacing and separators', () => {
  const ctx = { approved: false, trusted: () => false, allowedPath: () => false, cwd: '/w' };
  let seed = 3;
  const rnd = k => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
  const pre = ['', 'A=1 ', 'env ', 'command ', 'time ', 'git status && ', 'ls; ', 'true || '];
  const reads = ['gh issue view 1', 'glab issue view 2', 'acli jira workitem view --key A-1', 'git log', 'echo "gh issue edit 1"'];
  for (let i = 0; i < 300; i++) {
    const words = WRITES[rnd(WRITES.length)].split(' ');
    const cmd = pre[rnd(pre.length)] + words.join([' ', '  ', '\t'][rnd(3)]);
    assert.ok(bashVerdict(cmd, ctx), JSON.stringify(cmd));
    const read = pre[rnd(pre.length)] + reads[rnd(reads.length)];
    assert.equal(bashVerdict(read, ctx), null, JSON.stringify(read));
  }
});

test('should never throw when MCP tool names and inputs are random', () => {
  let seed = 5;
  const rnd = k => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
  const parts = ['mcp', '__', 'jira', 'Asana', 'update', 'create', 'get', 'x', '_', 'Write', 'issue', ''];
  for (let i = 0; i < 300; i++) {
    const name = Array.from({ length: rnd(6) }, () => parts[rnd(parts.length)]).join('');
    const v = mcpVerdict(name, [null, {}, { method: 'create' }, 'x'][rnd(4)], { approved: !!rnd(2) });
    assert.ok(v === null || typeof v === 'string');
  }
});

// answers.md: a warning, never a deny, for an answer whose question is not saved (P7 of the issue #19 retro)
const Q = ns => ns.map(n => `Q${n}: q${n}?\n(A) a\n  + p\n  - c\n(B) b\n  + p\n  - c\ntime: t\n\n`).join('');
const A = ns => ns.map(n => `A${n}: A\ntime: t\n`).join('');

test('should allow a write to answers.md without a warning when every answer has its question saved', () => {
  const fx = fixture();
  writeFileSync(join(fx.run, 'questions.md'), Q([1, 2]));
  const out = hook(fx, 'Write', { file_path: join(fx.run, 'answers.md'), content: A([1, 2]) });
  assert.deepEqual(out, { permissionDecision: 'allow' });
});

test('should warn, naming the answer and the missing question, and never deny when answers.md names an unsaved question', () => {
  const fx = fixture();
  writeFileSync(join(fx.run, 'questions.md'), Q([1, 20, 22]));
  writeFileSync(join(fx.run, 'answers.md'), A([1, 20]));
  const write = hook(fx, 'Write', { file_path: join(fx.run, 'answers.md'), content: A([1, 20, 21, 22]) });
  assert.equal(write.permissionDecision, undefined, 'no decision: the normal permission flow goes on');
  assert.match(write.additionalContext, /answers\.md will name A21, but \S+questions\.md has no Q21\. Save each question .* Not blocked\.$/);
  const edit = hook(fx, 'Edit', { file_path: join(fx.run, 'answers.md'), old_string: 'A20: A\ntime: t\n', new_string: 'A20: A\ntime: t\nA21: B\ntime: t\n' });
  assert.match(edit.additionalContext, /will name A21,/);
  const multi = hook(fx, 'MultiEdit', { file_path: join(fx.run, 'answers.md'), edits: [{ old_string: 'A1: A', new_string: 'A1: B' }, { old_string: '', new_string: 'A23: A\ntime: t\n' }] });
  assert.match(multi.additionalContext, /will name A23,/);
});

test('should not warn when questions.md holds no question yet, the guard is off, or the file is not answers.md in the run', () => {
  const fx = fixture();
  assert.deepEqual(hook(fx, 'Write', { file_path: join(fx.run, 'answers.md'), content: A([1, 2]) }), { permissionDecision: 'allow' }, 'no questions saved');
  writeFileSync(join(fx.run, 'questions.md'), Q([1]));
  assert.deepEqual(hook(fx, 'Write', { file_path: join(fx.run, 'answers.md'), content: A([1, 2]) }, { DOD_GUARD_ENABLED: 'false' }), { permissionDecision: 'allow' }, 'guard off');
  assert.deepEqual(hook(fx, 'Write', { file_path: join(fx.run, 'notes.md'), content: A([1, 2]) }), { permissionDecision: 'allow' }, 'another file');
  assert.equal(decision(fx, 'Write', { file_path: join(fx.repo, 'src', 'answers.md'), content: A([2]) }), 'deny', 'outside the run: the usual deny');
});

test('should compute answers.md after a Write, an Edit or a MultiEdit, and give null when the call is not readable', () => {
  assert.equal(answersAfter('Write', { content: 'x' }, 'old'), 'x');
  assert.equal(answersAfter('Edit', { old_string: 'a', new_string: 'b' }, 'a a'), 'b a');
  assert.equal(answersAfter('Edit', { old_string: 'a', new_string: '$&b', replace_all: true }, 'a a'), '$&b $&b');
  assert.equal(answersAfter('Edit', { old_string: 'a', new_string: '$&' }, 'a'), '$&', 'no replacement patterns');
  assert.equal(answersAfter('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: '', new_string: 'c' }] }, 'a'), 'bc');
  for (const [tool, ti] of [['Write', {}], ['Edit', { old_string: 1 }], ['MultiEdit', { edits: 'x' }], ['MultiEdit', { edits: [{}] }], ['NotebookEdit', {}]]) assert.equal(answersAfter(tool, ti, ''), null, tool);
});

test('should be registered in the plugin hooks for edits, Bash and MCP tools', () => {
  const hooks = JSON.parse(readFileSync(join(HERE, 'hooks.json'), 'utf8')).hooks.PreToolUse;
  const entry = hooks.find(h => h.hooks.some(x => x.command.includes('dod-guard.mjs')));
  assert.ok(entry, 'dod-guard.mjs is registered');
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'mcp__atlassian__editJiraIssue']) assert.match(tool, new RegExp(`^(?:${entry.matcher})$`), tool);
});
