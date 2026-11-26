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
  if (!run) {
    const why = [`no check run named "${name}" on ${sha}`, ...conflicts(sha, cwd, gh)];
    return { pass: false, output: `checks on ${sha}: ${list.map(r => r?.name).join(', ') || '(none)'}`, why };
  }
  const output = ['name', 'status', 'conclusion', 'html_url'].map(k => `${k}: ${run[k] ?? ''}`).join('\n');
  const why = [];
  if (run.status !== 'completed') why.push(`check run is ${run.status}, not completed: run again when it ends`);
  else if (run.conclusion !== 'success') why.push(`conclusion ${run.conclusion}, expected success`);
  return { pass: why.length === 0, output, why };
}

const ghJson = (gh, path, cwd) => { try { return JSON.parse(gh(['api', path], cwd)); } catch { return null; } };
/** A check that is not there may mean CI never started: GitHub runs no pull_request workflow on a PR with a merge conflict. Never throws. */
function conflicts(sha, cwd, gh) {
  const prs = ghJson(gh, `repos/{owner}/{repo}/commits/${sha}/pulls`, cwd);
  if (!Array.isArray(prs)) return [];
  return prs.filter(p => p?.state === 'open' && Number.isInteger(p.number))
    .filter(p => ghJson(gh, `repos/{owner}/{repo}/pulls/${p.number}`, cwd)?.mergeable_state === 'dirty')
    .map(p => `PR #${p.number} has a merge conflict with its base: CI does not run until it is fixed`);
}
