// The retro report (run folder only) and the one-line log that is committed (pure). Headings follow the user's language; ids, categories and
// verify values stay English so scripts and later retros can read them.
import { DEFAULT_OPTIONS } from './approvals.mjs';

export const LOG_FILE = 'docs/retro/log.md';
const LOG_COLUMNS = ['date', 'work', 'sessions', 'tokens', 'findings', 'passed', 'approved', 'ratchetRules'];
const LABELS = {
  en: { findings: 'Findings', proposals: 'Proposals', evidence: 'evidence', why: 'why', none: 'none' },
  th: { findings: 'Findings', proposals: 'ข้อเสนอ', evidence: 'หลักฐาน', why: 'เหตุผล', none: 'ไม่มี' },
};
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReport({ work, findings, proposals, lang = 'en' }) {
  const t = LABELS[lang] ?? LABELS.en;
  const counts = { passed: 0, 'not-passed': 0, 'no-evidence': 0 };
  for (const f of findings) counts[f.verify] = (counts[f.verify] ?? 0) + 1;
  const out = [`# Retro: ${work}`, '', `${counts.passed} passed · ${counts['not-passed']} not-passed · ${counts['no-evidence']} no-evidence`, '', `## ${t.findings}`, ''];
  for (const f of findings) {
    out.push(`### ${f.id} · ${f.verify} · ${f.category ?? ''}`.trimEnd(), '', f.title ?? '', '');
    for (const e of f.evidence ?? []) out.push(`- ${t.evidence}: ${e.kind} ${e.ref}${e.quote ? ` "${e.quote}"` : ''}`);
    if (f.verify !== 'passed') for (const r of f.reasons ?? []) out.push(`- ${t.why}: ${r}`);
    out.push('');
  }
  out.push(`## ${t.proposals}`, '');
  if (!proposals?.length) out.push(t.none);
  for (const p of proposals ?? []) {
    const options = Object.entries(p.options ?? DEFAULT_OPTIONS).map(([k, v]) => `${k} ${v}`).join(', ');
    out.push(`- ${p.id} (${p.finding}): ${p.text ?? ''} [${(p.files ?? []).join(', ')}] options: ${options}`);
  }
  return `${out.join('\n')}\n`;
}

/** The log with one more row; a new log gets its title and header. */
export function appendLog(text, row) {
  const head = `# Retro log\n\nOne line per retro (the retro skill appends it).\n\n| ${LOG_COLUMNS.join(' | ')} |\n|${LOG_COLUMNS.map(() => '---').join('|')}|\n`;
  const base = text && text.trim() ? (text.endsWith('\n') ? text : `${text}\n`) : head;
  return `${base}| ${LOG_COLUMNS.map(k => cell(row[k])).join(' | ')} |\n`;
}
