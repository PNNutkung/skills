// Unit tests for select.mjs testsFor(file, tests, repo) (ADR 0011 Interface, A10 speed): the test files whose static import/require graph reaches `file`,
// transitively; a language without a graph gets every test. `repo` is a git work tree whose files are committed and checked out, so reading the work tree
// or HEAD gives the same answer. The order of the result is not fixed (compared sorted); it may be sync or async.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { commit, git, tempDir } from './fixtures/repo.mjs';
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
