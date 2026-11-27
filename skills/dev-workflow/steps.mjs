// The dev-workflow step table and its gates. Pure: callers gather the evidence (io.mjs) and pass it in.
// evidence = { facts, measure, dod: {ok, errors}, board: {ok, errors, choice}, adr, pr, verify: {ok, errors}, retro }

export const STEPS = ['intake', 'dod', 'board', 'lock', 'tdd', 'verify', 'retro', 'done'];
/** Steps no answer can skip: what "done" means, the proof it works, and the look back (A5). */
export const NEVER_SKIP = ['dod', 'verify', 'retro'];
/** The only step a user's answer may skip: the concept board, for small work (A5). */
export const SKIPPABLE = ['board'];
const REASON_MIN_WORDS = 2;

const GATES = {
  intake: (ev, measure) => [
    ...(ev.facts ? [] : ['facts.md is missing or cites no file:line: send a low-tier subagent for the facts before the first question']),
    ...(measure && !ev.measure ? ['measure.md is missing: this run was opened with --measure (speed or size work), measure before asking'] : []),
  ],
  dod: ev => (ev.dod?.ok ? [] : ev.dod?.errors?.length ? ev.dod.errors : ['the DoD does not pass: run definition-of-done until dod.mjs check prints ok']),
  board: ev => {
    if (!ev.board?.ok) return ev.board?.errors?.length ? ev.board.errors : ['board.json is missing'];
    return ev.board.choice ? [] : ["the user's choice is not in answers.md: save their answer to the board question word for word"];
  },
  lock: ev => (ev.adr ? [] : ['no ADR for this slug: run dod.mjs adr, adr-check and commit the ADR (and update the ticket) once']),
  tdd: ev => (ev.pr ? (ev.prWhy?.errors ?? []) : ['no pull request yet: open a draft pull request for the branch (next --pr <url>)']),
  verify: ev => (ev.verify?.ok ? [] : ev.verify?.errors?.length ? ev.verify.errors : ['verify.md is missing']),
  retro: ev => (ev.retro ? [] : ['no retro log line for this branch: run the retro skill (retro.mjs log) before merging']),
};

/** The reasons the gate out of `step` is closed; [] when it is open. */
export function gate(step, evidence, measure) {
  const g = GATES[step];
  if (!g) return [`no gate out of ${step}`];
  return g(evidence ?? {}, measure);
}

const nextOf = step => STEPS[STEPS.indexOf(step) + 1];

/** Move to the next step when the current gate is open. */
export function advance(state, evidence) {
  const errors = gate(state.step, evidence, state.measure);
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], state: { ...state, step: nextOf(state.step) } };
}

/** Skip the current step on the user's answer (by id) that gives a reason; never DoD, verify or retro. */
export function skip(state, answers, answerId) {
  const step = state.step;
  if (NEVER_SKIP.includes(step)) return { ok: false, errors: [`${step} is never skipped`] };
  if (!SKIPPABLE.includes(step)) return { ok: false, errors: [`${step} cannot be skipped: only the concept board can, on the user's answer`] };
  const text = answers?.[answerId];
  if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: [`${answerId} not in answers.md: save the user's answer word for word first`] };
  if (text.trim().split(/\s+/).length < REASON_MIN_WORDS) return { ok: false, errors: [`${answerId} gives no reason: the user's answer must say why the step is skipped`] };
  return { ok: true, errors: [], state: { ...state, step: nextOf(step), skipped: { ...state.skipped, [step]: answerId } } };
}

/** The step to resume at from what the repo shows (A18): the furthest gate whose evidence is there. */
export function inferStep(ev) {
  // a chain: a later piece of evidence counts only when every earlier one is there too
  if (!ev.adr) return 'intake';
  if (!ev.pr) return 'tdd';
  if (!ev.verify?.ok) return 'verify';
  if (!ev.retro) return 'retro';
  return 'done';
}
