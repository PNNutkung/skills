// The 4 sections every ticket, new issue and PR body starts with (ADR 0012): Why, Expected outcome, If we do nothing, How we know.
// Pure: no IO. definition-of-done renders with it, hooks/ticket-why-guard.mjs and dev-workflow check with it.
export const SECTIONS = ['why', 'outcome', 'cost', 'how'];

export const HEADINGS = {
  en: { why: 'Why', outcome: 'Expected outcome', cost: 'If we do nothing', how: 'How we know' },
  th: { why: 'ทำไม (Why)', outcome: 'ผลที่คาดหวัง (Expected outcome)', cost: 'ถ้าไม่ทำจะเสียอะไร (If we do nothing)', how: 'รู้ได้อย่างไรว่าสำเร็จ (How we know)' },
};
// The words a heading may start with, per section, in any listed language.
const WORDS = {
  why: ['why', 'ทำไม'],
  outcome: ['expected outcome', 'ผลที่คาดหวัง'],
  cost: ['if we do nothing', 'ถ้าไม่ทำจะเสียอะไร'],
  how: ['how we know', 'รู้ได้อย่างไรว่าสำเร็จ'],
};
const COLUMNS = {
  metric: ['metric', 'ตัววัด'],
  today: ['today', 'baseline', 'วันนี้'],
  target: ['target', 'เป้า'],
};
const TABLE_HEAD = {
  en: { metric: 'Metric', today: 'Today', target: 'Target', proof: 'Proven by', result: 'Result' },
  th: { metric: 'ตัววัด', today: 'วันนี้', target: 'เป้า', proof: 'พิสูจน์ด้วย', result: 'ผลจริง' },
};
const NOT_MEASURABLE_RE = /^\s*[-*]?\s*(?:not measurable|วัดไม่ได้)\s*:\s*(.*)$/im;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^ {0,3}(```|~~~)/;

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const startsWithWord = (text, word) => text === word || (text.startsWith(word) && /^[\s(:\-–]/.test(text.slice(word.length)));

/** The section key a heading text names, or null. */
export function sectionKey(headingText) {
  const t = norm(headingText);
  for (const k of SECTIONS) if (WORDS[k].some(w => startsWithWord(t, w))) return k;
  return null;
}

/** -> [{key|null, heading, text}] for every heading outside code fences, in order. */
export function sectionsOf(body) {
  const out = [];
  let cur = null, fence = null;
  for (const line of String(body ?? '').split('\n')) {
    const f = FENCE_RE.exec(line);
    if (f) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]; if (cur) cur.lines.push(line); continue; }
    const h = fence ? null : HEADING_RE.exec(line);
    if (h) { cur = { key: sectionKey(h[2]), heading: h[2], lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out.map(s => ({ key: s.key, heading: s.heading, text: s.lines.join('\n') }));
}

const visible = text => String(text).replace(/<!--[\s\S]*?-->/g, '').trim();
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());

function outcomeProblems(text) {
  const nm = NOT_MEASURABLE_RE.exec(text);
  if (nm) return nm[1].trim() ? [] : ['"Expected outcome": "not measurable:" needs a reason after the colon'];
  const rows = text.split('\n').filter(l => /^\s*\|.*\|\s*$/.test(l));
  if (rows.length >= 2) {
    const head = cells(rows[0]).map(norm);
    const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, ws]) => [k, head.findIndex(h => ws.some(w => startsWithWord(h, w)))]));
    const missingCols = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k);
    if (missingCols.length) return [`"Expected outcome": the table needs columns metric, today and target (missing: ${missingCols.join(', ')})`];
    const data = rows.slice(1).filter(r => !/^\s*\|?\s*:?-{2,}/.test(r));
    if (!data.length) return ['"Expected outcome": the table has no row'];
    const errs = [];
    data.forEach((r, n) => {
      const c = cells(r);
      for (const k of ['metric', 'today', 'target']) if (!c[col[k]]) errs.push(`"Expected outcome": row ${n + 1} has an empty ${k} cell`);
    });
    return errs;
  }
  return ['"Expected outcome": write a table with metric, today and target, or a line "not measurable: <reason>"'];
}

/** -> list of error strings; empty when the body starts with the 4 sections, in order, each filled in. */
export function checkBody(body) {
  if (typeof body !== 'string') return ['the body must be text'];
  const secs = sectionsOf(body);
  const errors = [];
  for (const k of SECTIONS) if (!secs.some(s => s.key === k)) errors.push(`missing section "${HEADINGS.en[k]}" (Thai: "${HEADINGS.th[k]}")`);
  if (errors.length) return errors;
  const firstFour = secs.slice(0, SECTIONS.length).map(s => s.key);
  if (firstFour.join() !== SECTIONS.join()) errors.push(`the first 4 sections must be, in this order: ${SECTIONS.map(k => HEADINGS.en[k]).join(', ')} (found: ${secs.slice(0, 4).map(s => s.heading).join(', ')})`);
  for (const k of SECTIONS) {
    const s = secs.find(x => x.key === k);
    if (!visible(s.text)) { errors.push(`section "${HEADINGS.en[k]}" is empty: write it`); continue; }
    if (k === 'outcome') errors.push(...outcomeProblems(visible(s.text)));
  }
  return errors;
}

const cell = s => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

/**
 * Markdown for the 4 sections. fields = {why, outcomes:[{id, metric, baseline, target, notMeasurable, provenBy}], cost, how:[lines]}.
 * results (optional) = {outcomeId: 'met'|'not met'|'not run'} adds a result column.
 */
export function renderSections(fields, { lang = 'en', results } = {}) {
  const h = HEADINGS[lang] ?? HEADINGS.en;
  const t = TABLE_HEAD[lang] ?? TABLE_HEAD.en;
  const f = fields ?? {};
  const outs = Array.isArray(f.outcomes) ? f.outcomes : [];
  const withResult = results && typeof results === 'object';
  const head = [t.metric, t.today, t.target, t.proof, ...(withResult ? [t.result] : [])];
  const rows = outs.map(o => {
    const proof = (Array.isArray(o.provenBy) ? o.provenBy : []).join(', ');
    const base = o.notMeasurable ? [o.metric, '-', `not measurable: ${o.notMeasurable}`, proof] : [o.metric, o.baseline, o.target, proof];
    return `| ${[...base, ...(withResult ? [results[o.id] ?? 'not run'] : [])].map(cell).join(' | ')} |`;
  });
  const how = (Array.isArray(f.how) ? f.how : [f.how]).filter(x => String(x ?? '').trim()).map(x => `- ${String(x).trim()}`);
  return [
    `## ${h.why}`, '', String(f.why ?? '').trim(), '',
    `## ${h.outcome}`, '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows, '',
    `## ${h.cost}`, '', String(f.cost ?? '').trim(), '',
    `## ${h.how}`, '', ...how, '',
  ].join('\n');
}
