// Pure check of plan.json against the items, the booked envs, the new flags and answers.md (ADR 0009 A1, A3, A5, A6, A8, A14).
import { isAbsolute, normalize } from 'node:path';
import { describeExpect, lintExpect } from './expect.mjs';

export const KIND = { run: 'run', ci: 'ci', remote: 'remote', accept: 'accept' };
const FLAG_RE = /^[A-Z][A-Z0-9]*_[A-Z0-9_]*(ENABLED|MODE|MAX)$/;
const ANSWER_ID_RE = /^A\d+$/;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = v => typeof v === 'string' && v.trim() !== '';

/** The value of the flipped run: true <-> false, or the plan's own flag.flipped for a non-boolean flag. */
export function flipped(flag) {
  const d = String(flag?.default ?? '').trim().toLowerCase();
  if (d === 'true') return 'false';
  if (d === 'false') return 'true';
  return nonEmpty(flag?.flipped) ? flag.flipped : null;
}

const kindOf = e => (e.accepted !== undefined ? KIND.accept : e.ci !== undefined ? KIND.ci : e.remote === true ? KIND.remote : nonEmpty(e.run) ? KIND.run : null);
const answerOk = (a, answers) => typeof a === 'string' && ANSWER_ID_RE.test(a) && nonEmpty(answers?.[a]);

/** -> { ok, errors, entries, needsAsk }; entries carry kind and expectLine. Never throws. */
export function checkPlan(plan, { items = [], booked = [], newFlags = [], answers = {} } = {}) {
  const errors = [], entries = [], needsAsk = [];
  if (!isObject(plan) || !Array.isArray(plan.items)) return { ok: false, errors: ['plan.json must be an object with items: [{ id, env, run, expect }]'], entries, needsAsk };
  if (!items.length) errors.push('no items to verify: no ADR with dod: <slug> and no claims.json');
  const ids = new Set(items.map(i => i.id));
  const seen = new Set();
  for (const raw of plan.items) {
    if (!isObject(raw) || !nonEmpty(raw.id)) { errors.push(`entry ${JSON.stringify(raw)} has no id`); continue; }
    const e = raw, id = e.id;
    if (seen.has(id)) { errors.push(`duplicate entry ${id}: one entry per item`); continue; }
    seen.add(id);
    if (!ids.has(id)) errors.push(`${id} is not a DoD item (${[...ids].join(', ') || 'none'})`);
    if (!nonEmpty(e.env)) errors.push(`${id}: no env (a booked env name)`);
    else if (booked.length && !booked.includes(e.env.trim().toLowerCase())) errors.push(`${id}: env "${e.env}" is not booked (${booked.map(n => `[${n}]`).join(', ')})`);
    const kind = kindOf(e);
    if (!kind) { errors.push(`${id}: no command, no ci, no remote and no accepted answer: a check that is not a command needs the user's answer (accepted: "A<n>")`); continue; }
    if (kind === KIND.accept && !answerOk(e.accepted, answers)) errors.push(`${id}: accepted ${e.accepted} is not in answers.md`);
    if (kind === KIND.ci && !nonEmpty(e.ci)) errors.push(`${id}: ci must name the check run`);
    if (kind === KIND.remote) {
      if (!nonEmpty(e.run)) errors.push(`${id}: a remote entry needs run: the command run there`);
      if (e.approved === undefined) { errors.push(`${id}: remote run needs the user's approval: ask before running on their machine or a remote system, save the answer, set approved: "A<n>"`); needsAsk.push(id); }
      else if (!answerOk(e.approved, answers)) { errors.push(`${id}: approved ${e.approved} is not in answers.md`); needsAsk.push(id); }
    }
    if (e.exit !== undefined && !(Number.isInteger(e.exit) && e.exit >= 0 && e.exit <= 255)) errors.push(`${id}: exit must be a whole number from 0 to 255`);
    if (e.image !== undefined && (!nonEmpty(e.image) || isAbsolute(e.image) || normalize(e.image).startsWith('..'))) errors.push(`${id}: image must be a path inside the repo, relative to its root`);
    if (kind === KIND.run || kind === KIND.remote) errors.push(...lintExpect(e));
    if (e.flag !== undefined) {
      if (!isObject(e.flag) || !FLAG_RE.test(String(e.flag.name ?? ''))) errors.push(`${id}: flag name must look like NAME_ENABLED, NAME_MODE or NAME_MAX`);
      else if (flipped(e.flag) === null) errors.push(`${id}: flag ${e.flag.name} has default ${e.flag.default ?? '(none)'}: give default true or false, or flag.flipped for the flipped run`);
      if (kind !== KIND.run) errors.push(`${id}: flag runs need a local run (run:), not ${kind}`);
    }
    entries.push({ ...e, kind, expectLine: describeExpect(e) });
  }
  const envOf = e => String(e.env ?? '').trim().toLowerCase();
  // a local run's env is this session's machine: an entry there is run by verify.mjs, never relayed by hand through record
  for (const e of entries.filter(x => x.kind === KIND.remote)) {
    const local = entries.find(x => x.kind === KIND.run && envOf(x) === envOf(e));
    if (local) errors.push(`${e.id}: env "${e.env}" is where this session runs commands (${local.id} runs there): run it with verify.mjs run, not remote`);
  }
  for (const { id } of items) if (!seen.has(id)) errors.push(`${id}: no plan entry`);
  for (const n of booked) if (!entries.some(e => envOf(e) === n)) errors.push(`booked env [${n}] has no entry: plan at least one item there`);
  for (const f of newFlags) if (!entries.some(e => e.flag?.name === f)) errors.push(`new flag ${f} has no entry with flag: { name: "${f}", default } (flag runs always happen)`);
  return { ok: errors.length === 0, errors, entries, needsAsk };
}
