// Pure writer of docs/verify/<slug>.md sections (ADR 0009 A1, A12): code writes each run's section under a hash marker, and a rerun
// replaces only the sections of the items that ran.
import { markerLine, splitSections } from './marker.mjs';

export const CAP = 8000;
const FENCE = '```';

/** Output over cap chars keeps its head and tail, and says so. */
export function capOutput(text, cap = CAP) {
  const s = String(text ?? '');
  if (s.length <= cap) return s;
  const half = Math.floor(cap / 2);
  return `${s.slice(0, half)}\n... [cut: the output was ${s.length} chars; the first and last ${half} are kept] ...\n${s.slice(-half)}`;
}

// a line starting with ``` would close the block early, so it gets one leading space
const fenceSafe = s => s.split('\n').map(l => (l.startsWith(FENCE) ? ` ${l}` : l)).join('\n');
const oneLine = s => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();

/** One section: heading, marker, env/run/result/expect/image/why lines and the output block. Ends with a blank line. */
export function renderSection({ id, env, run, result, expect, image, why, output }) {
  const lines = [`env: ${oneLine(env)}`, `run: ${oneLine(run)}`, `result: ${oneLine(result)}`];
  if (expect) lines.push(`expect: ${oneLine(expect)}`);
  if (image) lines.push(`image: ${oneLine(image)}`);
  if (why) lines.push(`why: ${oneLine(why)}`); // inside the hashed body, so a failed section stays intact
  lines.push(FENCE, fenceSafe(capOutput(output).replace(/\n+$/, '')), FENCE);
  const body = `${lines.join('\n')}\n`;
  return `## ${id}\n${markerLine(body)}\n${body}\n`;
}

export const fileHeader = (slug, adrNo) => `# Verify: ${slug} (${adrNo ? `ADR ${adrNo}` : 'claims'})`;

const idOf = text => /^## (\S+)/.exec(text)?.[1] ?? null;

/** md with each new section put in place of the first section of its id (or appended); every other byte stays. */
export function mergeSections(md, sections, header) {
  if (md === null || md === undefined || md === '') return `${header}\n\n${sections.join('')}`;
  const parts = splitSections(md);
  const extra = [];
  for (const text of sections) {
    const id = idOf(text);
    const at = parts.findIndex(p => p.id === id);
    if (at < 0) { extra.push(text); continue; }
    // keep the whitespace that separated the old section from what follows
    const tail = /\s*$/.exec(parts[at].text)[0] || '\n';
    parts[at] = { id, text: text.trimEnd() + tail };
  }
  let out = parts.map(p => p.text).join('');
  if (extra.length) out = `${out}${out.endsWith('\n\n') ? '' : out.endsWith('\n') ? '\n' : '\n\n'}${extra.join('')}`;
  return out;
}
