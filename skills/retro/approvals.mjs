// Proposals and approvals (pure). A proposal belongs to a passed finding and names the files it may change. The user answers in chat; the
// agent saves each answer word for word in answers.md ("P1 ok, P2 no" or by option letter "P1 A, P2 B"). applied-check then refuses any changed
// file no approved proposal names. A letter is looked up in the proposal's options ({"A": "apply", "B": "skip", ...}); without options A applies
// and B skips. A letter the proposal does not offer approves nothing and is reported by answerErrors.
import { matchGlob } from './patterns.mjs';
import { VERIFY } from './evidence.mjs';

export const ALWAYS_ALLOWED = ['docs/retro/log.md'];
export const OPTION = Object.freeze({ apply: 'apply', skip: 'skip' });
export const DEFAULT_OPTIONS = Object.freeze({ A: OPTION.apply, B: OPTION.skip });
// A word may touch the id ("P1ok", as before); a letter needs a space or a separator so "P1A" is not read as an answer.
const DECISION = /(?<![A-Za-z0-9])(P\d+)(?:\s*[:=-]?\s*(ok|yes|approved?|agree|อนุมัติ|ได้|no|reject(?:ed)?|ไม่)(?![A-Za-z])|(?:\s+|\s*[:=-]\s*)([A-Z])(?![A-Za-z]))/gi;
const YES = /^(ok|yes|approved?|agree|อนุมัติ|ได้)$/i;
const LETTER = /^[A-Z]$/;

/** answers.md text -> [{ id, word } | { id, letter }] in text order; a lower-case single letter is prose, not an option. */
function decisions(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(DECISION)) {
    const id = m[1].toUpperCase();
    if (m[2] !== undefined) out.push({ id, word: m[2] });
    else if (LETTER.test(m[3])) out.push({ id, letter: m[3] });
  }
  return out;
}

const optionsOf = (proposals, id) => (Array.isArray(proposals) ? proposals : []).find(p => p?.id === id)?.options ?? DEFAULT_OPTIONS;

/** answers.md text (+ proposals for their options) -> Map(P<n> -> true|false); a later answer overrides an earlier one. */
export function parseApprovals(text, proposals = []) {
  const out = new Map();
  for (const d of decisions(text)) out.set(d.id, d.word !== undefined ? YES.test(d.word) : optionsOf(proposals, d.id)[d.letter] === OPTION.apply);
  return out;
}

/** -> [error] for letter answers that name no proposal or a letter the proposal does not offer. */
export function answerErrors(text, proposals = []) {
  const ids = new Set((Array.isArray(proposals) ? proposals : []).map(p => p?.id));
  const errors = [];
  for (const d of decisions(text)) {
    if (d.letter === undefined) continue;
    if (!ids.has(d.id)) { errors.push(`${d.id}: no such proposal`); continue; }
    const options = optionsOf(proposals, d.id);
    if (!Object.hasOwn(options, d.letter)) errors.push(`${d.id}: ${d.letter} is not an option (${Object.keys(options).join(', ')})`);
  }
  return errors;
}

function optionsError(options) {
  if (options === undefined) return null;
  if (!options || typeof options !== 'object' || Array.isArray(options) || !Object.keys(options).length) return 'options must map letters to apply or skip';
  const bad = Object.entries(options).find(([k, v]) => !LETTER.test(k) || !Object.values(OPTION).includes(v));
  return bad ? `option ${bad[0]} must be one capital letter set to apply or skip` : null;
}

/** -> [error] for proposals that are malformed or hang on a finding that is not passed. */
export function checkProposals(proposals, findings) {
  const verify = new Map((findings ?? []).map(f => [f.id, f.verify]));
  const errors = [];
  for (const p of Array.isArray(proposals) ? proposals : []) {
    if (!p || !/^P\d+$/.test(p.id ?? '')) { errors.push(`${p?.id ?? '?'}: id must be P<number>`); continue; }
    if (!Array.isArray(p.files) || !p.files.length) { errors.push(`${p.id}: files must list what it may change`); continue; }
    const optErr = optionsError(p.options);
    if (optErr) { errors.push(`${p.id}: ${optErr}`); continue; }
    const v = verify.get(p.finding);
    if (v === undefined) errors.push(`${p.id}: finding ${p.finding} does not exist`);
    else if (v !== VERIFY.passed) errors.push(`${p.id}: finding ${p.finding} is ${v}; only passed findings get proposals`);
  }
  return errors;
}

/** Every changed file must be named by an approved proposal. -> { ok, unapproved: [{file, proposal}] } */
export function appliedCheck({ proposals, approvals, changed }) {
  const unapproved = [];
  for (const file of changed) {
    if (ALWAYS_ALLOWED.includes(file)) continue;
    const owners = (proposals ?? []).filter(p => (p.files ?? []).some(g => matchGlob(g, file)));
    if (owners.some(p => approvals.get(p.id) === true)) continue;
    unapproved.push({ file, proposal: owners[0]?.id ?? null });
  }
  return { ok: unapproved.length === 0, unapproved };
}
