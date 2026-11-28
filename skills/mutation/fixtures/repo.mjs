// Test fixtures for the skills/mutation tests (ADR 0011): a tiny git repo with a JS module and a node:test file. Not a test file itself.
// src/calc.mjs line 2 (isBig) is pinned by test/calc.test.mjs on both sides of its boundary, so each of its mutants is killed; line 6 (half) is never
// tested, so each of its mutants survives. Tests run through paired-agent-tdd's direct-run.mjs (no sandbox needed), one `node <file>` per test file.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MUTATION_DIR = join(HERE, '..');
export const DIRECT_RUNNER = join(MUTATION_DIR, '..', 'paired-agent-tdd', 'direct-run.mjs');
export const shq = s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
export const NODE_CMD = `${shq(process.execPath)} {file}`;

export const CALC = `export function isBig(n) {
  return n >= 10;
}

export function half(n) {
  return n / 2;
}
`;
export const KILLED_LINE = 2, SURVIVOR_LINE = 6;
export const TEST_CALC = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBig } from '../src/calc.mjs';
test('isBig', () => { assert.equal(isBig(10), true); assert.equal(isBig(9), false); });
`;

// maintenance.auto=false: a commit starts no `git maintenance run --auto` process
export const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...a],
  { encoding: 'utf8' }).trim();
export const put = (repo, files) => {
  for (const [p, c] of Object.entries(files)) {
    const f = join(repo, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
};
export const commit = (repo, files, msg = 'c') => { put(repo, files); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', msg); return git(repo, 'rev-parse', 'HEAD'); };

/** A temp dir removed after the test: { dir, repo, scratch }. */
export function tempDir(t, prefix = 'mutation-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, repo: join(dir, 'repo'), scratch: join(dir, 'scratch') };
}

/** base = a README only; head adds src/calc.mjs and test/calc.test.mjs (plus `extra` files). -> { dir, repo, scratch, base, head } */
export function calcRepo(t, { source = CALC, testText = TEST_CALC, extra = {} } = {}) {
  const fx = tempDir(t);
  mkdirSync(fx.repo);
  git(fx.repo, 'init', '-q');
  const base = commit(fx.repo, { 'README.md': 'x\n' }, 'base');
  const head = commit(fx.repo, { 'src/calc.mjs': source, 'test/calc.test.mjs': testText, ...extra }, 'head');
  return { ...fx, base, head };
}

/** The runMutation options for the calc fixture. */
export const calcOpts = (fx, more = {}) => ({ repo: fx.repo, base: fx.base, head: fx.head, scratch: fx.scratch, cmd: NODE_CMD, runner: DIRECT_RUNNER, jobs: 4, timeout: 60, ...more });

/** A seeded generator, so a failing fuzz case can be replayed. */
export const rng = seed => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
export const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

/** { ok: true, value } or { ok: false, error }: works for a sync or an async function. */
export async function attempt(fn) {
  try { return { ok: true, value: await fn() }; } catch (error) { return { ok: false, error }; }
}
