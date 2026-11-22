// Speed policy of paired-agent-tdd (docs/adr/0001-ptdd-speed.md): pure functions, no I/O. In: the resolved speed flags and the state at hand; out: one decision each.
// tdd.mjs reads the flags once at `plan` and writes them into the Workflow args (args.speed) and plan.json (plan.speed), so a resumed run decides with the same values.
// A missing args.speed is every flag off: the v2.0.0 pipeline, byte for byte. workflow.js embeds the functions marked EMBEDDED (graph.mjs --write: a Workflow script cannot import).
import { enabled, oneOf } from './flags.mjs';

export const SPEED_ENV = { pipeline: 'PTDD_PIPELINE_MODE', quickDriverGate: 'PTDD_QUICK_DRIVER_GATE_ENABLED', gateReuse: 'PTDD_GATE_REUSE_ENABLED', courierSkip: 'PTDD_COURIER_SKIP_ENABLED', parallelReview: 'PTDD_PARALLEL_REVIEW_ENABLED' };
export const PIPELINES = ['fast', 'paired'];
export const SPEED_DEFAULT = { pipeline: 'fast', quickDriverGate: true, gateReuse: true, courierSkip: true, parallelReview: true };
/** The environment that turns every speed flag off: the v2.0.0 pipeline (tests pin it to keep testing that pipeline). */
export const SPEED_OFF_ENV = { PTDD_PIPELINE_MODE: 'paired', PTDD_QUICK_DRIVER_GATE_ENABLED: 'false', PTDD_GATE_REUSE_ENABLED: 'false', PTDD_COURIER_SKIP_ENABLED: 'false', PTDD_PARALLEL_REVIEW_ENABLED: 'false' };

export const SPEED_OFF = { pipeline: 'paired', quickDriverGate: false, gateReuse: false, courierSkip: false, parallelReview: false };

// EMBEDDED: the constants and functions listed in EMBED are copied into workflow.js by graph.mjs --write
export const FULL = 'full', QUICK = 'quick';

/** args.speed or plan.speed -> the flags; anything missing or not exactly true (or "fast") is off. */
export function speedOf(s) {
  const o = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  return { pipeline: o.pipeline === 'fast' ? 'fast' : 'paired', quickDriverGate: o.quickDriverGate === true, gateReuse: o.gateReuse === true, courierSkip: o.courierSkip === true, parallelReview: o.parallelReview === true };
}
/** fast: true for a fast run. A group runs fast (one tdd-driver, one navigator over both gates) only from scratch and when it waits for no other group. */
export function groupMode(fast, g, from) {
  return fast && from === 'red' && !((g && g.after) || []).length ? 'fast' : 'paired';
}
/** The gate runs of a driver's own GREEN loop (at most `runs`): the first and the last mutate, a middle one is quick (no mutants) when quickDriverGate is on. */
export function driverGateRuns(sp, runs) {
  const n = Math.max(1, runs | 0);
  return Array.from({ length: n }, (_, i) => (sp.quickDriverGate && i > 0 && i < n - 1 ? QUICK : FULL));
}
/** The navigator's GREEN gate asks the gate cache: reused only when the key matches, and its flake check runs again. */
export function navigatorReuses(sp) {
  return sp.gateReuse === true;
}
/** The final courier is not spawned when every fixer that ran reported its gate ok; `tdd.mjs verify` is then the check. */
export function skipCourier(sp, fixes) {
  if (!sp.courierSkip || !fixes || typeof fixes !== 'object') return false;
  const ran = Object.keys(fixes).filter(k => k !== '_byHand');
  return ran.length > 0 && ran.every(k => !!fixes[k] && fixes[k].gateOk === true);
}
/** The integration tester and the reviewer start together; the reviewer then leaves the integration test file out. */
export function reviewInParallel(sp, integration) {
  return sp.parallelReview === true && integration === true;
}
// /EMBEDDED

export const EMBED = { constants: { FULL, QUICK }, functions: [speedOf, groupMode, driverGateRuns, navigatorReuses, skipCourier, reviewInParallel] };

/** The five flags from the environment; a value that is not valid throws a FlagError naming the fix. */
export function readSpeed(env) {
  return {
    pipeline: oneOf(env, SPEED_ENV.pipeline, PIPELINES, SPEED_DEFAULT.pipeline),
    ...Object.fromEntries(['quickDriverGate', 'gateReuse', 'courierSkip', 'parallelReview'].map(k => [k, enabled(env, SPEED_ENV[k], SPEED_DEFAULT[k])])),
  };
}
/** What `plan` writes into the args and plan.json: nothing when every flag is off, so those files stay what v2.0.0 wrote. */
export function speedForArgs(sp) {
  return Object.keys(SPEED_OFF).every(k => sp[k] === SPEED_OFF[k]) ? undefined : sp;
}
/** plan.mode "fast" or "paired" overrides the flag; unset follows it; any other value is the paired pipeline, as v2.0.0 read it. */
export function pipelineOf(flag, planMode) {
  if (planMode === undefined || planMode === null || planMode === '') return flag;
  return planMode === 'fast' ? 'fast' : 'paired';
}
/** `tdd.mjs verify` takes final.json from the gate cache when its key matches the tree now (gatecache.mjs decides the match), instead of running final again. */
export function verifyReuses(sp) {
  return sp.gateReuse === true;
}
/** A full GREEN run stores its result for the navigator when reuse is on or asked; a quick run never does (it ran no mutants). */
export function mayStore(sp, asked, quick) {
  return !quick && (sp.gateReuse === true || asked === true);
}
