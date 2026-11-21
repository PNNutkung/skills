// File fence for paired-agent-tdd (opt-in: PTDD_GUARD=1 when `tdd.mjs plan` runs). Read by hooks/ptdd-guard.mjs.
// Every driver and fixer prompt names the only files it may edit; without this, the `final` gate only reports a stray file after the fact.
// With the fence on, a SUBAGENT (hook input has agent_id) may Edit/Write inside the run's repo only:
//   - the files of the group it works on. An agent's group is the group owning the first fenced file it writes (one owner per file),
//     recorded in RUN/fence-agents.jsonl; after that, files of another group are denied,
//   - the integration test file, for any agent,
//   - nothing else in the repo. Writes outside the repo (scratch, the run folder) are not fenced.
// Bash writes into the repo by a subagent through `sed -i`, `perl -i`, a redirect or `tee` are denied (rules/tool-discipline.md: the file tools edit files).
// The lead session (no agent_id) is never fenced. It catches agent mistakes, not a determined agent; the final gate still lists stray files.
// Marker: <markerDir>/.ptdd-active names the run (0600, ours, not a symlink, < 12 h old). `tdd.mjs verify` removes it; so does a new plan.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

export const FENCE_ENV = 'PTDD_GUARD';
export const MARKER_NAME = '.ptdd-active';
export const STALE_MS = 12 * 3600e3;
const MODE_CLOSED = 0o022;

const mine = st => typeof process.getuid !== 'function' || st.uid === process.getuid();
const trusted = st => st && !st.isSymbolicLink() && mine(st) && (st.mode & MODE_CLOSED) === 0;
const lstat = p => { try { return lstatSync(p); } catch { return null; } };
const isInside = (child, parent) => child === parent || child.startsWith(parent + sep);

/** realpath of a path that may not exist yet: the nearest existing ancestor, resolved, plus the missing tail. */
export function realLoose(p) {
  let dir = resolve(p), tail = '';
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return resolve(p);
    tail = tail ? join(basename(dir), tail) : basename(dir);
    dir = up;
  }
  const real = realpathSync(dir);
  return tail ? join(real, tail) : real;
}

/** Write RUN/fence.json and the marker. plan = the full plan (repo real path, groups, integration?). */
export function writeFence(run, plan, markerDir) {
  const groups = Object.fromEntries(plan.groups.map(g => [g.id, [...g.tests, ...g.src]]));
  const fence = { repo: plan.repo, run, groups, shared: plan.integration?.file ? [plan.integration.file] : [] };
  writeFileSync(join(run, 'fence.json'), `${JSON.stringify(fence)}\n`, { mode: 0o600 });
  mkdirSync(markerDir, { recursive: true, mode: 0o700 });
  const marker = join(markerDir, MARKER_NAME);
  rmSync(marker, { force: true }); // a planted symlink is removed, never written through
  writeFileSync(marker, `${run}\n`, { mode: 0o600, flag: 'wx' });
}

/** Remove the marker if it names this run. */
export function clearFence(run, markerDir) {
  const marker = join(markerDir, MARKER_NAME);
  try { if (readFileSync(marker, 'utf8').split('\n')[0].trim() === run) rmSync(marker, { force: true }); } catch { /* nothing to clear */ }
}

/** The active fence, or null: marker and fence.json must be ours, closed to others, not symlinks, and the marker fresh. */
export function readFence(markerDir, now = Date.now()) {
  const marker = join(markerDir, MARKER_NAME), st = lstat(marker);
  if (!trusted(st) || !st.isFile() || now - st.mtimeMs > STALE_MS || !trusted(lstat(markerDir))) return null;
  const run = readFileSync(marker, 'utf8').split('\n')[0].trim();
  const file = join(run, 'fence.json');
  if (!isAbsolute(run) || !trusted(lstat(run)) || !trusted(lstat(file))) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The group an agent was pinned to, or undefined. */
function pinnedGroup(run, agent) {
  try {
    for (const line of readFileSync(join(run, 'fence-agents.jsonl'), 'utf8').split('\n')) {
      if (!line) continue;
      const row = JSON.parse(line);
      if (row.agent === agent) return row.group;
    }
  } catch { /* no pins yet */ }
  return undefined;
}
const pin = (run, agent, group) => appendFileSync(join(run, 'fence-agents.jsonl'), `${JSON.stringify({ agent, group })}\n`, { mode: 0o600 });

const REDIRECT_RE = /(?:^|[\s\d])(>>?)\s*("[^"]*"|'[^']*'|[^\s;|&<>()]+)/g;
const IN_PLACE_RE = /(?:^|[\s;&|(])(?:sed|perl)\s+(?:[^;&|]*\s)?-[A-Za-z]*i/;
const unquote = t => t.replace(/^(["'])(.*)\1$/s, '$2');

/** Repo paths a Bash command writes through a redirect or tee (best effort, text only). */
function bashTargets(command, cwd) {
  // a quoted span is data (`node -e 'x > 2'`), except a quoted target right after > (`> "src/a.py"`): blank the rest, same length
  const plain = command.replace(/\d*>&\d*-?/g, ' ').replace(/(>>?\s*)?("[^"]*"|'[^']*')/g, (m, redirect) => (redirect ? m : ' '.repeat(m.length)));
  const targets = [...plain.matchAll(REDIRECT_RE)].map(m => unquote(m[2]));
  for (const seg of command.split(/&&|\|\||[;|&\n]/)) {
    const words = (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
    if (basename(words[0] ?? '') === 'tee') targets.push(...words.slice(1).filter(w => !w.startsWith('-')));
  }
  return targets.filter(t => !t.startsWith('/dev/')).map(t => realLoose(isAbsolute(t) ? t : join(cwd, t)));
}

/** A deny reason or null. input = the hook input; fence = readFence(). */
export function fenceVerdict(input, fence) {
  const { agent_id: agent, tool_name: tool, tool_input: ti = {}, cwd } = input ?? {};
  if (!agent || !fence) return null;
  const repo = realpathSync(fence.repo);
  const deny = why => `paired-agent-tdd fence: ${why}. Edit only the files your prompt names; report anything else as a finding instead.`;
  if (tool === 'Bash') {
    const command = String(ti.command ?? ''), here = cwd || repo;
    const inRepo = bashTargets(command, here).filter(p => isInside(p, repo));
    if (inRepo.length) return deny(`Bash would write ${inRepo.map(p => p.slice(repo.length + 1)).join(', ')} in the repo; use the Edit or Write tool`);
    if (IN_PLACE_RE.test(command) && isInside(realLoose(here), repo)) return deny('`sed -i` / `perl -i` edits files in place; use the Edit tool');
    return null;
  }
  if (tool !== 'Edit' && tool !== 'Write' && tool !== 'MultiEdit') return null;
  const abs = realLoose(String(ti.file_path ?? ''));
  if (!isInside(abs, repo) || isInside(abs, fence.run)) return null;
  const rel = abs.slice(repo.length + 1);
  if ((fence.shared ?? []).includes(rel)) return null;
  const owner = Object.keys(fence.groups).find(id => fence.groups[id].includes(rel));
  if (!owner) return deny(`${rel} belongs to no group of this plan`);
  const pinned = pinnedGroup(fence.run, agent);
  if (pinned === undefined) { pin(fence.run, agent, owner); return null; }
  return pinned === owner ? null : deny(`${rel} belongs to group ${owner}, and this agent works on group ${pinned}`);
}
