// Unit tests for select.mjs testsFor(file, tests, repo) (ADR 0011 Interface, A10 speed): the test files whose static import/require graph reaches `file`,
// transitively; a language without a graph gets every test. `repo` is a git work tree whose files are committed and checked out, so reading the work tree
// or HEAD gives the same answer. The order of the result is not fixed (compared sorted); it may be sync or async.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commit, git, put, tempDir } from './fixtures/repo.mjs';
import { testsFor } from './select.mjs';

const TESTS = ['test/a.test.mjs', 'test/b.test.cjs', 'test/helper-user.test.mjs', 'test/none.test.mjs', 'test/cycle.test.mjs'];
function graphRepo(t) {
  const { repo } = tempDir(t, 'mutation-select-');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  commit(repo, {
    'src/a.mjs': "import { b } from './b.mjs';\nexport const a = () => b() + 1;\n",
    'src/b.mjs': "import { c } from './deep/c.mjs';\nexport const b = () => c();\n",
    'src/deep/c.mjs': 'export const c = () => 1;\n',
    'src/lone.mjs': 'export const lone = 1;\n',
    'src/legacy.js': "const { a } = require('./other.js');\nmodule.exports = { legacy: () => a };\n",
    'src/other.js': 'module.exports = { a: 1 };\n',
    'src/x.mjs': "import { y } from './y.mjs';\nexport const x = 1;\n",
    'src/y.mjs': "import { x } from './x.mjs';\nexport const y = 2;\n",
    'scripts/deploy.sh': 'echo hi\n',
    'test/helper.mjs': "export { lone } from '../src/lone.mjs';\n",
    'test/a.test.mjs': "import { test } from 'node:test';\nimport { a } from '../src/a.mjs';\ntest('a', () => a());\n",
    'test/b.test.cjs': "const test = require('node:test');\nconst { legacy } = require('../src/legacy.js');\ntest('b', () => legacy());\n",
    'test/helper-user.test.mjs': "import { lone } from './helper.mjs';\nimport assert from 'node:assert';\nassert.equal(lone, 1);\n",
    'test/none.test.mjs': "import { test } from 'node:test';\ntest('none', () => {});\n",
    'test/cycle.test.mjs': "import { x } from '../src/x.mjs';\nconsole.log(x);\n",
  });
  return repo;
}
const sel = async (file, repo, tests = TESTS) => [...(await testsFor(file, tests, repo))].sort();

test('should pick the test that imports a file directly or through other modules when the graph reaches it (FinalSpeed happy)', async t => {
  const repo = graphRepo(t);
  assert.deepEqual(await sel('src/a.mjs', repo), ['test/a.test.mjs']);
  assert.deepEqual(await sel('src/deep/c.mjs', repo), ['test/a.test.mjs'], 'a.test -> a -> b -> deep/c');
  assert.deepEqual(await sel('src/other.js', repo), ['test/b.test.cjs'], 'require() chains count too');
});

test('should pick no test when no test file reaches the file (FinalSpeed fail)', async t => {
  const repo = graphRepo(t);
  assert.deepEqual(await sel('src/deep/nothing.mjs', repo), []);
  assert.deepEqual(await sel('src/a.mjs', repo, ['test/none.test.mjs']), [], 'only the tests passed in are candidates');
});

test('should give every test when the file is in a language without an import graph (FinalSpeed edge)', async t => {
  const repo = graphRepo(t);
  assert.deepEqual(await sel('scripts/deploy.sh', repo), [...TESTS].sort());
});

test('should follow re-exports and stop on import cycles when it walks the graph (FinalSpeed)', async t => {
  const repo = graphRepo(t);
  assert.deepEqual(await sel('src/lone.mjs', repo), ['test/helper-user.test.mjs'], 'export ... from in a helper counts as an import');
  assert.deepEqual(await sel('src/y.mjs', repo), ['test/cycle.test.mjs'], 'x <-> y cycle ends');
});

// Dynamic import() (ADR 0011 Interface, select.mjs): a computed path is an unknown edge that reaches every file, so the test is kept; a literal path
// (a quoted string, or a template literal with no ${}) is followed like a static import.
const DYN_TESTS = ['test/dyn.test.mjs', 'test/via-helper.test.mjs', 'test/lit.test.mjs', 'test/tpl.test.mjs', 'test/tplvar.test.mjs', 'test/plain.test.mjs'];
function dynRepo(t) {
  const { repo } = tempDir(t, 'mutation-select-dyn-');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  commit(repo, {
    'src/a.mjs': "import { c } from './deep/c.mjs';\nexport const a = () => c();\n",
    'src/deep/c.mjs': 'export const c = () => 1;\n',
    'src/unrelated.mjs': 'export const u = 1;\n',
    'src/dyn.mjs': "import { join } from 'node:path';\nconst DIR = process.env.X_DIR ?? '.';\nexport const m = await import(join(DIR, 'c.mjs'));\n",
    'src/lit.mjs': "export const load = () => import('./deep/c.mjs');\n",
    'src/tpl.mjs': 'export const load = () => import(`./deep/c.mjs`);\n',
    'src/tplvar.mjs': "const n = 'c';\nexport const load = () => import(`./deep/${n}.mjs`);\n",
    'test/helper.mjs': "export { m } from '../src/dyn.mjs';\n",
    'test/dyn.test.mjs': "import { m } from '../src/dyn.mjs';\nconsole.log(m);\n",
    'test/via-helper.test.mjs': "import { m } from './helper.mjs';\nconsole.log(m);\n",
    'test/lit.test.mjs': "import { load } from '../src/lit.mjs';\nawait load();\n",
    'test/tpl.test.mjs': "import { load } from '../src/tpl.mjs';\nawait load();\n",
    'test/tplvar.test.mjs': "import { load } from '../src/tplvar.mjs';\nawait load();\n",
    'test/plain.test.mjs': "import { a } from '../src/a.mjs';\nconsole.log(a());\n",
  });
  return repo;
}

test('should keep a test whose graph holds an import() with a computed path when the target is an unrelated file (TestSelect happy)', async t => {
  const repo = dynRepo(t);
  const got = await sel('src/unrelated.mjs', repo, DYN_TESTS);
  assert.ok(got.includes('test/dyn.test.mjs'), `direct: ${got}`);
  assert.ok(got.includes('test/via-helper.test.mjs'), `through a helper: ${got}`);
});

test('should not return a test when its graph has only string-literal imports that miss the target (TestSelect fail)', async t => {
  const repo = dynRepo(t);
  assert.deepEqual(await sel('src/unrelated.mjs', repo, ['test/plain.test.mjs']), []);
  // plain, lit and tpl only import literal paths that miss src/unrelated.mjs; tplvar has ${} so it is unknown
  assert.deepEqual(await sel('src/unrelated.mjs', repo, DYN_TESTS), ['test/dyn.test.mjs', 'test/tplvar.test.mjs', 'test/via-helper.test.mjs']);
});

test('should follow import() with a quoted or plain template literal path and treat a template with ${} as unknown when the graph is walked (TestSelect edge)', async t => {
  const repo = dynRepo(t);
  const toC = await sel('src/deep/c.mjs', repo, ['test/lit.test.mjs', 'test/tpl.test.mjs', 'test/plain.test.mjs']);
  assert.deepEqual(toC, ['test/lit.test.mjs', 'test/plain.test.mjs', 'test/tpl.test.mjs'], 'literal import() paths are followed');
  assert.deepEqual(await sel('src/unrelated.mjs', repo, ['test/lit.test.mjs', 'test/tpl.test.mjs']), [], 'a literal path is not an unknown edge');
  assert.deepEqual(await sel('src/unrelated.mjs', repo, ['test/tplvar.test.mjs']), ['test/tplvar.test.mjs'], '`${}` is unknown');
});

test('should keep the zero-trust-review tests that reach skills/mutation through MUTATION_SKILL_DIR when it runs on this repo (TestSelect edge)', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const zt = ['skills/zero-trust-review/probelib.test.mjs', 'skills/zero-trust-review/mutants.test.mjs'];
  assert.deepEqual(await sel('skills/mutation/proc.mjs', root, zt), [...zt].sort());
  assert.deepEqual(await sel('skills/mutation/mutants.mjs', root, ['skills/zero-trust-review/mutants.test.mjs']), ['skills/zero-trust-review/mutants.test.mjs']);
});

// ---------------------------------------------------------------- what is read: never a symlink, a file over 4 MiB, a non-JS file or a file out of the tree
const MAX = 1 << 22;
// a plain directory tree (the walk reads the work tree only)
function plainRepo(t, files) {
  const { dir, repo } = tempDir(t, 'mutation-select-');
  put(repo, files);
  return { dir, repo };
}
const IMPORT_A = "import { a } from '../src/a.mjs';\n";
const padded = size => `${IMPORT_A}//${'x'.repeat(size - IMPORT_A.length - 3)}\n`;

test('should read a test file of exactly 4 MiB and skip one byte more when the graph is walked (TestSelect edge)', async t => {
  const { repo } = plainRepo(t, { 'src/a.mjs': 'export const a = 1;\n', 'test/max.test.mjs': padded(MAX), 'test/over.test.mjs': padded(MAX + 1) });
  assert.equal(statSync(join(repo, 'test/max.test.mjs')).size, MAX);
  assert.deepEqual(await sel('src/a.mjs', repo, ['test/max.test.mjs', 'test/over.test.mjs']), ['test/max.test.mjs']);
});

test('should not follow a test file that is a symlink when the graph is walked (TestSelect edge)', async t => {
  const { repo } = plainRepo(t, { 'src/a.mjs': 'export const a = 1;\n', 'test/real.mjs': IMPORT_A });
  symlinkSync('real.mjs', join(repo, 'test/link.test.mjs'));
  assert.deepEqual(await sel('src/a.mjs', repo, ['test/link.test.mjs', 'test/real.mjs']), ['test/real.mjs']);
});

test('should not read an imported file that is not JavaScript when the graph is walked (TestSelect edge)', async t => {
  const { repo } = plainRepo(t, {
    'src/a.mjs': 'export const a = 1;\n', 'src/data.json': `{"note": "import './a.mjs'"}\n`,
    'test/j.test.mjs': "import data from '../src/data.json' with { type: 'json' };\n",
  });
  assert.deepEqual(await sel('src/a.mjs', repo, ['test/j.test.mjs']), []);
});

test('should not follow an import that leaves the repo when the file out of the tree holds a computed import() (TestSelect edge)', async t => {
  const { dir, repo } = plainRepo(t, { 'src/a.mjs': 'export const a = 1;\n', 'test/out.test.mjs': "import '../../evil.mjs';\n" });
  writeFileSync(join(dir, 'evil.mjs'), 'const name = process.argv[2];\nawait import(name);\n');
  assert.deepEqual(await sel('src/a.mjs', repo, ['test/out.test.mjs']), []);
});

// ---------------------------------------------------------------- a test that runs a file as a child process names it in a string literal (no import edge)
const SPAWN_HEAD = "import { spawnSync } from 'node:child_process';\nimport { dirname, join } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst HERE = dirname(fileURLToPath(import.meta.url));\n";
const spawnRepo = t => plainRepo(t, {
  'src/cli.mjs': 'console.log(1);\n', 'src/mycli.mjs': 'console.log(2);\n', 'src/other.mjs': 'export const o = 1;\n',
  'test/cli.test.mjs': `${SPAWN_HEAD}spawnSync(process.execPath, [join(HERE, '..', 'src', 'cli.mjs')]);\n`,
  'test/other.test.mjs': `${SPAWN_HEAD}spawnSync(process.execPath, [join(HERE, '..', 'src', 'other.mjs')]);\n`,
  'test/comment.test.mjs': `${SPAWN_HEAD}// runs cli.mjs by hand: see src/cli.mjs\nspawnSync('true');\n`,
  'test/mycli.test.mjs': `${SPAWN_HEAD}spawnSync(process.execPath, [join(HERE, '..', 'src', 'mycli.mjs')]);\n`,
  'test/helper.mjs': `${SPAWN_HEAD}export const CLI = join(HERE, '..', "src", "cli.mjs");\n`,
  'test/via-helper.test.mjs': "import { spawnSync } from 'node:child_process';\nimport { CLI } from './helper.mjs';\nspawnSync(process.execPath, [CLI]);\n",
}).repo;
const SPAWN_TESTS = ['test/cli.test.mjs', 'test/other.test.mjs', 'test/comment.test.mjs', 'test/mycli.test.mjs', 'test/via-helper.test.mjs'];

test('should return a test that spawns the file by its base name when it has no import edge to it (TestSelect happy)', async t => {
  assert.deepEqual(await sel('src/cli.mjs', spawnRepo(t), ['test/cli.test.mjs']), ['test/cli.test.mjs']);
});

test('should not return a test when it names another file or names the file only in a comment (TestSelect fail)', async t => {
  const repo = spawnRepo(t);
  assert.deepEqual(await sel('src/cli.mjs', repo, ['test/other.test.mjs', 'test/comment.test.mjs']), []);
});

test('should match the base name exactly and count a helper in the graph that names it when tests are picked by name (TestSelect edge)', async t => {
  const repo = spawnRepo(t);
  assert.deepEqual(await sel('src/cli.mjs', repo, SPAWN_TESTS), ['test/cli.test.mjs', 'test/via-helper.test.mjs'], "'mycli.mjs' does not name cli.mjs");
  assert.deepEqual(await sel('src/mycli.mjs', repo, SPAWN_TESTS), ['test/mycli.test.mjs'], "'cli.mjs' does not name mycli.mjs");
});
