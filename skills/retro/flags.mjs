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

export const FLAG = {
  ratchetHook: 'RETRO_RATCHET_PRECOMMIT_HOOK_ENABLED',
  transcripts: 'RETRO_TRANSCRIPTS_ENABLED',
  autoCollect: 'RETRO_AUTO_COLLECT_ENABLED',
  steeringMax: 'RETRO_STEERING_BYTES_MAX',
  unenforcedRule: 'RETRO_UNENFORCED_RULE_CHECK_ENABLED',
};
export const STEERING_BYTES_DEFAULT = 8000;

/** Every retro flag at once (throws FlagError on a bad value). steeringMax: null means unlimited. */
export function readFlags(env = process.env) {
  const steeringSet = String(env?.[FLAG.steeringMax] ?? '').trim() !== '';
  const steering = positiveInt(env, FLAG.steeringMax);
  return {
    ratchetHook: enabled(env, FLAG.ratchetHook, true),
    transcripts: enabled(env, FLAG.transcripts, true),
    autoCollect: enabled(env, FLAG.autoCollect, true),
    unenforcedRule: enabled(env, FLAG.unenforcedRule, true),
    steeringMax: steeringSet ? steering : STEERING_BYTES_DEFAULT,
  };
}
