#!/usr/bin/env node
// Every rule bullet in rules/*.md has an id, and rules/enforcers.json says what enforces each id (ADR 0013). The format is read by
// skills/retro/rules.mjs, the one parser that retro uses too.
// Usage: node rules/checks/rule-enforcers.mjs [--root <repo>]
// Prints one JSON line { ok, violations }. Exit 0 clean, 1 violations, 2 usage error. Node 22+, no dependencies.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENFORCERS_FILE, RULE_STATUSES, parseRuleIds, readEnforcers, ruleFiles } from '../../skills/retro/rules.mjs';

const RATCHET_PREFIX = 'ratchet:';
const STATUS = Object.freeze({ enforced: 'enforced' });

const insideRepo = rel => rel !== '' && !isAbsolute(rel) && !normalize(rel).split(/[\\/]/).includes('..');

/** -> null when the enforcer exists, else why not. ref: ratchet:<id>, <path>#<symbol> or <path> (file or folder), repo-relative. */
export function checkEnforcer(root, ref, ratchetRules) {
  if (typeof ref !== 'string' || ref === '') return 'an enforcer must be a non-empty string';
  if (ref.startsWith(RATCHET_PREFIX)) {
    const id = ref.slice(RATCHET_PREFIX.length);
    return ratchetRules && Object.hasOwn(ratchetRules, id) ? null : `ratchet rule ${id} is not in .ratchet.json`;
  }
  const hash = ref.indexOf('#');
  const path = hash === -1 ? ref : ref.slice(0, hash);
  const symbol = hash === -1 ? null : ref.slice(hash + 1);
  if (!insideRepo(path)) return `${path} is not a path inside the repo`;
  const file = join(root, path);
  if (!existsSync(file)) return `${path} does not exist`;
  if (symbol === null) return null;
  if (symbol === '') return 'the symbol after # is empty';
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return `${path} cannot be read`; }
  return text.includes(symbol) ? null : `${symbol} is not in ${path}`;
}

function ratchetRulesOf(root) {
  try { return JSON.parse(readFileSync(join(root, '.ratchet.json'), 'utf8'))?.rules ?? {}; } catch { return {}; }
}

function entryViolations(root, id, entry, ratchetRules) {
  const at = `${ENFORCERS_FILE}: ${id}`;
  const status = entry?.status;
  if (!RULE_STATUSES.includes(status)) return [`${at}: status ${status} is not enforced, partial or judgment`];
  const enforcers = Array.isArray(entry.enforcers) ? entry.enforcers : [];
  const out = [];
  if (status === STATUS.enforced && enforcers.length === 0) out.push(`${at}: enforced needs at least one enforcer`);
  if (status !== STATUS.enforced && !(typeof entry.reason === 'string' && entry.reason.trim())) out.push(`${at}: ${status} needs a reason`);
  for (const ref of enforcers) {
    const why = checkEnforcer(root, ref, ratchetRules);
    if (why) out.push(`${at}: ${ref}: ${why}`);
  }
  return out;
}

/** -> { violations } sorted: bullets without a valid id, ids without an entry, entries without a bullet, bad entries and enforcers. */
export function checkRepo(root) {
  const violations = [];
  const bullets = new Map();
  for (const rel of ruleFiles(root)) {
    const { ids, errors } = parseRuleIds(rel, readFileSync(join(root, rel), 'utf8'));
    violations.push(...errors);
    for (const { id } of ids) {
      if (bullets.has(id)) violations.push(`${id}: used in more than one rule file`);
      else bullets.set(id, rel);
    }
  }
  let entries;
  try { ({ entries } = readEnforcers(root)); } catch (e) { return { violations: [...violations, e.message].sort() }; }
  if (entries === null) {
    if (ruleFiles(root).length) violations.push(`${ENFORCERS_FILE} is missing`);
    return { violations: violations.sort() };
  }
  for (const id of bullets.keys()) if (!Object.hasOwn(entries, id)) violations.push(`${id}: no entry in ${ENFORCERS_FILE}`);
  const ratchetRules = ratchetRulesOf(root);
  for (const [id, entry] of Object.entries(entries)) {
    if (!bullets.has(id)) violations.push(`${ENFORCERS_FILE}: ${id} has no rule bullet`);
    violations.push(...entryViolations(root, id, entry, ratchetRules));
  }
  return { violations: violations.sort() };
}

/** -> { code, out } */
export function main(argv) {
  let root = '.';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1] !== undefined) root = argv[++i];
    else return { code: 2, out: { ok: false, error: `usage: rule-enforcers.mjs [--root <repo>] (bad argument ${argv[i]})` } };
  }
  const { violations } = checkRepo(resolve(root));
  return { code: violations.length ? 1 : 0, out: { ok: !violations.length, violations } };
}

let isMain = false;
try { isMain = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* not started as a script */ }
if (isMain) {
  const { code, out } = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = code;
}
