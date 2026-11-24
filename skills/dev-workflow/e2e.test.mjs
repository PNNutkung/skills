// E2E: the real workflow.mjs CLI and the real workflow-guard hook as child processes on a temp git repo, with the flag unset, on and off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG } from './flags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'workflow.mjs');
const HOOK = join(HERE, '..', '..', 'hooks', 'workflow-guard.mjs');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'ignore' });

function setup(flag) {
  const base = mkdtempSync(join(tmpdir(), 'dw-e2e-'));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'feat/e2e');
  // PATH holds only node: no gh, so nothing reaches the network; the PR comes from next --pr, as in a session without gh
  const bin = join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'node'));
  const env = { PATH: bin, HOME: base, XDG_CACHE_HOME: join(base, 'cache') };
  if (flag !== undefined) env[FLAG.guard] = flag;
  const cli = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a], { cwd: repo, env, encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout) }; };
  const hook = input => { const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: repo, ...input }), env, encoding: 'utf8' }); return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow'; };
  return { base, repo, cli, hook, done: () => rmSync(base, { recursive: true, force: true }) };
}

function walk(f, guarded) {
  const write = { tool_name: 'Write', tool_input: { file_path: join(f.repo, 'src', 'app.js') } };
  const merge = { tool_name: 'Bash', tool_input: { command: 'gh pr merge --squash' } };
  const { out: o } = f.cli('open', '--slug', 'e2e');
  assert.equal(o.ok, true);
  const run = o.run;
  assert.equal(f.hook(write), guarded ? 'deny' : 'allow');
  writeFileSync(join(run, 'facts.md'), 'src/app.js:1 is empty\n');
  assert.equal(f.cli('next').out.step, 'dod');
  const dod = join(f.base, 'dod.json');
  writeFileSync(dod, JSON.stringify({ slug: 'e2e', items: [{ id: 'Works' }], unconfirmed: [] }));
  // the sibling definition-of-done is installed, so its check needs an open DoD session; without one the gate stays shut
  assert.equal(f.cli('next', '--dod', dod).code, 1);
  return { run, write, merge };
}

function guardRun(flag, guarded) {
  const f = setup(flag);
  try {
    const { write, merge } = walk(f, guarded);
    assert.equal(f.hook(merge), guarded ? 'deny' : 'allow');
    assert.equal(f.cli('close').code, 0);
    assert.equal(f.hook(write), 'allow', 'a closed run guards nothing');
    assert.equal(f.hook(merge), 'allow');
  } finally { f.done(); }
}

// flags: defaults: this test sets no flag, so the guard runs as a fresh install has it (on)
test('should run the CLI and guard edits and merges when the flag is unset (flags: defaults) (Skill, GuardEdit, GuardIdle)', () => guardRun(undefined, true));

for (const [label, flag, guarded] of [['flags: on', 'true', true], ['flags: off', 'false', false]]) {
  test(`should run the CLI and guard edits only when the flag says so (${label}) (Skill, GuardEdit, GuardIdle)`, () => guardRun(flag, guarded));
}

test('should exit 2 with the fix when the flag value is not valid (flags: invalid)', () => {
  const f = setup('yes');
  try {
    const r = f.cli('open', '--slug', 'e2e');
    assert.equal(r.code, 2);
    assert.match(r.out.errors[0], /WORKFLOW_GUARD_ENABLED=yes is not valid/);
    assert.equal(f.hook({ tool_name: 'Bash', tool_input: { command: 'ls' } }), 'deny');
  } finally { f.done(); }
});
