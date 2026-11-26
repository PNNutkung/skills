// A [ci]-type env (ADR 0009 A5): the check runs of HEAD through gh's REST API (GraphQL is blocked in cloud sessions). gh is injected for tests.
import { execFileSync } from 'node:child_process';

const GH_TIMEOUT_MS = 30000;
export const defaultGh = (args, cwd) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS });

/** -> { pass, output, why[] } for the check run named `name` on commit `sha`. Never throws. */
export function ciCheck(name, { sha, cwd, gh = defaultGh }) {
  let list;
  try {
    list = JSON.parse(gh(['api', `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`], cwd)).check_runs;
    if (!Array.isArray(list)) throw new Error('no check_runs in the answer');
  } catch (e) {
    const msg = String(e.stderr || e.message).trim().split('\n').pop();
    return { pass: false, output: '', why: [`gh api failed: ${msg}`] };
  }
  const run = list.find(r => r?.name === name);
  if (!run) return { pass: false, output: `checks on ${sha}: ${list.map(r => r?.name).join(', ') || '(none)'}`, why: [`no check run named "${name}" on ${sha}`] };
  const output = ['name', 'status', 'conclusion', 'html_url'].map(k => `${k}: ${run[k] ?? ''}`).join('\n');
  const why = [];
  if (run.status !== 'completed') why.push(`check run is ${run.status}, not completed: run again when it ends`);
  else if (run.conclusion !== 'success') why.push(`conclusion ${run.conclusion}, expected success`);
  return { pass: why.length === 0, output, why };
}
