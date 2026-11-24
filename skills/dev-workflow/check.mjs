// Pure checks for dev-workflow evidence: answers.md, the concept board (board.json), the ADR's DoD item ids and verify.md.
// No IO: callers pass text or parsed JSON. Every check returns { ok, errors } (plus tickable for verify) and never throws on bad input.

const ANSWER_RE = /^(A\d+):\s?(.*)$/;
const TIME_RE = /^time:/;

/** answers.md (qa-sweep format: `A<n>: text` then `time: ...`) to { A<n>: text }. */
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

const nonEmpty = v => typeof v === 'string' && v.trim() !== '';
const list = v => (Array.isArray(v) ? v.filter(nonEmpty) : []);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const MIN_VARIANTS = 2;
const QUESTION_RE = /^Q\d+$/;

/** board.json: { slug, question: 'Q<n>', concept, diagram?, variants: [{ id, title, pros[], cons[] }], recommended }. */
export function checkBoard(board) {
  if (!isObject(board)) return { ok: false, errors: ['board.json must be a JSON object'] };
  const errors = [];
  if (!nonEmpty(board.concept)) errors.push('concept is empty: say what the work is in a sentence or two');
  if (!QUESTION_RE.test(String(board.question ?? ''))) errors.push('question must be Q<n>: the questions.md id the user answers with their choice');
  const variants = Array.isArray(board.variants) ? board.variants : [];
  if (variants.length < MIN_VARIANTS) errors.push(`at least ${MIN_VARIANTS} variants are needed, found ${variants.length}`);
  const seen = new Set();
  for (const v of variants) {
    const id = isObject(v) && nonEmpty(v.id) ? v.id : '?';
    if (seen.has(id)) errors.push(`duplicate variant ${id}`);
    seen.add(id);
    if (!isObject(v) || !nonEmpty(v.title)) errors.push(`${id} has no title`);
    if (!list(v?.pros).length) errors.push(`${id} has no pro`);
    if (!list(v?.cons).length) errors.push(`${id} has no con`);
  }
  if (!seen.has(board.recommended)) errors.push(`recommended ${board.recommended ?? '(none)'} is not a variant id`);
  return { ok: errors.length === 0, errors };
}

/** The user's choice on the board: the variant id their answer starts with, or null. */
export function boardChoice(board, answers) {
  const n = /^Q(\d+)$/.exec(String(board?.question ?? ''))?.[1];
  const text = n ? answers?.[`A${n}`] : undefined;
  if (!nonEmpty(text)) return null;
  const first = text.trim().split(/[\s,.:;)(]+/)[0];
  return (board.variants ?? []).find(v => v?.id === first)?.id ?? null;
}

const DOD_HEADING_RE = /^## Definition of done\s*$/;
const ITEM_RE = /^- \[[ xX]\] ([A-Za-z][A-Za-z0-9]{0,11}) \(/;

/** The DoD item ids in the ADR that definition-of-done wrote (`- [ ] <id> (kinds): text`). */
export function adrItems(adr) {
  const lines = String(adr ?? '').split('\n');
  const at = lines.findIndex(l => DOD_HEADING_RE.test(l));
  if (at < 0) return [];
  const out = [];
  for (const line of lines.slice(at + 1)) {
    if (/^## /.test(line)) break;
    const m = ITEM_RE.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

const FIELD_RE = /^(env|run|result|image):\s*(.*)$/;

/** verify.md: one `## <item id>` section per DoD item with env:, run:, result:, image: and a fenced output block. */
export function parseVerify(md) {
  const out = {};
  let cur = null, fence = null;
  for (const line of String(md ?? '').split('\n')) {
    if (fence !== null) {
      if (/^```/.test(line)) { cur.output = fence.join('\n').trim(); fence = null; } else fence.push(line);
      continue;
    }
    const h = /^## (\S+)\s*$/.exec(line);
    if (h) { cur = out[h[1]] = {}; continue; }
    if (!cur) continue;
    if (/^```/.test(line)) { fence = []; continue; }
    const f = FIELD_RE.exec(line);
    if (f) cur[f[1]] = f[2].trim();
  }
  return out;
}

const ACCEPTED_RE = /^accepted (A\d+)$/;

/**
 * Every DoD item has evidence from a real run (env + run + result pass + output or image), or the user accepted it by answer id.
 * tickable: items whose real run passed; those are ticked on the ticket without asking (A23). Accepted items are reported instead.
 */
export function checkVerify(md, items, answers) {
  const sections = parseVerify(md);
  const errors = [], tickable = [];
  if (!items?.length) return { ok: false, errors: ['no DoD items to verify: the ADR has no Definition of done items (dod.mjs adr writes them)'], tickable };
  for (const id of items) {
    const s = sections[id];
    if (!s) { errors.push(`${id}: missing (add a "## ${id}" section)`); continue; }
    const result = s.result ?? '';
    const acc = ACCEPTED_RE.exec(result);
    if (acc) {
      if (!nonEmpty(answers?.[acc[1]])) errors.push(`${id}: answer ${acc[1]} not in answers.md`);
      continue;
    }
    if (result !== 'pass') { errors.push(`${id}: result ${result || '(none)'}; use pass, or accepted A<n> with the user's answer`); continue; }
    const bad = [];
    if (!nonEmpty(s.env)) bad.push(`${id}: no env (where it ran)`);
    if (!nonEmpty(s.run) || !(nonEmpty(s.output) || nonEmpty(s.image))) bad.push(`${id}: no evidence (run: plus an output block or image:)`);
    if (bad.length) { errors.push(...bad); continue; }
    tickable.push(id);
  }
  return { ok: errors.length === 0, errors, tickable };
}
