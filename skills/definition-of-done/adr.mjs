// Pure ADR code for the definition-of-done skill: no file or git I/O. The DoD becomes an Architecture Decision Record (ADR), the one file
// committed: its Context quotes the ticket (T<n>) and specs (S<n>), its Decision keeps every question with the options, pros and cons the user
// saw when they answered (A<n>), and a `## Definition of done` section that code writes and hashes lists the items for paired-agent-tdd and
// qa-sweep. checkAdr needs only the committed file (what ptdd and qa run); checkAdrSources also needs the run folder (what `dod.mjs adr-check` runs).
// The frontmatter `touches` globs say which code the ADR governs; syncTouches follows renames, the index lists every ADR.
import { createHash } from 'node:crypto';
import { KINDS, REQUIRED, answerText } from './dodcheck.mjs';

export const DOD_HEADING = '## Definition of done';
const DOD_MARKER = '<!-- dod: written by dod.mjs adr; do not edit; sha256:';
const INDEX_OPEN = '<!-- adr-index: written by dod.mjs adrs; do not edit -->';
const INDEX_CLOSE = '<!-- /adr-index -->';
const REQUIRED_LABEL = { featureFlag: 'feature flag', backwardCompat: 'backward compat', nonGoals: 'non-goals', verifyEnv: 'verify env', testTiers: 'test tiers' };
const LABEL_KEY = Object.fromEntries(Object.entries(REQUIRED_LABEL).map(([k, v]) => [v, k]));
const NO_TRADE_OFF = 'none recorded (the answer picks no single option)';
const SPEC_TOLERANCE = 2; // lines of slack around a spec ref, as in dodcheck.mjs and qa-sweep findings.mjs
const HASH_LEN = 16;
const REF = '[ATS]\\d+';
const ITEM_RE = new RegExp(`^- \\[ \\] ([A-Za-z][A-Za-z0-9]{0,11}) \\(([a-z, ]+)\\): (.+) \\((${REF}(?:, ${REF})*)\\)$`);
const REQUIRED_RE = new RegExp(`^- (${Object.values(REQUIRED_LABEL).join('|')}): (.+) \\((${REF}(?:, ${REF})*)\\)$`);
const ANCHOR_RE = /^([TS]\d+): (.+)$/;
const DECISION_RE = /^### (A\d+): (.*)$/;
const OPTION_RE = /^- \(([A-Z])\) (.+)$/;
const PRO_RE = /^ {2}- pro: (.+)$/;
const CON_RE = /^ {2}- con: (.+)$/;
const ANSWER_RE = /^Answer: (.+)$/;
const SPEC_IN_ANCHOR = /^(.*) \(([^()\s]+):(\d+)\)$/;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const has = (hay, needle) => norm(needle) !== '' && norm(hay).includes(norm(needle));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const lines = text => String(text ?? '').split(/\r?\n/);
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, HASH_LEN);
const valueText = v => (Array.isArray(v) ? v.map(norm).join(', ') : norm(v));

// ---------------------------------------------------------------- questions.md
/**
 * The questions the agent saved when it asked them: `Q<n>: text`, optional `context:`, `(A) label` with `  + pro` and `  - con` lines,
 * `recommended:`, `time:`. -> Map n -> { n, text, context, options: [{key, label, pros, cons}], recommended }
 */
export function parseQuestions(text) {
  const out = new Map();
  let q = null, opt = null;
  for (const raw of lines(text)) {
    const head = /^Q(\d+): (.*)$/.exec(raw);
    if (head) { q = { n: Number(head[1]), text: norm(head[2]), context: '', options: [], recommended: '' }; out.set(q.n, q); opt = null; continue; }
    if (!q) continue;
    let m;
    if ((m = /^context: (.*)$/.exec(raw))) q.context = norm(m[1]);
    else if ((m = /^recommended: (.*)$/.exec(raw))) q.recommended = norm(m[1]);
    else if ((m = /^\(([A-Z])\) (.+)$/.exec(raw))) { opt = { key: m[1], label: norm(m[2]), pros: [], cons: [] }; q.options.push(opt); }
    else if (opt && (m = /^\s+\+ (.+)$/.exec(raw))) opt.pros.push(norm(m[1]));
    else if (opt && (m = /^\s+- (.+)$/.exec(raw))) opt.cons.push(norm(m[1]));
  }
  return out;
}

const answerIds = answers => [...String(answers ?? '').matchAll(/^A(\d+): /gm)].map(m => Number(m[1])).filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a - b);
const answerOf = (answers, n) => norm(answerText(answers, `A${n}`));
const picked = (q, answer) => q.options.find(o => o.key === answer) ?? null;

function questionProblems(q, n) {
  if (!q) return [`Q${n} is not in questions.md: save each question with its options, pros and cons when you ask it`];
  if (q.options.length < 2) return [`Q${n} needs at least two options`];
  return q.options.filter(o => !o.pros.length || !o.cons.length).map(o => `Q${n} (${o.key}) needs at least one pro and one con`);
}

/** Every question saved in questions.md, checked the way adr will check it, so a gap shows when the question is saved. -> errors */
export function checkQuestions(text) {
  return [...parseQuestions(text).entries()].sort(([a], [b]) => a - b).flatMap(([n, q]) => questionProblems(q, n));
}

// ---------------------------------------------------------------- the DoD section
/** T<n> per distinct ticket quote and S<n> per distinct spec quote, in the order the DoD cites them. */
function citations(dod) {
  const sources = [...(dod.items ?? []).map(i => i.source), ...REQUIRED.map(k => dod.required?.[k]?.source)].filter(isObj);
  const tickets = [], specs = [];
  for (const s of sources) {
    if (s.kind === 'ticket' && !tickets.includes(norm(s.quote))) tickets.push(norm(s.quote));
    if (s.kind === 'spec' && !specs.some(x => x.quote === norm(s.quote) && x.ref === s.ref)) specs.push({ quote: norm(s.quote), ref: String(s.ref) });
  }
  return { tickets, specs };
}

function refOf(source, accepted, cites) {
  if (!isObj(source)) return '';
  if (source.kind === 'user') return String(source.ref);
  if (source.kind === 'assumed') return String(accepted ?? '');
  if (source.kind === 'ticket') return `T${cites.tickets.indexOf(norm(source.quote)) + 1}`;
  if (source.kind === 'spec') return `S${cites.specs.findIndex(x => x.quote === norm(source.quote) && x.ref === String(source.ref)) + 1}`;
  return '';
}

/** The lines of the DoD section body (after the marker), as code writes them. */
function dodSectionBody(dod) {
  const cites = citations(dod);
  const items = (dod.items ?? []).map(i => `- [ ] ${i.id} (${(i.kinds ?? KINDS).join(', ')}): ${norm(i.text)} (${refOf(i.source, i.accepted, cites)})`);
  const required = REQUIRED.map(k => `- ${REQUIRED_LABEL[k]}: ${valueText(dod.required?.[k]?.value)} (${refOf(dod.required?.[k]?.source, undefined, cites)})`);
  return [...items, '', ...required].join('\n');
}
const normalizeBody = body => lines(body).map(l => l.trimEnd()).join('\n').trim();
const dodSection = dod => { const body = dodSectionBody(dod); return `${DOD_HEADING}\n\n${DOD_MARKER}${sha(normalizeBody(body))} -->\n\n${body}\n`; };

// ---------------------------------------------------------------- render
const titleOf = dod => norm(dod.title) || String(dod.slug ?? '').split('-').filter(Boolean).map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
const frontmatter = (touches, slug) => ['---', 'touches:', ...touches.map(g => `  - ${JSON.stringify(g)}`), `dod: ${slug}`, '---'].join('\n');

/**
 * The ADR draft for a DoD that passed `dod.mjs check`. -> { text, errors }; text is null when errors is not empty.
 * answers/questions/ticket are the run folder's answers.md, questions.md and ticket.md; number and date name the file and its header.
 */
export function renderAdr({ dod, answers, questions, ticket, number, date, status = 'Accepted' }) {
  const errors = [];
  const touches = Array.isArray(dod?.touches) ? dod.touches.filter(g => typeof g === 'string' && norm(g)) : [];
  if (!touches.length || touches.length !== (dod?.touches?.length ?? 0)) errors.push('touches is required: a non-empty list of globs of the code this decision governs (ask the user to confirm them)');
  const qs = parseQuestions(questions);
  const ids = answerIds(answers);
  for (const n of ids) errors.push(...questionProblems(qs.get(n), n));
  if (errors.length) return { text: null, errors };

  const cites = citations(dod);
  const context = [...cites.tickets.map((q, i) => `T${i + 1}: ${q}`), ...cites.specs.map((s, i) => `S${i + 1}: ${s.quote} (${s.ref})`)];
  const tradeOffs = [];
  const decisions = ids.flatMap(n => {
    const q = qs.get(n), answer = answerOf(answers, n), choice = picked(q, answer);
    const tradeOff = choice ? choice.cons.join('; ') : NO_TRADE_OFF;
    if (choice) tradeOffs.push(`- A${n}: ${tradeOff}`);
    return [
      `### A${n}: ${q.text}`, '',
      ...(q.context ? [`Context: ${q.context}`] : []),
      "Options considered (the agent's analysis when the question was asked):",
      ...q.options.flatMap(o => [`- (${o.key}) ${o.label}`, ...o.pros.map(p => `  - pro: ${p}`), ...o.cons.map(c => `  - con: ${c}`)]),
      ...(q.recommended ? [`Recommended: ${q.recommended}`] : []),
      `Answer: ${answer}${choice ? ` (${choice.label})` : ''}`,
      `Trade-off accepted: ${tradeOff}`, '',
    ];
  });
  const text = [
    frontmatter(touches, dod.slug), `# ${number}. ${titleOf(dod)}`, '', `Date: ${date}`, `Status: ${status}`, '',
    '## Context', '', 'Quoted verbatim from the ticket and the specs this decision rests on:', '', ...(context.length ? context : ['(no ticket or spec quotes)']), '',
    '## Decision', '', ...decisions,
    '## Consequences', '', 'Trade-offs we accepted:', '', ...(tradeOffs.length ? tradeOffs : ['- none']), '',
    dodSection(dod),
  ].join('\n');
  return { text, errors: [] };
}

// ---------------------------------------------------------------- parse
/** The frontmatter fields this skill writes: { touches: [glob], slug }. A missing or broken block gives empty values. */
export function parseFrontmatter(text) {
  const out = { touches: [], slug: null };
  const ls = lines(text);
  if (ls[0] !== '---') return out;
  let key = null;
  for (let i = 1; i < ls.length && ls[i] !== '---'; i++) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(ls[i]);
    if (kv) { key = kv[1]; if (key === 'dod') out.slug = unquote(kv[2]) || null; continue; }
    const item = /^\s+-\s+(.+)$/.exec(ls[i]);
    if (item && key === 'touches') out.touches.push(unquote(item[1]));
  }
  return out;
}
function unquote(v) {
  const s = String(v).trim();
  if (s.startsWith('"')) { try { return String(JSON.parse(s)); } catch { return s.slice(1, -1); } }
  return s.replace(/^'(.*)'$/, '$1');
}

/** Replace the frontmatter `touches` list, keeping everything else byte for byte. */
export function setTouches(text, touches) {
  const ls = lines(text);
  const block = ['touches:', ...touches.map(g => `  - ${JSON.stringify(g)}`)];
  if (ls[0] !== '---') return [frontmatter(touches, '').replace(/\ndod: \n/, '\n'), ...ls].join('\n');
  const end = ls.indexOf('---', 1);
  const fm = ls.slice(1, end), out = [];
  for (let i = 0; i < fm.length; i++) {
    if (/^touches:/.test(fm[i])) { while (i + 1 < fm.length && /^\s+-\s/.test(fm[i + 1])) i++; out.push(...block); continue; }
    out.push(fm[i]);
  }
  if (!fm.some(l => /^touches:/.test(l))) out.unshift(...block);
  return ['---', ...out, ...ls.slice(end)].join('\n');
}

/**
 * Everything checkAdr and the consumers need, with 1-based line numbers.
 * -> { touches, slug, title, status, anchors: Map(T1|S1 -> {line, text}), decisions: Map(A1 -> {line, options, answer, answerLine}), section | null }
 */
export function parseAdr(text) {
  const ls = lines(text);
  const fm = parseFrontmatter(text);
  const anchors = new Map(), decisions = new Map();
  let title = null, status = null, cur = null, opt = null, sectionAt = -1;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (l === DOD_HEADING) { sectionAt = i; break; }
    let m;
    if (title === null && (m = /^# (.+)$/.exec(l))) title = norm(m[1]);
    if (status === null && (m = /^Status: (.+)$/.exec(l))) status = norm(m[1]);
    if (/^#{1,2} /.test(l)) { cur = null; opt = null; }
    if ((m = DECISION_RE.exec(l))) { cur = { line: i + 1, title: norm(m[2]), options: [], answer: null, answerLine: null }; decisions.set(m[1], cur); opt = null; continue; }
    if ((m = ANCHOR_RE.exec(l)) && !anchors.has(m[1])) anchors.set(m[1], { line: i + 1, text: norm(m[2]) });
    if (!cur) continue;
    if ((m = OPTION_RE.exec(l))) { opt = { key: m[1], label: norm(m[2]), pros: [], cons: [] }; cur.options.push(opt); }
    else if (opt && (m = PRO_RE.exec(l))) opt.pros.push(norm(m[1]));
    else if (opt && (m = CON_RE.exec(l))) opt.cons.push(norm(m[1]));
    else if (cur.answer === null && (m = ANSWER_RE.exec(l))) { cur.answer = norm(m[1]); cur.answerLine = i + 1; }
  }
  return { touches: fm.touches, slug: fm.slug, title, status, anchors, decisions, section: sectionAt < 0 ? null : parseSection(ls, sectionAt) };
}

function parseSection(ls, at) {
  let end = ls.length;
  for (let i = at + 1; i < ls.length; i++) if (/^## /.test(ls[i])) { end = i; break; }
  const bodyLines = ls.slice(at + 1, end);
  const markerIdx = bodyLines.findIndex(l => l.startsWith(DOD_MARKER));
  const hash = markerIdx < 0 ? null : (/sha256:([0-9a-f]+) -->/.exec(bodyLines[markerIdx]) ?? [])[1] ?? null;
  const body = normalizeBody(bodyLines.slice(markerIdx + 1).join('\n'));
  const items = [], required = {}, bad = [];
  for (const [k, l] of bodyLines.slice(markerIdx + 1).entries()) {
    if (!l.trim()) continue;
    let m;
    if ((m = ITEM_RE.exec(l))) items.push({ id: m[1], kinds: m[2].split(', '), text: m[3], refs: m[4].split(', '), line: at + markerIdx + k + 3 });
    else if ((m = REQUIRED_RE.exec(l))) required[LABEL_KEY[m[1]]] = { value: m[2], refs: m[3].split(', ') };
    else bad.push(l);
  }
  return { hash, body, items, required, bad };
}

// ---------------------------------------------------------------- checks
function specProblem(id, anchorText, show) {
  const m = SPEC_IN_ANCHOR.exec(anchorText);
  if (!m) return `${id}: a spec quote needs its place, "quote (file:line)"`;
  let text = null;
  try { text = typeof show === 'function' ? show(m[2]) : null; } catch { text = null; }
  if (typeof text !== 'string') return `${id}: cannot read ${m[2]} at HEAD`;
  const line = Number(m[3]);
  const window = text.split('\n').slice(Math.max(1, line - SPEC_TOLERANCE) - 1, line + SPEC_TOLERANCE).join(' ');
  return has(window, m[1]) ? null : `${id}: quote not found within ${SPEC_TOLERANCE} lines of ${m[2]}:${m[3]}`;
}

/**
 * The check paired-agent-tdd and qa-sweep run on the committed ADR alone: the DoD section is there and unedited (its hash), every line parses,
 * every cited A/T/S exists, every decision keeps its answer and at least two options each with a pro and a con, every spec quote is still at its
 * line (show(path) -> the file at HEAD). -> list of error strings; never throws.
 */
export function checkAdr(text, { show } = {}) {
  try {
    const p = parseAdr(text);
    if (!p.section) return [`not an ADR with a "${DOD_HEADING}" section (point dodFile at the ADR that dod.mjs adr wrote, or run dod.mjs adr first)`];
    const errors = [];
    const s = p.section;
    if (!s.hash || s.hash !== sha(s.body)) errors.push(`the "${DOD_HEADING}" section was edited by hand (its sha256 does not match); re-run dod.mjs adr to rewrite it`);
    for (const l of s.bad) errors.push(`cannot read this line of the "${DOD_HEADING}" section: ${l}`);
    if (!s.items.length) errors.push(`the "${DOD_HEADING}" section lists no item`);
    for (const k of REQUIRED) if (!s.required[k]) errors.push(`the "${DOD_HEADING}" section has no "${REQUIRED_LABEL[k]}" line`);
    const cited = [...s.items.map(i => [i.id, i.refs]), ...Object.entries(s.required).map(([k, r]) => [REQUIRED_LABEL[k], r.refs])];
    for (const [who, refs] of cited) for (const ref of refs) if (!(ref.startsWith('A') ? p.decisions.has(ref) : p.anchors.has(ref))) errors.push(`${who} cites ${ref}, which is not in the ADR`);
    for (const [id, d] of p.decisions) {
      if (d.answer === null) errors.push(`${id} has no "Answer:" line`);
      if (d.options.length < 2) errors.push(`${id} needs at least two options`);
      for (const o of d.options) if (!o.pros.length || !o.cons.length) errors.push(`${id} (${o.key}) needs at least one pro and one con`);
    }
    for (const [id, a] of p.anchors) if (id.startsWith('S')) { const why = specProblem(id, a.text, show); if (why) errors.push(why); }
    return errors;
  } catch (e) {
    return [`ADR check crashed: ${String(e?.message ?? e)}`];
  }
}

/**
 * The check `dod.mjs adr-check` runs after the agent reorganized the draft, with the run folder's sources: checkAdr, plus the DoD section
 * equals what the DoD renders, and every quote, question, option, pro, con, recommendation and answer survives word for word. Never throws.
 */
export function checkAdrSources(text, { dod, answers, questions, ticket, show } = {}) {
  try {
    const errors = checkAdr(text, { show });
    const p = parseAdr(text);
    if (p.section && p.section.body !== normalizeBody(dodSectionBody(dod))) errors.push(`the "${DOD_HEADING}" section does not match the DoD; re-run dod.mjs adr`);
    const must = [];
    const cites = citations(dod);
    cites.tickets.forEach((q, i) => { must.push([q, `T${i + 1}`]); if (!has(ticket, q)) errors.push(`T${i + 1} is not in ticket.md: ${q}`); });
    cites.specs.forEach((s, i) => must.push([s.quote, `S${i + 1}`]));
    const qs = parseQuestions(questions);
    for (const n of answerIds(answers)) {
      const q = qs.get(n);
      if (!q) { errors.push(`Q${n} is not in questions.md`); continue; }
      must.push([q.text, `Q${n}`], [answerOf(answers, n), `A${n}`]);
      if (q.recommended) must.push([q.recommended, `Q${n} recommendation`]);
      for (const o of q.options) must.push([o.label, `Q${n} (${o.key})`], ...o.pros.map(x => [x, `Q${n} (${o.key}) pro`]), ...o.cons.map(x => [x, `Q${n} (${o.key}) con`]));
    }
    for (const [needle, where] of must) if (!has(text, needle)) errors.push(`dropped from the ADR: "${needle}" (${where}); keep it word for word`);
    return errors;
  } catch (e) {
    return [`ADR source check crashed: ${String(e?.message ?? e)}`];
  }
}

// ---------------------------------------------------------------- what the consumers take
/** paired-agent-tdd plan.json dod[]: the source names the ADR and the cited refs (validatePlan needs a non-empty source). */
export const toPlanDod = (parsed, file) => parsed.section.items.map(i => ({ id: i.id, text: i.text, kinds: i.kinds, source: `${file} ${i.refs.join(', ')}` }));

/** qa-sweep findings.json requirements[]: a spec source at the line that holds the quote (the first cited ref), plus `dod` for the report. */
export function toRequirements(parsed, file) {
  return parsed.section.items.map(i => {
    const ref = i.refs[0];
    let line, quote;
    if (ref.startsWith('A')) { const d = parsed.decisions.get(ref); line = d.answerLine; quote = d.answer; }
    else { const a = parsed.anchors.get(ref); line = a.line; quote = ref.startsWith('S') ? (SPEC_IN_ANCHOR.exec(a.text)?.[1] ?? a.text) : a.text; }
    return { id: i.id, text: i.text, source: { kind: 'spec', ref: `${file}:${line}`, quote }, dod: ref };
  });
}

// ---------------------------------------------------------------- globs and renames
const GLOB_CHARS = /[*?]/;
const escapeRe = s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
/** `**` any depth, `*` and `?` inside one path segment; a glob with no wildcard matches that path or anything under it. */
export function matchGlob(glob, path) {
  const g = String(glob ?? ''), p = String(path ?? '');
  if (!g) return false;
  if (!GLOB_CHARS.test(g)) { const bare = g.replace(/\/+$/, ''); return p === bare || p.startsWith(bare + '/'); }
  let re = '';
  for (let i = 0; i < g.length; i++) {
    if (g.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (g.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (g[i] === '*') re += '[^/]*';
    else if (g[i] === '?') re += '[^/]';
    else re += escapeRe(g[i]);
  }
  return new RegExp(`^${re}$`).test(p);
}
function staticPrefix(glob) {
  const at = glob.search(GLOB_CHARS);
  return at < 0 ? glob : glob.slice(0, glob.lastIndexOf('/', at) + 1);
}

/**
 * Follow renames ([old, new] repo paths) in a touches list. files = the repo's paths after the move.
 * -> { touches, changes: [{from, to} | {added, next}], warnings }
 */
export function syncTouches(touches, renames, files) {
  const out = [], changes = [], warnings = [];
  const add = g => { if (!out.includes(g)) out.push(g); };
  const fileList = Array.isArray(files) ? files : [];
  for (const g of Array.isArray(touches) ? touches : []) {
    const moved = (Array.isArray(renames) ? renames : []).filter(([o, n]) => matchGlob(g, o) && !matchGlob(g, n));
    if (!moved.length) { add(g); continue; }
    const still = fileList.some(f => matchGlob(g, f));
    const prefix = staticPrefix(g);
    const targets = moved.map(([o, n]) => { const tail = String(o).slice(prefix.length); return String(o).startsWith(prefix) && String(n).endsWith(tail) ? String(n).slice(0, String(n).length - tail.length) : null; });
    const one = targets.every(t => t !== null && t === targets[0]) ? targets[0] : null;
    if (one !== null && one !== prefix) {
      const next = one + g.slice(prefix.length);
      if (still) { add(g); add(next); changes.push({ added: next, next: g }); } else { add(next); changes.push({ from: g, to: next }); }
      continue;
    }
    const literal = moved.map(([, n]) => String(n));
    if (still) add(g);
    literal.forEach(add);
    changes.push(still ? { added: literal.join(', '), next: g } : { from: g, to: literal.join(', ') });
    warnings.push(`${g}: files moved to several places; added ${literal.join(', ')}. Check the ADR's touches`);
  }
  for (const g of out) if (!fileList.some(f => matchGlob(g, f))) warnings.push(`${g} matches no file; update the ADR's touches`);
  return { touches: out, changes, warnings };
}

// ---------------------------------------------------------------- numbering and the index
export const nextNumber = names => 1 + Math.max(0, ...names.map(n => /^(\d{4})-/.exec(n)).filter(Boolean).map(m => Number(m[1])));
export const adrFileName = (n, slug) => `${String(n).padStart(4, '0')}-${slug}.md`;

const cell = s => norm(s).replace(/\|/g, '\\|');
/** The index block for entries [{n, file, title, status, touches}], sorted by number. */
function indexBlock(entries) {
  const rows = [...entries].sort((a, b) => a.n - b.n).map(e => `| [${e.n}](${e.file}) | ${cell(e.title)} | ${cell(e.status)} | ${(e.touches ?? []).map(g => `\`${cell(g)}\``).join(', ')} |`);
  return [INDEX_OPEN, '| # | Title | Status | Touches |', '|---|---|---|---|', ...rows, INDEX_CLOSE].join('\n');
}

/** The README with the index written between its markers (appended when absent); null makes a new README. Idempotent. */
export function upsertIndex(readme, entries) {
  const block = indexBlock(entries);
  if (readme === null || readme === undefined) return `# Architecture decision records\n\n${block}\n`;
  const a = readme.indexOf(INDEX_OPEN), b = readme.indexOf(INDEX_CLOSE);
  if (a >= 0 && b > a) return readme.slice(0, a) + block + readme.slice(b + INDEX_CLOSE.length);
  return `${readme}${readme.endsWith('\n') ? '' : '\n'}\n${block}\n`;
}
