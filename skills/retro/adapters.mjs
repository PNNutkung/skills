// Linter output -> ratchet violations (pure). ESLint and ruff are read from their JSON output and counted here, so neither needs its own
// baseline feature. Rule ids carry the tool as a prefix: eslint:<ruleId>, ruff:<code>; retro:* and custom patterns go to patterns.mjs.
import { isAbsolute, relative } from 'node:path';
import { BUILTIN } from './patterns.mjs';

const rel = (repo, p) => (isAbsolute(p) ? relative(repo, p) : p).split('\\').join('/');
function parse(text, tool) {
  try {
    const data = JSON.parse(String(text));
    if (!Array.isArray(data)) return { data: null, error: `${tool} output is not a JSON list` };
    return { data, error: null };
  } catch (e) { return { data: null, error: `${tool} output is not JSON: ${e.message}` }; }
}

/** `eslint --format json` -> { violations, errors }. Messages with no rule: a fatal one is an error, a warning (ignored file) is dropped. */
export function parseEslint(text, repo) {
  const { data, error } = parse(text, 'eslint');
  if (!data) return { violations: [], errors: [error] };
  const violations = [], errors = [];
  for (const f of data) {
    if (!f || typeof f.filePath !== 'string' || !Array.isArray(f.messages)) { errors.push('eslint output has an entry without filePath/messages'); continue; }
    const file = rel(repo, f.filePath);
    for (const m of f.messages) {
      if (m?.ruleId) violations.push({ rule: `eslint:${m.ruleId}`, file, line: m.line ?? 0 });
      else if (m?.fatal) errors.push(`${file}:${m.line ?? 0} ${m.message ?? 'fatal error'}`);
    }
  }
  return { violations, errors };
}

/** `ruff check --output-format json` -> { violations, errors }. A message with no code is a syntax error. */
export function parseRuff(text, repo) {
  const { data, error } = parse(text, 'ruff');
  if (!data) return { violations: [], errors: [error] };
  const violations = [], errors = [];
  for (const m of data) {
    if (!m || typeof m.filename !== 'string') { errors.push('ruff output has an entry without filename'); continue; }
    const file = rel(repo, m.filename), line = m.location?.row ?? 0;
    if (m.code) violations.push({ rule: `ruff:${m.code}`, file, line });
    else errors.push(`${file}:${line} ${m.message ?? 'error'}`);
  }
  return { violations, errors };
}

/** Which counter owns each rule. */
export function toolsFor(rules, customPatterns = {}) {
  const out = { eslint: [], ruff: [], patterns: [], unknown: [] };
  for (const r of rules) {
    if (r.startsWith('eslint:')) out.eslint.push(r);
    else if (r.startsWith('ruff:')) out.ruff.push(r);
    else if (BUILTIN[r] || customPatterns?.[r]) out.patterns.push(r);
    else out.unknown.push(r);
  }
  return out;
}
