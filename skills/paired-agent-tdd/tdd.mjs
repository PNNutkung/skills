#!/usr/bin/env node
// T0 gates of paired-agent-tdd: plain code, no model. They turn "the driver says it is done" into facts the navigator and the reviewer judge.
//   node tdd.mjs plan   --plan plan.json                 validate, snapshot the base tree, create the run folder RUN, print the Workflow args (JSON)
//   node tdd.mjs red    --run RUN --group G               the group's NEW tests must FAIL now (class: assertion | load error | passes already)
//   node tdd.mjs green  --run RUN --group G [--retest]    the group's tests pass, exercise the change, did not change since RED, stay in scope; mutants; coverage
//   node tdd.mjs dod    --run RUN --group G --stage red|green --row ID:kind:test:file ...   the group's DoD pairs from its gate file and the working tree (instant, no run)
//   node tdd.mjs final  --run RUN [--again]               every group's tests together, existing tests that mention the changed modules, scope, whole-diff patch (--again: a re-run after fixes)
//   node tdd.mjs verify --run RUN --ret return.json       DoD closure from the gate files, fixes still present, reviewer proofs (proofcheck.mjs)
//   node tdd.mjs snap   --run RUN --on REV [--files a,b]  print the sha of REV + those working-tree files (no --files: the whole working tree)
// A snapshot is a git commit of the working tree built with a temporary index: no ref, no index and no file of the user's repo changes (only loose objects are added).
// Group snapshots hold the BASE tree plus ONLY that group's files (and the groups it waits for), so a gate never sees another group's half-written edit.
// Every test command runs through the sandbox runner of the zero-trust-review skill (ZT_DIR overrides where it lives): exit 86 = no sandbox, 124 = timeout, and the
// run id of each command is in RUN/exec.jsonl. RUN is made by `plan` under the per-user zt-review base (the only place the ledger tools approve) and gets NO marker:
// the review-only guard hook must not restrict the agents that write the code. Gates write RUN/gates/*.json and RUN/diff/*.patch.
// Exit: 0 (results are data, read `ok`); 2 usage or invalid plan; 3 no trusted run dir; 1 other error.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { changedCoverage, classifyRed, closure, closureMarkdown, groupClosure, outOfScope, parseLcov, parseNumstat, parseRow, pickAffected, redOk, validatePlan } from './gates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZT = resolve(process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review'));
const fail = (code, msg) => { process.stderr.write(`tdd: ${msg}\n`); process.exit(code); };
if (!existsSync(join(ZT, 'probelib.mjs'))) fail(2, `the zero-trust-review skill is not at ${ZT} (set ZT_DIR): its sandbox runner and probes are required`);
const imp = f => import(pathToFileURL(join(ZT, f)).href);
const lib = await imp('probelib.mjs');
const { createRunDir, readMarker, resolveRun, writeSafe } = await imp('runctx.mjs');
const { changedLines } = await imp('mutants.mjs');

const COMMIT_ENV = { GIT_AUTHOR_NAME: 'pat', GIT_AUTHOR_EMAIL: 'pat@localhost', GIT_COMMITTER_NAME: 'pat', GIT_COMMITTER_EMAIL: 'pat@localhost' };
const MUTATION = { max: 12, budget: 60 }; // per group, inside the navigator's own turn: small enough to stay well under the harness's ~180 s silence limit
const SUMMARY_MAX = 2400, TAIL_SHOWN = 300, TAIL_KEPT = 1200;
const short = sha => String(sha).slice(0, 8);

function git(repo, args, env = {}) {
  try { return execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env }, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); }
  catch (e) { throw new Error(`git ${args[0]}: ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
}
const names = text => text.split('\0').filter(Boolean); // git ... -z: names stay raw (a quoted "caf\\303\\251.py" would never match the plan)
const has = (repo, rev, path) => { try { git(repo, ['cat-file', '-e', `${rev}:${path}`]); return true; } catch { return false; } };
const showText = (repo, rev, path) => (has(repo, rev, path) ? git(repo, ['show', `${rev}:${path}`]) : '');

// ---------------------------------------------------------------- snapshots
let counter = 0;
const inside = (root, p) => { try { const r = realpathSync(dirname(p)); return r === root || r.startsWith(root + sep); } catch { return false; } };

/** commit of `on` + the given working-tree files (undefined = every non-ignored file). Refuses links and anything that resolves outside the repo. */
function snapshot(scratch, repo, on, files) {
  const index = join(scratch, `idx-${process.pid}-${counter++}`), env = { ...COMMIT_ENV, GIT_INDEX_FILE: index }, g = (...a) => git(repo, a, env).trim();
  const parent = g('rev-parse', '--verify', `${on}^{commit}`), root = realpathSync(repo);
  try {
    g('read-tree', parent);
    if (files === undefined) g('add', '-A', '--', '.');
    else for (const f of [...new Set(files)]) {
      const p = join(root, f), st = lstatSync(p, { throwIfNoEntry: false });
      if (!st) { g('update-index', '--force-remove', '--', f); continue; }
      if (!st.isFile() || !inside(root, p)) throw new Error(`refusing to snapshot ${f}: not a regular file inside the repo`);
      g('update-index', '--add', '--cacheinfo', `${st.mode & 0o111 ? '100755' : '100644'},${g('hash-object', '-w', '--no-filters', '--', p)},${f}`);
    }
    return g('commit-tree', g('write-tree'), '-p', parent, '-m', 'paired-agent-tdd snapshot');
  } finally { rmSync(index, { force: true }); }
}
const baseSnapshot = (scratch, repo) => (git(repo, ['status', '--porcelain']).trim() ? snapshot(scratch, repo, 'HEAD') : git(repo, ['rev-parse', '--verify', 'HEAD^{commit}']).trim());

// ---------------------------------------------------------------- plan and run folder
const group = (plan, id) => plan.groups.find(g => g.id === id) ?? fail(2, `unknown group ${id}`);
const filesOf = gs => gs.flatMap(g => [...g.tests, ...g.src]);
const planFiles = plan => [...filesOf(plan.groups), ...(plan.integration?.file ? [plan.integration.file] : [])]; // the integration test belongs to the plan but to no group
function needs(plan, g) { // every group g waits for, directly or not
  const seen = new Set(), walk = id => { for (const d of group(plan, id).after ?? []) if (!seen.has(d)) { seen.add(d); walk(d); } };
  walk(g.id);
  return [...seen].map(id => group(plan, id));
}

const trustedRun = dir => { // the explicit flag alone: another candidate (env, marker) must never stand in for a bad one
  let real = '';
  try { real = realpathSync(resolve(dir ?? '')); } catch { /* missing */ }
  return real && resolveRun({ run: real, env: process.env }) === real ? real : '';
};
function load(o) {
  const run = trustedRun(o.run);
  if (!run) fail(3, '--run must be the run folder `tdd.mjs plan` created (under the per-user zt-review base; yours and closed to others)');
  let plan;
  try { plan = JSON.parse(readFileSync(join(run, 'plan.json'), 'utf8')); } catch { fail(3, `no ${join(run, 'plan.json')}: run \`tdd.mjs plan\` first`); }
  process.env.ZT_RUN_DIR = run; // sandbox-run.mjs appends its ledger (one entry per command, ZT-RUN <id>) to RUN/exec.jsonl
  const linked = (plan.link ?? []).map(n => realpathSync(join(plan.repo, n)));
  const env = [...(plan.env ?? []), ...(plan.env ?? []).some(e => e.startsWith('PYTHONDONTWRITEBYTECODE=')) ? [] : ['PYTHONDONTWRITEBYTECODE=1']];
  const ro = [...linked, ...lib.editableRoots(linked, plan.repo), ...(plan.ro ?? []).map(p => resolve(p))];
  const runner = resolve(o.runner ?? join(ZT, 'sandbox-run.mjs'));
  mkdirSync(join(run, 'gates'), { recursive: true, mode: 0o700 });
  mkdirSync(join(run, 'diff'), { recursive: true, mode: 0o700 });
  return { run, plan, linked, jobs: plan.jobs ?? 4, probe: { runner, env, ro, timeout: plan.timeout ?? 120, tail: TAIL_KEPT } };
}
const gatePath = (ctx, name) => join(ctx.run, 'gates', name);
const writeGate = (ctx, name, obj) => writeSafe(ctx.run, gatePath(ctx, name), `${JSON.stringify(obj)}\n`);
const readGate = (ctx, name) => { try { return JSON.parse(readFileSync(gatePath(ctx, name), 'utf8')); } catch { return null; } };
const writeDiff = (ctx, name, args) => { const f = join(ctx.run, 'diff', name); writeSafe(ctx.run, f, git(ctx.plan.repo, args)); return f; };

async function tree(ctx, rev, tag) {
  const dir = mkdtempSync(join(ctx.plan.scratch, `${tag}-`));
  await lib.extract(ctx.plan.repo, rev, dir);
  (ctx.plan.link ?? []).forEach((name, i) => { lib.clear(dir, name); symlinkSync(ctx.linked[i], join(dir, name)); });
  return dir;
}
const discard = d => { try { rmSync(d, { recursive: true, force: true }); } catch { /* untrusted code may have locked it: scratch is disposable */ } };
const runFile = (ctx, dir, file) => lib.runIn(ctx.probe, dir, ctx.plan.cmd.replaceAll('{file}', () => lib.shq(file)));
const snapOf = (ctx, files, on = ctx.plan.base) => snapshot(ctx.plan.scratch, ctx.plan.repo, on, files);
// Files that differ from the base and that no group or the integration test owns. A scan that fails (a file vanished mid-add) is `unknown`, never a gate failure.
function strayFiles(ctx) {
  try { return { files: outOfScope(names(git(ctx.plan.repo, ['diff', '--name-only', '-z', ctx.plan.base, snapOf(ctx, undefined)])), new Set(planFiles(ctx.plan))) }; }
  catch (e) { return { files: [], error: e.message.slice(0, 160) }; }
}

// testprobe.mjs and mutate.mjs run as their own processes: proven units, one JSON line each
function child(ctx, script, base, head, tests, tag, extra = []) {
  const { plan } = ctx, scratch = mkdtempSync(join(plan.scratch, `${tag}-`));
  const argv = [join(ZT, script), '--repo', plan.repo, '--base', base, '--head', head, '--scratch', scratch, '--cmd', plan.cmd, '--tests', tests.join(','), '--runner', ctx.probe.runner,
    '--jobs', String(ctx.jobs), '--timeout', String(ctx.probe.timeout), ...(plan.link ?? []).flatMap(n => ['--link', n]), ...(plan.ro ?? []).flatMap(p => ['--ro', p]), ...ctx.probe.env.flatMap(e => ['--env', e]), ...extra];
  return new Promise(done => {
    const p = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => { discard(scratch); try { done(JSON.parse(out.trim().split('\n').pop())); } catch { done({ error: `${script} exited ${code}: ${err.trim().split('\n')[0] ?? ''}`.slice(0, 300) }); } });
  });
}

const say = rows => process.stdout.write(`${rows.join('\n').slice(0, SUMMARY_MAX)}\n`);
const clipTail = t => (t ?? '').replace(/\s+/g, ' ').trim().slice(-TAIL_SHOWN);
const spread = (map, n = 6) => map.slice(0, n).map(([f, ls]) => `${f}:${ls.slice(0, 6).join(',')}`).join(' ');

// ---------------------------------------------------------------- gates
async function red(ctx, gid) {
  const { plan } = ctx, g = group(plan, gid);
  const ready = needs(plan, g).filter(d => readGate(ctx, `${d.id}.green.json`)?.ok); // a group still in flight is not part of this one's world
  const snap = snapOf(ctx, [...g.tests, ...filesOf(ready)]), dir = await tree(ctx, snap, 'red');
  const tests = await lib.pool(g.tests, ctx.jobs, async file => {
    if (!has(plan.repo, snap, file)) return { file, verdict: 'missing' };
    const r = await runFile(ctx, dir, file), verdict = classifyRed(r);
    return { file, verdict, exit: r.exit, sec: r.sec, run: r.run, ...(verdict === 'fails' ? {} : { tail: clipTail(r.tail) }) };
  });
  discard(dir);
  const patch = writeDiff(ctx, `${gid}.red.patch`, ['diff', '-U10', plan.base, snap, '--', ...g.tests]);
  const out = { kind: 'red', group: gid, base: plan.base, snapshot: snap, ok: redOk(tests), tests };
  writeGate(ctx, `${gid}.red.json`, out);
  say([`RED ${gid} ok=${out.ok} snapshot ${short(snap)} patch ${patch}`, '  (a new test must FAIL now; a load error is only right when the code under test does not exist yet)',
    ...tests.map(t => `  ${t.file}: ${t.verdict}${t.exit === undefined ? '' : ` exit ${t.exit}, ${t.sec}s, run ${t.run}`}${t.tail ? `\n    ...${t.tail}` : ''}`)]);
}

async function green(ctx, gid, retest) {
  const { plan } = ctx, g = group(plan, gid), deps = needs(plan, g);
  const baseDeps = deps.length ? snapOf(ctx, filesOf(deps)) : plan.base; // the tests must need THIS group's code, with the groups it waits for already in place
  const snap = snapOf(ctx, [...g.tests, ...g.src], baseDeps); // a CHILD of baseDeps: the probes diff `base...head` (merge base), so it must hold exactly this group's files
  const redGate = readGate(ctx, `${gid}.red.json`);
  const frozen = redGate ? parseNumstat(git(plan.repo, ['diff', '--numstat', redGate.snapshot, snap, '--', ...g.tests])) : null;
  const stray = strayFiles(ctx); // shared tree: a stray file cannot be pinned on this group, so it is a note here and blocks only at `final`
  const patch = writeDiff(ctx, `${gid}.green.patch`, ['diff', '-U10', baseDeps, snap, '--', ...g.tests, ...g.src]);
  const mut = plan.mutation ?? {}, kill = plan.killExits ? ['--kill-exits', plan.killExits.join(',')] : [];
  const [probe, mutants, cover] = await Promise.all([
    child(ctx, 'testprobe.mjs', baseDeps, snap, g.tests, 'gp', ['--flake', '2']),
    mut.off ? { reason: 'switched off in the plan' } : child(ctx, 'mutate.mjs', baseDeps, snap, g.tests, 'gm', ['--max', String(mut.max ?? MUTATION.max), '--budget', String(mut.budget ?? MUTATION.budget), ...kill]),
    coverage(ctx, g, snap, baseDeps),
  ]);
  const tests = (probe.tests ?? []).map(t => ({ file: t.file, verdict: t.verdict, reason: t.reason, head: t.head?.exit, base: t.base?.exit, nondeterministic: t.flake?.nondeterministic }));
  const survivors = (mutants.mutants ?? []).filter(m => m.result === 'survived').map(m => ({ id: m.id, file: m.file, line: m.line, op: m.op, before: m.before, after: m.after, run: m.run, quote: m.quote }));
  const reasons = [];
  if (probe.error) reasons.push(`test probe: ${probe.error}`);
  if (!tests.length || tests.some(t => t.verdict !== 'exercises-change')) reasons.push('a test file does not pass and exercise the change');
  if (tests.some(t => t.nondeterministic)) reasons.push('flaky');
  if (!frozen) reasons.push('no RED gate on record for this group');
  else if (frozen.changed.length && !retest) reasons.push(`tests changed since RED: ${frozen.changed.join(', ')}`);
  if (survivors.length) reasons.push(`${survivors.length} mutant(s) survived: the tests do not pin that code`);
  if (cover?.pct != null && cover.pct < cover.min) reasons.push(`changed-line coverage ${cover.pct}% < ${cover.min}%`);
  const out = { kind: 'green', group: gid, base: baseDeps, snapshot: snap, ok: reasons.length === 0, reasons, tests, frozen, outOfScope: stray.files, strayScan: stray.error, mutation: { reason: mutants.reason ?? mutants.error, summary: mutants.summary, score: mutants.score, survivors }, coverage: cover };
  writeGate(ctx, `${gid}.green.json`, out);
  say([`GREEN ${gid} ok=${out.ok} snapshot ${short(snap)} patch ${patch}${reasons.length ? `\n  not ok: ${reasons.join('; ')}` : ''}`,
    ...tests.map(t => `  ${t.file}: ${t.verdict}${t.reason ? ` (${t.reason})` : ''}, exit on HEAD ${t.head}, with the group's code reverted ${t.base}${t.nondeterministic ? ', FLAKY' : ''}`),
    stray.files.length ? `  note: files outside the plan exist in the shared tree: ${stray.files.slice(0, 5).join(', ')} (judge from the patch whether this group made them; \`final\` blocks on them)` : '',
    `  tests since RED: ${frozen ? (frozen.changed.length ? `CHANGED ${frozen.changed.join(', ')} (${frozen.removed} line(s) removed)${retest ? ' [--retest: sanctioned]' : ''}` : 'unchanged') : 'unknown'}`,
    `  ${mutants.summary ?? `mutation: ${mutants.reason ?? mutants.error ?? 'not run'}`}`,
    ...survivors.slice(0, 3).map(s => `  survivor ${s.id} ${s.file}:${s.line} ${s.op}: ${s.before.slice(0, 50)} -> ${s.after.slice(0, 50)} (run ${s.run}; quote "${s.quote}")`),
    cover ? `  coverage: ${cover.error ?? `${cover.pct ?? 'n/a'}% of ${cover.total} changed line(s), min ${cover.min}%${cover.noData.length ? `, no data for ${cover.noData.join(', ')}` : ''}${Object.keys(cover.uncovered).length ? `; uncovered ${spread(Object.entries(cover.uncovered))}` : ''}`}` : '  coverage: not configured']);
}

const escapeRe = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isNamed = (repo, rev, r) => typeof r.test === 'string' && r.test !== '' && new RegExp(`(?<![A-Za-z0-9_])${escapeRe(r.test)}(?![A-Za-z0-9_])`).test(showText(repo, rev, r.file));

/**
 * The DoD pairs of ONE group while it is built: no test is run, so a driver can ask after every edit. The rows are a claim; the facts are the working tree (is the test
 * named in its file?) and the gate file (did the file fail at RED, pass at GREEN, is the gate ok?). A gate file only speaks for the tree it ran on: edited since, it is stale.
 */
function dod(ctx, gid, stage, rowTexts) {
  const { plan } = ctx, g = group(plan, gid);
  if (stage !== 'red' && stage !== 'green') fail(2, 'dod needs --stage red|green');
  const parsed = rowTexts.map(parseRow), gate = readGate(ctx, `${gid}.${stage}.json`), files = stage === 'red' ? g.tests : [...g.tests, ...g.src];
  const cur = snapOf(ctx, files), reasons = [], phantom = [];
  const stale = gate?.snapshot ? parseNumstat(git(plan.repo, ['diff', '--numstat', gate.snapshot, cur, '--', ...files])).changed : [];
  const rows = parsed.filter(Boolean).filter(r => isNamed(plan.repo, cur, r) || (phantom.push(`${r.dod}/${r.kind}: ${r.test} is not in ${r.file}`), false));
  const verdicts = name => Object.fromEntries((readGate(ctx, name)?.tests ?? []).map(t => [t.file, t.verdict]));
  const c = groupClosure(plan, gid, rows, verdicts(`${gid}.red.json`), verdicts(`${gid}.green.json`), readGate(ctx, `${gid}.green.json`)?.ok === true, stage);
  const unreadable = rowTexts.length - parsed.filter(Boolean).length;
  if (unreadable) reasons.push(`${unreadable} --row not in the form ID:kind:test:file`);
  if (!gate) reasons.push(`no ${stage.toUpperCase()} gate on record: run \`tdd.mjs ${stage}\` first`);
  else if (stale.length) reasons.push(`the ${stage.toUpperCase()} gate ran before ${stale.join(', ')} changed: run it again`);
  else if (stage === 'green' && !gate.ok) reasons.push('the GREEN gate said not ok');
  if (phantom.length) reasons.push(`rows with no such test: ${phantom.join('; ')}`);
  if (c.gaps.length) reasons.push(`DoD gaps: ${c.gaps.join(', ')}`);
  const ok = reasons.length === 0;
  say([`DOD ${gid} stage=${stage} ok=${ok} covered ${c.covered}/${c.total}${c.shared.length ? ` (also owned by another group: ${c.shared.join(', ')})` : ''}`, ...(ok ? [] : [`  not ok: ${reasons.join('; ')}`]),
    ...c.items.map(i => `  ${i.id}: ${Object.entries(i.kinds).map(([k, v]) => `${k} ${v.status}${v.tests.length ? ` (${v.tests.join(', ')})` : ''}`).join(', ')}`)]);
}

async function coverage(ctx, g, snap, base) {
  const { plan } = ctx;
  if (!plan.cover) return null;
  const dir = await tree(ctx, snap, 'cov'), out = 'zt-coverage.lcov', min = plan.coverMin ?? 80;
  const r = await lib.runIn(ctx.probe, dir, plan.cover.replaceAll('{files}', g.tests.map(lib.shq).join(' ')).replaceAll('{out}', out));
  const f = join(dir, out), st = lstatSync(f, { throwIfNoEntry: false });
  const cleanup = () => discard(dir);
  if (!st?.isFile()) return cleanup(), { error: `cover command wrote no ${out} (exit ${r.exit}, run ${r.run})`, min, noData: [], uncovered: {} };
  const changed = changedLines(git(plan.repo, ['diff', '-U0', '--no-color', '--no-ext-diff', base, snap, '--', ...g.src]));
  const cov = { ...changedCoverage(parseLcov(readFileSync(f, 'utf8')), changed), min, run: r.run };
  cleanup();
  return cov;
}

async function final(ctx, quiet, again) {
  const { plan } = ctx, own = new Set(plan.groups.flatMap(g => g.tests)), snap = snapOf(ctx, planFiles(plan));
  // the integration test needs its real dependency, which the sandbox has not: its agent runs it for real and reports the exit code (verify reads it)
  const skip = new Set([...own, ...(plan.integration?.file ? [plan.integration.file] : [])]);
  const listed = names(git(plan.repo, ['ls-tree', '-r', '--name-only', '-z', snap])).filter(f => lib.TEST.test(f) && !lib.DOC.test(f));
  const texts = new Map(), textOf = p => { if (!texts.has(p)) texts.set(p, showText(plan.repo, snap, p)); return texts.get(p); };
  const affected = pickAffected(listed.filter(p => !skip.has(p)), textOf, plan.groups.flatMap(g => g.src), skip);
  const dir = await tree(ctx, snap, 'fin');
  const verdict = async file => { const r = await runFile(ctx, dir, file); return { file, exit: r.exit, run: r.run, tail: clipTail(r.tail) }; };
  const [together, existing] = await Promise.all([lib.pool([...own], ctx.jobs, verdict), lib.pool(affected.run, ctx.jobs, verdict)]);
  const broken = existing.filter(r => r.exit !== 0);
  let regressions = broken, preexisting = [];
  if (broken.length) { // fails now: new, or did it already fail before this change?
    const baseDir = await tree(ctx, plan.base, 'finb'), before = await lib.pool(broken, ctx.jobs, r => runFile(ctx, baseDir, r.file));
    discard(baseDir);
    regressions = broken.filter((_, i) => before[i].exit === 0);
    preexisting = broken.filter((_, i) => before[i].exit !== 0).map(r => r.file);
  }
  discard(dir);
  const stray = strayFiles(ctx), patch = writeDiff(ctx, 'final.patch', ['diff', '-U15', plan.base, snap]), reasons = [];
  if (together.some(r => r.exit !== 0)) reasons.push(`group tests fail together: ${together.filter(r => r.exit !== 0).map(r => r.file).join(', ')}`);
  if (regressions.length) reasons.push(`existing tests broken by the change: ${regressions.map(r => r.file).join(', ')}`);
  if (stray.files.length) reasons.push(`files outside the plan changed: ${stray.files.slice(0, 5).join(', ')}`);
  const out = { kind: 'final', base: plan.base, snapshot: snap, ok: !reasons.length, reasons, together, existing: { ran: affected.run, more: affected.more, regressions, preexisting }, outOfScope: stray.files, strayScan: stray.error };
  writeGate(ctx, 'final.json', out);
  if (!quiet && !again && !readGate(ctx, 'reviewed.json')) writeGate(ctx, 'reviewed.json', out); // the FIRST final run is the reviewer's view: its proofs are checked against that tree, not the post-fix one (--again: a re-run after fixes never is)
  if (!quiet) say([`FINAL ok=${out.ok} snapshot ${short(snap)} patch ${patch}${reasons.length ? `\n  not ok: ${reasons.join('; ')}` : ''}`,
    `  group tests together: ${together.filter(r => r.exit === 0).length}/${together.length} pass`,
    `  existing tests that mention the changed modules: ${affected.run.length} run${affected.more ? ` (+${affected.more} not run)` : ''}, ${regressions.length} broken by this change, ${preexisting.length} already failing before`,
    ...regressions.slice(0, 3).map(r => `    ${r.file} exit ${r.exit} run ${r.run}: ...${r.tail}`)]);
  return snap;
}

async function verify(ctx, retPath) {
  const { plan } = ctx;
  let ret;
  try { ret = JSON.parse(readFileSync(resolve(retPath), 'utf8')); } catch (e) { fail(2, `--ret must be the Workflow return as JSON: ${e.message}`); }
  const fileMap = (gid, stage) => Object.fromEntries((readGate(ctx, `${gid}.${stage}.json`)?.tests ?? []).map(t => [t.file, t.verdict]));
  const rows = {}, redMap = {}, greenMap = {}, greenOk = {}, phantom = [];
  const snapNow = snapOf(ctx, planFiles(plan)); // a claimed test must exist by name in its file now: a row is a claim, the file is the fact
  const named = r => isNamed(plan.repo, snapNow, r);
  for (const g of plan.groups) {
    rows[g.id] = (ret.groups?.[g.id]?.matrix ?? []).filter(r => named(r) || (phantom.push(`${r.dod}/${r.kind}: ${r.test} is not in ${r.file}`), false));
    redMap[g.id] = fileMap(g.id, 'red'); greenMap[g.id] = fileMap(g.id, 'green');
    greenOk[g.id] = readGate(ctx, `${g.id}.green.json`)?.ok === true; // flaky, changed-since-RED or surviving-mutant groups credit nothing
  }
  const c = closure(plan, rows, redMap, greenMap, greenOk);
  writeSafe(ctx.run, join(ctx.run, 'dod-matrix.md'), `${closureMarkdown(c)}\n`);
  const overridden = plan.groups.flatMap(g => ['red', 'green'].flatMap(stage => {
    const gate = readGate(ctx, `${g.id}.${stage}.json`);
    if (ret.groups?.[g.id]?.[stage]?.verdict !== 'PASS') return [];
    return !gate ? [`${g.id}/${stage}: PASS with no gate on record`] : gate.ok ? [] : [`${g.id}/${stage}: PASS although the gate said not ok (${(gate.reasons ?? []).join('; ') || 'a test file did not fail'})`];
  }));
  const reviewed = readGate(ctx, 'reviewed.json')?.snapshot;
  const snap = await final(ctx, true); // the post-fix state: tests together, regressions, scope
  const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const stillThere = cl => { const q = squash(cl.quote); return q !== '' && squash(showText(plan.repo, snap, cl.file)).includes(q); };
  const open = (ret.clusters ?? []).filter(cl => !/^(refuted|out-of-scope|unverified-nit)$/.test(cl.status)); // a nit is reported, never sent to a fixer
  const unfixed = open.filter(stillThere).map(cl => `${cl.id} ${cl.severity} ${cl.file}:${cl.startLine} ${cl.title}`);
  let proof = null;
  if ((ret.clusters ?? []).length && existsSync(join(ZT, 'proofcheck.mjs'))) {
    const text = await new Promise(done => { const p = spawn(process.execPath, [join(ZT, 'proofcheck.mjs'), '--ret', resolve(retPath), '--repo', plan.repo, '--head', reviewed ?? snap, '--run', ctx.run], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d)); p.on('close', code => done({ out, err, code })); });
    try { const parsed = JSON.parse(text.out); proof = (parsed.clusters ?? parsed).reduce((m, x) => ({ ...m, [x.status]: (m[x.status] ?? 0) + 1 }), {}); } catch { proof = `proofcheck exited ${text.code}: ${text.err.trim().split('\n')[0]}`; }
  }
  const integration = plan.integration?.file ? (ret.integration ? (ret.integration.exit === 0 ? 'ok' : `${plan.integration.file} exited ${ret.integration.exit}`) : 'not run') : undefined;
  const res = { integration, dod: { covered: c.covered, total: c.total, gaps: c.gaps, phantom }, final: readGate(ctx, 'final.json')?.ok, overridden, unfixed, notDone: Object.entries(ret.groups ?? {}).filter(([, v]) => v.state !== 'done').map(([k, v]) => `${k}: ${v.state}`).concat(integration && integration !== 'ok' ? [`integration: ${integration}`] : []), proofcheck: proof, snapshot: snap, report: join(ctx.run, 'dod-matrix.md') };
  writeGate(ctx, 'verify.json', res);
  process.stdout.write(`${JSON.stringify(res)}\n`);
}

// ---------------------------------------------------------------- plan command
function cmdPlan(o) {
  let plan;
  try { plan = JSON.parse(readFileSync(resolve(o.plan ?? ''), 'utf8')); } catch (e) { fail(2, `--plan must be a plan.json file: ${e.message}`); }
  let ticket;
  if (plan.ticket) { try { ticket = readFileSync(resolve(plan.ticket), 'utf8'); } catch (e) { fail(2, `ticket not readable: ${e.message}`); } }
  const errors = validatePlan(plan, ticket);
  if (errors.length) fail(2, `invalid plan:\n  ${errors.join('\n  ')}`);
  let repo;
  try { repo = realpathSync(plan.repo); git(repo, ['rev-parse', '--git-dir']); } catch { fail(2, `repo is not a git repository: ${plan.repo}`); }
  if (git(repo, ['rev-parse', '--show-prefix']).trim()) fail(2, `repo must be the top level of its work tree, not a subdirectory (${plan.repo}): snapshots are tree-relative`);
  const notSource = plan.groups.flatMap(g => g.src.filter(f => !lib.isSource(f)).map(f => `${g.id}: ${f}`));
  if (notSource.length) fail(2, `src files the probes never count as source (a test-like path, a data or config file): ${notSource.join(', ')}; the group could never be judged green. Move them out of src.`);
  const marker = readMarker({ env: process.env });
  if (marker) fail(3, `a zero-trust-review run is still active (${marker}): its guard hook would deny the test commands of the agents that write code. Finish it or run: node ${join(ZT, 'note.mjs')} deactivate`);
  const scratch = plan.scratch ? resolve(plan.scratch) : join(realpathSync(tmpdir()), `pat-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const real = realpathSync(scratch);
  if (real === repo || real.startsWith(repo + sep)) fail(2, 'scratch must be outside the repo');
  let base;
  try { base = plan.base ? git(repo, ['rev-parse', '--verify', `${plan.base}^{commit}`]).trim() : baseSnapshot(real, repo); } catch (e) { fail(2, `base is not a commit: ${e.message}`); } // a full sha: a branch name would move when an agent commits
  let run;
  if (o.run) { run = trustedRun(o.run); if (!run) fail(3, '--run must be a run folder under the per-user zt-review base; omit it and plan creates one'); }
  else { try { run = createRunDir(`pat-${short(base)}-${Date.now().toString(36)}`); } catch (e) { fail(3, `cannot create the run folder: ${e.message}`); } }
  const full = { ...plan, repo, scratch: real, base, run };
  mkdirSync(join(run, 'gates'), { recursive: true, mode: 0o700 });
  writeSafe(run, join(run, 'plan.json'), `${JSON.stringify(full)}\n`);
  const backend = lib.backendOf(resolve(o.runner ?? join(ZT, 'sandbox-run.mjs')));
  const args = { ...full, skillDir: HERE, ztDir: ZT, runDir: run, sandbox: backend };
  writeSafe(run, join(run, 'args.json'), `${JSON.stringify(args)}\n`);
  process.stderr.write(`plan ok: ${plan.groups.length} group(s), ${plan.dod.length} DoD item(s), base ${short(base)}, sandbox ${backend}${backend === 'none' ? ' (no sandbox: every gate will be unverifiable)' : ''}; Workflow args in ${join(run, 'args.json')}\n`);
  process.stdout.write(`${JSON.stringify(args)}\n`);
}

// ---------------------------------------------------------------- main
try {
  const { values: v } = parseArgs({ options: { plan: { type: 'string' }, run: { type: 'string' }, group: { type: 'string' }, ret: { type: 'string' }, on: { type: 'string' }, files: { type: 'string' }, runner: { type: 'string' }, retest: { type: 'boolean' }, again: { type: 'boolean' }, stage: { type: 'string' }, row: { type: 'string', multiple: true } }, args: process.argv.slice(3), strict: true });
  const cmd = process.argv[2];
  if (cmd === 'plan') cmdPlan(v);
  else if (['red', 'green', 'final', 'verify', 'snap', 'dod'].includes(cmd)) {
    const ctx = load(v);
    if (cmd === 'snap') process.stdout.write(`${snapOf(ctx, v.files === undefined ? undefined : v.files.split(',').filter(Boolean), v.on ?? ctx.plan.base)}\n`);
    else if (cmd === 'dod') dod(ctx, v.group ?? fail(2, 'dod needs --group'), v.stage, v.row ?? []);
    else if (cmd === 'final') await final(ctx, false, v.again);
    else if (cmd === 'verify') await verify(ctx, v.ret ?? fail(2, 'verify needs --ret'));
    else if (cmd === 'red') await red(ctx, v.group ?? fail(2, 'red needs --group'));
    else await green(ctx, v.group ?? fail(2, 'green needs --group'), v.retest);
  } else fail(2, 'usage: tdd.mjs plan|red|green|dod|final|verify|snap (see the header of tdd.mjs)');
} catch (e) { fail(1, e.message); }
