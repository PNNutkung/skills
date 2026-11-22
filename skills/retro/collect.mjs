// Gather the facts of one piece of work into a run folder (code only, no model): git range, Claude Code sessions, PR comments and CI (gh, when
// installed), guardrail, steering file sizes, where standards go, which ratchet rules apply. The agent then reads collect.json, not the raw
// transcripts; a low-tier subagent reads a transcript only when a finding needs the detail.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { guardrail, standardsFile, steering } from './facts.mjs';
import { checksFromRest, prFromRest } from './github.mjs';
import { applicablePatterns } from './patterns.mjs';
import { readBaseline, repoFiles } from './ratchet-io.mjs';
import { listTranscripts, projectsRoot, selectSessions, sinceWindow, workWindow } from './sessions.mjs';
import { parseTranscript } from './transcript.mjs';

const CI_FILES = ['.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'Jenkinsfile', 'bitbucket-pipelines.yml'];
const PRE_COMMIT = ['.husky/pre-commit', 'lefthook.yml', '.lefthook.yml', '.pre-commit-config.yaml'];
const STEERING = ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md'];
const MAX_BUFFER = 1 << 28;

const git = (repo, args) => execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER });
const tryGit = (repo, args) => { try { return git(repo, args); } catch { return null; } };
const read = p => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const size = p => { try { return statSync(p).size; } catch { return null; } };

/** A fresh run folder under the per-user temp base. */
export function runDir(slug) {
  const base = join(tmpdir(), `retro-${userInfo().uid}`);
  const dir = join(base, `${slug.replace(/[^\w.-]+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** The default base of the current branch: the merge-base with origin's default branch, main or master. */
function defaultBase(repo) {
  for (const ref of ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master']) {
    const mb = (tryGit(repo, ['merge-base', 'HEAD', ref]) ?? '').trim();
    if (mb && mb !== (tryGit(repo, ['rev-parse', 'HEAD']) ?? '').trim()) return mb;
  }
  return null;
}

function commits(repo, range) {
  return (tryGit(repo, ['log', '--format=%H%x1f%cI%x1f%s', range]) ?? '').split('\n').filter(Boolean).map(l => { const [sha, time, subject] = l.split('\x1f'); return { sha, time, subject }; });
}

function gh(args, repo) {
  const r = spawnSync('gh', args, { cwd: repo, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  return r.status === 0 ? r.stdout : null;
}
const ghJson = (args, repo) => { const out = gh(args, repo); try { return out === null ? null : JSON.parse(out); } catch { return null; } };
const restList = (repo, path) => ghJson(['api', `repos/{owner}/{repo}/${path}?per_page=100`], repo);

/** gh pr view uses GraphQL; where only REST is open, read the same facts with gh api. -> the gh pr view shape, or null */
function readPr(n, repo) {
  const viaGraphql = ghJson(['pr', 'view', n, '--json', 'number,title,url,mergedAt,headRefName,baseRefName,commits,comments,reviews'], repo);
  if (viaGraphql) return viaGraphql;
  const pr = ghJson(['api', `repos/{owner}/{repo}/pulls/${n}`], repo);
  if (!pr) return null;
  const pulls = `pulls/${n}`;
  return { ...prFromRest({ pr, commits: restList(repo, `${pulls}/commits`), comments: restList(repo, `issues/${n}/comments`),
    reviewComments: restList(repo, `${pulls}/comments`), reviews: restList(repo, `${pulls}/reviews`) }), headSha: pr.head?.sha };
}

function readChecks(pr, repo) {
  const viaGraphql = gh(['pr', 'checks', String(pr.number)], repo);
  if (viaGraphql !== null) return viaGraphql;
  const sha = pr.headSha ?? pr.commits?.at(-1)?.oid;
  return sha ? checksFromRest(ghJson(['api', `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`], repo)) || null : null;
}

export function guardrailFacts(repo) {
  const ciFiles = {};
  const wf = join(repo, '.github', 'workflows');
  if (existsSync(wf)) for (const n of readdirSync(wf).filter(n => /\.ya?ml$/.test(n)).sort()) ciFiles[`.github/workflows/${n}`] = read(join(wf, n)) ?? '';
  for (const f of CI_FILES) { const t = read(join(repo, f)); if (t !== null) ciFiles[f] = t; }
  const hooksDir = resolve(repo, (tryGit(repo, ['rev-parse', '--git-path', 'hooks']) ?? '.git/hooks').trim());
  const preCommit = [...(existsSync(join(hooksDir, 'pre-commit')) ? ['.git/hooks/pre-commit'] : []), ...PRE_COMMIT.filter(f => existsSync(join(repo, f)))];
  return guardrail({ ciFiles, preCommit });
}

export function steeringFacts(repo, max, env = process.env) {
  const files = STEERING.map(f => ({ file: f, bytes: size(join(repo, f)) }));
  const globalDir = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  files.push({ file: '~/.claude/CLAUDE.md', bytes: size(join(globalDir, 'CLAUDE.md')) });
  return steering(files.filter(f => f.bytes !== null), max);
}

const sessionView = m => {
  const t = m.summary;
  return { path: m.path, sessionId: m.sessionId, subagent: m.subagent, start: m.start, end: m.end, tokens: t.tokens, toolCalls: t.toolCalls,
    reads: t.reads, failedCommands: t.failedCommands, bigResults: t.bigResults, userMessages: t.userMessages, redacted: t.redacted };
};
const sumTokens = list => list.reduce((s, m) => s + m.tokens.input + m.tokens.output + m.tokens.cacheRead + m.tokens.cacheCreate, 0);

/**
 * opts: { repo, base?, head?, pr?, since?, sessions?: [id], lang, flags, env, now? }
 * -> { run, collect } (collect.json is written into run; pr.json and ci.log too when gh can read them)
 */
export function collect(opts) {
  const { repo, flags, env = process.env } = opts;
  const notes = [];
  const head = opts.head ?? 'HEAD';
  const startRef = (tryGit(repo, ['rev-parse', 'HEAD']) ?? '').trim() || null;
  let work, list = [], window, pr = null;
  if (opts.pr) {
    pr = readPr(String(opts.pr), repo);
    if (!pr) notes.push(`gh could not read PR ${opts.pr}; PR comments and CI were not read`);
  }
  if (opts.since) {
    window = sinceWindow(opts.since, opts.now);
    list = commits(repo, `--since=${window.from}`);
    work = { label: `since ${opts.since}`, since: opts.since };
  } else {
    const base = opts.base ?? defaultBase(repo);
    list = pr ? pr.commits.map(c => ({ sha: c.oid, time: c.committedDate, subject: c.messageHeadline })) : commits(repo, base ? `${base}..${head}` : `-1 ${head}`);
    if (!list.length) list = commits(repo, `-1 ${head}`);
    window = workWindow([...list.map(c => c.time), ...(pr?.mergedAt ? [pr.mergedAt] : [])]);
    work = { label: pr ? `PR #${pr.number}` : (tryGit(repo, ['rev-parse', '--abbrev-ref', head]) ?? head).trim(), base, head, pr: pr?.number ?? null };
  }
  const run = runDir(work.label);
  if (pr) {
    writeFileSync(join(run, 'pr.json'), JSON.stringify({ title: pr.title, url: pr.url, comments: pr.comments, reviews: pr.reviews }, null, 1));
    const checks = readChecks(pr, repo);
    if (checks !== null) writeFileSync(join(run, 'ci.log'), checks);
  }
  let sessions = [];
  if (!flags.transcripts) notes.push('RETRO_TRANSCRIPTS_ENABLED=false: transcripts were not read');
  else {
    const metas = listTranscripts(projectsRoot(env));
    sessions = selectSessions(metas, { repo, from: window.from, to: window.to, ids: opts.sessions ?? [] }).map(sessionView);
    if (!sessions.length) notes.push('no Claude Code session matched this work (cwd and time); pass --session <id> to name one');
  }
  const files = repoFiles(repo);
  const { baseline, exists } = readBaseline(repo);
  const result = {
    repo, startRef, lang: opts.lang ?? 'en', work, window, flags,
    git: { commits: list },
    sessions,
    totals: { sessions: sessions.filter(s => !s.subagent).length, tokens: sumTokens(sessions), subagentTokens: sumTokens(sessions.filter(s => s.subagent)) },
    guardrail: guardrailFacts(repo),
    steering: steeringFacts(repo, flags.steeringMax, env),
    standards: standardsFile(files),
    ratchet: { exists, rules: Object.keys(baseline?.rules ?? {}), applicable: applicablePatterns(files) },
    notes,
  };
  writeFileSync(join(run, 'collect.json'), `${JSON.stringify(result, null, 1)}\n`);
  return { run, collect: result };
}

/** The hook's version: one transcript, no git range, no gh. -> { run, summary } */
export function autoCollect({ transcriptPath, cwd, sessionId, flags }) {
  const run = runDir(`auto-${sessionId ?? 'session'}`);
  const t = flags.transcripts && transcriptPath && existsSync(transcriptPath) ? parseTranscript(readFileSync(transcriptPath, 'utf8')) : null;
  const summary = { cwd, sessionId, transcript: t ? transcriptPath : null, tokens: t?.tokens ?? null, toolCalls: t?.toolCalls ?? null,
    reads: t?.reads ?? [], failedCommands: t?.failedCommands ?? [], at: new Date().toISOString(), notes: t ? [] : ['transcript not read'] };
  writeFileSync(join(run, 'collect.json'), `${JSON.stringify(summary, null, 1)}\n`);
  return { run, summary };
}
