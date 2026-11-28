// Flags mean what they say, or the run stops: a value that is not valid, or an old flag name still set, throws a FlagError naming the fix.
//   NAME_ENABLED=true|false (any case). Unset or empty keeps the default.
// This skill reads only its own flags; it shares no flag with another skill.
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

/** NAME: a whole number from 0 to 100; dflt when unset. */
export function percent(env, name, dflt) {
  const v = raw(env, name);
  if (!v) return dflt;
  if (!/^\d{1,3}$/.test(v) || Number(v) > 100) throw new FlagError(`${name}=${env[name]} is not valid: use a whole number from 0 to 100`);
  return Number(v);
}

export const FLAG = {
  guard: 'WORKFLOW_GUARD_ENABLED', verifyEnv: 'WORKFLOW_VERIFY_ENV_CHECK_ENABLED', prWhy: 'WORKFLOW_PR_WHY_CHECK_ENABLED',
  mutationCheck: 'WORKFLOW_MUTATION_CHECK_ENABLED', mutationScoreMin: 'WORKFLOW_MUTATION_SCORE_MIN',
};

/** Every dev-workflow flag at once (throws FlagError on a bad value). */
export function readFlags(env = process.env) {
  return {
    guard: enabled(env, FLAG.guard, true), verifyEnv: enabled(env, FLAG.verifyEnv, true), prWhy: enabled(env, FLAG.prWhy, true),
    mutationCheck: enabled(env, FLAG.mutationCheck, true), mutationScoreMin: percent(env, FLAG.mutationScoreMin, 100),
  };
}
