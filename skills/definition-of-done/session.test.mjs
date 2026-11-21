// Tests for the DoD session: run folder and marker, ticket approval, third-party CLI trust, tool choice.
// Every test points DOD_MARKER_DIR, DOD_RUN_BASE and DOD_CONFIG_DIR at a temp dir, so the real ~/.cache and ~/.config are never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approve, close, isTrusted, open, readActive, ticketApproved, toolFor, trust } from './session.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dod-session-')));
let n = 0;
function fixture() {
  const dir = join(tmp, `f${n++}`);
  const repo = join(dir, 'repo');
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q']);
  const env = { DOD_MARKER_DIR: join(dir, 'markers'), DOD_RUN_BASE: join(dir, 'runs'), DOD_CONFIG_DIR: join(dir, 'config') };
  return { repo, env, session: `s-${n}` };
}

test('should open a run with a private run folder and marker when no run is active', () => {
  const fx = fixture();
  const { run, marker } = open({ repo: fx.repo, slug: 'csv', session: fx.session, env: fx.env });
  assert.ok(existsSync(run) && existsSync(marker));
  const active = readActive({ session: fx.session, env: fx.env });
  assert.equal(active.run, run);
  assert.equal(active.repo, realpathSync(fx.repo));
  assert.equal(active.slug, 'csv');
});

test('should refuse a second open when a run is already active in the session', () => {
  const fx = fixture();
  open({ repo: fx.repo, slug: 'a', session: fx.session, env: fx.env });
  assert.throws(() => open({ repo: fx.repo, slug: 'b', session: fx.session, env: fx.env }), /a run is active/);
});

test('should end the run when close is called, and be harmless when called twice', () => {
  const fx = fixture();
  const { run } = open({ repo: fx.repo, slug: 'a', session: fx.session, env: fx.env });
  assert.deepEqual(close({ session: fx.session, env: fx.env }), { closed: run });
  assert.equal(readActive({ session: fx.session, env: fx.env }), null);
  assert.deepEqual(close({ session: fx.session, env: fx.env }), { closed: null });
});

test('should ignore a marker when it is stale, writable by others or a symlink', () => {
  const fx = fixture();
  const { marker } = open({ repo: fx.repo, slug: 'a', session: fx.session, env: fx.env });
  assert.equal(readActive({ session: fx.session, env: fx.env, now: Date.now() + 9 * 3600e3 }), null);
  chmodSync(marker, 0o666);
  assert.equal(readActive({ session: fx.session, env: fx.env }), null);
  const fx2 = fixture();
  mkdirSync(fx2.env.DOD_MARKER_DIR, { recursive: true, mode: 0o700 });
  symlinkSync(marker, join(fx2.env.DOD_MARKER_DIR, `${fx2.session}.json`));
  assert.equal(readActive({ session: fx2.session, env: fx2.env }), null);
});

test('should refuse a session id when it could escape the marker folder', () => {
  const fx = fixture();
  assert.throws(() => open({ repo: fx.repo, slug: 'a', session: '../x', env: fx.env }), /bad session id/);
  assert.equal(readActive({ session: '../x', env: fx.env }), null);
});

test('should refuse a slug when it could escape docs/dod', () => {
  const fx = fixture();
  assert.throws(() => open({ repo: fx.repo, slug: '../x', session: fx.session, env: fx.env }), /bad slug/);
});

test('should approve exactly the rendered text, so a later DoD change needs approval again', () => {
  const fx = fixture();
  const { run } = open({ repo: fx.repo, slug: 'a', session: fx.session, env: fx.env });
  assert.equal(ticketApproved(run), false);
  assert.throws(() => approve({ session: fx.session, env: fx.env }), /render first/);
  writeFileSync(join(run, 'ticket-new.md'), 'v1\n');
  approve({ session: fx.session, env: fx.env });
  assert.equal(ticketApproved(run), true);
  writeFileSync(join(run, 'ticket-new.md'), 'v2\n');
  assert.equal(ticketApproved(run), false);
});

test('should not count an approval file when others can write it', () => {
  const fx = fixture();
  const { run } = open({ repo: fx.repo, slug: 'a', session: fx.session, env: fx.env });
  writeFileSync(join(run, 'ticket-new.md'), 'v1\n');
  approve({ session: fx.session, env: fx.env });
  chmodSync(join(run, '.ticket-ok'), 0o666);
  assert.equal(ticketApproved(run), false);
});

test('should remember a trusted third-party CLI per machine when the user trusts it', () => {
  const fx = fixture();
  assert.equal(isTrusted('jira', fx.env), false);
  trust({ cli: 'jira', env: fx.env });
  assert.equal(isTrusted('jira', fx.env), true);
  assert.ok(JSON.parse(readFileSync(join(fx.env.DOD_CONFIG_DIR, 'trusted-cli.json'), 'utf8')).cli.includes('jira'));
  assert.throws(() => trust({ cli: 'gh', env: fx.env }), /official/);
  assert.throws(() => trust({ cli: 'curl', env: fx.env }), /not a known/);
});

function binDir(names) {
  const d = mkdtempSync(join(tmp, 'bin-'));
  for (const name of names) { writeFileSync(join(d, name), '#!/bin/sh\n'); chmodSync(join(d, name), 0o755); }
  return d;
}

test('should pick the official CLI first when it is on PATH', () => {
  const fx = fixture();
  const PATH = binDir(['gh', 'glab', 'acli', 'jira']);
  assert.deepEqual(toolFor({ system: 'github', env: { ...fx.env, PATH } }), { use: 'cli', cli: 'gh' });
  assert.deepEqual(toolFor({ system: 'gitlab', env: { ...fx.env, PATH } }), { use: 'cli', cli: 'glab' });
  assert.deepEqual(toolFor({ system: 'jira', env: { ...fx.env, PATH } }), { use: 'cli', cli: 'acli' });
});

test('should ask before a third-party CLI when no official one is on PATH and it is not trusted yet', () => {
  const fx = fixture();
  const PATH = binDir(['jira', 'linear']);
  const t = toolFor({ system: 'jira', env: { ...fx.env, PATH } });
  assert.equal(t.use, 'ask-trust');
  assert.equal(t.cli, 'jira');
  assert.match(t.command, /dod\.mjs" trust --cli jira/);
  trust({ cli: 'jira', env: fx.env });
  assert.deepEqual(toolFor({ system: 'jira', env: { ...fx.env, PATH } }), { use: 'cli', cli: 'jira', thirdParty: true });
});

test('should fall back to MCP or the file when no CLI fits, and for systems with no CLI at all', () => {
  const fx = fixture();
  const PATH = binDir([]);
  for (const system of ['github', 'jira', 'asana', 'trello', 'linear']) assert.equal(toolFor({ system, env: { ...fx.env, PATH } }).use, 'mcp-or-file', system);
  assert.throws(() => toolFor({ system: 'notion', env: fx.env }), /unknown system/);
});
