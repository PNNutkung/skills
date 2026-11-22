// Re-check each finding's evidence in plain code (pure; ctx does the reading). A finding is `passed` only when it cites evidence and every
// piece checks out, `not-passed` when something it cites does not match, `no-evidence` when it cites nothing. Only passed findings may carry
// proposals.
import { redact } from './redact.mjs';

export const VERIFY = { passed: 'passed', notPassed: 'not-passed', noEvidence: 'no-evidence' };
const TOLERANCE = 2;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const has = (hay, quote) => norm(hay).includes(norm(quote));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const REF_LINE = /^(.+):(\d+)$/;
const safePath = p => !p.startsWith('/') && !p.split('/').includes('..') && !p.includes('\0');

const CHECKS = {
  file(e, ctx) {
    const m = REF_LINE.exec(e.ref);
    if (!m) return `file evidence needs ref file:line, got ${JSON.stringify(e.ref)}`;
    if (!safePath(m[1])) return `${m[1]} is not a path inside the repo`;
    const text = ctx.readFile(m[1]);
    if (typeof text !== 'string') return `cannot read ${m[1]}`;
    const n = Number(m[2]), lines = text.split('\n');
    const window = lines.slice(Math.max(0, n - 1 - TOLERANCE), n + TOLERANCE).join('\n');
    return has(window, e.quote) ? null : `quote not within ${TOLERANCE} lines of ${e.ref}`;
  },
  transcript(e, ctx) {
    const m = REF_LINE.exec(e.ref);
    if (!m) return `transcript evidence needs ref <path>:<line>, got ${JSON.stringify(e.ref)}`;
    if (redact(e.quote).count) return 'quote holds a secret; quote the redacted text';
    const line = ctx.transcriptLine(m[1], Number(m[2]));
    if (typeof line !== 'string') return `cannot read line ${m[2]} of ${m[1]}`;
    let shown = line;
    try { shown = JSON.stringify(JSON.parse(line)); } catch { /* not JSON: compare the raw line */ }
    const hay = redact(`${line}\n${shown}`).text.replace(/\\n/g, ' ').replace(/\\"/g, '"');
    return has(hay, e.quote) ? null : `quote not on line ${m[2]} of ${m[1]}`;
  },
  commit(e, ctx) {
    const show = /^[0-9a-f]{4,40}$/i.test(e.ref) ? ctx.commit(e.ref) : null;
    if (typeof show !== 'string') return `no commit ${e.ref}`;
    return norm(e.quote) === '' || has(show, e.quote) ? null : `quote not in commit ${e.ref}`;
  },
  pr: (e, ctx) => runFileCheck(e, ctx),
  ci: (e, ctx) => runFileCheck(e, ctx),
  metric(e, ctx) {
    if (/(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(e.ref)) return `bad metric key ${e.ref}`;
    const v = ctx.metric(e.ref);
    if (v === undefined) return `no metric ${e.ref} in collect.json`;
    return String(v) === norm(e.quote) ? null : `metric ${e.ref} is ${JSON.stringify(v)}, not ${JSON.stringify(e.quote)}`;
  },
};
function runFileCheck(e, ctx) {
  if (norm(e.quote) === '') return 'empty quote';
  if (!/^[\w.-]+$/.test(e.ref)) return `${e.kind} evidence ref must be a file in the run folder, got ${JSON.stringify(e.ref)}`;
  const text = ctx.runFile(e.ref);
  if (typeof text !== 'string') return `no ${e.ref} in the run folder`;
  return has(text, e.quote) ? null : `quote not in ${e.ref}`;
}

/** -> { ...finding, verify, reasons } */
export function verifyFinding(finding, ctx) {
  const evidence = isObj(finding) && Array.isArray(finding.evidence) ? finding.evidence : [];
  if (!evidence.length) return { ...finding, verify: VERIFY.noEvidence, reasons: ['no evidence cited'] };
  const reasons = [];
  for (const e of evidence) {
    if (!isObj(e) || typeof e.ref !== 'string') { reasons.push('evidence needs {kind, ref, quote}'); continue; }
    const check = Object.hasOwn(CHECKS, e.kind) ? CHECKS[e.kind] : null;
    if (!check) { reasons.push(`unknown evidence kind ${JSON.stringify(e.kind)} (file, transcript, commit, pr, ci, metric)`); continue; }
    if ((e.kind === 'file' || e.kind === 'transcript') && norm(e.quote) === '') { reasons.push('empty quote'); continue; }
    let why;
    try { why = check(e, ctx); } catch (err) { why = `check failed: ${err.message}`; }
    if (why) reasons.push(why);
  }
  return { ...finding, verify: reasons.length ? VERIFY.notPassed : VERIFY.passed, reasons };
}

/** -> { findings, counts } */
export function verifyAll(findings, ctx) {
  const out = (Array.isArray(findings) ? findings : []).map(f => verifyFinding(f, ctx));
  const counts = { [VERIFY.passed]: 0, [VERIFY.notPassed]: 0, [VERIFY.noEvidence]: 0 };
  for (const f of out) counts[f.verify]++;
  return { findings: out, counts };
}
