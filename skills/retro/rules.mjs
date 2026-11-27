// The one reader of rule ids (rules/*.md), rules/enforcers.json and docs/retro/rule-hits.json (ADR 0013). retro.mjs uses it for the repeat
// gate; rules/checks/rule-enforcers.mjs imports it for the CI check, so the format is parsed in one place. Pure, except the three readers.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export const RULE_STATUSES = ['enforced', 'partial', 'judgment'];
export const RULE_LEVELS = ['check', 'ratchet', 'hook', 'type', 'test'];
export const ENFORCERS_FILE = 'rules/enforcers.json';
export const HITS_FILE = 'docs/retro/rule-hits.json';

const STATUS = Object.freeze({ enforced: 'enforced' });
const MARK_AT_END = /<!--\s*rule:\s*(\S*?)\s*-->\s*$/;
const FENCE = /^\s*(```|~~~)/;
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A rules/*.md text -> { ids: [{ id, line }], errors: ['<path>:<line>: ...'] }. A rule is a top-level "- " bullet outside a fence. */
export function parseRuleIds(path, text) {
  const stem = basename(path).replace(/\.md$/, '');
  const shape = new RegExp(`^${escape(stem)}/${SLUG}$`);
  const ids = [], errors = [], seen = new Set();
  let fenced = false;
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (FENCE.test(raw)) { fenced = !fenced; return; }
    if (fenced || !raw.startsWith('- ')) return;
    const m = MARK_AT_END.exec(raw);
    if (!m) { errors.push(`${path}:${line}: the bullet does not end with <!-- rule: ${stem}/<slug> -->`); return; }
    const id = m[1];
    if (!shape.test(id)) { errors.push(`${path}:${line}: id ${JSON.stringify(id)} is not ${stem}/<slug> with a lowercase-kebab slug`); return; }
    if (seen.has(id)) { errors.push(`${path}:${line}: id ${id} is used twice`); return; }
    seen.add(id);
    ids.push({ id, line });
  });
  return { ids, errors };
}

/** Repo-relative rules/*.md files, sorted, without rules/README.md and without subfolders. */
export function ruleFiles(root) {
  const dir = join(root, 'rules');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md') && d.name !== 'README.md')
    .map(d => `rules/${d.name}`).sort();
}

function readJsonFile(root, rel, isShape, what) {
  const file = join(root, rel);
  if (!existsSync(file)) return undefined;
  let v;
  try { v = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${rel} is not JSON: ${e.message}`); }
  if (!isShape(v)) throw new Error(`${rel} must hold ${what}`);
  return v;
}

/** -> { entries } from rules/enforcers.json, { entries: null } when it is missing; throws when it is not a JSON object. */
export function readEnforcers(root) {
  const v = readJsonFile(root, ENFORCERS_FILE, x => x !== null && typeof x === 'object' && !Array.isArray(x), 'a JSON object');
  return { entries: v ?? null };
}

/** -> the hits in docs/retro/rule-hits.json, [] when it is missing; throws when it is not a JSON array. */
export function readHits(root) {
  return readJsonFile(root, HITS_FILE, Array.isArray, 'a JSON array') ?? [];
}

const entryOf = (entries, rule) => (entries && typeof entries === 'object' && Object.hasOwn(entries, rule) ? entries[rule] : undefined);
const namesRule = f => typeof f?.rule === 'string' && f.rule !== '';

/** True unless the rule's entry says enforced. */
export function isUnenforced(entries, rule) {
  return entryOf(entries, rule)?.status !== STATUS.enforced;
}

/** Old hits plus one { rule, date, branch, finding } per finding that names a rule, in findings order; a new array. */
export function addHits(hits, findings, { date, branch }) {
  return [...hits, ...findings.filter(namesRule).map(f => ({ rule: f.rule, date, branch, finding: f.id }))];
}

/** Findings with repeat (and earlierHits) set on each that names a rule: hit on another branch, or 2+ evidence items in this retro. */
export function markRepeats(findings, hits, { branch }) {
  return findings.map(f => {
    if (!namesRule(f)) return f;
    const earlierHits = hits.filter(h => h?.rule === f.rule && h.branch !== branch);
    const repeat = earlierHits.length > 0 || (Array.isArray(f.evidence) && f.evidence.length >= 2);
    return repeat ? { ...f, repeat, earlierHits } : { ...f, repeat };
  });
}

const knownLevel = p => RULE_LEVELS.includes(p?.level);
const hasNoLevel = p => typeof p?.noLevel === 'string' && p.noLevel.trim() !== '';

/** -> [error] for each repeat of an unenforced rule with no proposal naming a level or a noLevel reason, and each unknown level. */
export function levelErrors(findings, proposals, entries) {
  const list = Array.isArray(proposals) ? proposals : [];
  const errors = list.filter(p => p?.level !== undefined && !knownLevel(p)).map(p => `${p.id}: level ${p.level} is not one of ${RULE_LEVELS.join(', ')}`);
  for (const f of findings) {
    if (f?.repeat !== true || !namesRule(f) || !isUnenforced(entries, f.rule)) continue;
    if (list.some(p => p?.finding === f.id && (knownLevel(p) || hasNoLevel(p)))) continue;
    errors.push(`${f.id}: repeat of unenforced rule ${f.rule} needs a proposal with level (${RULE_LEVELS.join('|')}) or noLevel "<why>"`);
  }
  return errors;
}
