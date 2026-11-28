// Shared plumbing for the real-execution probes (testprobe.mjs, mutate.mjs): the options every probe takes and the trusted in-process runner. The generic git, tree
// and process helpers (read-only git access to the change, a symlink-safe scratch copy of a tree, and THE way a command runs here: through the sandbox runner,
// exit 86 = no sandbox, 124 = timeout) live in skills/mutation/proc.mjs (ADR 0011 A18) and are re-exported here unchanged, so the probes import them as before.
// The mutation skill is found beside this one, or at MUTATION_DIR (like ZT_DIR: a copy of this folder elsewhere needs it).
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { positiveInt } from './flags.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MUTATION_SKILL_DIR = resolve(process.env.MUTATION_DIR || join(HERE, '..', 'mutation'));
const proc = await import(pathToFileURL(join(MUTATION_SKILL_DIR, 'proc.mjs')).href);
export const { NO_SANDBOX, TIMEOUT, TEST, DOC, isSource, shq, rel, editableRoots, gitOut, changes, extract, ensureDir, clear, restore, runIn, limiter, HEAD_RUN_SCHEMA, HEAD_RUN_KIND,
  HEAD_RUN_REFUSED, runIdentity, headRunDoc, writeHeadRun, baselineFrom, readBaseline, pool, backendOf } = proc;

export const intOption = (values, name, min) => {
  const n = Number(values[name]);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} must be an integer >= ${min}`);
  return n;
};

// The options every probe takes, validated. `extra` adds the probe's own parseArgs definitions; their raw values come back in `values`. `optional` names common options this probe may omit (e.g. base).
// `args` and `cwd` (ADR 0003) let an in-process caller pass its own argv and working directory; left out, they are process.argv and process.cwd() as before
export function parseProbeArgs(extra = {}, { optional = [], args, cwd } = {}) {
  const str = { type: 'string' }, many = { type: 'string', multiple: true, default: [] }, abs = p => (cwd === undefined ? resolve(p) : resolve(cwd, p));
  const { values: v } = parseArgs({ ...(args === undefined ? {} : { args }), options: { repo: str, base: str, head: str, scratch: str, cmd: str, tests: str, runner: str, link: many, ro: many, env: many,
    jobs: { ...str, default: '4' }, timeout: { ...str, default: '120' }, 'runner-inprocess': { type: 'boolean', default: false }, ...extra } });
  for (const k of ['repo', 'base', 'head', 'scratch', 'cmd']) if (!v[k] && !optional.includes(k)) throw new Error(`--${k} is required`);
  if (!v.cmd.includes('{file}')) throw new Error('--cmd must contain {file}');
  for (const e of v.env) if (!/^[A-Za-z_]\w*=/.test(e)) throw new Error(`--env wants K=V, got ${e}`);
  const runner = abs(v.runner ?? join(dirname(fileURLToPath(import.meta.url)), 'sandbox-run.mjs'));
  if (!existsSync(runner)) throw new Error(`runner not found: ${runner}`);
  if (v['runner-inprocess'] && !isBuiltInDirectRunner(runner)) throw new Error(`--runner-inprocess needs --runner to be the built-in ${DIRECT_RUNNER} of paired-agent-tdd next to this skill (${builtInDirectRunner() ?? `none at ${siblingRunner()}`}), not ${runner}: pass that runner or drop --runner-inprocess`);
  return { values: v, repo: abs(v.repo), base: v.base, head: v.head, scratch: abs(v.scratch), cmd: v.cmd, runner, inprocess: v['runner-inprocess'], env: v.env, link: v.link.map(rel),
    extraRo: v.ro.map(p => abs(p)), tests: v.tests?.split(',').filter(Boolean).map(rel), jobs: intOption(v, 'jobs', 1), timeout: intOption(v, 'timeout', 1) };
}

// --runner-inprocess: the probe imports runDirect() of the --runner file (paired-agent-tdd's direct-run.mjs) and passes it to runIn as o.inproc: no node start per command
// Trust: only the paired-agent-tdd skill installed beside this one is imported into the probe, compared by real path (a file merely named direct-run.mjs is not)
const DIRECT_RUNNER = 'direct-run.mjs';
const siblingRunner = () => join(dirname(fileURLToPath(import.meta.url)), '..', 'paired-agent-tdd', DIRECT_RUNNER);
export function builtInDirectRunner() { try { return realpathSync(siblingRunner()); } catch { return null; } }
const isBuiltInDirectRunner = runner => { try { return realpathSync(runner) === builtInDirectRunner(); } catch { return false; } };
export async function inprocRunner(runner) {
  const { runDirect } = await import(pathToFileURL(runner).href);
  if (typeof runDirect !== 'function') throw new Error(`--runner-inprocess: ${runner} exports no runDirect()`);
  return runDirect;
}

export const TEST_PROCESS_MAX_FLAG = 'ZT_TEST_PROCESS_MAX';
export const testProcessSlots = env => limiter(positiveInt(env, TEST_PROCESS_MAX_FLAG));
