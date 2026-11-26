// Flags mean what they say, or the run stops: an invalid value, or a removed flag still set, throws a FlagError naming the fix.
//   VERIFY_GUARD_ENABLED=true|false (any case, default true)   VERIFY_RUN_TIMEOUT_MAX=<seconds above 0>|unlimited (default unlimited)
// Unset or empty keeps the default. This skill reads only its own flags.
export class FlagError extends Error {}

export const FLAG = { guard: 'VERIFY_GUARD_ENABLED', timeout: 'VERIFY_RUN_TIMEOUT_MAX' };
export const REMOVED = { VERIFY_FLAG_RUNS_ENABLED: 'flag runs always happen (ADR 0009 A15)' };
const UNLIMITED = 'unlimited';

const raw = (env, name) => String(env?.[name] ?? '').trim();

/** Throws when a removed flag is still set. The CLI and the hook call it first. */
export function checkRemoved(env = process.env) {
  for (const [name, why] of Object.entries(REMOVED)) {
    if (raw(env, name)) throw new FlagError(`${name} was removed: ${why}; unset ${name}`);
  }
}

/** VERIFY_GUARD_ENABLED: true unless set to false. */
export function guardEnabled(env = process.env) {
  const v = raw(env, FLAG.guard).toLowerCase();
  if (!v || v === 'true') return true;
  if (v === 'false') return false;
  throw new FlagError(`${FLAG.guard}=${env[FLAG.guard]} is not valid: use true or false`);
}

/** VERIFY_RUN_TIMEOUT_MAX: seconds per planned command, or Infinity. */
export function timeoutMax(env = process.env) {
  const v = raw(env, FLAG.timeout);
  if (!v || v.toLowerCase() === UNLIMITED) return Infinity;
  if (/^\d+$/.test(v) && Number(v) > 0) return Number(v);
  throw new FlagError(`${FLAG.timeout}=${env[FLAG.timeout]} is not valid: use a whole number of seconds above 0, or ${UNLIMITED}`);
}
