// Which Claude Code transcripts belong to a piece of work. A session belongs when its cwd is the repo (or inside it) and its time overlaps
// the work's commits, widened by an hour; --session names them instead. Subagent transcripts live in <session>/subagents/ and follow it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseTranscript } from './transcript.mjs';

const SLACK_MS = 60 * 60 * 1000;
const UNIT_MS = { d: 24 * SLACK_MS, h: SLACK_MS };
const inside = (repo, dir) => dir === repo || dir.startsWith(`${repo}/`);
const overlaps = (m, from, to) => m.start && m.end && m.start <= to && m.end >= from;

/** metas: [{path, sessionId, cwds, start, end, subagent}] -> the ones that belong. */
export function selectSessions(metas, { repo, from, to, ids = [] }) {
  if (ids.length) return metas.filter(m => ids.includes(m.sessionId) || ids.some(id => m.path.endsWith(`/${id}.jsonl`)));
  return metas.filter(m => m.cwds.some(c => inside(repo, c)) && overlaps(m, from, to));
}

/** ISO times of the work's commits -> {from, to} widened by an hour each side. */
export function workWindow(times) {
  const ms = times.map(t => Date.parse(t)).filter(Number.isFinite);
  if (!ms.length) throw new Error('no commit times to place the work in time');
  return { from: new Date(Math.min(...ms) - SLACK_MS).toISOString(), to: new Date(Math.max(...ms) + SLACK_MS).toISOString() };
}

/** --since 7d | 12h | 2026-11-01 -> {from, to: now}. */
export function sinceWindow(since, now = Date.now()) {
  const m = /^(\d+)([dh])$/.exec(String(since));
  const from = m ? now - Number(m[1]) * UNIT_MS[m[2]] : Date.parse(since);
  if (!Number.isFinite(from)) throw new Error(`--since ${since}: use a number of days (7d), hours (12h) or a date (2026-11-01)`);
  return { from: new Date(from).toISOString(), to: new Date(now).toISOString() };
}

export const projectsRoot = (env = process.env) => join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');

const jsonl = dir => { try { return readdirSync(dir).filter(n => n.endsWith('.jsonl')).sort(); } catch { return []; } };
const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Every transcript under the projects folder with its parsed summary (main sessions and their subagents). */
export function listTranscripts(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const add = (path, subagent) => { const t = parseTranscript(readFileSync(path, 'utf8')); out.push({ path, subagent, sessionId: t.sessionId, cwds: t.cwds, start: t.start, end: t.end, summary: t }); };
  for (const project of readdirSync(root).sort()) {
    const dir = join(root, project);
    if (!isDir(dir)) continue;
    for (const f of jsonl(dir)) {
      add(join(dir, f), false);
      const sub = join(dir, f.replace(/\.jsonl$/, ''), 'subagents');
      for (const s of jsonl(sub)) add(join(sub, s), true);
    }
  }
  return out;
}
