// Real git repos, the real CLI and the real pre-commit hook; counts come from the skill's own patterns (no linter needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'ratchet.mjs');
const ENV = { ...process.env, CI: '', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
for (const k of Object.keys(ENV)) if (k.startsWith('RETRO_')) delete ENV[k];

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ratchet-it-'));
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { env: ENV, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'const a = x as Foo;\nconst b = y as Bar;\n');
  g('add', '.'); g('commit', '-qm', 'init');
  return { dir, g, write: (f, t) => writeFileSync(join(dir, f), t), read: f => readFileSync(join(dir, f), 'utf8') };
}
const cli = (dir, args, env = {}) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env: { ...ENV, ...env }, encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout || 'null'), err: r.stderr }; };
const commit = (r, msg) => spawnSync('git', ['-C', r.dir, 'commit', '-qm', msg], { env: ENV, encoding: 'utf8' });

test('should write .ratchet.json at the repo root with today\'s counts when a rule is added (RtFile, RProp)', () => {
  const r = repo();
  const res = cli(join(r.dir, 'src'), ['add', '--rule', 'retro:ts-as-cast']);
  assert.equal(res.code, 0, res.err);
  assert.deepEqual(JSON.parse(r.read('.ratchet.json')).rules, { 'retro:ts-as-cast': { 'src/a.ts': 2 } });
  rmSync(r.dir, { recursive: true, force: true });
});

test('should stop the commit when a staged file gets a new violation and pass once it is fixed (RtRun, RtBase)', () => {
  const r = repo();
  cli(r.dir, ['add', '--rule', 'retro:ts-as-cast']);
  assert.ok(cli(r.dir, ['install']).out.installed);
  r.g('add', '.'); assert.equal(commit(r, 'baseline').status, 0);
  r.write('src/b.ts', 'const c = z as Baz;\n'); r.g('add', '.');
  const bad = commit(r, 'new cast');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /src\/b\.ts\s+0 -> 1\s+\(src\/b\.ts:1\)/);
  r.write('src/b.ts', 'const c: Baz = z;\n'); r.g('add', '.');
  assert.equal(commit(r, 'fixed').status, 0);
  rmSync(r.dir, { recursive: true, force: true });
});

test('should lower and stage the baseline in the same commit when a count goes down (RtLower)', () => {
  const r = repo();
  cli(r.dir, ['add', '--rule', 'retro:ts-as-cast']); cli(r.dir, ['install']);
  r.g('add', '.'); commit(r, 'baseline');
  r.write('src/a.ts', 'const a: Foo = x;\nconst b = y as Bar;\n'); r.g('add', 'src/a.ts');
  const c = commit(r, 'one less');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stderr, /went down, \.ratchet\.json updated and staged/);
  assert.equal(r.g('show', 'HEAD:.ratchet.json').includes('"src/a.ts": 1'), true);
  assert.equal(r.g('status', '--porcelain'), '');
  rmSync(r.dir, { recursive: true, force: true });
});

test('should keep a renamed file\'s counts and refuse moved violations until accepted when files move (RtGran)', () => {
  const r = repo();
  cli(r.dir, ['add', '--rule', 'retro:ts-as-cast']); cli(r.dir, ['install']);
  r.g('add', '.'); commit(r, 'baseline');
  r.g('mv', 'src/a.ts', 'src/z.ts');
  const mv = commit(r, 'rename');
  assert.equal(mv.status, 0, mv.stderr);
  assert.match(r.g('show', 'HEAD:.ratchet.json'), /"src\/z\.ts": 2/);
  r.write('src/z.ts', 'const a = x as Foo;\n'); r.write('src/d.ts', 'const b = y as Bar;\n'); r.g('add', '.');
  assert.notEqual(commit(r, 'move one').status, 0);
  const acc = cli(r.dir, ['accept', '--rule', 'retro:ts-as-cast', '--file', 'src/d.ts', '--reason', 'moved from z.ts']);
  assert.equal(acc.code, 0, acc.err);
  assert.equal(acc.out.count, 1);
  r.g('add', '.');
  assert.equal(commit(r, 'move one').status, 0);
  assert.equal(JSON.parse(r.read('.ratchet.json')).accepted[0].reason, 'moved from z.ts');
  assert.equal(cli(r.dir, ['accept', '--rule', 'retro:ts-as-cast', '--file', 'src/d.ts', '--reason', ' ']).code, 2);
  rmSync(r.dir, { recursive: true, force: true });
});

test('should fail in CI without writing when a count goes up and only warn when one goes down (RtRun)', () => {
  const r = repo();
  cli(r.dir, ['add', '--rule', 'retro:ts-as-cast']);
  r.write('src/a.ts', 'const a = x as Foo;\n');
  const down = cli(r.dir, ['check', '--ci']);
  assert.equal(down.code, 0); assert.equal(down.out.lowered, false); assert.match(down.err, /run check --write/);
  assert.match(r.read('.ratchet.json'), /"src\/a\.ts": 2/);
  r.write('src/a.ts', 'const a = x as Foo;\nb as C;\nc as D;\n');
  const up = cli(r.dir, ['check'], { CI: 'true' });
  assert.equal(up.code, 1); assert.equal(up.out.up[0].to, 3);
  rmSync(r.dir, { recursive: true, force: true });
});

test('should pass with a note when the repo has no .ratchet.json (RtFile)', () => {
  const r = repo();
  const res = cli(r.dir, ['check']);
  assert.equal(res.code, 0); assert.match(res.out.note, /nothing is enforced/);
  rmSync(r.dir, { recursive: true, force: true });
});

test('should give the line instead of overwriting when a pre-commit hook it did not write exists (RtHook)', () => {
  const r = repo();
  const hook = join(r.dir, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, '#!/bin/sh\necho mine\n');
  const res = cli(r.dir, ['install']);
  assert.match(res.out.skipped, /not ours/); assert.match(res.out.line, /check --staged --write/);
  assert.equal(readFileSync(hook, 'utf8'), '#!/bin/sh\necho mine\n');
  r.g('config', 'core.hooksPath', '.husky');
  assert.match(cli(r.dir, ['install']).out.skipped, /husky or lefthook/);
  rmSync(r.dir, { recursive: true, force: true });
});

test('should stop with exit 2 when a flag or the baseline is not valid (FStrict)', () => {
  const r = repo();
  assert.equal(cli(r.dir, ['check'], { RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED: '0' }).code, 2);
  assert.equal(cli(r.dir, ['install'], { RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED: 'false' }).out.skipped, 'RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED=false');
  assert.ok(!existsSync(join(r.dir, '.git', 'hooks', 'pre-commit')));
  r.write('.ratchet.json', '{"version":1,"rules":{"retro:ts-as-cast":{"../x":1}}}');
  assert.equal(cli(r.dir, ['check']).code, 2);
  assert.equal(cli(r.dir, ['nope']).code, 2);
  assert.equal(cli(r.dir, ['check', '--bogus']).code, 2);
  rmSync(r.dir, { recursive: true, force: true });
});

test('should stop the commit when the hook meets a flag that is not valid and skip when it is false (FStrict, FFlags)', () => {
  const r = repo();
  cli(r.dir, ['add', '--rule', 'retro:ts-as-cast']); cli(r.dir, ['install']);
  r.g('add', '.');
  assert.notEqual(spawnSync('git', ['-C', r.dir, 'commit', '-qm', 'x'], { env: { ...ENV, RETRO_TRANSCRIPTS_ENABLED: 'nah' }, encoding: 'utf8' }).status, 0);
  r.write('src/b.ts', 'a as B;\n'); r.g('add', '.');
  assert.equal(spawnSync('git', ['-C', r.dir, 'commit', '-qm', 'x'], { env: { ...ENV, RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED: 'false' }, encoding: 'utf8' }).status, 0);
  rmSync(r.dir, { recursive: true, force: true });
});
