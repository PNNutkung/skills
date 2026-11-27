// The equivalent-mutant file, mutation-equivalent.json (ADR 0011 A16): {"schema": 1, "marks": [{id, file, line, reason, judge}]}. A judge marks a SURVIVOR whose edit no
// input can tell apart from the original; the engine then reports it `equivalent` and leaves it out of the score. A mark applies only while the mutant id (a hash of
// file, line and edit) is the same: once the line changes, the mark marks nothing. The file is data a caller wrote: it is checked, never trusted.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export const SCHEMA = 1, REASON_MIN = 20;
const isObject = x => typeof x === 'object' && x !== null && !Array.isArray(x);
const nonEmpty = s => typeof s === 'string' && s !== '';
const wellFormed = m => isObject(m) && nonEmpty(m.id) && nonEmpty(m.file) && Number.isInteger(m.line) && m.line >= 1 && typeof m.reason === 'string' && typeof m.judge === 'string';

/** The marks of a schema 1 document; throws on anything else (the reason's length is checked when a mark is added, not here). */
export function parseMarks(text) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error(`equivalent file: not JSON (${e.message})`); }
  if (!isObject(doc) || doc.schema !== SCHEMA) throw new Error(`equivalent file: want {"schema": ${SCHEMA}, "marks": [...]}`);
  if (!Array.isArray(doc.marks)) throw new Error('equivalent file: marks must be a list');
  const bad = doc.marks.findIndex(m => !wellFormed(m));
  if (bad >= 0) throw new Error(`equivalent file: mark ${bad} needs id, file, line (an integer from 1), reason and judge`);
  return doc.marks;
}

/** The marks in the file at path; [] when there is no file. */
export const readMarks = path => (existsSync(path) ? parseMarks(readFileSync(path, 'utf8')) : []);

/** Adds marks to the file (created when missing). Refuses, writing nothing, a mark whose id is not a survivor of result or whose reason is under 20 characters. */
export function addMarks(path, marks, result) {
  if (!Array.isArray(marks)) throw new Error('addMarks: marks must be a list');
  const survivors = new Set((result?.mutants ?? []).filter(m => m.result === 'survived').map(m => m.id));
  for (const m of marks) {
    if (!wellFormed(m)) throw new Error(`addMarks: a mark needs id, file, line, reason and judge: ${JSON.stringify(m)?.slice(0, 200)}`);
    if (!survivors.has(m.id)) throw new Error(`addMarks: ${m.id} is not a survivor of the result: only a surviving mutant can be marked equivalent`);
    if (m.reason.trim().length < REASON_MIN) throw new Error(`addMarks: the reason for ${m.id} must be at least ${REASON_MIN} characters`);
  }
  const have = readMarks(path);
  const next = { schema: SCHEMA, marks: [...have, ...marks.filter(m => !have.some(h => h.id === m.id)).map(({ id, file, line, reason, judge }) => ({ id, file, line, reason, judge }))] };
  const part = `${path}.part`;
  writeFileSync(part, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(part, path);
  return next.marks;
}

/** A new mutant list: each survivor whose id has a mark becomes `equivalent`; nothing else changes. */
export function applyMarks(mutants, marks) {
  const ids = new Set(marks.map(m => m.id));
  return mutants.map(m => (m.result === 'survived' && ids.has(m.id) ? { ...m, result: 'equivalent' } : { ...m }));
}
