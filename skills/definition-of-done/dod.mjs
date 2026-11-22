#!/usr/bin/env node
// CLI of the definition-of-done skill. Every command prints one JSON line on stdout.
//   open --repo DIR --slug SLUG          open a DoD session: run folder + marker (hooks/dod-guard.mjs reads it when DOD_GUARD=1)
//   check --dod FILE                     the gate: every item and required section quoted, no open question; on pass writes docs/dod/<slug>.md
//                                        (<slug>.md next to FILE when FILE is in the run folder: the ADR path, nothing of the DoD in the repo)
//   render --dod FILE [--lang en|th] [--fallback]
//                                        write <run>/ticket-new.md (the whole new ticket description); --fallback also writes docs/dod/<slug>.ticket.md
//   ticket-check --dod FILE [--posted F] every original sentence kept and every item on the checklist; --posted: the ticket as read back equals the approved text
//   tools --system S                     which tool writes the ticket: official CLI, trusted third-party CLI, ask the user to trust, or MCP / the file
//   export --dod FILE --to ptdd|qa --out DIR
//                                        ptdd: DIR/dod.json (plan.json dod[]) + DIR/dod-source.md (plan.json ticket); qa: DIR/requirements.json, answers.md, ticket.md
//   adr --dod FILE                       write the ADR draft (English) from the DoD, answers.md, questions.md and ticket.md: the repo's ADR folder,
//                                        the next number or this slug's existing file; refresh the index; install the pre-commit hook ($DOD_ADR_HOOK=0: no)
//   adr-check --dod FILE                 after you reorganized the draft: every quote, question, option, pro, con and answer kept; DoD section untouched
//   adrs [--repo DIR] --touches FILE...  the active ADRs whose touches match these files (no session needed)
//   adrs [--repo DIR] --sync [--staged]  follow staged renames in every ADR's touches and the index (--staged: git add them; the pre-commit hook)
//   adrs [--repo DIR] --install-hook     install the pre-commit hook (never over a hook it did not write)
//   approve                              USER ONLY: approve the rendered ticket text as it is now
//   trust --cli NAME                     USER ONLY: trust a third-party ticket CLI on this machine
//   close                                end the session (the run folder stays)
// Options for all: --session ID (default $CLAUDE_CODE_SESSION_ID). The run folder holds ticket.md and answers.md (qa-sweep's format).
// Exit: 0 ok; 1 the check failed or an error; 2 usage error, no session id or no open session.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkAdrSources, renderAdr } from './adr.mjs';
import { HOOK_ENV, adrTarget, findAdrsFor, installHook, repoFiles, stagedRenames, syncRepo, topLevel, writeIndex } from './adrio.mjs';
import { checkDod, exportPtdd, exportQa, renderMarkdown, renderTicket, ticketCheck } from './dodcheck.mjs';
import { RENDERED_FILE, approve, close, open, readActive, recordAdr, toolFor, touch, trust } from './session.mjs';

const COMMANDS = ['open', 'check', 'render', 'ticket-check', 'tools', 'export', 'adr', 'adr-check', 'adrs', 'approve', 'trust', 'close'];
const NEEDS_RUN = new Set(['check', 'render', 'ticket-check', 'export', 'adr', 'adr-check', 'approve']);
const DOD_MJS = fileURLToPath(import.meta.url);
const USAGE = `usage: dod.mjs ${COMMANDS.join(' | ')} [--session ID]; see the header of dod.mjs`;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

class Usage extends Error {}
const readOr = (f, fallback = '') => (existsSync(f) ? readFileSync(f, 'utf8') : fallback);

function context(active) {
  const show = path => {
    if (path.startsWith('/') || path.split('/').includes('..')) return null;
    try { return execFileSync('git', ['-C', active.repo, 'show', `HEAD:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 }); } catch { return null; }
  };
  return { answers: readOr(join(active.run, 'answers.md')), ticket: readOr(join(active.run, 'ticket.md')), questions: readOr(join(active.run, 'questions.md')), show };
}

function loadDod(file) {
  if (!file) throw new Usage('--dod FILE is required');
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`cannot read ${file}: ${e.message}`); }
}

export function run(cmd, v, env = process.env) {
  const session = v.session ?? env.CLAUDE_CODE_SESSION_ID;
  if (!COMMANDS.includes(cmd)) throw new Usage(USAGE);
  if (cmd === 'tools') { if (!v.system) throw new Usage('tools needs --system'); return toolFor({ system: v.system, env }); }
  if (cmd === 'trust') { if (!v.cli) throw new Usage('trust needs --cli NAME'); return trust({ cli: v.cli, env }); }
  if (cmd === 'adrs') return adrs(v, env);
  if (!session) throw new Usage('no session id: pass --session, or ask the user for it');
  if (cmd === 'open') { if (!v.repo || !v.slug) throw new Usage('open needs --repo DIR --slug SLUG'); return open({ repo: v.repo, slug: v.slug, session, env }); }
  if (cmd === 'close') return close({ session, env });
  if (cmd === 'export' && (!['ptdd', 'qa'].includes(v.to) || !v.out)) throw new Usage('export needs --to ptdd|qa and --out DIR');
  if (cmd !== 'approve' && !v.dod) throw new Usage(`${cmd} needs --dod FILE`);
  const active = NEEDS_RUN.has(cmd) ? readActive({ session, env }) : null;
  if (!active) throw new Usage('no active run: dod.mjs open first');
  touch({ session, env });
  if (cmd === 'approve') return approve({ session, env });

  const dod = loadDod(v.dod), ctx = context(active);
  const errors = checkDod(dod, ctx);
  if (cmd === 'check') {
    if (errors.length) return { ok: false, errors };
    // a DoD JSON kept in the run folder (the ADR path) keeps its .md there; otherwise docs/dod/<slug>.md in the repo, as before
    const inRun = resolve(v.dod).startsWith(realpathSync(active.run) + '/') || resolve(v.dod).startsWith(resolve(active.run) + '/');
    const md = inRun ? join(dirname(resolve(v.dod)), `${dod.slug}.md`) : join(active.repo, 'docs', 'dod', `${dod.slug}.md`);
    mkdirSync(dirname(md), { recursive: true });
    writeFileSync(md, renderMarkdown(dod));
    return { ok: true, items: dod.items.length, markdown: md };
  }
  if (errors.length) return { ok: false, errors: ['the DoD does not pass check; fix it first', ...errors] };

  const rendered = join(active.run, RENDERED_FILE);
  if (cmd === 'render') {
    const text = renderTicket(dod, ctx.ticket, { lang: v.lang });
    writeFileSync(rendered, text, { mode: 0o600 });
    const out = { ok: true, rendered };
    if (v.fallback) { out.fallback = join(active.repo, 'docs', 'dod', `${dod.slug}.ticket.md`); mkdirSync(dirname(out.fallback), { recursive: true }); writeFileSync(out.fallback, text); }
    return out;
  }
  if (cmd === 'ticket-check') {
    if (!existsSync(rendered)) return { ok: false, errors: ['nothing rendered: run render first'] };
    const text = readFileSync(rendered, 'utf8');
    const r = ticketCheck(ctx.ticket, text, dod);
    const errs = [...r.missing.map(s => `original sentence dropped: ${s}`), ...r.missingItems.map(id => `${id} has no checklist line`)];
    if (v.posted && norm(readFileSync(v.posted, 'utf8')) !== norm(text)) errs.push('the posted ticket differs from the approved text (someone edited it, or the post changed it); show the user the difference');
    return errs.length ? { ok: false, errors: errs } : { ok: true };
  }
  if (cmd === 'adr') return writeAdr(dod, ctx, active, session, env);
  if (cmd === 'adr-check') {
    const target = adrTarget(active.repo, dod.slug);
    if (!target.existing) return { ok: false, errors: ['no ADR for this DoD yet: run adr first'] };
    const errs = checkAdrSources(readFileSync(join(active.repo, target.file), 'utf8'), { dod, ...ctx });
    return errs.length ? { ok: false, errors: errs } : { ok: true, adr: join(active.repo, target.file) };
  }
  // export
  const out = resolve(v.out);
  mkdirSync(out, { recursive: true });
  if (v.to === 'ptdd') {
    const { dod: items, sourceText } = exportPtdd(dod, ctx);
    writeFileSync(join(out, 'dod.json'), JSON.stringify(items, null, 2) + '\n');
    writeFileSync(join(out, 'dod-source.md'), sourceText);
    return { ok: true, dod: join(out, 'dod.json'), ticket: join(out, 'dod-source.md') };
  }
  const { requirements, answers } = exportQa(dod, ctx);
  writeFileSync(join(out, 'requirements.json'), JSON.stringify(requirements, null, 2) + '\n');
  writeFileSync(join(out, 'answers.md'), answers);
  writeFileSync(join(out, 'ticket.md'), ctx.ticket);
  return { ok: true, requirements: join(out, 'requirements.json'), answers: join(out, 'answers.md'), ticket: join(out, 'ticket.md') };
}

function writeAdr(dod, ctx, active, session, env) {
  const target = adrTarget(active.repo, dod.slug);
  const r = renderAdr({ dod, answers: ctx.answers, questions: ctx.questions, ticket: ctx.ticket, number: target.n, date: new Date().toISOString().slice(0, 10) });
  if (r.errors.length) return { ok: false, errors: r.errors };
  const file = join(active.repo, target.file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, r.text);
  const index = join(active.repo, writeIndex(active.repo).file);
  recordAdr({ session, env, files: [file, index] }); // DOD_GUARD lets the agent edit these two files, no other ADR
  const hook = env[HOOK_ENV] === '0' ? { skipped: `${HOOK_ENV}=0` } : installHook({ repo: active.repo, dodMjs: DOD_MJS });
  return { ok: true, adr: file, index, rewritten: target.existing, hook };
}

const say = line => process.stderr.write(`dod-adr: ${line}\n`);
function adrs(v, env) {
  const repo = topLevel(resolve(v.repo ?? '.'));
  if (!repo) throw new Usage('adrs needs a git repository (--repo DIR)');
  if (v['install-hook']) return { ok: true, ...installHook({ repo, dodMjs: DOD_MJS }) };
  if (v.sync) {
    if (env[HOOK_ENV] === '0') return { ok: true, skipped: `${HOOK_ENV}=0` };
    const r = syncRepo({ repo, renames: stagedRenames(repo), files: repoFiles(repo, { staged: true }), stage: !!v.staged });
    for (const c of r.changes) say(`${c.adr}: ${c.from !== undefined ? `${c.from} -> ${c.to}` : `added ${c.added} next to ${c.next}`}`);
    for (const w of r.warnings) say(`warning: ${w}`);
    return { ok: true, ...r };
  }
  if (v.touches) {
    if (!v.files.length) throw new Usage('adrs --touches needs at least one file');
    return { ok: true, adrs: findAdrsFor(repo, v.files) };
  }
  throw new Usage('adrs needs --touches FILE..., --sync or --install-hook');
}

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: Object.fromEntries(['session', 'repo', 'slug', 'dod', 'to', 'out', 'lang', 'posted', 'system', 'cli'].map(k => [k, { type: 'string' }]).concat(['fallback', 'touches', 'sync', 'staged', 'install-hook'].map(k => [k, { type: 'boolean' }]))) });
  } catch (e) { process.stderr.write(`dod: ${e.message}\n${USAGE}\n`); process.exit(2); }
  try {
    const result = run(parsed.positionals[0], { ...parsed.values, files: parsed.positionals.slice(1) });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok === false ? 1 : 0);
  } catch (e) {
    process.stderr.write(`dod: ${e.message}\n`);
    process.exit(e instanceof Usage || /a run is active|bad session id|bad slug/.test(e.message) ? 2 : 1);
  }
}

const direct = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) main(process.argv.slice(2));
