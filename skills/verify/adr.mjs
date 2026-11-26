// Pure readers of the ADR that definition-of-done wrote, and of answers.md. Copied rules, not imports: verify works alone (ADR 0009 A9).
import { basename } from 'node:path';

const DOD_HEADING_RE = /^## Definition of done\s*$/;
// same item shape as skills/dev-workflow/check.mjs adrItems
const ITEM_RE = /^- \[[ xX]\] ([A-Za-z][A-Za-z0-9]{0,11}) (\(.*)$/;
const VERIFY_ENV_RE = /^- verify env:(.*)$/m;
const ENV_NAME_RE = /\[([a-z0-9][a-z0-9_-]*)\]/gi;
const FLAG_LINE_RE = /^- feature flag:(.*)$/m;
export const FLAG_NAME_RE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*(ENABLED|MODE|MAX)\b/g;
const REMOVED_BEFORE_RE = /\bno\s+$/i;
const ANSWER_RE = /^(A\d+):\s?(.*)$/;
const TIME_RE = /^time:/;

/** [{ id, text }] from the `## Definition of done` section. */
export function adrItems(adr) {
  const lines = String(adr ?? '').split('\n');
  const at = lines.findIndex(l => DOD_HEADING_RE.test(l));
  if (at < 0) return [];
  const out = [];
  for (const line of lines.slice(at + 1)) {
    if (/^## /.test(line)) break;
    const m = ITEM_RE.exec(line);
    if (m) out.push({ id: m[1], text: m[2].trim() });
  }
  return out;
}

/** The env names booked in brackets on the `- verify env:` line, lowercased, once each (ADR 0005). */
export function bookedEnvs(adr) {
  const m = VERIFY_ENV_RE.exec(String(adr ?? ''));
  if (!m) return [];
  return [...new Set([...m[1].matchAll(ENV_NAME_RE)].map(x => x[1].toLowerCase()))];
}

/** Flag names in text, once each; a name right after "no " is a removed flag, not a new one. */
export function flagNames(text) {
  const s = String(text ?? '');
  const out = [];
  for (const m of s.matchAll(FLAG_NAME_RE)) {
    if (REMOVED_BEFORE_RE.test(s.slice(0, m.index))) continue;
    if (!out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** The flags the ADR's `- feature flag:` line adds. */
export function newFlags(adr) {
  const m = FLAG_LINE_RE.exec(String(adr ?? ''));
  return m ? flagNames(m[1]) : [];
}

/** answers.md (`A<n>: text`, then optional `time: ...`) to { A<n>: text }. */
export function parseAnswers(text) {
  const out = {};
  let id = null;
  for (const line of String(text ?? '').split('\n')) {
    const m = ANSWER_RE.exec(line);
    if (m) { id = m[1]; out[id] = m[2]; continue; }
    if (!id) continue;
    if (TIME_RE.test(line)) { id = null; continue; }
    out[id] += `\n${line}`;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

export const adrNumber = path => /^(\d{4})-/.exec(basename(String(path ?? '')))?.[1] ?? null;
