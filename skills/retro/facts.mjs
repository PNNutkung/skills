// Repo facts a script can decide alone (pure): is there a guardrail, which steering files are too big, where do standards go.
const LINT = /\b(?:eslint|ruff|lint|golangci-lint|flake8|pylint|rubocop|biome|ratchet\.mjs)\b/i;
const TYPECHECK = /\b(?:tsc|typecheck|type-check|mypy|pyright)\b/i;
const TEST = /\b(?:test|tests|pytest|jest|vitest|mocha|node --test)\b/i;
const STANDARDS = ['CODING_STANDARDS.md', 'docs/CODING_STANDARDS.md', 'rules/', 'CONTRIBUTING.md', 'docs/CONTRIBUTING.md'];

/**
 * ciFiles: {path: text} of CI configs; preCommit: hook files that exist (.git/hooks/pre-commit, .husky/pre-commit, lefthook, pre-commit).
 * finding: true when nothing runs a check before code lands.
 */
export function guardrail({ ciFiles, preCommit }) {
  const texts = Object.values(ciFiles ?? {});
  const ci = { lint: texts.some(t => LINT.test(t)), typecheck: texts.some(t => TYPECHECK.test(t)), test: texts.some(t => TEST.test(t)), files: Object.keys(ciFiles ?? {}) };
  const missing = ['lint', 'typecheck', 'test'].filter(k => !ci[k]);
  return { preCommit: preCommit ?? [], ci, missing, finding: !(preCommit ?? []).length && missing.length === 3 };
}

/** files: [{file, bytes}]; max: bytes or null (unlimited). */
export const steering = (files, max) => ({ max, files, over: max === null ? [] : files.filter(f => f.bytes > max) });

/** Where judgment-call standards go: the repo's existing file, else a new CODING_STANDARDS.md. */
export function standardsFile(repoFiles) {
  for (const s of STANDARDS) if (s.endsWith('/') ? repoFiles.some(f => f.startsWith(s)) : repoFiles.includes(s)) return { file: s, create: false };
  return { file: STANDARDS[0], create: true };
}
