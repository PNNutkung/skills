// Pure helpers for the paired-agent-tdd T0 gates: no I/O, no model. Plan validation, RED classification, the DoD test matrix, lcov coverage of changed lines.
// checkMatrix is also embedded into workflow.js by graph.mjs --write (a Workflow script cannot import): keep it free of outer references.
import { posix } from 'node:path';

export const KINDS = ['happy', 'fail', 'edge'];
const DOD_ID = /^[A-Za-z][A-Za-z0-9]{0,11}$/; // usable inside a test name: AC1, DOD2
const GROUP_ID = /^[A-Za-z0-9_-]{1,40}$/;
const squash = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const relPath = p => typeof p === 'string' && p !== '' && p !== '.' && !p.includes('\0') && !p.includes(',') && posix.normalize(p) === p && !p.startsWith('/') && !p.split('/').includes('..');

/** -> list of error strings (empty = the plan can run). `ticketText` (optional) is what every DoD `source` quote must be found in. */
export function validatePlan(plan, ticketText) {
  const errors = [];
  const bad = m => errors.push(m);
  for (const k of ['repo', 'cmd']) if (typeof plan?.[k] !== 'string' || !plan[k]) bad(`${k} is required`);
  if (typeof plan?.cmd === 'string' && !plan.cmd.includes('{file}')) bad('cmd must contain {file}');
  if (plan?.cover !== undefined && !(typeof plan.cover === 'string' && plan.cover.includes('{out}'))) bad('cover must be a command containing {out} (an lcov file it writes; {files} = the group test files)');
  if (plan?.integration !== undefined && !(relPath(plan.integration?.file) && squash(plan.integration?.goal))) bad('integration needs a relative file and a goal');
  if (plan?.rounds !== undefined && !(Number.isInteger(plan.rounds) && plan.rounds >= 1 && plan.rounds <= 4)) bad('rounds must be an integer from 1 to 4 (repair rounds per stage before a group is blocked)');
  if (plan?.maxRepairs !== undefined && !(Number.isInteger(plan.maxRepairs) && plan.maxRepairs >= 0 && plan.maxRepairs <= 40)) bad('maxRepairs must be an integer from 0 to 40 (repair passes for the whole run; groups still failing then are paused, not blocked)');
  if (plan?.smoke !== undefined && !(Array.isArray(plan.smoke) && plan.smoke.length >= 1 && plan.smoke.length <= 3 && plan.smoke.every(relPath))) bad('smoke must list 1 to 3 relative test files that already pass at the base (plan runs one first: it proves the sandbox and the test command work)');
  for (const n of plan?.link ?? []) if (!relPath(n)) bad(`link ${JSON.stringify(n)} must be a normalized relative path inside the repo`);
  for (const p of plan?.ro ?? []) if (typeof p !== 'string' || !p.startsWith('/')) bad(`ro ${JSON.stringify(p)} must be an absolute path`);
  for (const e of plan?.env ?? []) if (!/^[A-Za-z_]\w*=/.test(String(e))) bad(`env ${JSON.stringify(e)} must be K=V`);
  const groups = Array.isArray(plan?.groups) ? plan.groups : [], dod = Array.isArray(plan?.dod) ? plan.dod : [];
  if (!groups.length) bad('at least one group is required');
  if (!dod.length) bad('at least one DoD item is required');

  const dodIds = new Set();
  for (const d of dod) {
    if (!DOD_ID.test(d?.id ?? '')) { bad(`DoD id ${JSON.stringify(d?.id)} must match ${DOD_ID}`); continue; }
    if (dodIds.has(d.id)) bad(`DoD id ${d.id} is repeated`);
    dodIds.add(d.id);
    if (!squash(d.text)) bad(`${d.id}: text is required`);
    const kinds = d.kinds ?? KINDS;
    if (!Array.isArray(kinds) || !kinds.length || kinds.some(k => !KINDS.includes(k))) bad(`${d.id}: kinds must be a non-empty subset of ${KINDS}`);
    const src = squash(d.source);
    if (!src) bad(`${d.id}: source is required (a verbatim quote from the ticket or request, or "assumed")`);
    else if (src !== 'assumed' && ticketText !== undefined && !squash(ticketText).includes(src)) bad(`${d.id}: source quote not found in the ticket; quote it verbatim or write "assumed"`);
  }

  const gids = new Set(), owner = new Map(), assigned = new Set();
  for (const g of groups) {
    if (!GROUP_ID.test(g?.id ?? '')) { bad(`group id ${JSON.stringify(g?.id)} must match ${GROUP_ID}`); continue; }
    if (gids.has(g.id)) bad(`group ${g.id} is repeated`);
    gids.add(g.id);
    for (const k of ['tests', 'src']) {
      if (!Array.isArray(g[k]) || !g[k].length) bad(`${g.id}: ${k} must list at least one file`);
      for (const f of g[k] ?? []) {
        if (!relPath(f)) bad(`${g.id}: ${f} must be a normalized relative path inside the repo`);
        else if (owner.has(f)) bad(`${f} is owned by both ${owner.get(f)} and ${g.id}: one owner per file`);
        else owner.set(f, g.id);
      }
    }
    if (!Array.isArray(g.dod) || !g.dod.length) bad(`${g.id}: dod must list the DoD ids this group covers`);
    for (const id of g.dod ?? []) { if (!dodIds.has(id)) bad(`${g.id}: unknown DoD id ${id}`); assigned.add(id); }
  }
  for (const id of dodIds) if (!assigned.has(id)) bad(`DoD ${id} is covered by no group`);

  const after = new Map(groups.filter(g => gids.has(g?.id)).map(g => [g.id, Array.isArray(g.after) ? g.after : []]));
  for (const [id, deps] of after) for (const d of deps) if (!gids.has(d) || d === id) bad(`${id}: after names unknown or own group ${d}`);
  const state = new Map();
  const cyclic = id => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    const hit = (after.get(id) ?? []).some(d => gids.has(d) && cyclic(d));
    state.set(id, 2);
    return hit;
  };
  if ([...after.keys()].some(cyclic)) bad('after edges form a cycle');
  return errors;
}

/**
 * The group's DoD items against the rows its red-driver wrote.
 * items = [{id, kinds}], rows = [{dod, kind, test, file}], files = the group's test files.
 * A row counts only if: its DoD id is known and its kind valid, its file is one of the group's, its test name carries the id SET APART by non-alphanumerics
 * (test_ac1_happy; ac10 never serves ac1), and that test name does not already stand for another (dod, kind).
 * -> { missing: [{dod, kind}] required pairs with no valid row, bad: [{row, why}] rows that cannot count, good: the rows that can }
 */
export function checkMatrix(items, rows, files) {
  const good = [], bad = [], used = {};
  for (const r of rows || []) {
    const it = items.find(i => i.id === (r && r.dod)), name = String((r && r.test) || ''), key = r && r.file + '::' + name;
    const carries = !!it && new RegExp('(^|[^A-Za-z0-9])' + it.id + '($|[^A-Za-z0-9])', 'i').test(name);
    const why = !it ? 'unknown DoD id' : !['happy', 'fail', 'edge'].includes(r.kind) ? 'kind must be happy, fail or edge'
      : !files.includes(r.file) ? 'file is not one of the group test files' : !carries ? 'test name must carry its DoD id set apart by non-alphanumerics (test_' + it.id.toLowerCase() + '_happy)'
      : used[key] && used[key] !== r.dod + '/' + r.kind ? 'test ' + name + ' already stands for ' + used[key] : '';
    if (why) bad.push({ row: r, why }); else { used[key] = used[key] || r.dod + '/' + r.kind; good.push(r); }
  }
  const missing = [];
  for (const it of items) for (const k of it.kinds) if (!good.some(r => r.dod === it.id && r.kind === k)) missing.push({ dod: it.id, kind: k });
  return { missing, bad, good };
}

const NO_TESTS = /collected 0 items|no tests ran|no tests found|0 tests? (ran|found|passed)/i;
const LOAD_ERROR = /ModuleNotFoundError|ImportError|Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError|error TS\d+|cannot find symbol|undefined reference|error during collection|ERROR collecting/i;
/** RED means "fails now". The class says how: an assertion (fails), a load error before any assertion (fails-to-load), or not at all (passes-already). Exit 86 (no sandbox) and 127 (the command cannot start) say nothing about the test. */
export function classifyRed({ exit, tail }) {
  if (exit === 86 || exit === 127) return 'unverifiable';
  if (exit === 124) return 'timeout';
  if (exit === 0) return 'passes-already';
  if (NO_TESTS.test(tail || '')) return 'no-tests';
  return LOAD_ERROR.test(tail || '') ? 'fails-to-load' : 'fails';
}
const RED_OK = new Set(['fails', 'fails-to-load']);
export const redOk = tests => tests.length > 0 && tests.every(t => RED_OK.has(t.verdict));

const DEFECT_CAP = 6;
const RED_WHY = { 'passes-already': 'it passes without new code, so it pins no new behavior', missing: 'the file does not exist', 'no-tests': 'it holds no test', unverifiable: 'the sandbox could not run it', timeout: 'it timed out' };
/** RED gate file -> the defects a maker must fix (what a RED navigator would report), read from the gate's own facts, not from anyone's words. */
export function defectsFromRed(gate) {
  return (gate?.tests ?? []).filter(t => !RED_OK.has(t.verdict)).slice(0, DEFECT_CAP).map(t => ({ cls: 'test', file: t.file, what: `RED gate: ${t.file} is ${t.verdict}: ${RED_WHY[t.verdict] ?? 'it must fail now for the right reason'}` }));
}
/**
 * GREEN gate file -> defects, classed the way the green navigator is told to: code that does not pass or a flaky run = impl, a test that pins nothing or a surviving mutant or
 * too little coverage = gap (strengthen), changed tests = test (restore). A reason the structure does not name still becomes an impl defect, never silence. Worst first, capped.
 */
export function defectsFromGreen(gate) {
  const tests = gate?.tests ?? [], impl = [], test = [], gap = [];
  for (const t of tests) {
    if (t.verdict === 'exercises-change') continue;
    if (t.verdict === 'no-signal') gap.push({ cls: 'gap', file: t.file, what: `${t.file} passes without the group's code, so it pins nothing: assert the new behavior` });
    else impl.push({ cls: 'impl', file: t.file, what: `${t.file} is ${t.verdict}${t.reason ? ` (${t.reason})` : ''}: it does not pass with the group's code` });
  }
  if (tests.some(t => t.nondeterministic)) impl.push({ cls: 'impl', what: 'flaky: the 3 runs disagree: make the code under test deterministic, or report the test under testDefects' }); // the restore maker cannot fix it: only the code maker can
  if ((gate?.reasons ?? []).some(r => r.startsWith('tests changed since RED')) && gate?.frozen?.changed?.length) test.push({ cls: 'test', file: gate.frozen.changed[0], what: `tests changed since RED: ${gate.frozen.changed.join(', ')}` });
  for (const s of gate?.mutation?.survivors ?? []) gap.push({ cls: 'gap', file: s.file, line: s.line, what: `mutant ${s.id} survived (${s.op}): ${String(s.before ?? '').trim().slice(0, 60)} -> ${String(s.after ?? '').trim().slice(0, 60)}; no test pins that code` });
  const cov = gate?.coverage;
  if (cov?.pct != null && cov.pct < cov.min) gap.push({ cls: 'gap', what: `changed-line coverage ${cov.pct}% < ${cov.min}%${Object.keys(cov.uncovered ?? {}).length ? `; uncovered ${Object.entries(cov.uncovered).slice(0, 3).map(([f, ls]) => `${f}:${ls.slice(0, 5).join(',')}`).join(' ')}` : ''}` });
  const all = [...impl, ...test, ...gap];
  return (all.length ? all : (gate?.ok === false ? (gate.reasons ?? []).map(what => ({ cls: 'impl', what })) : [])).slice(0, DEFECT_CAP);
}

/** `git diff --numstat` text -> { changed: paths, removed: deleted line count } (binary files count as changed) */
export function parseNumstat(text) {
  const rows = String(text).split('\n').filter(Boolean).map(l => { const [, d, ...p] = l.split('\t'); return { path: p.join('\t'), removed: d === '-' ? 0 : Number(d) || 0 }; });
  return { changed: rows.map(r => r.path), removed: rows.reduce((s, r) => s + r.removed, 0) };
}

/** files that are not in `allowed` (a Set) */
export const outOfScope = (changed, allowed) => changed.filter(f => !allowed.has(f));

/** lcov text -> Map(file -> Map(line -> hits)) */
export function parseLcov(text) {
  const out = new Map();
  let cur = null;
  for (const l of String(text).split('\n')) {
    if (l.startsWith('SF:')) { cur = new Map(); out.set(l.slice(3).trim(), cur); }
    else if (cur && l.startsWith('DA:')) { const [n, h] = l.slice(3).split(','); cur.set(Number(n), Number(h)); }
    else if (l.startsWith('end_of_record')) cur = null;
  }
  return out;
}
/** changed = Map(file -> new-side line numbers). Only instrumented lines count; a file with no lcov entry goes to noData. */
export function changedCoverage(lcov, changed) {
  let covered = 0, total = 0;
  const uncovered = {}, noData = [];
  for (const [file, lines] of changed) {
    const key = [...lcov.keys()].find(k => k === file || k.endsWith(`/${file}`));
    if (!key) { noData.push(file); continue; }
    const da = lcov.get(key);
    for (const n of lines) {
      if (!da.has(n)) continue;
      total++;
      if (da.get(n) > 0) covered++; else (uncovered[file] ??= []).push(n);
    }
  }
  return { covered, total, pct: total ? Math.round((covered * 1000) / total) / 10 : null, uncovered, noData };
}

const stemOf = p => posix.basename(p).replace(/\.[^.]+$/, '');
/** existing test files (not the group tests) that mention a changed source module by name; heuristic, over-approximates on purpose */
export function pickAffected(testPaths, textOf, srcPaths, own, cap = 12) {
  const stems = [...new Set(srcPaths.map(stemOf).filter(s => s.length >= 3 && !/^(index|main|init|__init__)$/.test(s)))];
  const re = stems.length ? new RegExp(`\\b(${stems.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`) : null;
  const hit = re ? testPaths.filter(p => !own.has(p) && re.test(textOf(p))).sort() : [];
  return { run: hit.slice(0, cap), more: Math.max(0, hit.length - cap) };
}

/**
 * The DoD closure: for every item and required kind, is there a row whose test file FAILED at RED and PASSES at GREEN?
 * rows = { group: [row] }, red/green = { group: { file: verdict } } and greenOk = { group: boolean } read from the gate files (T0), never from an agent's claim.
 * A row is re-validated here (checkMatrix: id carried, one test = one pair, the group's own file); a `late` row (written by a strengthening pass after GREEN)
 * cannot have failed at RED, so it never credits a pair; a group whose last GREEN gate was not ok credits nothing.
 */
export function closure(plan, rows, red, green, greenOk = {}) {
  const valid = Object.fromEntries(plan.groups.map(g => [g.id, checkMatrix(g.dod.map(id => ({ id, kinds: [] })), rows[g.id] ?? [], g.tests).good.filter(r => !r.late)]));
  const items = plan.dod.map(d => {
    const need = d.kinds ?? KINDS, groups = plan.groups.filter(g => g.dod.includes(d.id));
    const kinds = Object.fromEntries(need.map(k => {
      const mine = groups.flatMap(g => valid[g.id].filter(r => r.dod === d.id && r.kind === k).map(r => ({ ...r, group: g.id })));
      const proven = mine.filter(r => greenOk[r.group] !== false && RED_OK.has(red[r.group]?.[r.file]) && green[r.group]?.[r.file] === 'exercises-change');
      const status = proven.length ? 'covered' : mine.length ? 'unproven' : 'missing';
      return [k, { status, tests: (proven.length ? proven : mine).map(r => r.test) }];
    }));
    return { id: d.id, text: d.text, source: d.source === 'assumed' ? 'assumed' : 'quoted', reduced: need.length < KINDS.length, kinds };
  });
  const pairs = items.flatMap(i => Object.entries(i.kinds).map(([kind, v]) => ({ dod: i.id, kind, ...v })));
  return { items, covered: pairs.filter(p => p.status === 'covered').length, total: pairs.length, gaps: pairs.filter(p => p.status !== 'covered').map(p => `${p.dod}/${p.kind}: ${p.status}`) };
}

/** `ID:kind:test:file` (the --row of `tdd.mjs dod`) -> row, or null. The file is what follows the LAST colon, so a test name may hold one. */
export function parseRow(text) {
  const t = String(text), i = t.indexOf(':'), j = t.indexOf(':', i + 1), k = t.lastIndexOf(':');
  return i < 1 || j < 0 || k <= j ? null : { dod: t.slice(0, i), kind: t.slice(i + 1, j), test: t.slice(j + 1, k), file: t.slice(k + 1) };
}

/**
 * The closure of ONE group while it is still being built: its own items and rows, judged by the same rules as the whole-run closure.
 * stage 'red': a pair counts when its test is a valid row whose file failed at RED (GREEN does not exist yet); stage 'green': the full closure.
 * An item that another group also owns can be closed there, so its gaps are listed as `shared`, not as blockers.
 * -> { covered, total, gaps (blocking), shared, items }
 */
export function groupClosure(plan, gid, rows, red, green, greenOk, stage = 'green') {
  const g = plan.groups.find(x => x.id === gid), mine = plan.dod.filter(d => g.dod.includes(d.id));
  const assumed = stage === 'red' ? Object.fromEntries(g.tests.map(f => [f, 'exercises-change'])) : green;
  const c = closure({ groups: [g], dod: mine }, { [gid]: rows }, { [gid]: red }, { [gid]: assumed }, stage === 'red' ? {} : { [gid]: greenOk });
  const shared = new Set(mine.filter(d => plan.groups.some(o => o.id !== gid && o.dod.includes(d.id))).map(d => d.id));
  const blocking = c.gaps.filter(x => !shared.has(x.split('/')[0])), loose = c.gaps.filter(x => shared.has(x.split('/')[0]));
  return { ...c, gaps: blocking, shared: loose, covered: c.covered, total: c.total };
}

export function closureMarkdown(c) {
  const cell = v => (v ? `${v.status === 'covered' ? 'ok' : v.status.toUpperCase()}${v.tests.length ? ` ${v.tests.join(', ')}` : ''}` : '-');
  return [`DoD closure: ${c.covered}/${c.total} required (item, kind) pairs covered by a test that failed at RED and passes at GREEN`, '',
    '| DoD | source | happy | fail | edge |', '|---|---|---|---|---|',
    ...c.items.map(i => `| ${i.id} ${i.text.slice(0, 60)}${i.reduced ? ' (reduced kinds)' : ''} | ${i.source} | ${cell(i.kinds.happy)} | ${cell(i.kinds.fail)} | ${cell(i.kinds.edge)} |`),
    ...(c.gaps.length ? ['', `Gaps: ${c.gaps.join('; ')}`] : [])].join('\n');
}
