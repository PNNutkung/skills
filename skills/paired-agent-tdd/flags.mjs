// Flags mean what they say, or the run stops: a value that is not valid, or an old flag name still set, throws a FlagError naming the fix.
//   NAME_ENABLED=true|false (any case)   NAME_MODE=<one of the listed modes>   NAME_MAX=<whole number above 0>|unlimited
// Unset or empty keeps the default. This skill reads only its own flags; it shares no flag with another skill.
export class FlagError extends Error {}

const raw = (env, name) => String(env?.[name] ?? '').trim();
function oldName(env, renamedFrom, name, use) {
  if (renamedFrom && raw(env, renamedFrom)) throw new FlagError(`${renamedFrom} was renamed: use ${use}, and unset ${renamedFrom}`);
}

/** NAME_ENABLED: true or false; dflt when unset. */
export function enabled(env, name, dflt, { renamedFrom } = {}) {
  oldName(env, renamedFrom, name, `${name}=true or ${name}=false`);
  const v = raw(env, name).toLowerCase();
  if (!v) return dflt;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new FlagError(`${name}=${env[name]} is not valid: use true or false`);
}

/** NAME_MAX: a whole number above 0; null (no limit) for unlimited or when unset. */
export function positiveInt(env, name, { renamedFrom } = {}) {
  oldName(env, renamedFrom, name, `${name}=<number> or ${name}=unlimited`);
  const v = raw(env, name);
  if (!v || v.toLowerCase() === 'unlimited') return null;
  if (/^\d+$/.test(v) && Number(v) > 0) return Number(v);
  throw new FlagError(`${name}=${env[name]} is not valid: use a whole number above 0, or unlimited`);
}

/** NAME_MODE: one of modes (any case); dflt when unset. */
export function oneOf(env, name, modes, dflt, { renamedFrom } = {}) {
  oldName(env, renamedFrom, name, `${name}=${modes.join('|')}`);
  const v = raw(env, name).toLowerCase();
  if (!v) return dflt;
  if (modes.includes(v)) return v;
  throw new FlagError(`${name}=${env[name]} is not valid: use one of ${modes.join(', ')}`);
}

// ADR 0008 A4: the built-in direct runner (direct-run.mjs) runs in tdd.mjs's own process and in the probes it starts; false starts a node process per command, as before
export const INPROCESS_RUNNER_FLAG = 'PTDD_INPROCESS_RUNNER_ENABLED';
export const inprocessRunner = env => enabled(env, INPROCESS_RUNNER_FLAG, true);

/** NAME_MIN: a whole number from 0 to 100; dflt when unset. */
export function percent(env, name, dflt) {
  const v = raw(env, name);
  if (!v) return dflt;
  if (/^\d+$/.test(v) && Number(v) <= 100) return Number(v);
  throw new FlagError(`${name}=${env[name]} is not valid: use a whole number from 0 to 100`);
}

// ADR 0011: the mutation gate. SCORE_MIN: the score green and final need (survivors fail whatever it says); MAX: the final gate's mutant count (null = unlimited);
// TEST_WRITER: fast mode splits the one driver into a test writer and a code driver
export const MUTATION_FLAGS = { scoreMin: 'PTDD_MUTATION_SCORE_MIN', max: 'PTDD_MUTATION_MAX', testWriter: 'PTDD_TEST_WRITER_ENABLED' };
export const mutationFlags = env => ({ scoreMin: percent(env, MUTATION_FLAGS.scoreMin, 100), max: positiveInt(env, MUTATION_FLAGS.max), testWriter: enabled(env, MUTATION_FLAGS.testWriter, true) });
