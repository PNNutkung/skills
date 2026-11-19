#!/usr/bin/env node
// No proof, no finding: re-checks every proof the agent wrote against ground truth in plain code, then writes the markdown report.
//   node findings.mjs --run DIR --repo DIR --head REV --findings FILE [--inventory FILE] [--out FILE]
// Ground truth: the repo at HEAD (git show, never the working tree), and in the run dir exec.jsonl (runner ledger), answers.md, ticket.md.
// A finding whose proof fails is listed under Unverified with its reasons, never dropped.
// Prints {report, verified, unverified, unconfirmed} (counts). Exit: 0 ok; 2 usage error; 1 other error.
import { execFileSync } from 'node:child_process';
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { touch } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZT = resolve(process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review'));
// Resolved once at import, never throws: without zero-trust-review no ledger is trusted and the CLI cannot write.
const zt = existsSync(join(ZT, 'runctx.mjs')) ? await import(pathToFileURL(join(ZT, 'runctx.mjs')).href).catch(() => null) : null;

const TOLERANCE = 2; // lines of slack around a quoted ref, as in zero-trust-review/proofcheck.mjs
const REAL_BACKENDS = new Set(['direct', 'seatbelt', 'bwrap', 'docker']); // passthrough is not a real run
const MUTANT = /^ZT-MUTANT \S+ \S+:\d+ \S+ exit=(\d+)$/;
const REF_RE = /^(.+):(\d+)$/;
const HEAD_RE = /^[A-Za-z0-9][\w./@^~{}-]*$/;
const NOT_TRUSTED = 'ledger not trusted';
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const has = (hay, quote) => norm(quote) !== '' && norm(hay).includes(norm(quote));
const ok = () => ({ ok: true });
const bad = reason => ({ ok: false, reason });

// Same checks as proofcheck.mjs opens its ledgers with: regular file, own uid, not group/world-writable, no symlink.
function readTrusted(runDir, name) {
  let fd;
  try {
    fd = openSync(join(runDir, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile() || (typeof process.getuid === 'function' && st.uid !== process.getuid()) || (st.mode & 0o022) !== 0) return { untrusted: true };
    const buf = Buffer.alloc(st.size);
    readSync(fd, buf, 0, st.size, 0);
    return { text: buf.toString('utf8') };
  } catch (e) {
    return e.code === 'ENOENT' ? { text: null } : { untrusted: true };
  } finally { if (fd !== undefined) closeSync(fd); }
}

function gitShow(repo, head, path) {
  if (!HEAD_RE.test(head ?? '') || path.startsWith('/') || path.split('/').includes('..')) return null;
  try { return execFileSync('git', ['-C', repo, 'show', `${head}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 }); } catch { return null; }
}

/** The only function that does I/O: everything the checks need, so they stay pure. `requirements` is the input's list, looked up by id. */
export function loadContext({ run, repo, head, requirements = [], tmp }) {
  // resolveRun trusts only a run under the per-user base (or the marker's); a fallback to some other run is refused
  const dir = zt && zt.resolveRun({ run, tmp }) === zt.checkRunDir(run, { tmp }) ? zt.resolveRun({ run, tmp }) : '';
  const read = name => (dir ? readTrusted(dir, name) : { untrusted: true });
  const led = read('exec.jsonl'), ans = read('answers.md'), tkt = read('ticket.md');
  const ledger = led.text == null ? null : new Map();
  for (const l of led.text?.split('\n') ?? []) { try { const e = JSON.parse(l); if (e?.id) ledger.set(e.id, [...(ledger.get(e.id) ?? []), e]); } catch { /* skip a bad line */ } }
  const files = new Map();
  const show = path => { if (!files.has(path)) files.set(path, gitShow(repo, head, path)); return files.get(path); };
  return { run, repo, head, requirements, ledger, ledgerUntrusted: !!led.untrusted, answers: ans.text, ticket: tkt.text, show };
}

function checkCode({ ref, quote }, ctx) {
  const m = REF_RE.exec(String(ref ?? ''));
  if (!m) return bad(`bad ref ${ref}`);
  if (norm(quote) === '') return bad('empty quote');
  const text = ctx.show(m[1]);
  if (text == null) return bad(`cannot read ${m[1]} at ${ctx.head}`);
  const lines = text.split('\n'), line = Number(m[2]);
  const window = lines.slice(Math.max(1, line - TOLERANCE) - 1, line + TOLERANCE).join(' ');
  return has(window, quote) ? ok() : bad(`quote not found within ${TOLERANCE} lines of ${ref}`);
}

function checkRun({ ref, exit, quote }, ctx) {
  if (ctx.ledgerUntrusted || ctx.ledger == null) return bad(NOT_TRUSTED);
  const same = ctx.ledger.get(ref) ?? [];
  if (!same.length) return bad(`run ${ref} not in ledger`);
  if (new Set(same.map(x => JSON.stringify(x))).size > 1) return bad('conflicting duplicate run id'); // a forged line cannot shadow a real one
  const [e] = same;
  if (!REAL_BACKENDS.has(e.backend)) return bad(`backend ${e.backend} is not a real run`);
  if (exit !== undefined && e.exit !== exit) return bad(`run ${ref} exit is ${e.exit}, not ${exit}`);
  if (norm(quote) === '') return bad('empty quote');
  return has(e.out, quote) ? ok() : bad(`quote not found in output of run ${ref}`);
}

export function checkProof(proof, ctx) {
  if (proof?.mode === 'code') return checkCode(proof, ctx);
  if (proof?.mode === 'executed') return checkRun(proof, ctx);
  return bad(`unknown proof mode ${proof?.mode}`);
}

export function checkSource({ source }, ctx) {
  const { kind, ref, quote } = source ?? {};
  if (kind === 'spec') return checkCode({ ref, quote }, ctx);
  if (kind === 'ticket') return has(ctx.ticket, quote) ? ok() : bad('quote not found in ticket');
  if (kind === 'user') {
    const m = /^A(\d+)$/.exec(String(ref ?? ''));
    const block = m && ctx.answers?.split(/^(?=A\d+: )/m).find(b => b.startsWith(`A${m[1]}: `));
    return block && has(block.slice(m[0].length + 1), quote) ? ok() : bad(`quote not found in answer ${ref}`);
  }
  return bad(`unknown source kind ${kind}`);
}

// a proof of the given mode that checks out, and satisfies `want`
const proven = (proofs, ctx, mode, want = () => true) => (proofs ?? []).some(p => p?.mode === mode && want(p) && checkProof(p, ctx).ok);
const mutant = p => MUTANT.exec(norm(p.quote));
const survivor = p => mutant(p)?.[1] === '0';
const killed = p => { const m = mutant(p); return !!m && m[1] !== '0'; };
const failing = p => typeof p.exit === 'number' && p.exit !== 0;
const passing = p => p.exit === 0;

export function checkFinding(finding, ctx) {
  const req = ctx.requirements?.find(r => r.id === finding?.requirement);
  const reasons = [];
  if (!req) reasons.push(`requirement ${finding?.requirement} not found`);
  else { const s = checkSource(req, ctx); if (!s.ok) reasons.push(`source of ${req.id}: ${s.reason}`); }
  const { proofs, kind, tier } = finding ?? {};
  // a coverage run counts only when its output names a file a verified code proof points at
  const files = (proofs ?? []).filter(p => p?.mode === 'code' && checkProof(p, ctx).ok).map(p => REF_RE.exec(p.ref)[1]);
  const covers = p => p.coverage === true && files.some(f => norm(p.quote).includes(f));
  const hasCoverage = (proofs ?? []).some(p => p?.mode === 'executed' && p.coverage === true);
  if (kind === 'test-gap') {
    const survives = proven(proofs, ctx, 'executed', survivor) || (tier === 'e2e' && proven(proofs, ctx, 'executed', covers));
    if (!survives) reasons.push(tier === 'e2e' && hasCoverage ? 'coverage proof does not name the implementing file' : 'no surviving mutant proof');
  }
  else if (kind === 'weak-test') {
    if (!proven(proofs, ctx, 'code')) reasons.push('no code proof');
    if (!proven(proofs, ctx, 'executed', survivor)) reasons.push('no surviving mutant proof');
  } else if (kind === 'defect') { if (!proven(proofs, ctx, 'executed', failing)) reasons.push('no failing run proof'); }
  else reasons.push(`unknown finding kind ${kind}`);
  for (const p of proofs ?? []) { const v = checkProof(p, ctx); if (!v.ok && !reasons.includes(v.reason)) reasons.push(v.reason); }
  return { ok: reasons.length === 0, reasons };
}

export function checkWritten(entry, ctx) {
  const { proofs } = entry ?? {}, reasons = [];
  if (!proven(proofs, ctx, 'executed', passing)) reasons.push('no passing run proof');
  if (!proven(proofs, ctx, 'executed', killed)) reasons.push('no killed mutant proof');
  return { ok: reasons.length === 0, reasons };
}

/** Verdicts aligned by index with the input's requirements, findings and tests_written. */
export function verifyAll(data, ctx) {
  const c = { ...ctx, requirements: data.requirements ?? ctx.requirements };
  const one = f => { const v = f(); return v.reasons ? v : { ok: v.ok, reasons: v.reason ? [v.reason] : [] }; };
  return {
    requirements: (data.requirements ?? []).map(r => one(() => checkSource(r, c))),
    findings: (data.findings ?? []).map(f => one(() => checkFinding(f, c))),
    written: (data.tests_written ?? []).map(w => one(() => checkWritten(w, c))),
  };
}

const SECTION_OF_KIND = { defect: 'Defects', 'weak-test': 'Weak tests', 'test-gap': 'Test gaps' };
// Agent text is data: collapse whitespace (no new lines, so no new headings or list items) and escape markdown metacharacters.
const esc = s => norm(s).replace(/([\\`*_{}[\]<>()#+!|~-])/g, '\\$1');
const proofLine = p => `  - proof: ${esc(p.mode)} ${esc(p.ref)}${p.exit === undefined ? '' : ` exit=${esc(p.exit)}`}${p.coverage ? ' coverage' : ''} "${esc(p.quote)}"`;
const sourceLine = s => `  - source: ${esc(s?.kind)} ${esc(s?.ref)} "${esc(s?.quote)}"`;
const item = (id, text, sub, reasons = []) => [`- **${esc(id)}** ${esc(text)}`, ...sub, ...reasons.map(r => `  - unverified: ${esc(r)}`)].join('\n');

export function renderReport(data, verdicts, inventory) {
  const sections = new Map(['Inventory', 'Requirements', 'Defects', 'Weak tests', 'Test gaps', 'Tests written', 'Unverified', 'Unconfirmed'].map(n => [n, []]));
  const put = (name, line) => sections.get(name).push(line);
  const route = (v, name) => (v.ok ? name : 'Unverified');
  if (inventory) put('Inventory', inventory.trim());
  (data.requirements ?? []).forEach((r, i) => { const v = verdicts.requirements[i]; put(route(v, 'Requirements'), item(r.id, `${r.text ?? ''} (${r.source?.kind}: ${r.source?.ref})`, [sourceLine(r.source)], v.reasons)); });
  (data.findings ?? []).forEach((f, i) => {
    const v = verdicts.findings[i];
    put(route(v, SECTION_OF_KIND[f.kind]), item(f.id, `${f.title ?? ''} [${f.kind}, ${f.tier}, ${f.requirement}]`, (f.proofs ?? []).map(proofLine), v.reasons));
  });
  (data.tests_written ?? []).forEach((w, i) => { const v = verdicts.written[i]; put(route(v, 'Tests written'), item(w.path, `for ${w.finding}`, (w.proofs ?? []).map(proofLine), v.reasons)); });
  (data.unconfirmed ?? []).forEach((u, i) => put('Unconfirmed', `- **U${i + 1}** ${esc(u.question)}: ${esc(u.behavior)}`));
  return '# QA sweep report\n\n' + [...sections].filter(([, l]) => l.length).map(([n, l]) => `## ${n}\n\n${l.join('\n')}\n`).join('\n');
}

function main(argv) {
  const fail = (code, msg) => { process.stderr.write(`qa-findings: ${msg}\n`); process.exit(code); };
  let v;
  try { v = parseArgs({ args: argv, options: { run: { type: 'string' }, repo: { type: 'string' }, head: { type: 'string' }, findings: { type: 'string' }, inventory: { type: 'string' }, out: { type: 'string' } } }).values; } catch (e) { fail(2, e.message); }
  if (!v.run || !v.repo || !v.head || !v.findings) fail(2, 'usage: findings.mjs --run DIR --repo DIR --head REV --findings FILE [--inventory FILE] [--out FILE]');
  let data, inventory;
  try { data = JSON.parse(readFileSync(v.findings, 'utf8')); if (!data || typeof data !== 'object') throw new Error('not an object'); } catch (e) { fail(2, `cannot read findings: ${e.message}`); }
  try { inventory = v.inventory ? readFileSync(v.inventory, 'utf8') : undefined; } catch (e) { fail(2, `cannot read inventory: ${e.message}`); }
  try {
    const verdicts = verifyAll(data, loadContext({ run: v.run, repo: v.repo, head: v.head, requirements: data.requirements }));
    const report = v.out ? resolve(v.out) : join(v.run, 'report.md');
    if (!zt) throw new Error(`the zero-trust-review skill is not at ${ZT} (set ZT_DIR)`);
    zt.writeSafe(v.run, report, renderReport(data, verdicts, inventory));
    const all = [...verdicts.requirements, ...verdicts.findings, ...verdicts.written];
    process.stdout.write(JSON.stringify({ report, verified: all.filter(x => x.ok).length, unverified: all.filter(x => !x.ok).length, unconfirmed: (data.unconfirmed ?? []).length }) + '\n');
  } catch (e) { fail(1, e.message); }
  try { touch({ session: process.env.CLAUDE_CODE_SESSION_ID }); } catch { /* the run marker is a convenience */ }
}

const direct = (() => { try { return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) main(process.argv.slice(2));
