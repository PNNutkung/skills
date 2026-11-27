// IO for dev-workflow: the run folder (~/.cache/dev-workflow, never in the repo), the repo and gh. The gates themselves are in steps.mjs.
// Importing this file never exits or throws: the hook imports it, and a PreToolUse hook that exits 2 blocks the user's tool call.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adrItems, boardChoice, bookedEnvs, checkBoard, checkVerify, parseAnswers } from './check.mjs';
import { readFlags } from './flags.mjs';
// ticket-writer is a sibling skill (ADR 0012). Installed alone (npx skills add), this skill still runs, without the 4 ticket sections.
let tw = null;
try { tw = await import('../ticket-writer/why.mjs'); } catch { tw = null; }

const HERE = dirname(fileURLToPath(import.meta.url));
export const SIBLING_DOD = join(HERE, '..', 'definition-of-done', 'dod.mjs');
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const STATE_FILE = 'state.json';
const FILE_LINE_RE = /\S+:\d+/;
const ADR_DIRS = ['docs/adr', 'docs/decisions', 'doc/adr', 'adr'];

const readOr = (p, d = '') => { try { return readFileSync(p, 'utf8'); } catch { return d; } };
const real = p => { try { return realpathSync(p); } catch { return resolve(p); } };

/** ~/.cache/dev-workflow, or $XDG_CACHE_HOME/dev-workflow: it outlives /tmp cleanup on the same machine (A18). */
export const cacheBase = (env = process.env) => join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'dev-workflow');

/** The repo root above dir (a .git folder or file), or null. No git process: the hook calls this on every tool call. */
export function repoRoot(dir) {
  let d = real(dir);
  for (;;) {
    if (existsSync(join(d, '.git'))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** The checked-out branch from .git/HEAD (worktrees: the gitdir file), or null when detached. */
export function currentBranch(root) {
  let git = join(root, '.git');
  try {
    if (statSync(git).isFile()) { const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(git, 'utf8')); if (m) git = isAbsolute(m[1].trim()) ? m[1].trim() : resolve(root, m[1].trim()); }
  } catch { return null; }
  const m = /^ref: refs\/heads\/(.+)$/m.exec(readOr(join(git, 'HEAD')));
  return m ? m[1].trim() : null;
}

const repoKey = root => `${basename(root).replace(/[^A-Za-z0-9._-]/g, '_')}-${createHash('sha256').update(real(root)).digest('hex').slice(0, 12)}`;
export const runDir = (env, root, slug) => join(cacheBase(env), repoKey(root), slug);

export function readState(run) {
  try { return JSON.parse(readFileSync(join(run, STATE_FILE), 'utf8')); } catch { return null; }
}
export function writeState(run, state) {
  mkdirSync(run, { recursive: true, mode: 0o700 });
  writeFileSync(join(run, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

/** Every run of this repo: [{ run, state }]. */
export function runsOf(env, root) {
  const dir = join(cacheBase(env), repoKey(root));
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names.map(n => ({ run: join(dir, n), state: readState(join(dir, n)) })).filter(r => r.state);
}

/** Runs open on this repo's current branch (not closed, not done). The hook guards only these (A19). */
export function openRuns(env, root) {
  const branch = currentBranch(root);
  return runsOf(env, root).filter(({ state }) => !state.closed && state.step !== 'done' && state.branch === branch);
}

/** The ADR that definition-of-done wrote for this slug (frontmatter `dod: <slug>`), or null. */
export function findAdr(root, slug) {
  const custom = readOr(join(root, '.adr-dir')).trim();
  for (const d of [...(custom ? [custom] : []), ...ADR_DIRS]) {
    let names = [];
    try { names = readdirSync(join(root, d)); } catch { continue; }
    for (const n of names.filter(x => /^\d{4}-.*\.md$/.test(x)).sort()) {
      const text = readOr(join(root, d, n));
      if (new RegExp(`^dod:\\s*${slug}\\s*$`, 'm').test(text.split(/^---\s*$/m)[1] ?? '')) return { path: join(root, d, n), text };
    }
  }
  return null;
}

export const verifyPath = (root, slug) => join(root, 'docs', 'verify', `${slug}.md`);
export const retroLog = root => join(root, 'docs', 'retro', 'log.md');

/** The DoD gate: dod.mjs check when definition-of-done sits next to this skill, else the JSON itself (items, nothing unconfirmed). */
export function dodEvidence(dodFile, { env = process.env, dodMjs = SIBLING_DOD, cwd } = {}) {
  if (!dodFile) return { ok: false, errors: ['no DoD file: next --dod <path to the DoD JSON>'] };
  if (!existsSync(dodFile)) return { ok: false, errors: [`${dodFile} does not exist`] };
  if (existsSync(dodMjs)) {
    try {
      const out = execFileSync(process.execPath, [dodMjs, 'check', '--dod', dodFile], { env, cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const r = JSON.parse(out.trim().split('\n').pop());
      return r.ok ? { ok: true, errors: [] } : { ok: false, errors: r.errors ?? ['dod.mjs check failed'] };
    } catch (e) {
      const msg = String(e.stderr || e.stdout || e.message).trim().split('\n').pop();
      return { ok: false, errors: [`dod.mjs check: ${msg}`] };
    }
  }
  let dod;
  try { dod = JSON.parse(readFileSync(dodFile, 'utf8')); } catch (e) { return { ok: false, errors: [`cannot read ${dodFile}: ${e.message}`] }; }
  const errors = [];
  if (!Array.isArray(dod.items) || !dod.items.length) errors.push('the DoD has no items');
  if (Array.isArray(dod.unconfirmed) && dod.unconfirmed.length) errors.push(`${dod.unconfirmed.length} unconfirmed item(s)`);
  return { ok: !errors.length, errors };
}

/** A pull request for the branch through gh's REST API (GraphQL is blocked in some sessions), or null. */
export function prFromGh(root, branch, { run = defaultGh } = {}) {
  if (!branch) return null;
  try {
    const out = run(['api', `repos/{owner}/{repo}/pulls?state=all&per_page=1&head={owner}:${branch}`, '--jq', '.[0].html_url // ""'], root);
    return String(out).trim() || null;
  } catch { return null; }
}
const PR_URL_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/;
/** The body of a GitHub pull request through gh's REST API, or null when it cannot be read. */
export function prBodyFromGh(root, prUrl, { run = defaultGh } = {}) {
  const m = PR_URL_RE.exec(String(prUrl ?? ''));
  if (!m) return null;
  try { return String(run(['api', `repos/${m[1]}/${m[2]}/pulls/${m[3]}`, '--jq', '.body // ""'], root)); } catch { return null; }
}

/** The PR body check of ADR 0012 (WorkflowPr): { checked, errors }. body: the text, or null when it could not be read. */
export function prWhyEvidence(on, pr, body) {
  if (!on || !pr) return { checked: false, errors: [] };
  if (body === null || body === undefined) return { checked: true, errors: [`cannot read the body of ${pr}: pass next --pr-body <file> with the body, or check that gh works (WORKFLOW_PR_WHY_CHECK_ENABLED=false turns this check off)`] };
  if (!tw) return { checked: true, errors: ['PR body: cannot check it: the ticket-writer skill is not installed next to dev-workflow (install it, or WORKFLOW_PR_WHY_CHECK_ENABLED=false turns this check off)'] };
  const errors = tw.checkBody(String(body));
  return { checked: true, errors: errors.map(e => `PR body: ${e} (dod.mjs render --pr writes the 4 sections; WORKFLOW_PR_WHY_CHECK_ENABLED=false turns this check off)`) };
}
const defaultGh = (args, cwd) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });

/** Everything the gates read, for one run. */
export function evidence(state, run, root, { env = process.env, dodMjs, gh } = {}) {
  // the DoD run's answers.md (next to the DoD JSON) holds the board choice and skips, so the ADR keeps them; the run's own file may add more
  const answers = { ...(state.dod ? parseAnswers(readOr(join(dirname(resolve(state.dod)), 'answers.md'))) : {}), ...parseAnswers(readOr(join(run, 'answers.md'))) };
  let board = { ok: false, errors: ['board.json is missing: the subagent writes it with the concept board'], choice: null };
  const boardText = readOr(join(run, 'board.json'), null);
  if (boardText !== null) {
    try { const b = JSON.parse(boardText); board = { ...checkBoard(b), choice: boardChoice(b, answers) }; } catch (e) { board = { ok: false, errors: [`board.json: ${e.message}`], choice: null }; }
  }
  const adr = findAdr(root, state.slug);
  const verifyText = readOr(verifyPath(root, state.slug), null);
  const verify = verifyText === null ? { ok: false, errors: [`${verifyPath(root, state.slug)} is missing`], tickable: [] }
    : !adr ? { ok: false, errors: ['no ADR to verify against'], tickable: [] }
      : checkVerify(verifyText, adrItems(adr.text), answers, { booked: readFlags(env).verifyEnv ? bookedEnvs(adr.text) : null });
  const branch = state.branch;
  const pr = state.pr ?? (gh === false ? null : prFromGh(root, branch, gh ? { run: gh } : {}));
  const prOn = readFlags(env).prWhy;
  const prBody = !prOn || !pr ? null : state.prBodyFile ? readOr(state.prBodyFile, null) : gh === false ? null : prBodyFromGh(root, pr, gh ? { run: gh } : {});
  const retro = Boolean(branch) && readOr(retroLog(root)).split('\n').some(l => l.split('|').map(c => c.trim())[2] === branch);
  return {
    facts: FILE_LINE_RE.test(readOr(join(run, 'facts.md'))),
    measure: readOr(join(run, 'measure.md')).trim() !== '',
    dod: dodEvidence(state.dod, { env, dodMjs, cwd: root }),
    board,
    adr: Boolean(adr),
    pr,
    prWhy: prWhyEvidence(prOn, pr, prBody),
    verify,
    retro,
    answers,
  };
}
