#!/usr/bin/env node
// "No guessing" gate of zero-trust-review: re-checks every cluster's proof against ground truth (the code at HEAD, the sandbox run ledger,
// the telemetry ledger) in plain code, zero LLM tokens. A claim whose proof does not check out is downgraded to 'unproven' and listed for the human.
//   node proofcheck.mjs --ret RET.json --repo DIR --head REV [--run DIR] [--out DIR]
// The run dir comes only from runctx.resolveRun (--run, $ZT_RUN_DIR, per-user marker) and must be ours and closed to others; each ledger file must be a
// regular, own, not group/world-writable file opened without following links, else it is 'ledger not trusted'. --out defaults to the run dir. Writes OUT/verified.json and
// OUT/evidence.md, prints the adjusted cluster list as JSON, exits 0 (results are data); usage errors exit 2. REPO is only read (rev-parse, cat-file).
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkRunDir, resolveRun, writeSafe } from './runctx.mjs';

const TOLERANCE = 2, LIST_MAX = 20, ITEM_CUT = 160, TITLE_CUT = 100, CMD_CUT = 100, RAN_MAX = 40;
const BUDGET = { table: 1300, unproven: 600, unverified: 500, notReviewed: 350, questions: 600, ran: 1500 }; // bytes per evidence.md block; keeps the file near 6 KB
const REAL_BACKENDS = new Set(['seatbelt', 'bwrap', 'docker']); // sandbox-run.mjs also has 'passthrough' (tests only, unsandboxed): that is not a real run
const UNTRUSTED = 'ledger not trusted'; // sentinel in ctx.exec/ctx.obs: the file is there but cannot be believed
const CONFIRMED = new Set(['confirmed', 'confirmed-by-trace']);
const LOW_FINAL = new Set(['refuted', 'out-of-scope', 'disputed', 'unverifiable']); // agents already ruled on these; a low cluster's own quote cannot overturn that

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const has = (hay, quote) => quote !== '' && typeof hay === 'string' && norm(hay).includes(quote); // quote is already normalized; '' would match everything
const cut = (s, n) => norm(s).slice(0, n);
const asText = x => (typeof x === 'string' ? x : JSON.stringify(x));

function git(repo, args) {
  try { return execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
  catch (e) { throw new Error(`git ${args[0]}: ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
}

// Proof refs are model-written: a path only ever reaches git as <sha>:<path>, never the file system.
function headFile(ctx, path) {
  if (!path || path.startsWith('/') || path.includes('\0') || path.split('/').includes('..')) return null;
  if (!ctx.files.has(path)) {
    let text = null;
    try { text = git(ctx.repo, ['cat-file', 'blob', `${ctx.head}:${path}`]); } catch { /* not a blob at HEAD */ }
    ctx.files.set(path, text);
  }
  return ctx.files.get(path);
}

function verifyRead(ctx, { path, start, end }, quote) {
  const text = headFile(ctx, path);
  if (text === null) return 'file not at HEAD';
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (!(start >= 1 && end >= start && end <= lines.length)) return 'lines out of range';
  const window = lines.slice(Math.max(1, start - TOLERANCE) - 1, Math.min(lines.length, end + TOLERANCE)).join(' ');
  return has(window, norm(quote)) ? null : 'quote not found in lines';
}

const parseReadRef = ref => {
  const m = /^(.*):(\d+)(?:-(\d+))?$/.exec(ref);
  return m ? { path: m[1], start: +m[2], end: +(m[3] ?? m[2]) } : { path: ref };
};

// ref is an obs id, or a tool name (a model rarely knows the harness's internal call id): then any entry of that tool may hold the quote
const verifyObs = (ctx, p) => {
  if (ctx.obs === UNTRUSTED) return UNTRUSTED;
  if (!ctx.obs) return 'no telemetry ledger (hook not installed)';
  const hits = ctx.obs.filter(x => x.id === p.ref || x.tool === p.ref);
  if (!hits.length) return 'observation not in ledger';
  return hits.some(x => has(x.out, norm(p.quote))) ? null : 'quote not in output';
};

const VERIFY = {
  read: (ctx, p) => verifyRead(ctx, parseReadRef(p.ref), p.quote),
  executed(ctx, p) {
    if (ctx.exec === UNTRUSTED) return UNTRUSTED;
    const same = ctx.exec?.filter(x => x.id === p.ref) ?? [];
    if (!same.length) return 'run id not in ledger';
    if (new Set(same.map(x => JSON.stringify(x))).size > 1) return 'conflicting duplicate run id'; // a forged line cannot shadow a real one
    const [e] = same;
    if (!REAL_BACKENDS.has(e.backend)) return 'not run in a real sandbox backend';
    if (p.exit != null && Number(e.exit) !== Number(p.exit)) return 'exit mismatch';
    return has(e.out, norm(p.quote)) ? null : 'quote not in output';
  },
  log: verifyObs, metric: verifyObs, trace: verifyObs,
};

function check(ctx, proof) {
  const mode = String(proof?.mode ?? 'none'), ref = proof?.ref;
  const reason = Object.hasOwn(VERIFY, mode) ? VERIFY[mode](ctx, { ...proof, ref: String(ref ?? '') }) : `not verifiable (${mode})`;
  return { ok: !reason, mode, ref, reason: reason ?? undefined };
}

// A low cluster never goes to an agent: its own quote, checked as a read proof at its own location, is the whole verification.
const lowProof = c => ({ mode: 'read', ref: `${c.file}:${c.startLine}-${c.endLine ?? c.startLine}`, quote: c.quote });

function adjust(ctx, c) {
  const was = c.status;
  if (c.severity === 'low' && !LOW_FINAL.has(was)) {
    const k = check(ctx, lowProof(c));
    return k.ok ? { ...c, status: 'confirmed', evidence: 'read', was, check: k } : { ...c, status: 'unproven', evidence: 'inferred', was, check: k };
  }
  const k = check(ctx, c.proof);
  if (!CONFIRMED.has(was)) return { ...c, check: k }; // never upgrade what the agents did not confirm
  if (!k.ok) return { ...c, status: 'unproven', evidence: 'inferred', was, check: k };
  return { ...c, status: 'confirmed', evidence: k.mode, ...(was === 'confirmed' ? {} : { was }), check: k };
}

const bytes = s => Buffer.byteLength(s) + 1;
const capped = (lines, max, extra = 0) => {
  let used = 0, n = 0;
  while (n < lines.length && used + bytes(lines[n]) <= max) used += bytes(lines[n++]);
  const more = lines.length - n + extra;
  return more ? [...lines.slice(0, n), `\n(+${more} more)`] : lines;
};
const bullets = (items, max) => capped(items.slice(0, LIST_MAX).map(x => `- ${cut(asText(x), ITEM_CUT)}`), max, Math.max(0, items.length - LIST_MAX));
const cell = (s, n) => cut(s, n).replaceAll('|', '\\|');

function evidenceMd(ctx, ret, after, counts) {
  const rows = after.map(c => `| ${cell(c.id, 40)} | ${cell(c.severity, 12)} | ${cell(c.status, 24)} | ${cell(c.check.mode, 12)} | ${cell(c.check.ref, 60)} | ${c.check.ok ? 'OK' : `FAIL: ${cell(c.check.reason, 80)}`} |`);
  const unproven = after.filter(c => c.status === 'unproven').map(c => `- ${cut(c.id, 40)} (${c.severity}): ${cut(c.title, TITLE_CUT)} -- ${cut(c.check.reason, 80)}`);
  const group = (name, lines) => (lines.length ? [`${name}:`, ...lines, ''] : []);
  const noted = [...group('Unproven', capped(unproven, BUDGET.unproven)), ...group('Unverified', bullets(ret.unverified ?? [], BUDGET.unverified)),
    ...group('Not reviewed', bullets(ret.notReviewed ?? [], BUDGET.notReviewed)), ...group('Questions', bullets(ret.questions ?? [], BUDGET.questions))];
  const execRows = Array.isArray(ctx.exec) ? ctx.exec : [];
  const ran = execRows.slice(0, RAN_MAX).map(e => `- ${cut(e.id, 40)} exit=${e.exit} sec=${e.sec} ${cut(e.cmd.join(' '), CMD_CUT)}`.trimEnd());
  return [
    '# Proofcheck: noted for review', '',
    `head ${ctx.head} | clusters ${after.length}${Object.entries(counts).map(([k, v]) => ` | ${k} ${v}`).join('')}`, '',
    '| cluster | severity | status | proof mode | ref | check |', '|---|---|---|---|---|---|', ...capped(rows, BUDGET.table), '',
    '## Noted for review (not verified, do not treat as fact)', '', ...(noted.length ? noted : ['Nothing.', '']),
    '## What actually ran', '', ...(ran.length ? capped(ran, BUDGET.ran, Math.max(0, execRows.length - RAN_MAX)) : [ctx.exec === UNTRUSTED ? `exec ledger ${UNTRUSTED}, ignored.` : 'No runs recorded.']),
    '', `obs entries: ${Array.isArray(ctx.obs) ? ctx.obs.length : 0}${ctx.obs === UNTRUSTED ? ` (${UNTRUSTED}, ignored)` : ctx.obs ? '' : ' (no telemetry ledger)'}`, '',
  ].join('\n');
}

// A row counts only in its own ledger, so command output redirected into obs.jsonl can never verify a log/metric/trace proof
// and a hand-written obs row can never verify an executed proof. exec rows are what sandbox-run.mjs writes; obs rows what zt-capture writes.
const idOf = x => (typeof x === 'string' && x !== '' ? x : typeof x === 'number' ? String(x) : undefined);
const text = x => typeof x === 'string';
const SHAPE = {
  exec: o => text(o.id) && o.id !== '' && Array.isArray(o.cmd) && Number.isInteger(o.exit) && text(o.out),
  obs: o => idOf(o.id) !== undefined && text(o.tool) && o.tool.startsWith('mcp__') && text(o.out) && !('cmd' in o) && !('backend' in o),
};
const wellFormed = (kind, o) => (o && typeof o === 'object' && !Array.isArray(o) && SHAPE[kind](o) ? { ...o, id: String(o.id) } : null);

// null = no such file; UNTRUSTED = no trusted run dir, or the file is there but a symlink / not ours / writable by others (checked on the open fd, so no swap can slip in); else the well-formed entries.
function ledgerRows(run, name, kind) {
  if (!run) return UNTRUSTED; // no run dir we can trust: nothing it holds can be believed
  let fd;
  try {
    fd = openSync(join(run, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile() || (typeof process.getuid === 'function' && st.uid !== process.getuid()) || (st.mode & 0o022) !== 0) return UNTRUSTED;
    return readFileSync(fd, 'utf8').split('\n').flatMap(l => { try { const o = wellFormed(kind, JSON.parse(l)); return o ? [o] : []; } catch { return []; } }); // a torn line is not fatal
  } catch (e) { return e.code === 'ENOENT' ? null : UNTRUSTED; } // ELOOP (symlink), EISDIR, EACCES...: present but not believable
  finally { if (fd !== undefined) closeSync(fd); }
}

function main() {
  const str = { type: 'string' };
  const { values: v } = parseArgs({ options: { ret: str, repo: str, head: str, run: str, out: str } });
  for (const k of ['ret', 'repo', 'head']) if (!v[k]) throw new Error(`--${k} is required`);
  if (v.head.startsWith('-')) throw new Error('--head must be a revision, not an option');
  const run = resolveRun({ run: v.run, env: process.env }), out = v.out ? resolve(v.out) : run;
  if (!out) throw new Error('no --out and no run dir (--run, $ZT_RUN_DIR, or the per-user marker; each must be ours and closed to others)');
  let ret;
  try { ret = JSON.parse(readFileSync(v.ret, 'utf8')); } catch (e) { throw new Error(`cannot read --ret: ${e.message}`); }
  const repo = resolve(v.repo);
  const ctx = { repo, head: git(repo, ['rev-parse', '--verify', '--quiet', `${v.head}^{commit}`]).trim(), files: new Map(),
    exec: ledgerRows(run, 'exec.jsonl', 'exec'), obs: ledgerRows(run, 'obs.jsonl', 'obs') };
  const before = Array.isArray(ret?.clusters) ? ret.clusters : [], after = before.map(c => adjust(ctx, c));
  const counts = {};
  for (const c of after) counts[c.status ?? 'unknown'] = (counts[c.status ?? 'unknown'] ?? 0) + 1;
  const verified = { counts, clusters: after.map((c, i) => ({ id: c.id, severity: c.severity, was: before[i].status, status: c.status, evidence: c.evidence, check: c.check })) };
  mkdirSync(out, { recursive: true, mode: 0o700 }); // an existing dir is left as it is, then judged below
  const outDir = checkRunDir(out);
  if (!outDir) throw new Error(`unsafe --out dir (must be ours, not a symlink, not group/world-writable): ${out}`);
  writeSafe(outDir, join(outDir, 'verified.json'), JSON.stringify(verified, null, 2) + '\n');
  writeSafe(outDir, join(outDir, 'evidence.md'), evidenceMd(ctx, ret ?? {}, after, counts));
  process.stdout.write(JSON.stringify(after) + '\n');
}

try { main(); } catch (e) { console.error(`proofcheck: ${e.message}`); process.exit(2); }
