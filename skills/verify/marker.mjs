// Code-written sections of docs/verify/<slug>.md carry a marker with the hash of their body, so a hand edit shows (ADR 0008 A10).
// A section runs from a `## <id>` line to the next line starting `## ` outside a fenced block, or EOF; fences are tracked like
// dev-workflow's parseVerify, so a `## ` line in captured output stays in its section. The marker is the first line after the heading.
import { createHash } from 'node:crypto';

const HASH_LEN = 16;
const MARKER_PREFIX = '<!-- verify: written by verify.mjs; sha256:';
const MARKER_RE = /^<!-- verify: written by verify\.mjs; sha256:(\S*) -->\s*$/;
const HEADING_RE = /^## /;
const FENCE_RE = /^```/;

/** sha256 of the trimmed body, first 16 hex. */
export const bodyHash = (body) => createHash('sha256').update(String(body ?? '').trim()).digest('hex').slice(0, HASH_LEN);

/** The marker comment line for this body. */
export const markerLine = (body) => `${MARKER_PREFIX}${bodyHash(body)} -->`;

/** The file as consecutive parts [{ id, text }]: id null for the text before the first heading. Joining every text gives md back. */
export function splitSections(md) {
  const parts = [];
  let cur = { id: null, text: '' }, inFence = false;
  for (const line of String(md ?? '').split(/(?<=\n)/)) {
    if (!inFence && HEADING_RE.test(line)) {
      if (cur.id !== null || cur.text) parts.push(cur);
      cur = { id: line.slice(3).trim(), text: '' };
    } else if (cur.id !== null && FENCE_RE.test(line)) inFence = !inFence;
    cur.text += line;
  }
  if (cur.id !== null || cur.text) parts.push(cur);
  return parts;
}

/** Every marked section in file order (ids may repeat): [{ id, body, hash, intact }]. */
export function markedList(md) {
  const out = [];
  for (const { id, text } of splitSections(md)) {
    if (id === null) continue;
    const lines = text.split('\n');
    const m = MARKER_RE.exec(lines[1] ?? '');
    if (!m) continue;
    const body = lines.slice(2).join('\n');
    out.push({ id, body, hash: m[1], intact: bodyHash(body) === m[1] });
  }
  return out;
}

/** Map<id, { body, hash, intact }> of the marked sections; the first wins when an id repeats. */
export function markedSections(md) {
  const map = new Map();
  for (const { id, ...rest } of markedList(md)) if (!map.has(id)) map.set(id, rest);
  return map;
}

/** [{ id, count }] for each code-written id with more than one `## <id>` section: dev-workflow reads the last, so a copy shadows it. */
export function duplicateMarked(md) {
  const count = new Map();
  for (const { id } of splitSections(md)) if (id !== null) count.set(id, (count.get(id) ?? 0) + 1);
  return [...new Set(markedList(md).map(s => s.id))].filter(id => count.get(id) > 1).map(id => ({ id, count: count.get(id) }));
}
