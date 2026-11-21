#!/usr/bin/env node
// CLI of the definition-of-done skill. Every command prints one JSON line on stdout.
//   open --repo DIR --slug SLUG          open a DoD session: run folder + marker (hooks/dod-guard.mjs reads it when DOD_GUARD=1)
//   check --dod FILE                     the gate: every item and required section quoted, no open question; on pass writes docs/dod/<slug>.md
//   render --dod FILE [--lang en|th] [--fallback]
//                                        write <run>/ticket-new.md (the whole new ticket description); --fallback also writes docs/dod/<slug>.ticket.md
//   ticket-check --dod FILE [--posted F] every original sentence kept and every item on the checklist; --posted: the ticket as read back equals the approved text
//   tools --system S                     which tool writes the ticket: official CLI, trusted third-party CLI, ask the user to trust, or MCP / the file
//   export --dod FILE --to ptdd|qa --out DIR
//                                        ptdd: DIR/dod.json (plan.json dod[]) + DIR/dod-source.md (plan.json ticket); qa: DIR/requirements.json, answers.md, ticket.md
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
import { checkDod, exportPtdd, exportQa, renderMarkdown, renderTicket, ticketCheck } from './dodcheck.mjs';
import { RENDERED_FILE, approve, close, open, readActive, toolFor, touch, trust } from './session.mjs';

const COMMANDS = ['open', 'check', 'render', 'ticket-check', 'tools', 'export', 'approve', 'trust', 'close'];
const NEEDS_RUN = new Set(['check', 'render', 'ticket-check', 'export', 'approve']);
const USAGE = `usage: dod.mjs ${COMMANDS.join(' | ')} [--session ID]; see the header of dod.mjs`;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

class Usage extends Error {}
const readOr = (f, fallback = '') => (existsSync(f) ? readFileSync(f, 'utf8') : fallback);

function context(active) {
  const show = path => {
    if (path.startsWith('/') || path.split('/').includes('..')) return null;
    try { return execFileSync('git', ['-C', active.repo, 'show', `HEAD:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 }); } catch { return null; }
  };
  return { answers: readOr(join(active.run, 'answers.md')), ticket: readOr(join(active.run, 'ticket.md')), show };
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
    const md = join(active.repo, 'docs', 'dod', `${dod.slug}.md`);
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

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: Object.fromEntries(['session', 'repo', 'slug', 'dod', 'to', 'out', 'lang', 'posted', 'system', 'cli'].map(k => [k, { type: 'string' }]).concat([['fallback', { type: 'boolean' }]])) });
  } catch (e) { process.stderr.write(`dod: ${e.message}\n${USAGE}\n`); process.exit(2); }
  try {
    const result = run(parsed.positionals[0], parsed.values);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok === false ? 1 : 0);
  } catch (e) {
    process.stderr.write(`dod: ${e.message}\n`);
    process.exit(e instanceof Usage || /a run is active|bad session id|bad slug/.test(e.message) ? 2 : 1);
  }
}

const direct = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) main(process.argv.slice(2));
