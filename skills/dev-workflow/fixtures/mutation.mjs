// Shared fixture of the dev-workflow mutation tests (ADR 0011 phase 3: `next` from tdd runs the mutation gate). Not a test file itself.
// A small git repo: `main` (also as origin/main and origin/HEAD) holds the base, the branch feat/x holds the change; the sources are tiny .mjs modules whose
// mutants are known in advance (mutation/mutants.mjs): `n >= 10` gives ge-gt (`n > 10`) and const-inc (`n >= 11`), both on line 1.
// The run is put at the tdd step by hand (the earlier steps have their own tests); the PR comes from next --pr with --pr-body, so gh is never called.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = join(HERE, 'workflow.mjs');
export const shq = s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
/** the test command given once by next --test-cmd: one node process per test file */
export const TEST_CMD = `${shq(process.execPath)} {file}`;
export const PR = 'https://github.com/o/r/pull/11';
export const PR_BODY = '## Why\n\nx\n\n## Expected outcome\n\nnot measurable: demo\n\n## If we do nothing\n\ny\n\n## How we know\n\nz\n';

// ---------------------------------------------------------------- sources and tests
export const CALC = 'src/calc.mjs';
export const CALC_TEST = 'test/calc.test.mjs';
export const CALC_SRC = 'export const isBig = n => n >= 10;\n';
/** a node:test file for src/calc.mjs; checks = [[input, want], ...] */
export const calcTest = checks => `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBig } from '../src/calc.mjs';
test('isBig', () => {
${checks.map(([n, want]) => `  assert.equal(isBig(${n}), ${want});`).join('\n')}
});
`;
/** misses the boundary: both mutants of line 1 survive */
export const WEAK = calcTest([[50, true], [1, false]]);
/** pins the boundary on both sides: both mutants of line 1 are killed */
export const STRONG = calcTest([[10, true], [9, false]]);
/** fails on the unmutated code: no test file is usable, so every mutant is unverifiable (not killed, not a survivor) */
export const BROKEN = calcTest([[10, false]]);

export const AGE = 'src/age.mjs';
export const AGE_SRC = 'export const isAdult = age => age >= 18;\n';
/** the same behaviour, a changed line: its mutants (ge-gt, const-inc) are new mutants on a changed source */
export const AGE_SRC_EDITED = 'export const isAdult = (age) => age >= 18;\n';
export const ageTest = checks => `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdult } from '../src/age.mjs';
test('isAdult', () => {
${checks.map(([n, want]) => `  assert.equal(isAdult(${n}), ${want});`).join('\n')}
});
`;
export const AGE_STRONG = ageTest([[18, true], [17, false]]);
export const AGE_WEAK = ageTest([[30, true], [5, false]]);
export const APP_SRC = "import { isAdult } from './age.mjs';\nexport const canVote = a => isAdult(a);\n";
export const APP_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { canVote } from '../src/app.mjs';\ntest('canVote', () => {\n  assert.equal(canVote(18), true);\n  assert.equal(canVote(17), false);\n});\n";
export const OTHER_SRC = 'export const two = () => 2;\n';
export const OTHER_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { two } from '../src/other.mjs';\ntest('two', () => assert.equal(two(), 2));\n";
export const THREE_SRC = 'export const three = () => 3;\n';
export const THREE_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { three } from '../src/three.mjs';\ntest('three', () => assert.equal(three(), 3));\n";

// ---------------------------------------------------------------- the repo
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const put = (repo, files) => {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    writeFileSync(join(repo, p), c);
  }
};

/**
 * A repo whose main holds `base` and whose branch feat/x adds `branch` on top (one commit each). -> { base, repo, env, git, commit, done }.
 * env: PATH and a temp HOME and cache only: no WORKFLOW_ flag, so each test sets the flags it is about.
 */
export function mrepo({ base = { 'README.md': 'x\n' }, branch = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dw-mut-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  put(repo, base); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  // the default branch as a clone sees it, so the merge base is found whichever ref the code asks for
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  const commit = files => { put(repo, files); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'change'); };
  if (Object.keys(branch).length) commit(branch);
  const body = join(dir, 'pr.md');
  writeFileSync(body, PR_BODY);
  const env = { PATH: process.env.PATH, HOME: dir, XDG_CACHE_HOME: join(dir, 'cache'), DOD_MARKER_DIR: join(dir, 'dodm'), DOD_RUN_BASE: join(dir, 'dodr'), CLAUDE_CODE_SESSION_ID: 'sess-mut' };
  return { dir, repo, env, body, git: (...a) => git(repo, ...a), commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** the run's state file, moved to the tdd step (the earlier gates have their own tests) */
export function toTdd(run) {
  const f = join(run, 'state.json');
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), step: 'tdd' }, null, 2));
}

/** the mutation Result next wrote in the run folder, or null */
export function mutationJson(run) {
  try { return JSON.parse(readFileSync(join(run, 'mutation.json'), 'utf8')); } catch { return null; }
}

/** a mutation-equivalent.json (ADR 0011 equivalent.mjs, schema 1) that marks these mutants */
export const equivalentDoc = mutants => JSON.stringify({ schema: 1, marks: mutants.map(m => ({ id: m.id, file: m.file, line: m.line, reason: 'no input can tell this edit from the original line', judge: 'judge-1' })) });

/** the survivors of a Result */
export const survivorsOf = r => (r?.mutants ?? []).filter(m => m.result === 'survived');
/** true when the errors name this mutant: its id, or file:line */
export const names = (errors, m) => errors.some(e => e.includes(m.id) || e.includes(`${m.file}:${m.line}`));
