// Deterministic mutant generator for mutate.mjs: no model, no I/O. A mutant is ONE changed line (a flipped comparison, an inverted condition, a dropped statement, a
// different return value ...). If the changed tests still pass with it, those tests do not pin that behavior: a test gap with a reproducible proof.
// Lines are masked first (string contents and trailing comments blanked), so an operator inside a string or comment is never touched.
import { createHash } from 'node:crypto';

const LANG = { py: 'p', js: 'j', jsx: 'j', mjs: 'j', cjs: 'j', ts: 'j', tsx: 'j', go: 'c', java: 'c', c: 'c', h: 'c', cc: 'c', cpp: 'c', cs: 'c', rs: 'c', kt: 'c', swift: 'c', php: 'c', scala: 'c' };
const PER_LINE = 6;
const STRING_FILL = '\u0001';
const KEYWORD = /^(return|raise|yield|import|from|def|class|with|try|except|finally|else|elif|if|for|while|assert|del|global|nonlocal|pass|break|continue|lambda|async|await)\b/;
const IMPORT = { p: /^\s*(import|from)\s/, j: /^\s*import\s|require\(/, c: /^\s*(import|using|#include|package)\b/ };
const COND = /\b(if|elif|while|assert|and|or|return)\b/;

// same length as the line; string contents and comments become filler, so regexes only see code
function mask(line, lang) {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if ((lang === 'p' && c === '#') || (lang !== 'p' && c === '/' && line[i + 1] === '/')) return out + ' '.repeat(line.length - i);
    if (c === '"' || c === "'" || (lang === 'j' && c === '`')) {
      out += c;
      for (i++; i < line.length && line[i] !== c; i++) {
        if (line[i] === '\\') { out += STRING_FILL; i++; }
        out += STRING_FILL;
      }
      if (i < line.length) out += c;
    } else out += c;
  }
  return out;
}

const balanced = s => ['()', '[]', '{}'].every(([o, c]) => s.split(o).length === s.split(c).length);
const indent = line => /^\s*/.exec(line)[0];

// span replacement: the first match of `re` in the masked line is replaced in the ORIGINAL line
const span = (re, to) => (masked, original) => {
  const m = re.exec(masked);
  return m ? original.slice(0, m.index) + (typeof to === 'function' ? to(m[0]) : to) + original.slice(m.index + m[0].length) : null;
};
// a single-line `return X` becomes `return <value>` (not when X already is the value)
const returns = (value, same) => (masked, original) => {
  const m = /^\s*return\s+(\S.*?);?\s*$/.exec(masked);
  if (!m || !balanced(masked) || m[1] === same) return null;
  return `${indent(original)}return ${value}${original.trimEnd().endsWith(';') ? ';' : ''}`;
};
// a whole simple statement (a call or an assignment) that can be replaced by `pass`
const droppable = masked => {
  const t = masked.trim();
  return /^[A-Za-z_][\w.[\]]*\s*(\(|[-+*/|&]?=(?!=))/.test(t) && !KEYWORD.test(t) && !/[:,\\([{]\s*$/.test(t) && balanced(t);
};
const inCondition = masked => COND.test(masked) && !/\bfor\b/.test(masked);

// [name, languages (p python, j javascript/typescript, c other c-like), apply(masked, original) -> new line | null]. Order = priority at the per-line cap.
const OPS = [
  ['stmt-drop', 'p', (masked, original) => (droppable(masked) ? `${indent(original)}pass` : null)],
  ['return-none', 'p', returns('None', 'None')],
  ['return-none', 'j', returns('null', 'null')],
  ['eq-ne', 'pjc', span(/(?<![=!<>+\-*/%&|^:])(?:===|==)(?!=)/, m => (m === '===' ? '!==' : '!='))],
  ['ne-eq', 'pjc', span(/!==|!=(?!=)/, m => (m === '!==' ? '===' : '=='))],
  ['lt-le', 'pjc', span(/ < /, ' <= ')],
  ['gt-ge', 'pjc', span(/ > /, ' >= ')],
  ['le-lt', 'pjc', span(/(?<![<=])<=(?![=>])/, '<')],
  ['ge-gt', 'pjc', span(/(?<![>=])>=(?!=)/, '>')],
  ['and-or', 'p', span(/ and /, ' or ')],
  ['or-and', 'p', span(/ or /, ' and ')],
  ['and-or', 'jc', span(/ && /, ' || ')],
  ['or-and', 'jc', span(/ \|\| /, ' && ')],
  ['not-drop', 'p', span(/(?<!\bis )\bnot (?!in\b)/, '')],
  ['not-drop', 'jc', span(/(?<![=!<>&|\w])!(?=[\w(])/, '')],
  ['true-false', 'p', span(/\bTrue\b/, 'False')],
  ['false-true', 'p', span(/\bFalse\b/, 'True')],
  ['true-false', 'jc', span(/\btrue\b/, 'false')],
  ['false-true', 'jc', span(/\bfalse\b/, 'true')],
  ['none-flip', 'p', (masked, original) => span(/ is not None\b/, ' is None')(masked, original) ?? span(/ is None\b/, ' is not None')(masked, original)],
  ['in-notin', 'p', (masked, original) => (inCondition(masked) ? span(/(?<!not) in /, ' not in ')(masked, original) : null)],
  ['notin-in', 'p', (masked, original) => (inCondition(masked) ? span(/ not in /, ' in ')(masked, original) : null)],
  ['add-sub', 'pjc', span(/ \+ /, ' - ')],
  ['sub-add', 'pjc', span(/ - /, ' + ')],
  ['mul-div', 'pjc', span(/ \* /, ' / ')],
  ['div-mul', 'pjc', span(/ \/ /, ' * ')],
  ['const-inc', 'pjc', span(/(?<![\w.$#"'])\d+(?![\w.])/, m => String(Number(m) + 1))],
];

// lines (1-based) inside a python triple-quoted string, opening and closing lines included
function docstringLines(lines) {
  const inside = new Set();
  let open = false;
  lines.forEach((line, i) => {
    const marks = (line.match(/"""|'''/g) ?? []).length;
    if (open || marks % 2) inside.add(i + 1);
    if (marks % 2) open = !open;
  });
  return inside;
}

/** -> [{ id, file, line, op, before, after, newLine }] in file/line order; `lines` = the 1-based line numbers the change touched */
export function generateMutants(path, text, lines, { perLine = PER_LINE } = {}) {
  const lang = LANG[path.split('.').pop().toLowerCase()];
  if (!lang) return [];
  const src = text.split('\n');
  const docs = lang === 'p' ? docstringLines(src) : new Set();
  const wanted = new Set(lines);
  const out = [];
  for (let n = 1; n <= src.length; n++) {
    if (!wanted.has(n) || docs.has(n)) continue;
    const original = src[n - 1], masked = mask(original, lang);
    if (!masked.trim() || /^\s*@/.test(masked) || IMPORT[lang].test(masked)) continue;
    const seen = new Set();
    let count = 0;
    for (const [op, langs, apply] of OPS) {
      if (count >= perLine) break;
      if (!langs.includes(lang)) continue;
      const newLine = apply(masked, original);
      if (newLine === null || newLine === original || seen.has(`${op}:${newLine}`)) continue;
      seen.add(`${op}:${newLine}`);
      count++;
      out.push({ id: `X-${createHash('sha1').update(`${path}:${n}:${op}:${newLine}`).digest('hex').slice(0, 8)}`, file: path, line: n, op, before: original.trim(), after: newLine.trim(), newLine });
    }
  }
  return out;
}

const key = m => m.file + String(m.line).padStart(6, '0') + m.op;
/** at most `max` mutants spread evenly over the sorted list (every file and region represented); deterministic */
export function sample(mutants, max) {
  const sorted = [...mutants].sort((a, b) => key(a).localeCompare(key(b)));
  if (sorted.length <= max) return sorted;
  return Array.from({ length: max }, (_, i) => sorted[Math.floor((i * sorted.length) / max)]);
}

/** `git diff -U0` text -> Map(path -> new-side line numbers added or changed); deleted files and pure deletions give nothing */
export function changedLines(patch) {
  const out = new Map();
  let file = null;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6).split('\t')[0] : null; continue; }
    const h = file && /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!h) continue;
    const start = Number(h[1]), count = h[2] === undefined ? 1 : Number(h[2]);
    if (count) out.set(file, [...(out.get(file) ?? []), ...Array.from({ length: count }, (_, i) => start + i)]);
  }
  return out;
}
