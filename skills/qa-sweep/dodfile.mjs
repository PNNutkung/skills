// findings.json can take its requirements from an ADR that the definition-of-done skill wrote, instead of a requirements[] list:
//   "dodFile": "docs/adr/NNNN-<slug>.md"  the ADR at --head (unchanged in the working tree when --head is HEAD), checked by that skill's checkAdr
//   neither requirements[] nor dodFile    the one active ADR whose touches match the files the findings and tests name ($QA_ADR_AUTO_FIND_ENABLED=false turns this off);
//                                         none: no requirements, as before; several: a warning, and no requirements
// The definition-of-done skill is found next to this one, or at $DOD_DIR. Findings with requirements[] are returned untouched, the same object.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enabled } from './flags.mjs';

export const AUTO_ENV = 'QA_ADR_AUTO_FIND_ENABLED';
const CODE_REF = /^(.+):\d+$/;

async function dodSkill(env, here) {
  const dir = resolve(env.DOD_DIR || join(here, '..', 'definition-of-done'));
  if (!existsSync(join(dir, 'adrio.mjs'))) return { dir, lib: null };
  const [io, adr] = await Promise.all([import(pathToFileURL(join(dir, 'adrio.mjs')).href), import(pathToFileURL(join(dir, 'adr.mjs')).href)]);
  return { dir, lib: { ...io, ...adr } };
}

/** The repo files the findings and tests name: code proofs' refs and the tests written. */
function namedFiles(data) {
  const refs = (Array.isArray(data.findings) ? data.findings : []).flatMap(f => (Array.isArray(f?.proofs) ? f.proofs : [])).filter(p => p?.mode === 'code').map(p => CODE_REF.exec(String(p.ref ?? ''))?.[1]);
  const written = (Array.isArray(data.tests_written) ? data.tests_written : []).map(w => w?.path);
  return [...new Set([...refs, ...written].filter(f => typeof f === 'string'))];
}

/** -> { data, note?, warning? } with data.requirements filled from the ADR, or { error } (a usage error: exit 2). */
export async function requirementsFromDod(data, { repo, head, env = process.env, here }) {
  const has = k => data?.[k] !== undefined;
  if (has('dodFile') && has('requirements')) return { error: 'use dodFile or requirements[], not both' };
  const auto = !has('dodFile') && !has('requirements') && enabled(env, AUTO_ENV, true);
  if (!has('dodFile') && !auto) return { data };
  const { dir, lib } = await dodSkill(env, here);
  if (!lib) return auto ? { data } : { error: `dodFile needs the definition-of-done skill, not found at ${dir} (set DOD_DIR)` };
  const top = lib.topLevel(repo);
  if (!top) return auto ? { data } : { error: `dodFile needs --repo to be a git repository (${repo})` };
  let file = data.dodFile;
  if (auto) {
    const found = lib.findAdrsFor(top, namedFiles(data), { rev: head }).filter(a => a.hasDod);
    if (found.length > 1) return { data, warning: `${found.length} ADRs touch the files the findings name (${found.map(a => a.file).join(', ')}); set dodFile to use one as the requirements` };
    if (!found.length) return { data };
    file = found[0].file;
  }
  const r = lib.loadAdrDod({ repo: top, file, rev: head });
  if (!r.ok) return { error: r.errors.join('\n  ') };
  const requirements = lib.toRequirements(r.parsed, r.file);
  const warning = (r.warnings ?? []).join('; ') || undefined;
  return { data: { ...data, requirements }, ...(warning ? { warning } : {}), note: `${requirements.length} requirement(s) from ${r.file}${auto ? ' (found by touches)' : ''}` };
}
