import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardrail, standardsFile, steering } from './facts.mjs';

const ci = { '.github/workflows/test.yml': 'jobs:\n  t:\n    steps:\n      - run: npm test\n' };

test('should report a finding when the repo has no pre-commit hook and no CI that lints, type-checks or tests (CGuard)', () => {
  const g = guardrail({ ciFiles: {}, preCommit: [] });
  assert.equal(g.finding, true);
  assert.deepEqual(g.ci, { lint: false, typecheck: false, test: false, files: [] });
});

test('should see CI test and lint steps and the pre-commit hooks when they exist (CGuard)', () => {
  const g = guardrail({ ciFiles: { ...ci, '.gitlab-ci.yml': 'lint:\n  script: npx eslint .\n' }, preCommit: ['.husky/pre-commit'] });
  assert.equal(g.finding, false);
  assert.deepEqual(g.ci, { lint: true, typecheck: false, test: true, files: ['.github/workflows/test.yml', '.gitlab-ci.yml'] });
  assert.deepEqual(g.missing, ['typecheck']);
  assert.equal(guardrail({ ciFiles: ci, preCommit: [] }).finding, false);
  assert.equal(guardrail({ ciFiles: { 'x.yml': 'run: tsc --noEmit' }, preCommit: [] }).ci.typecheck, true);
});

test('should flag steering files above the limit and none when the limit is unlimited (CSteer)', () => {
  const files = [{ file: 'CLAUDE.md', bytes: 2140 }, { file: '~/.claude/CLAUDE.md', bytes: 9312 }, { file: 'AGENTS.md', bytes: 8000 }];
  assert.deepEqual(steering(files, 8000).over.map(f => f.file), ['~/.claude/CLAUDE.md']);
  assert.deepEqual(steering(files, null).over, []);
});

test('should pick the repo\'s existing standards file and fall back to a new CODING_STANDARDS.md when there is none (CStd)', () => {
  assert.deepEqual(standardsFile(['src/a.ts', 'CONTRIBUTING.md', 'rules/README.md']), { file: 'rules/', create: false });
  assert.deepEqual(standardsFile(['docs/CODING_STANDARDS.md', 'CONTRIBUTING.md']), { file: 'docs/CODING_STANDARDS.md', create: false });
  assert.deepEqual(standardsFile(['CONTRIBUTING.md']), { file: 'CONTRIBUTING.md', create: false });
  assert.deepEqual(standardsFile(['src/a.ts']), { file: 'CODING_STANDARDS.md', create: true });
});
