// Pure checks for the definition-of-done skill: no I/O, no model. checkDod is the gate, exportPtdd/exportQa feed the next skills, and
// renderTicket/ticketCheck keep a rewritten ticket description honest (every original sentence kept, every DoD item on its checklist).
// ctx = { answers: answers.md text, ticket: ticket.md text, show(path) -> file text at HEAD or null }.

export const REQUIRED = ['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'];
export const KINDS = ['happy', 'fail', 'edge'];
const DOD_ID = /^[A-Za-z][A-Za-z0-9]{0,11}$/; // the id rule of paired-agent-tdd gates.mjs: it goes into test names
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ANSWER_REF = /^A(\d+)$/;
const SPEC_REF = /^(.+):(\d+)$/;
// "(A1)" or "(A1, T2)" at the end of an item text: adr.mjs writes the source ref there itself, so the ADR would show it twice
const TRAILING_REF = /\([ATS]\d+(?:, [ATS]\d+)*\)$/;
const SPEC_TOLERANCE = 2; // lines of slack around a spec ref, as in qa-sweep findings.mjs
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const has = (hay, quote) => norm(quote) !== '' && norm(hay).includes(norm(quote));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text of answer A<n> in answers.md (without the "A<n>: " prefix and its time line), or null. */
export function answerText(answers, ref) {
  const m = ANSWER_REF.exec(String(ref ?? ''));
  if (!m || typeof answers !== 'string') return null;
  const block = answers.split(/^(?=A\d+: )/m).find(b => b.startsWith(`A${m[1]}: `));
  return block ? block.slice(m[0].length + 2).replace(/^time:.*$/m, '') : null;
}

/** -> null when the source checks out, else the reason. */
function sourceProblem(source, ctx) {
  if (!isObj(source)) return 'source is required ({kind, ref, quote})';
  const { kind, ref, quote } = source;
  if (norm(quote) === '') return 'source quote is empty';
  if (kind === 'ticket') return has(ctx.ticket, quote) ? null : 'quote not found in ticket.md';
  if (kind === 'user') {
    if (norm(source.question) === '') return 'question is required for a user source (a short answer means nothing without it)';
    return has(answerText(ctx.answers, ref), quote) ? null : `quote not found in answer ${ref}`;
  }
  if (kind === 'spec') {
    const m = SPEC_REF.exec(String(ref ?? ''));
    if (!m) return `bad spec ref ${ref} (file:line)`;
    const text = typeof ctx.show === 'function' ? ctx.show(m[1]) : null;
    if (typeof text !== 'string') return `cannot read ${m[1]} at HEAD`;
    const line = Number(m[2]);
    const window = text.split('\n').slice(Math.max(1, line - SPEC_TOLERANCE) - 1, line + SPEC_TOLERANCE).join(' ');
    return has(window, quote) ? null : `quote not found within ${SPEC_TOLERANCE} lines of ${ref}`;
  }
  return `unknown source kind ${JSON.stringify(kind)} (spec, ticket, user, or assumed with accepted)`;
}

function itemProblems(item, ctx) {
  const out = [];
  const id = item.id;
  if (norm(item.text) === '') out.push(`${id}: text is required`);
  const tail = TRAILING_REF.exec(norm(item.text));
  if (tail) out.push(`${id}: text ends with a source ref "${tail[0]}": remove it, the ADR adds the source ref itself`);
  if (item.kinds !== undefined) {
    if (!Array.isArray(item.kinds) || !item.kinds.length || item.kinds.some(k => !KINDS.includes(k))) out.push(`${id}: kinds must be a non-empty subset of ${KINDS}`);
    else if (item.kinds.length < KINDS.length && norm(item.kindsReason) === '') out.push(`${id}: kinds narrowed without kindsReason`);
  }
  if (isObj(item.source) && item.source.kind === 'assumed') {
    if (item.accepted === undefined) out.push(`${id}: assumed and not accepted; ask the user, or record their acceptance as an answer and set accepted: "A<n>"`);
    else {
      const text = answerText(ctx.answers, item.accepted);
      if (text === null) out.push(`${id}: accepted answer ${item.accepted} not found in answers.md`);
      else if (!new RegExp(`(^|[^A-Za-z0-9])${escapeRe(id)}([^A-Za-z0-9]|$)`).test(text)) out.push(`${id}: answer ${item.accepted} does not accept ${id} (it must name the item)`);
    }
    return out;
  }
  const why = sourceProblem(item.source, ctx);
  if (why) out.push(`${id}: ${why}`);
  return out;
}

/** -> list of error strings; empty means the DoD may be exported. Never throws. */
export function checkDod(dod, ctx = {}) {
  try {
    const errors = [];
    if (!isObj(dod)) return ['the DoD must be a JSON object'];
    if (typeof dod.slug !== 'string' || !SLUG.test(dod.slug)) errors.push(`slug ${JSON.stringify(dod.slug)} must match ${SLUG} (it names docs/dod/<slug>.json)`);
    const items = Array.isArray(dod.items) ? dod.items : [];
    if (!items.length) errors.push('at least one item is required');
    const seen = new Set();
    for (const item of items) {
      if (!isObj(item) || typeof item.id !== 'string' || !DOD_ID.test(item.id)) { errors.push(`item id ${JSON.stringify(isObj(item) ? item.id : item)} must match ${DOD_ID}`); continue; }
      if (seen.has(item.id)) errors.push(`${item.id} is repeated`);
      seen.add(item.id);
      errors.push(...itemProblems(item, ctx));
    }
    const required = isObj(dod.required) ? dod.required : {};
    for (const k of REQUIRED) {
      const r = required[k];
      if (!isObj(r) || (Array.isArray(r.value) ? !r.value.length : norm(r.value) === '')) { errors.push(`${k}: missing (write "not relevant" with the user's answer as source if it does not apply)`); continue; }
      const why = sourceProblem(r.source, ctx);
      if (why) errors.push(`${k}: ${why.startsWith('source') ? why : `source ${why}`}`);
    }
    if (dod.unconfirmed !== undefined && !Array.isArray(dod.unconfirmed)) errors.push('unconfirmed must be a list');
    for (const u of Array.isArray(dod.unconfirmed) ? dod.unconfirmed : []) errors.push(`unconfirmed: ${norm(isObj(u) ? u.question : u) || '(empty question)'}`);
    return errors;
  } catch (e) {
    return [`check crashed: ${String(e?.message ?? e)}`];
  }
}

// A wall-time target in an item's text: "<= 80 s", "under 2 min", "ไม่เกิน 60 วิ". Its floor is the CPU the work needs spread over every core
// (user+sys CPU-seconds / cores, from one measured run): a target below it cannot be met by running more in parallel (rules/performance.md).
const TIME_TARGET = /(?:<=|≤|<|\bunder|\bwithin|\bat most|ไม่เกิน|ภายใน)\s*(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|min|mins|minutes?|วิ|วินาที|นาที)(?![A-Za-z\u0E00-\u0E7F])/gi;
const UNIT_SECONDS = u => (/^(min|mins|minutes?|นาที)$/i.test(u) ? 60 : 1);

/** The wall-time targets in a text, in seconds. */
export function timeTargets(text) {
  return [...String(text ?? '').matchAll(TIME_TARGET)].map(m => Number(m[1]) * UNIT_SECONDS(m[2]));
}

/**
 * -> list of error strings. An item whose text sets a wall-time target needs timeFloor: {cpuSeconds, cores} measured before the target was
 * set, and its largest target must be at least cpuSeconds / cores; or timeFloor: {none: "<why>"} when the time is a limit, not a speed target
 * (a timeout). dod.mjs check runs it unless DOD_TIME_FLOOR_CHECK_ENABLED=false. Never throws.
 */
export function checkTimeFloors(dod) {
  const errors = [];
  for (const item of isObj(dod) && Array.isArray(dod.items) ? dod.items : []) {
    if (!isObj(item)) continue;
    const targets = timeTargets(item.text);
    if (!targets.length) continue;
    const f = item.timeFloor, id = item.id;
    if (isObj(f) && norm(f.none) !== '') continue;
    const cpu = isObj(f) ? Number(f.cpuSeconds) : NaN, cores = isObj(f) ? Number(f.cores) : NaN;
    if (!(cpu > 0) || !Number.isInteger(cores) || cores < 1) {
      errors.push(`${id}: sets a time target (${targets.map(t => `${t} s`).join(', ')}) without timeFloor: measure one run first (user+sys CPU-seconds and cores) and add timeFloor: {cpuSeconds, cores}, or timeFloor: {none: "<why>"} when it is a limit, not a speed target`);
      continue;
    }
    const floor = Math.round((cpu / cores) * 10) / 10, top = Math.max(...targets);
    if (top < floor) errors.push(`${id}: target ${top} s is below its floor ${floor} s (${cpu} CPU-seconds / ${cores} cores); only less work can meet it, not more parallelism`);
  }
  return errors;
}

const mustPass = (dod, ctx) => {
  const errors = checkDod(dod, ctx);
  if (errors.length) throw new Error(`check failed: ${errors.join('; ')}`);
};

/** One line that proves the item, as it appears in the source text written next to the plan. */
function provenance(item, ctx) {
  const s = item.source;
  if (s.kind === 'assumed') return `accepted ${item.accepted}: ${norm(answerText(ctx.answers, item.accepted))}`;
  if (s.kind === 'user') return `${s.ref}: ${norm(s.quote)}`;
  return norm(s.quote);
}

/**
 * paired-agent-tdd: plan.json dod[] plus the text its `ticket` file must hold, since validatePlan finds every source quote in ONE file.
 * -> { dod: [{id, text, source, kinds}], sourceText }
 */
export function exportPtdd(dod, ctx) {
  mustPass(dod, ctx);
  const items = dod.items.map(i => ({ id: i.id, text: norm(i.text), source: provenance(i, ctx), kinds: i.kinds ?? KINDS }));
  const parts = ['# DoD sources', '', '## ticket.md', '', ctx.ticket ?? '', '', '## answers (question, then answer)', ''];
  for (const i of dod.items) {
    if (i.source.kind === 'user') parts.push(`${norm(i.source.question)}`, `${i.source.ref}: ${norm(i.source.quote)}`, '');
    if (i.source.kind === 'assumed') parts.push(provenance(i, ctx), '');
  }
  parts.push('## spec quotes', '', ...dod.items.filter(i => i.source.kind === 'spec').map(i => `${i.source.ref}: ${norm(i.source.quote)}`), '');
  return { dod: items, sourceText: parts.join('\n') };
}

/** qa-sweep: findings.json requirements[] (kinds spec, ticket, user) and answers.md as is. An accepted assumption becomes a user requirement. */
export function exportQa(dod, ctx) {
  mustPass(dod, ctx);
  const requirements = dod.items.map(i => {
    const s = i.source.kind === 'assumed'
      ? { kind: 'user', ref: i.accepted, quote: norm(answerText(ctx.answers, i.accepted)) }
      : { kind: i.source.kind, ref: i.source.ref, quote: i.source.quote };
    return { id: i.id, text: norm(i.text), source: s };
  });
  return { requirements, answers: ctx.answers ?? '' };
}

// ---------- the ticket rewrite ----------
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

/** Sentences of a text: one per line, a line split after . ! ? followed by a space; list markers and empty lines dropped. */
export function sentences(text) {
  return String(text ?? '').split(/\r?\n|\r/)
    .flatMap(line => line.replace(BULLET, '').split(/(?<=[.!?])\s+/))
    .map(s => s.trim()).filter(Boolean);
}

const HEADINGS = {
  en: { goal: 'Goal', dod: 'Definition of Done', flag: 'Feature flag', compat: 'Backward compatibility', nonGoals: 'Out of scope', env: 'Verify environment', tiers: 'Test tiers', notes: 'Previous notes', file: 'DoD file' },
  th: { goal: 'เป้าหมาย', dod: 'Definition of Done', flag: 'Feature flag', compat: 'Backward compatibility', nonGoals: 'ไม่อยู่ในขอบเขต', env: 'Environment ที่ใช้ verify', tiers: 'Test tiers', notes: 'บันทึกเดิม', file: 'ไฟล์ DoD' },
};
const valueLines = v => (Array.isArray(v) ? v.map(x => `- ${norm(x)}`) : [norm(v)]);
const checklistLine = i => `${i.id} ${norm(i.text)}`;

/**
 * A full ticket description: the DoD as a checklist, the required sections, and every original sentence under "previous notes".
 * The agent may then move original sentences into the goal section; ticketCheck says whether the result still holds everything.
 */
export function renderTicket(dod, original, { lang = 'en', file } = {}) {
  const h = HEADINGS[lang] ?? HEADINGS.en;
  const ticked = new Set(String(original ?? '').split('\n').map(l => /^\s*[-*+]\s+\[[xX]\]\s+([A-Za-z][A-Za-z0-9]*)\b/.exec(l)?.[1]).filter(Boolean));
  const r = dod.required ?? {};
  const out = [`## ${h.dod}`, '', ...dod.items.map(i => `- [${ticked.has(i.id) ? 'x' : ' '}] ${checklistLine(i)}`), ''];
  const section = (title, req) => { if (req) out.push(`## ${title}`, '', ...valueLines(req.value), ''); };
  section(h.flag, r.featureFlag); section(h.compat, r.backwardCompat); section(h.nonGoals, r.nonGoals); section(h.env, r.verifyEnv); section(h.tiers, r.testTiers);
  const notes = sentences(original);
  if (notes.length) out.push(`## ${h.notes}`, '', ...notes, '');
  out.push(`${h.file}: ${file ?? `docs/dod/${dod.slug}.md`}`, '');
  return out.join('\n');
}

/** -> { ok, missing: original sentences not found in the rewrite, missingItems: DoD ids with no checklist line } */
export function ticketCheck(original, rewritten, dod) {
  const flat = norm(rewritten);
  const missing = [...new Set(sentences(original))].filter(s => !flat.includes(norm(s)));
  const lines = String(rewritten ?? '').split('\n').map(l => norm(l));
  const missingItems = (Array.isArray(dod?.items) ? dod.items : [])
    .filter(i => !lines.some(l => /^[-*+] \[[ xX]\] /.test(l) && l.replace(/^[-*+] \[[ xX]\] /, '') === checklistLine(i)))
    .map(i => i.id);
  return { ok: missing.length === 0 && missingItems.length === 0, missing, missingItems };
}

/** docs/dod/<slug>.md: the human-readable DoD. */
export function renderMarkdown(dod) {
  const src = i => {
    const s = i.source;
    if (s.kind === 'assumed') return `accepted assumption (${i.accepted})`;
    if (s.kind === 'user') return `user ${s.ref}: "${norm(s.quote)}" to "${norm(s.question)}"`;
    return `${s.kind} ${s.ref}: "${norm(s.quote)}"`;
  };
  const cell = s => String(s).replace(/\|/g, '\\|');
  const r = dod.required ?? {};
  const lines = [`# Definition of Done: ${dod.slug}`, ''];
  if (dod.ticket?.ref) lines.push(`Ticket: ${dod.ticket.system ?? ''} ${dod.ticket.ref}`.replace(/\s+/g, ' '), '');
  lines.push('| ID | Behavior | Kinds | Source |', '|---|---|---|---|');
  for (const i of dod.items) lines.push(`| ${i.id} | ${cell(norm(i.text))} | ${(i.kinds ?? KINDS).join(', ')}${i.kindsReason ? ` (${cell(norm(i.kindsReason))})` : ''} | ${cell(src(i))} |`);
  lines.push('');
  for (const [k, title] of [['featureFlag', 'Feature flag'], ['backwardCompat', 'Backward compatibility'], ['nonGoals', 'Non-goals'], ['verifyEnv', 'Verify environment'], ['testTiers', 'Test tiers']]) {
    if (r[k]) lines.push(`## ${title}`, '', ...valueLines(r[k].value), '', `Source: ${src({ source: r[k].source })}`, '');
  }
  return lines.join('\n');
}
