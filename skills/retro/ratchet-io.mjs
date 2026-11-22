// The git, file and linter side of the ratchet (ratchet-core.mjs stays pure). Paths are relative to the repo's top level, forward slashes.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEslint, parseRuff, toolsFor } from './adapters.mjs';
import { countPatterns } from './patterns.mjs';
import { BASELINE_FILE, countsOf, emptyBaseline, parseBaseline, serialize } from './ratchet-core.mjs';
import { FLAG } from './flags.mjs';

const HOOK_TAG = 'retro ratchet (retro skill)';
const PY = /\.pyi?$/;
const LINT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 1 << 28;

const git = (repo, args) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER });
const tryGit = (repo, args) => { try { return git(repo, args); } catch { return null; } };
const nul = t => String(t ?? '').split('\0').filter(Boolean);

export const topLevel = dir => (tryGit(dir, ['rev-parse', '--show-toplevel']) ?? '').trim() || null;
export const repoFiles = repo => nul(tryGit(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).filter(f => existsSync(join(repo, f)));
export const stagedFiles = repo => nul(tryGit(repo, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));

/** Renames staged in the index: [[old, new]]. */
export function stagedRenames(repo) {
  const parts = nul(tryGit(repo, ['diff', '--cached', '-M', '--name-status', '-z']));
  const out = [];
  for (let i = 0; i < parts.length;) {
    if (/^R\d*$/.test(parts[i])) { out.push([parts[i + 1], parts[i + 2]]); i += 3; }
    else if (/^C\d*$/.test(parts[i])) i += 3;
    else i += 2;
  }
  return out;
}

/** -> { baseline, exists, errors } (an empty baseline when the file is missing). */
export function readBaseline(repo) {
  const file = join(repo, BASELINE_FILE);
  if (!existsSync(file)) return { baseline: emptyBaseline(), exists: false, errors: [] };
  const r = parseBaseline(readFileSync(file, 'utf8'));
  return r.ok ? { baseline: r.baseline, exists: true, errors: [] } : { baseline: null, exists: true, errors: r.errors };
}
export const writeBaseline = (repo, baseline) => writeFileSync(join(repo, BASELINE_FILE), serialize(baseline));

/** The repo's ESLint (node_modules/.bin first) or ruff, or null. */
function findTool(repo, name) {
  const local = join(repo, 'node_modules', '.bin', name);
  if (existsSync(local)) return local;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() || null : null;
}

function runTool(repo, bin, args) {
  const r = spawnSync(bin, args, { cwd: repo, encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout: LINT_TIMEOUT_MS });
  return { out: r.stdout ?? '', err: (r.stderr ?? '').trim(), status: r.status, failed: r.error ? r.error.message : null };
}

/**
 * Today's violations of the enforced rules. files: limit to these paths (null = the whole repo).
 * -> { violations, errors, missing: [tool] }
 */
export function countViolations({ repo, rules, patterns = {}, files = null, env = process.env }) {
  const t = toolsFor(rules, patterns);
  const all = files ?? repoFiles(repo);
  const violations = [], errors = [], missing = [];
  if (t.unknown.length) errors.push(`no counter for ${t.unknown.join(', ')} (use eslint:, ruff:, a retro: rule or a pattern in ${BASELINE_FILE})`);
  if (t.eslint.length) {
    const bin = env.RETRO_ESLINT_BIN || findTool(repo, 'eslint');
    const targets = all.filter(f => /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(f));
    if (!bin) missing.push('eslint');
    else if (targets.length || files === null) {
      const r = runTool(repo, bin, ['--format', 'json', '--no-warn-ignored', ...(files === null ? ['.'] : targets)]);
      if (r.failed || (r.status !== 0 && r.status !== 1)) errors.push(`eslint failed: ${r.failed ?? r.err.split('\n')[0]}`);
      else { const p = parseEslint(r.out, repo); violations.push(...p.violations.filter(v => t.eslint.includes(v.rule))); errors.push(...p.errors); }
    }
  }
  if (t.ruff.length) {
    const bin = env.RETRO_RUFF_BIN || findTool(repo, 'ruff');
    const targets = all.filter(f => PY.test(f));
    if (!bin) missing.push('ruff');
    else if (targets.length) {
      const r = runTool(repo, bin, ['check', '--output-format', 'json', '--exit-zero', '--no-cache', ...(files === null ? ['.'] : targets)]);
      if (r.failed || r.status !== 0) errors.push(`ruff failed: ${r.failed ?? r.err.split('\n')[0]}`);
      else { const p = parseRuff(r.out, repo); violations.push(...p.violations.filter(v => t.ruff.includes(v.rule))); errors.push(...p.errors); }
    }
  }
  if (t.patterns.length) {
    const texts = all.map(file => { try { return { file, text: readFileSync(join(repo, file), 'utf8') }; } catch { return null; } }).filter(Boolean);
    violations.push(...countPatterns(texts, t.patterns, patterns));
  }
  return { violations, errors, missing };
}
export const countsFor = violations => countsOf(violations);

/** The pre-commit hook line: exit 1 (a count went up) or 2 (a bad flag) stops the commit; anything else never does. */
export const hookLine = ratchetMjs => `node "${ratchetMjs}" check --staged --write; s=$?; [ $s -eq 1 ] || [ $s -eq 2 ] && exit 1`;
export const hookScript = ratchetMjs => `#!/bin/sh\n# ${HOOK_TAG}: no rule in .ratchet.json may get worse. ${FLAG.ratchetHook}=false skips it.\n[ "$${FLAG.ratchetHook}" = "false" ] && exit 0\ncommand -v node >/dev/null 2>&1 || exit 0\n[ -f "${ratchetMjs}" ] || exit 0\n${hookLine(ratchetMjs)}\nexit 0\n`;

/** Install the pre-commit hook; never over a hook it did not write, and with a hook manager return the line to add. */
export function installHook({ repo, ratchetMjs }) {
  const line = hookLine(ratchetMjs);
  const managed = (tryGit(repo, ['config', '--get', 'core.hooksPath']) ?? '').trim();
  if (managed) return { skipped: `core.hooksPath is ${managed} (a hook manager such as husky or lefthook); add this line to its pre-commit hook`, line };
  const dir = resolve(repo, (tryGit(repo, ['rev-parse', '--git-path', 'hooks']) ?? '.git/hooks').trim());
  const file = join(dir, 'pre-commit');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current !== null && !current.includes(HOOK_TAG)) return { skipped: `${file} exists and is not ours; add this line to it`, line };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, hookScript(ratchetMjs));
  chmodSync(file, 0o755);
  return { installed: file };
}

export const stage = (repo, files) => git(repo, ['add', '--', ...files]);
