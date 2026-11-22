// The ratchet with the real ESLint and ruff. Locally a missing linter skips its test with a message; with CI=true it fails (TLint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'ratchet.mjs');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const IN_CI = String(process.env.CI ?? '').toLowerCase() === 'true';
const has = bin => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;

/** Skip with a reason locally; fail in CI, where the workflow installs both linters. */
export function linterGate(name, present, inCi) {
  if (present) return { run: true };
  if (inCi) return { run: false, fail: `${name} is not installed but CI=true: the workflow must install it` };
  return { run: false, skip: `${name} is not installed; install it to run this test (CI installs it)` };
}

test('should skip locally and fail in CI when a linter is missing (TLint)', () => {
  assert.deepEqual(linterGate('ruff', true, true), { run: true });
  assert.match(linterGate('ruff', false, false).skip, /not installed/);
  assert.match(linterGate('ruff', false, true).fail, /CI=true/);
});

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ratchet-lint-'));
  for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, f), t);
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'add', '.'], { env: ENV });
  return dir;
}
const cli = (dir, args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env: { ...ENV, CI: '' }, encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout || 'null'), err: r.stderr }; };

for (const [name, files, rule, file, worse] of [
  ['eslint', { 'eslint.config.mjs': "export default [{ files: ['**/*.js'], rules: { 'no-var': 'error' } }];\n", 'a.js': 'var x = 1;\nvar y = 2;\nexport { x, y };\n' }, 'eslint:no-var', 'a.js', 'var x = 1;\nvar y = 2;\nvar z = 3;\nexport { x, y, z };\n'],
  ['ruff', { 'a.py': 'import os\nimport sys\n' }, 'ruff:F401', 'a.py', 'import os\nimport sys\nimport re\n'],
]) {
  test(`should count ${rule} from the real ${name} and fail when it gets worse (RtTools, RtLint)`, t => {
    const gate = linterGate(name, has(name), IN_CI);
    if (gate.fail) assert.fail(gate.fail);
    if (!gate.run) return t.skip(gate.skip);
    const dir = fixture(files);
    const added = cli(dir, ['add', '--rule', rule]);
    assert.equal(added.code, 0, added.err + JSON.stringify(added.out));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '.ratchet.json'), 'utf8')).rules[rule], { [file]: 2 });
    writeFileSync(join(dir, file), worse);
    const r = cli(dir, ['check']);
    assert.equal(r.code, 1, r.err);
    assert.deepEqual(r.out.up.map(u => [u.file, u.from, u.to]), [[file, 2, 3]]);
    rmSync(dir, { recursive: true, force: true });
  });
}
