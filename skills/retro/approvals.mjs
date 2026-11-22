// Proposals and approvals (pure). A proposal belongs to a passed finding and names the files it may change. The user answers in chat; the
// agent saves each answer word for word in answers.md ("P1 ok, P2 no"). applied-check then refuses any changed file no approved proposal names.
import { matchGlob } from './patterns.mjs';
import { VERIFY } from './evidence.mjs';

export const ALWAYS_ALLOWED = ['docs/retro/log.md'];
const DECISION = /(?<![A-Za-z0-9])(P\d+)\s*[:=-]?\s*(ok|yes|approved?|agree|อนุมัติ|ได้|no|reject(?:ed)?|ไม่)(?![A-Za-z])/gi;
const YES = /^(ok|yes|approved?|agree|อนุมัติ|ได้)$/i;

/** answers.md text -> Map(P<n> -> true|false); a later answer overrides an earlier one. */
export function parseApprovals(text) {
  const out = new Map();
  for (const m of String(text ?? '').matchAll(DECISION)) out.set(m[1].toUpperCase(), YES.test(m[2]));
  return out;
}

/** -> [error] for proposals that are malformed or hang on a finding that is not passed. */
export function checkProposals(proposals, findings) {
  const verify = new Map((findings ?? []).map(f => [f.id, f.verify]));
  const errors = [];
  for (const p of Array.isArray(proposals) ? proposals : []) {
    if (!p || !/^P\d+$/.test(p.id ?? '')) { errors.push(`${p?.id ?? '?'}: id must be P<number>`); continue; }
    if (!Array.isArray(p.files) || !p.files.length) { errors.push(`${p.id}: files must list what it may change`); continue; }
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
