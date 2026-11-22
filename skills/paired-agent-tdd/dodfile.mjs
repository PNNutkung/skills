// plan.json can take its DoD from an ADR that the definition-of-done skill wrote, instead of a dod[] list:
//   "dodFile": "docs/adr/NNNN-<slug>.md"  the ADR, read at HEAD (it must be committed and unchanged), checked by that skill's own checkAdr
//   neither dod[] nor dodFile             the one active ADR whose touches match the groups' src files ($DOD_AUTO=0 turns this off)
// The definition-of-done skill is found next to this one, or at $DOD_DIR. A plan with dod[] is returned untouched, the same object.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUTO_ENV = 'DOD_AUTO';

async function dodSkill(env, here) {
  const dir = resolve(env.DOD_DIR || join(here, '..', 'definition-of-done'));
  if (!existsSync(join(dir, 'adrio.mjs'))) return { dir, lib: null };
  const [io, adr] = await Promise.all([import(pathToFileURL(join(dir, 'adrio.mjs')).href), import(pathToFileURL(join(dir, 'adr.mjs')).href)]);
  return { dir, lib: { ...io, ...adr } };
}

/**
 * -> { plan, fromAdr, note?, warnings? } with plan.dod, plan.dodFile and plan.dodBlob filled from the ADR, or { error } (a usage error: exit 2).
 * env: process.env; here: this skill's folder.
 */
export async function resolveDod(plan, { env = process.env, here }) {
  const has = k => plan?.[k] !== undefined;
  if (has('dodFile') && has('dod')) return { error: 'use dodFile or dod[], not both' };
  const auto = !has('dodFile') && !has('dod') && env[AUTO_ENV] !== '0';
  if (!has('dodFile') && !auto) return { plan, fromAdr: false };
  const { dir, lib } = await dodSkill(env, here);
  if (!lib) return auto ? { plan, fromAdr: false } : { error: `dodFile needs the definition-of-done skill, not found at ${dir} (set DOD_DIR)` };
  const repo = typeof plan.repo === 'string' ? lib.topLevel(plan.repo) : null;
  if (!repo) return auto ? { plan, fromAdr: false } : { error: `dodFile needs repo to be a git repository (${plan.repo})` };
  let file = plan.dodFile;
  if (auto) {
    const src = (Array.isArray(plan.groups) ? plan.groups : []).flatMap(g => (Array.isArray(g?.src) ? g.src : []));
    const found = lib.findAdrsFor(repo, src, { rev: 'HEAD' }).filter(a => a.hasDod);
    if (found.length > 1) return { error: `${found.length} ADRs touch the groups' src files (${found.map(a => a.file).join(', ')}); set dodFile to the one this work implements` };
    if (!found.length) return { error: `no dod[], no dodFile, and no ADR with a Definition of done touches ${src.join(', ') || 'the groups\' src files'}; add dod[] or dodFile (or set ${AUTO_ENV}=0)` };
    file = found[0].file;
  }
  const r = lib.loadAdrDod({ repo, file });
  if (!r.ok) return { error: r.errors.join('\n  ') };
  const dod = lib.toPlanDod(r.parsed, r.file);
  return { plan: { ...plan, dod, dodFile: r.file, dodBlob: r.blob }, fromAdr: true, warnings: r.warnings ?? [], note: `${dod.length} DoD item(s) from ${r.file} @ ${r.blob.slice(0, 8)}${auto ? ' (found by touches)' : ''}` };
}
