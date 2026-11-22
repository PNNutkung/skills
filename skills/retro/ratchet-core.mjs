// The ratchet, pure: no I/O. A baseline holds, per enforced rule, the number of violations each file had when the rule was added or last
// lowered. A count may go down (the baseline follows) but never up, unless `accept` records a reason. A rule missing from `rules` is not
// enforced; a file missing under a rule counts 0. Used by ratchet.mjs (the CLI and the pre-commit hook) and retro.mjs (proposals).
export const BASELINE_FILE = '.ratchet.json';
const VERSION = 1;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = n => Number.isInteger(n) && n >= 0;
const sortKeys = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));

/** A path the baseline may hold: relative, forward slashes, inside the repo. */
export const okPath = p => typeof p === 'string' && p !== '' && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && !p.includes('\0') && !p.split('/').some(s => s === '..' || s === '.' || s === '');

export const emptyBaseline = () => ({ version: VERSION, rules: {}, accepted: [] });

/** -> { ok: true, baseline } | { ok: false, errors } */
export function parseBaseline(text) {
  let data;
  try { data = JSON.parse(String(text)); } catch (e) { return { ok: false, errors: [`${BASELINE_FILE} is not JSON: ${e.message}`] }; }
  const errors = [];
  if (!isObj(data)) return { ok: false, errors: [`${BASELINE_FILE} must be a JSON object`] };
  if (data.version !== VERSION) errors.push(`${BASELINE_FILE}: version must be ${VERSION}`);
  if (!isObj(data.rules)) errors.push(`${BASELINE_FILE}: rules must be an object of {rule: {file: count}}`);
  else for (const [rule, files] of Object.entries(data.rules)) {
    if (!isObj(files)) { errors.push(`${rule}: must be an object of {file: count}`); continue; }
    for (const [file, n] of Object.entries(files)) {
      if (!okPath(file)) errors.push(`${rule}: ${JSON.stringify(file)} is not a relative path inside the repo`);
      if (!isCount(n)) errors.push(`${rule} ${file}: count must be a whole number, 0 or more`);
    }
  }
  if (data.patterns !== undefined) {
    if (!isObj(data.patterns)) errors.push(`${BASELINE_FILE}: patterns must be an object`);
    else for (const [id, p] of Object.entries(data.patterns)) {
      if (!isObj(p) || typeof p.regex !== 'string') { errors.push(`pattern ${id}: needs a regex string`); continue; }
      try { new RegExp(p.regex, p.flags ?? ''); } catch (e) { errors.push(`pattern ${id}: ${e.message}`); }
      if (p.glob !== undefined && typeof p.glob !== 'string') errors.push(`pattern ${id}: glob must be a string`);
    }
  }
  if (data.accepted !== undefined && !Array.isArray(data.accepted)) errors.push(`${BASELINE_FILE}: accepted must be a list`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, baseline: { ...data, accepted: data.accepted ?? [] } };
}

/** Stable text: sorted rules and files, two-space indent, trailing newline (so a lowered count is a one-line diff). */
export function serialize(baseline) {
  const rules = sortKeys(Object.fromEntries(Object.entries(baseline.rules).map(([r, f]) => [r, sortKeys(f)])));
  const out = { version: VERSION, rules };
  if (baseline.patterns && Object.keys(baseline.patterns).length) out.patterns = sortKeys(baseline.patterns);
  out.accepted = baseline.accepted ?? [];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** [{rule, file}] -> {rule: {file: count}} */
export function countsOf(violations) {
  const out = {};
  for (const { rule, file } of violations) {
    out[rule] ??= {};
    out[rule][file] = (out[rule][file] ?? 0) + 1;
  }
  return out;
}

/** Move counts along git renames ([[old, new]]), so a renamed file keeps its allowance. */
export function applyRenames(rules, renames) {
  const map = new Map(renames);
  const out = {};
  for (const [rule, files] of Object.entries(rules)) {
    out[rule] = {};
    for (const [file, n] of Object.entries(files)) {
      const to = map.get(file) ?? file;
      out[rule][to] = (out[rule][to] ?? 0) + n;
    }
  }
  return out;
}

const byRuleFile = (a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file);

/**
 * Compare today's counts with the baseline, for enforced rules only. files: limit to these paths (the staged files); null = every file.
 * -> { up: [{rule, file, from, to}], down: [...] }
 */
export function compare(rules, current, { files = null } = {}) {
  const up = [], down = [];
  const scope = files ? new Set(files) : null;
  for (const [rule, allowed] of Object.entries(rules)) {
    const now = current?.[rule] ?? {};
    const paths = scope ?? new Set([...Object.keys(allowed), ...Object.keys(now)]);
    for (const file of paths) {
      const from = allowed[file] ?? 0, to = now[file] ?? 0;
      if (to > from) up.push({ rule, file, from, to });
      else if (to < from) down.push({ rule, file, from, to });
    }
  }
  return { up: up.sort(byRuleFile), down: down.sort(byRuleFile) };
}

/** The baseline with each drop written in; a file at 0 leaves its rule's list. */
export function lower(baseline, down) {
  const rules = Object.fromEntries(Object.entries(baseline.rules).map(([r, f]) => [r, { ...f }]));
  for (const { rule, file, to } of down) {
    if (!rules[rule]) continue;
    if (to > 0) rules[rule][file] = to; else delete rules[rule][file];
  }
  return { ...baseline, rules };
}

/** Raise one count on purpose, with a reason that stays in the baseline. Throws when the rule is unknown or the reason empty. */
export function accept(baseline, { rule, file, count, reason, time = new Date().toISOString() }) {
  if (!baseline.rules[rule]) throw new Error(`${rule} is not in ${BASELINE_FILE}; add it first`);
  if (!okPath(file)) throw new Error(`${JSON.stringify(file)} is not a relative path inside the repo`);
  if (!isCount(count)) throw new Error('count must be a whole number, 0 or more');
  if (String(reason ?? '').trim() === '') throw new Error('accept needs a reason (--reason "...")');
  const from = baseline.rules[rule][file] ?? 0;
  const rules = { ...baseline.rules, [rule]: { ...baseline.rules[rule] } };
  if (count > 0) rules[rule][file] = count; else delete rules[rule][file];
  return { ...baseline, rules, accepted: [...(baseline.accepted ?? []), { rule, file, from, to: count, reason: String(reason).trim(), time }] };
}

/** Start enforcing a rule at today's counts. */
export function addRule(baseline, rule, counts) {
  const files = Object.fromEntries(Object.entries(counts ?? {}).filter(([, n]) => n > 0));
  return { ...baseline, rules: { ...baseline.rules, [rule]: files } };
}
