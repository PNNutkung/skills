// Tests for the dod-adr-sync hook. Run: node --test hooks/dod-adr-sync.test.mjs
// The hook runs as a child process after a real mv / git mv in a throwaway repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { movesOf } from './dod-adr-sync.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'dod-adr-sync.mjs');
const ADR = '---\ntouches:\n  - "src/reports/**"\n  - "src/util.ts"\ndod: x\n---\n# 1. X\n\nStatus: Accepted\n';

function fixture() {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'adr-sync-')));
  const put = (p, t) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), t); };
  put('docs/adr/0001-x.md', ADR); put('src/reports/a.ts', 'a\n'); put('src/reports/b.ts', 'b\n'); put('src/util.ts', 'u\n');
  const g = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'base');
  return { repo, g, adr: () => readFileSync(join(repo, 'docs/adr/0001-x.md'), 'utf8') };
}
function hook(fx, command, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: fx.repo }), env: { ...process.env, DOD_ADR_TOUCHES_SYNC_ENABLED: '', ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
}

test('should read the moves of mv and git mv, with flags, prefixes and several sources', () => {
  assert.deepEqual(movesOf('mv src/a b'), [{ sources: ['src/a'], target: 'b' }]);
  assert.deepEqual(movesOf('cd x && git -C . mv -f "src/my dir" lib/'), [{ sources: ['src/my dir'], target: 'lib/' }]);
  assert.deepEqual(movesOf('env A=1 mv -v a b c dest'), [{ sources: ['a', 'b', 'c'], target: 'dest' }]);
  assert.deepEqual(movesOf('echo "mv a b"; ls'), []);
  assert.deepEqual(movesOf('mv onlyone'), []);
});

test('should rewrite the touches when the agent moves a folder with plain mv, and say what it changed', () => {
  const fx = fixture();
  execFileSync('mv', [join(fx.repo, 'src/reports'), join(fx.repo, 'src/export')]);
  const said = hook(fx, 'mv src/reports src/export');
  assert.match(fx.adr(), /- "src\/export\/\*\*"/);
  assert.doesNotMatch(fx.adr(), /src\/reports/);
  assert.match(said, /dod-adr: docs\/adr\/0001-x\.md: src\/reports\/\*\* -> src\/export\/\*\*/);
  assert.match(readFileSync(join(fx.repo, 'docs/adr/README.md'), 'utf8'), /`src\/export\/\*\*`/);
});

test('should follow a file moved into an existing folder with git mv', () => {
  const fx = fixture();
  mkdirSync(join(fx.repo, 'lib'));
  fx.g('mv', 'src/util.ts', 'lib/');
  hook(fx, 'git mv src/util.ts lib/');
  assert.match(fx.adr(), /- "lib\/util\.ts"/);
});

test('should do nothing when DOD_ADR_TOUCHES_SYNC_ENABLED is false, the tool is not Bash, or nothing an ADR touches moved', () => {
  const fx = fixture();
  execFileSync('mv', [join(fx.repo, 'src/reports'), join(fx.repo, 'src/export')]);
  assert.equal(hook(fx, 'mv src/reports src/export', { DOD_ADR_TOUCHES_SYNC_ENABLED: 'false' }), '');
  assert.equal(fx.adr(), ADR);
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name: 'Edit', tool_input: {}, cwd: fx.repo }), encoding: 'utf8' });
  assert.equal(r.stdout, '');
  writeFileSync(join(fx.repo, 'x.txt'), 'x'); execFileSync('mv', [join(fx.repo, 'x.txt'), join(fx.repo, 'y.txt')]);
  assert.equal(hook(fx, 'mv x.txt y.txt'), '');
});

test('should exit 0 with no output when the input is junk or the folder is not a repo', () => {
  for (const input of ['not json', '{}', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'mv a b' }, cwd: tmpdir() })]) {
    const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('should be registered as a PostToolUse hook for Bash', () => {
  const hooks = JSON.parse(readFileSync(join(HERE, 'hooks.json'), 'utf8')).hooks.PostToolUse;
  assert.ok(hooks.some(h => h.matcher === 'Bash' && h.hooks.some(x => x.command.includes('dod-adr-sync.mjs'))));
});
