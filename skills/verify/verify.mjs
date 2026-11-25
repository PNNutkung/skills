#!/usr/bin/env node
// verify CLI (ADR 0008): the agent writes the plan; code checks it, runs it and writes the evidence. Prints one JSON line.
//   open --slug S [--repo DIR] [--dod ADR.md]   start a run: items, booked envs and new flags from the ADR; writes the session marker
//   claims --base REF                           no ADR: candidate flags, CLI options and config keys added on the branch
//   plan                                        check <run>/plan.json; print it with the preset expects and needsAsk
//   run [--only ID,...]                         run the plan and write docs/verify/<slug>.md sections from the real runs
//   record --id ID --from HOW --exit N [--file F]   a remote entry's output (stdin or --file), judged like a local run
//   status                                      each item's written result and whether its section is intact
//   close                                       end the run (deletes the session marker)
// Exit 0 ok, 1 refused or an item failed, 2 usage or flag error. Node 22+, no dependencies.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import { join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adrItems, adrNumber, bookedEnvs, flagNames, newFlags, parseAnswers } from './adr.mjs';
import { ciCheck } from './ci.mjs';
import { candidatesFromDiff, claimItems } from './claims.mjs';
import { describeExpect, flagErrorShown, judge } from './expect.mjs';
import { FlagError, checkRemoved, guardEnabled, timeoutMax } from './flags.mjs';
import { FILES, SLUG_RE, findAdr, git, readJson, readOr, removeFile, repoRoot, verifyPath, writePrivateJson, writeText } from './io.mjs';
import { duplicateMarked, markedSections, splitSections } from './marker.mjs';
import { runDir, sessionMarker } from './paths.mjs';
import { KIND, checkPlan, flipped } from './plan.mjs';
import { CAP, capOutput, fileHeader, mergeSections, renderSection } from './section.mjs';
import { runCommand } from './runner.mjs';
import { changedSince, snapshot } from './snapshot.mjs';

class Usage extends Error {}
const COMMANDS = ['open', 'claims', 'plan', 'run', 'record', 'status', 'close'];
const VALUE_OPTS = new Set(['--slug', '--repo', '--dod', '--base', '--only', '--id', '--from', '--exit', '--file']);
const INVALID_FLAG_VALUE = 'maybe';
const HOW = { run: 'local shell', ci: 'gh check runs', accept: 'accepted' };
const RESULT = { pass: 'pass', fail: 'fail' };

function parse(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS.includes(cmd)) throw new Usage(`usage: verify.mjs ${COMMANDS.join('|')} [options]`);
  const v = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!VALUE_OPTS.has(a) || rest[i + 1] === undefined) throw new Usage(`unknown or incomplete option ${a}`);
    v[a.slice(2)] = rest[++i];
  }
  return { cmd, v };
}

// A started process sees its cwd as a real path (macOS /var -> /private/var, rules/paths.md); in-process callers get the same.
const realCwd = p => { try { return realpathSync(p); } catch { return p; } };

/** The CLI as a function: Promise<{ code, out }>. deps: { env, cwd, gh, stdin, home }. */
export async function main(argv, { env = process.env, cwd = process.cwd(), gh, stdin, home = homedir() } = {}) {
  try {
    cwd = realCwd(cwd);
    checkRemoved(env);
    guardEnabled(env);
    const timeoutSec = timeoutMax(env);
    const { cmd, v } = parse(argv);
    const deps = { env, cwd, gh, stdin, home, timeoutSec };
    if (cmd === 'open') return open(v, deps);
    if (cmd === 'claims') return claims(v, deps);
    const ctx = locate(v, deps);
    if (cmd === 'close') {
      if (ctx.marker) removeFile(ctx.marker);
      const errors = productErrors(ctx);
      return { code: errors.length ? 1 : 0, out: { ok: !errors.length, closed: ctx.run, errors } };
    }
    if (cmd === 'status') return status(ctx);
    if (cmd === 'plan') return plan(ctx);
    if (cmd === 'run') return await run(v, ctx, deps);
    return record(v, ctx, deps);
  } catch (e) {
    if (e instanceof Usage || e instanceof FlagError) return { code: 2, out: { ok: false, errors: [e.message] } };
    throw e;
  }
}

function open(v, { env, cwd, home }) {
  const session = env.CLAUDE_CODE_SESSION_ID;
  const marker = sessionMarker(session, env, home);
  if (!marker) throw new Usage('no session id: CLAUDE_CODE_SESSION_ID is not set (the guard keys the run to the session)');
  if (!v.slug || !SLUG_RE.test(v.slug)) throw new Usage('open needs --slug S (lowercase letters, digits and -)');
  const repo = repoRoot(resolve(cwd, v.repo ?? '.'));
  if (!repo) throw new Usage('not inside a git repository');
  let adr = null;
  if (v.dod) {
    const p = resolve(cwd, v.dod);
    if (!existsSync(p)) throw new Usage(`--dod ${v.dod} does not exist`);
    adr = { path: p, text: readOr(p) };
  } else adr = findAdr(repo, v.slug);
  const run = runDir(repo, v.slug, env, home);
  const old = readJson(marker);
  if (old && old.run !== run) return { code: 1, out: { ok: false, errors: [`a verify run is open for ${old.slug} in this session: close it first (node verify.mjs close)`] } };
  const verifyFile = verifyPath(repo, v.slug);
  // a reopen of the open run keeps the first snapshot, so reopening never hides a change made since
  const kept = old ? readJson(join(run, FILES.state))?.snapshot : null;
  writePrivateJson(join(run, FILES.state), { slug: v.slug, repo, adr: adr?.path ?? null, opened: new Date().toISOString(), snapshot: kept ?? snapshot(repo) });
  writePrivateJson(marker, { run, repo, slug: v.slug, verifyFile, started: new Date().toISOString() });
  const c = context({ run, state: { slug: v.slug, repo, adr: adr?.path ?? null } });
  return { code: 0, out: { ok: true, run, slug: v.slug, adr: adr?.path ?? null, items: c.items, booked: c.booked, newFlags: c.newFlags, errors: c.errors, verifyFile, files: Object.fromEntries(['plan', 'answers', 'claims'].map(k => [k, join(run, FILES[k])])) } };
}

function claims(v, { cwd }) {
  if (!v.base) throw new Usage('claims needs --base REF');
  const repo = repoRoot(cwd);
  if (!repo) throw new Usage('not inside a git repository');
  let diff;
  try { diff = git(repo, ['diff', `${v.base}...HEAD`]); } catch (e) { return { code: 1, out: { ok: false, errors: [`git diff ${v.base}...HEAD failed: ${String(e.stderr || e.message).trim()}`] } }; }
  return { code: 0, out: { ok: true, base: v.base, ...candidatesFromDiff(diff), next: 'ask the user to confirm each claim; save the answers in answers.md and the claims in claims.json' } };
}

/** The run of this session (or --slug in this repo) and its state. */
function locate(v, { env, cwd, home }) {
  if (v.slug) {
    if (!SLUG_RE.test(v.slug)) throw new Usage('--slug: lowercase letters, digits and -');
    const repo = repoRoot(resolve(cwd, v.repo ?? '.'));
    if (!repo) throw new Usage('not inside a git repository');
    const run = runDir(repo, v.slug, env, home);
    const state = readJson(join(run, FILES.state));
    if (!state) throw new Usage(`no verify run for ${v.slug}: open --slug ${v.slug}`);
    return { run, state, marker: null };
  }
  const marker = sessionMarker(env.CLAUDE_CODE_SESSION_ID, env, home);
  const m = marker ? readJson(marker) : null;
  const state = m ? readJson(join(m.run, FILES.state)) : null;
  if (!state) throw new Usage('no open verify run for this session: open --slug S');
  return { run: m.run, state, marker };
}

/** Items, booked envs, new flags and answers: from the ADR, or from the confirmed claims when there is none. */
function context({ run, state }) {
  const answers = parseAnswers(readOr(join(run, FILES.answers)));
  if (state.adr) {
    const text = readOr(state.adr);
    return { items: adrItems(text), booked: bookedEnvs(text), newFlags: newFlags(text), answers, errors: [], adrNo: adrNumber(state.adr) };
  }
  const raw = readOr(join(run, FILES.claims), null);
  if (raw === null) return { items: [], booked: [], newFlags: [], answers, errors: [], adrNo: null };
  let list;
  try { list = JSON.parse(raw); } catch (e) { return { items: [], booked: [], newFlags: [], answers, errors: [`claims.json: ${e.message}`], adrNo: null }; }
  const c = claimItems(list, answers);
  return { items: c.items, booked: [], newFlags: flagNames(c.items.map(i => i.text).join('\n')), answers, errors: c.errors, adrNo: null };
}

function checked(ctx) {
  const c = context(ctx);
  const text = readOr(join(ctx.run, FILES.plan), null);
  if (text === null) return { c, r: { ok: false, errors: [`${join(ctx.run, FILES.plan)} is missing: write the plan first`], entries: [], needsAsk: [] } };
  let p;
  try { p = JSON.parse(text); } catch (e) { return { c, r: { ok: false, errors: [`plan.json: ${e.message}`], entries: [], needsAsk: [] } }; }
  const r = checkPlan(p, c);
  return { c, r: { ...r, ok: r.ok && !c.errors.length, errors: [...c.errors, ...r.errors] } };
}

const shown = e => ({ id: e.id, env: e.env, kind: e.kind, run: e.run, ci: e.ci, flag: e.flag, image: e.image, accepted: e.accepted, approved: e.approved, expectLine: e.expectLine });

function plan(ctx) {
  const { r } = checked(ctx);
  return { code: r.ok ? 0 : 1, out: { ok: r.ok, errors: r.errors, plan: r.entries.map(shown), needsAsk: r.needsAsk } };
}

const NO_SNAPSHOT = 'no snapshot of the work tree from open: close and open the run again';
/** Product files changed since open (docs/verify, the run folder and skipped paths aside), or [NO_SNAPSHOT]. */
function productChanges(ctx, skip = () => false) {
  const before = ctx.state.snapshot;
  if (!before?.files) return [NO_SNAPSHOT];
  // verify's own files (the run folder, the session marker) when VERIFY_CACHE_DIR puts them in the repo; outside it (../..) they match no repo path
  const runRel = relative(ctx.state.repo, ctx.run);
  const markerRel = ctx.marker ? relative(ctx.state.repo, ctx.marker) : null;
  const own = p => p === runRel || p.startsWith(`${runRel}/`) || p === markerRel;
  return changedSince(before, snapshot(ctx.state.repo), p => own(p) || skip(p));
}
function productErrors(ctx) {
  const changed = productChanges(ctx);
  return changed[0] === NO_SNAPSHOT ? changed : changed.length ? [`product files changed since open: ${changed.join(', ')}`] : [];
}

/** Errors for a verify file whose code-written section has a second heading of its id. */
const duplicateErrors = (md, file) => duplicateMarked(md).map(d => `${d.id}: ${d.count} sections in ${file}; dev-workflow reads the last one, so only the section verify.mjs wrote may use that heading`);

function status(ctx) {
  const { c } = checked(ctx);
  const file = verifyPath(ctx.state.repo, ctx.state.slug);
  const md = readOr(file, '');
  const marked = markedSections(md);
  const results = new Map(splitSections(md).filter(p => p.id).map(p => [p.id, /^result:\s*(.*)$/m.exec(p.text)?.[1].trim() ?? null]));
  const items = c.items.map(({ id }) => ({ id, result: results.get(id) ?? null, intact: marked.has(id) ? marked.get(id).intact : null }));
  const errors = [...c.errors, ...duplicateErrors(md, file), ...productErrors(ctx)];
  const bad = errors.length > c.errors.length;
  return { code: bad ? 1 : 0, out: { ok: !bad, run: ctx.run, slug: ctx.state.slug, verifyFile: file, items, errors } };
}

/** Runs fn over items, at most `limit` at a time, results in item order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const withFlag = (env, name, value) => { const e = { ...env }; if (value === undefined) delete e[name]; else e[name] = value; return e; };
const partCap = Math.floor(CAP / 3) - 100;

/** -> { pass, why[], output } for one local entry; a flag entry runs three times (ADR 0008 A3). */
async function runLocal(e, { env, timeoutSec }, repo) {
  if (!e.flag) {
    const r = await runCommand(e.run, { cwd: repo, env, timeoutSec });
    return { ...judge(e, r), output: r.output };
  }
  const name = e.flag.name, flip = flipped(e.flag);
  const runs = [
    { label: `1/3 ${name} unset (default ${e.flag.default})`, value: undefined },
    { label: `2/3 ${name}=${flip}`, value: flip },
    { label: `3/3 ${name}=${INVALID_FLAG_VALUE} (invalid)`, value: INVALID_FLAG_VALUE },
  ];
  const done = await Promise.all(runs.map(x => runCommand(e.run, { cwd: repo, env: withFlag(env, name, x.value), timeoutSec })));
  const why = [], parts = [];
  done.forEach((r, i) => {
    parts.push(`--- ${runs[i].label}: exit ${r.timedOut ? 'timeout' : r.code} ---\n${capOutput(r.output, partCap).replace(/\n+$/, '')}`);
    if (i < 2) { for (const w of judge(e, r).why) why.push(`${runs[i].label}: ${w}`); return; }
    if (r.timedOut) why.push(`${runs[i].label}: timeout after ${timeoutSec}s`);
    else if (r.code === 0 || r.code === null) why.push(`${runs[i].label}: exit ${r.code}, expected non-zero`);
    if (!flagErrorShown(r.output, name, INVALID_FLAG_VALUE)) why.push(`${runs[i].label}: no line outside the test results names ${name} with ${INVALID_FLAG_VALUE} (the flag error must say which flag and which value)`);
  });
  return { pass: why.length === 0, why, output: parts.join('\n') };
}

function section(e, { env, run, pass, why, output, result }) {
  const failed = !pass && !result;
  // why: only on a failed item; renderSection puts it inside the hashed body
  return renderSection({ id: e.id, env, run, result: result ?? (pass ? RESULT.pass : RESULT.fail), expect: e.expectLine, image: e.image, why: failed ? why.join('; ') : undefined, output });
}

function writeSections(ctx, c, sections) {
  const f = verifyPath(ctx.state.repo, ctx.state.slug);
  writeText(f, mergeSections(readOr(f, null), sections, fileHeader(ctx.state.slug, c.adrNo)));
  return f;
}

async function run(v, ctx, deps) {
  const { c, r } = checked(ctx);
  if (!r.ok) return { code: 1, out: { ok: false, errors: r.errors, needsAsk: r.needsAsk } };
  let entries = r.entries;
  if (v.only) {
    const want = v.only.split(',').map(s => s.trim()).filter(Boolean);
    const unknown = want.filter(id => !entries.some(e => e.id === id));
    if (unknown.length) throw new Usage(`--only: not in the plan: ${unknown.join(', ')}`);
    entries = entries.filter(e => want.includes(e.id));
  }
  const repo = ctx.state.repo;
  let sha = null;
  const results = await pool(entries, availableParallelism(), async e => {
    if (e.kind === KIND.remote) return null;
    if (e.kind === KIND.accept) {
      return { e, pass: true, why: [], env: `${e.env} (${HOW.accept})`, run: '(none: accepted by the user)', result: `accepted ${e.accepted}`, output: `${e.accepted}: ${c.answers[e.accepted]}` };
    }
    if (e.kind === KIND.ci) {
      if (!sha) sha = git(repo, ['rev-parse', 'HEAD']).trim();
      const r2 = ciCheck(e.ci, { sha, cwd: repo, gh: deps.gh });
      return { e, ...r2, env: `${e.env} (${HOW.ci})`, run: `gh api repos/{owner}/{repo}/commits/${sha}/check-runs (check "${e.ci}")` };
    }
    const r2 = await runLocal(e, deps, repo);
    if (e.image && !existsSync(join(repo, e.image))) { r2.pass = false; r2.why.push(`image ${e.image} was not made by the run`); }
    return { e, ...r2, env: `${e.env} (${HOW.run})`, run: e.run };
  });
  const done = results.filter(Boolean);
  // the backstop for a guard bypass: a run that changed product code proves nothing about the code it started with
  const images = new Set(r.entries.filter(e => e.image).map(e => normalize(e.image)));
  const changed = done.length ? productChanges(ctx, p => images.has(p)) : [];
  if (changed.length) {
    const why = changed[0] === NO_SNAPSHOT ? NO_SNAPSHOT : `changed product files: ${changed.join(', ')}`;
    for (const x of done) { x.pass = false; x.result = undefined; x.why = [...x.why, why]; }
  }
  const f = done.length ? writeSections(ctx, c, done.map(x => section(x.e, x))) : verifyPath(repo, ctx.state.slug);
  const failed = done.filter(x => !x.pass).map(x => ({ id: x.e.id, why: x.why }));
  const errors = duplicateErrors(readOr(f, ''), f);
  const bad = failed.length || errors.length;
  return { code: bad ? 1 : 0, out: { ok: !bad, errors, ran: done.map(x => x.e.id), passed: done.filter(x => x.pass).map(x => x.e.id), failed, waiting: entries.filter(e => e.kind === KIND.remote).map(e => e.id), verifyFile: f } };
}

function record(v, ctx, { stdin }) {
  if (!v.id || !v.from) throw new Usage('record needs --id ID --from "<how it was run>" --exit N [--file OUT]');
  if (!/^\d{1,3}$/.test(String(v.exit ?? '')) || Number(v.exit) > 255) throw new Usage('--exit must be the exit code, 0 to 255');
  if (/[()\r\n]/.test(v.from)) throw new Usage('--from: one line with no parentheses, naming where the command ran (the env line is "<env> (relayed: <from>)")');
  const { c, r } = checked(ctx);
  if (!r.ok) return { code: 1, out: { ok: false, errors: r.errors, needsAsk: r.needsAsk } };
  const e = r.entries.find(x => x.id === v.id);
  if (!e) throw new Usage(`--id ${v.id} is not in the plan`);
  if (e.kind !== KIND.remote) return { code: 1, out: { ok: false, errors: [`${v.id} is not a remote entry: verify.mjs run runs it`] } };
  const output = v.file ? readOr(resolve(v.file), null) : typeof stdin === 'string' ? stdin : readFileSync(0, 'utf8');
  if (output === null) throw new Usage(`--file ${v.file} cannot be read`);
  const j = judge(e, { code: Number(v.exit), output, timedOut: false });
  const f = writeSections(ctx, c, [section(e, { ...j, env: `${e.env} (relayed: ${v.from})`, run: e.run, output })]);
  return { code: j.pass ? 0 : 1, out: { ok: j.pass, id: e.id, why: j.why, verifyFile: f, expect: describeExpect(e) } };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { code, out } = await main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = code;
}
