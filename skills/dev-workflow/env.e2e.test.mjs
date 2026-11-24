// E2E for the verify env check (ADR 0005): the real workflow.mjs CLI as a child process on a temp git repo whose run sits at verify,
// with WORKFLOW_VERIFY_ENV_CHECK_ENABLED unset, true, false and invalid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG } from './flags.mjs';
import { STATE_FILE } from './io.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'workflow.mjs');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'ignore' });
const ADR = envLine => `---\ntouches:\n  - "src/**"\ndod: env\n---\n# 1. Env\n\n## Definition of done\n\n- [ ] Works (happy): it works\n- [ ] Fast (happy): it is fast\n\n${envLine}\n`;
const SECTION = (id, env) => `## ${id}\nenv: ${env}\nrun: node --test\nresult: pass\n\`\`\`\n# pass 1\n\`\`\`\n`;

function atVerify(flag, envLine, verify) {
  const base = mkdtempSync(join(tmpdir(), 'dw-env-'));
  const repo = join(base, 'repo');
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
  mkdirSync(join(repo, 'docs', 'verify'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'feat/env');
  writeFileSync(join(repo, 'docs', 'adr', '0001-env.md'), ADR(envLine));
  writeFileSync(join(repo, 'docs', 'verify', 'env.md'), verify);
  const bin = join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'node'));
  const env = { PATH: bin, HOME: base, XDG_CACHE_HOME: join(base, 'cache') };
  const cli = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a], { cwd: repo, env, encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout) }; };
  const run = cli('open', '--slug', 'env').out.run;
  // a run that reached verify: the earlier steps have their own e2e tests (e2e.test.mjs, workflow.test.mjs)
  writeFileSync(join(run, STATE_FILE), JSON.stringify({ slug: 'env', branch: 'feat/env', step: 'verify', measure: false, skipped: {}, pr: 'https://github.com/o/r/pull/1' }));
  if (flag !== undefined) env[FLAG.verifyEnv] = flag;
  return { cli, done: () => rmSync(base, { recursive: true, force: true }) };
}

const BOOKED = '- verify env: [cloud] fixture e2e; [ci] CI green (A7)';
const MISMATCH = SECTION('Works', 'cloud container') + SECTION('Fast', 'staging');
const GOOD = SECTION('Works', 'cloud container') + SECTION('Fast', 'ci run 7');

for (const [label, flag] of [['flags: defaults', undefined], ['flags: on', 'true']]) {
  test(`should close verify on an unbooked env and open it when every booked env has a passing item (${label}) (EnvMatch, Mismatch, EnvCoverage)`, () => {
    const f = atVerify(flag, BOOKED, MISMATCH);
    try {
      const shut = f.cli('next');
      assert.equal(shut.code, 1);
      assert.ok(shut.out.errors.some(e => e.startsWith('Fast: env "staging" does not start with a booked name ([cloud], [ci])')), shut.out.errors.join('\n'));
      assert.ok(shut.out.errors.some(e => /booked env \[ci\] has no passing item/.test(e)));
      assert.equal(f.cli('tick').code, 1);
    } finally { f.done(); }
    const g = atVerify(flag, BOOKED, GOOD);
    try {
      assert.deepEqual(g.cli('tick').out, { ok: true, tick: ['Works', 'Fast'], warnings: [] });
      assert.equal(g.cli('next').out.step, 'retro');
    } finally { g.done(); }
  });
}

test('should pass with a warning when the ADR books no env names (flags: defaults) (NoNames)', () => {
  const f = atVerify(undefined, '- verify env: cloud container, CI green (A7)', MISMATCH);
  try {
    const st = f.cli('status').out;
    assert.match(st.evidence.verifyWarnings.join(), /no env names booked/);
    assert.match(f.cli('tick').out.warnings.join(), /no env names booked/);
    assert.equal(f.cli('next').out.step, 'retro');
  } finally { f.done(); }
});

test('should ignore env names entirely when the check is off (flags: off) (Flag)', () => {
  const f = atVerify('false', BOOKED, MISMATCH);
  try {
    assert.deepEqual(f.cli('tick').out, { ok: true, tick: ['Works', 'Fast'], warnings: [] });
    assert.deepEqual(f.cli('status').out.evidence.verifyWarnings, []);
    assert.equal(f.cli('next').out.step, 'retro');
  } finally { f.done(); }
});

test('should exit 2 with the fix when the flag value is not valid (flags: invalid) (Flag)', () => {
  const f = atVerify('1', BOOKED, GOOD);
  try {
    const r = f.cli('next');
    assert.equal(r.code, 2);
    assert.match(r.out.errors[0], /WORKFLOW_VERIFY_ENV_CHECK_ENABLED=1 is not valid: use true or false/);
  } finally { f.done(); }
});
