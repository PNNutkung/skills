// Gate cache of paired-agent-tdd (ADR 0001, A4 and A8): a gate result stored under a sha256 key of what decides it, so the same tree is not tested twice.
// key = sha256(snapshot tree id, every judged file's path and bytes, the gate's arguments); entries live next to the gate files in RUN/gates as <gate>.cache.json.
// A missing, garbled or mismatched entry is no reuse: the gate runs in full.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const CACHE_VERSION = 1;
const MISSING = '\0missing';
export const cacheName = gate => `${gate}.cache.json`;

/** { snapshot: tree id, files: [[path, Buffer | string | null (missing)]], args: [string] } -> 64 hex chars. Fields are length-prefixed and files sorted by path. */
export function gateKey({ snapshot, files, args }) {
  if (typeof snapshot !== 'string' || !snapshot) throw new TypeError('gateKey needs the snapshot identity');
  if (!Array.isArray(files) || !Array.isArray(args)) throw new TypeError('gateKey needs files and args as lists');
  const h = createHash('sha256'), field = b => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8'); h.update(`${buf.length}:`); h.update(buf); };
  field(`v${CACHE_VERSION}`); field(snapshot);
  const sorted = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  field(String(sorted.length));
  for (const [path, bytes] of sorted) {
    if (typeof path !== 'string' || !path) throw new TypeError('gateKey: every file needs a path');
    field(path); field(bytes === null || bytes === undefined ? MISSING : bytes);
  }
  field(String(args.length));
  for (const a of args) field(String(a));
  return h.digest('hex');
}

export const encodeEntry = (key, result) => `${JSON.stringify({ version: CACHE_VERSION, key, result })}\n`;

/** The stored result when the entry is well formed and holds exactly this key; anything else is null. */
export function decodeEntry(text, key) {
  if (typeof key !== 'string' || !key || typeof text !== 'string') return null;
  let e;
  try { e = JSON.parse(text); } catch { return null; }
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  return isObj(e) && e.version === CACHE_VERSION && e.key === key && isObj(e.result) ? e.result : null;
}

export function readEntry(file, key) {
  try { return decodeEntry(readFileSync(file, 'utf8'), key); } catch { return null; }
}

export function writeEntry(file, key, result, write = (f, text) => writeFileSync(f, text, { mode: 0o600 })) {
  write(file, encodeEntry(key, result));
}
