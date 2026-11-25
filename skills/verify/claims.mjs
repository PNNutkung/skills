// Standalone use with no ADR (ADR 0008 A2): candidates from the branch diff, and the user's confirmed claims as the items.
import { FLAG_NAME_RE } from './adr.mjs';

const OPTION_RE = /(?<![\w-])--[a-z][a-z0-9-]+/g;
const CODE_FILE_RE = /\.(?:mjs|js|py|ts)$/;
const CONFIG_KEY_RE = { json: /"([A-Za-z_][\w.-]*)"\s*:/g, yaml: /^\s*-?\s*([A-Za-z_][\w.-]*)\s*:(?:\s|$)/g, toml: /^\s*([A-Za-z_][\w.-]*)\s*=/g };
const configKind = f => (/\.json$/.test(f) ? 'json' : /\.ya?ml$/.test(f) ? 'yaml' : /\.toml$/.test(f) ? 'toml' : null);
export const CLAIM_ID_RE = /^[A-Za-z][A-Za-z0-9]{0,11}$/;

/** -> { flags: [{ name, file }], options: [{ name, file }], configKeys: [{ key, file }] }, each once, from added lines of a unified diff. */
export function candidatesFromDiff(diff) {
  const out = { flags: [], options: [], configKeys: [] };
  const add = (list, k, v, file) => { if (!list.some(x => x[k] === v)) list.push({ [k]: v, file }); };
  let file = null;
  for (const line of String(diff ?? '').split('\n')) {
    const f = /^\+\+\+ (?:b\/)?(.*)$/.exec(line);
    if (f) { file = f[1].trim(); continue; }
    if (!file || !line.startsWith('+')) continue;
    const text = line.slice(1);
    for (const m of text.matchAll(FLAG_NAME_RE)) add(out.flags, 'name', m[0], file);
    if (CODE_FILE_RE.test(file)) for (const m of text.matchAll(OPTION_RE)) add(out.options, 'name', m[0], file);
    const kind = configKind(file);
    if (kind && !/^\s*#/.test(text)) for (const m of text.matchAll(CONFIG_KEY_RE[kind])) add(out.configKeys, 'key', m[1], file);
  }
  return out;
}

/** claims.json ([{ id, text, answer }]) -> { items: [{ id, text }], errors }: every claim needs the user's answer in answers.md. */
export function claimItems(claims, answers) {
  if (!Array.isArray(claims)) return { items: [], errors: ['claims.json must be a JSON array of { id, text, answer }'] };
  const items = [], errors = [], seen = new Set();
  for (const c of claims) {
    const id = c?.id;
    if (typeof id !== 'string' || !CLAIM_ID_RE.test(id)) { errors.push(`claim id ${JSON.stringify(id)} is a bad id: a letter, then up to 11 letters or digits`); continue; }
    if (seen.has(id)) { errors.push(`duplicate claim ${id}`); continue; }
    seen.add(id);
    if (typeof c.text !== 'string' || !c.text.trim()) { errors.push(`${id}: no text`); continue; }
    if (typeof c.answer !== 'string' || !answers?.[c.answer]) { errors.push(`${id}: answer ${c.answer ?? '(none)'} is not in answers.md: the user confirms each claim`); continue; }
    items.push({ id, text: c.text.trim() });
  }
  return { items, errors };
}
