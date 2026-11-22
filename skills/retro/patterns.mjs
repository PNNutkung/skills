// The skill's own counter for rules no linter has (pure: text in, violations out). Built-in rules are `retro:*`; a repo adds its own as
// {regex, flags?, glob?} under `patterns` in .ratchet.json. Regex based on purpose: it works in any repo with no setup, and the ratchet only
// compares a file with itself, so a steady false positive costs nothing. Strings and comments are blanked before code rules look at a line.
const SLASH_LANGS = /\.(?:[cm]?[jt]sx?|go|java|kt|swift|rs|c|cc|cpp|h|hpp|cs|scala|dart)$/;
const HASH_LANGS = /\.(?:py|pyi|rb|sh|bash)$/;
const TS = /\.(?:[cm]?ts|tsx)$/;
const MAGIC_MIN_LENGTH = 3;
const MAGIC_MIN_REPEATS = 3;
const COMMENT_SHARE = 0.25;
const CODE_WORD = /^(?:const|let|var|if|for|while|return|try|catch|import|export|function|def|class|await|else|elif|from)\b/;
const CODE_END = /[;{}]\s*$/;

const reEscape = s => s.replace(/[.+^$()|[\]\\]/g, '\\$&');
/** Glob with **, *, ? and {a,b}. */
export function matchGlob(glob, path) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; } }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') { const end = glob.indexOf('}', i); if (end < 0) { re += '\\{'; continue; } re += `(?:${glob.slice(i + 1, end).split(',').map(reEscape).join('|')})`; i = end; }
    else re += reEscape(c);
  }
  return new RegExp(`^${re}$`).test(path);
}

const commentMark = file => SLASH_LANGS.test(file) ? '//' : HASH_LANGS.test(file) ? '#' : null;

/** Per line: code with strings blanked and the line comment cut, the comment text (or null), and the string literals it held. */
function scan(text, file) {
  const mark = commentMark(file);
  return String(text).split('\n').map(line => {
    let code = '', comment = null;
    const literals = [];
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1, lit = '';
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') { lit += line[j + 1] ?? ''; j += 2; } else lit += line[j++]; }
        literals.push(lit);
        code += c + ' '.repeat(Math.max(0, Math.min(j, line.length) - i - 1)) + (j < line.length ? c : '');
        i = j;
      } else if (mark && line.startsWith(mark, i) && !(mark === '#' && i === 0 && line[1] === '!')) { comment = line.slice(i + mark.length).trim(); break; }
      else code += c;
    }
    return { code, comment, literals, blockComment: /^\s*(?:\/\*|\*)/.test(line) };
  });
}

const perMatch = (rows, test) => rows.flatMap((r, i) => Array.from({ length: test(r) }, () => i + 1));
const countRe = (s, re) => (s.match(re) ?? []).length;

export const BUILTIN = {
  'retro:ts-as-cast': {
    applies: f => TS.test(f),
    count: rows => perMatch(rows, r => /^\s*(?:import\b|export\s*[{*])/.test(r.code) ? 0 : countRe(r.code, /\bas\s+(?!const\b)[A-Za-z_$({[]/g)),
  },
  'retro:ts-intersection': {
    applies: f => TS.test(f),
    count: rows => perMatch(rows, r => (/\btype\s+\w+[^=]*=/.test(r.code) || /:[^=]*&/.test(r.code)) ? countRe(r.code, /(?<![&|])&(?![&=])/g) : 0),
  },
  'retro:magic-string': {
    applies: f => SLASH_LANGS.test(f) || HASH_LANGS.test(f),
    count: rows => {
      const seen = new Map();
      rows.forEach((r, i) => {
        if (/^\s*(?:import|from)\b|\brequire\s*\(/.test(r.code)) return;
        for (const lit of r.literals) if (lit.length >= MAGIC_MIN_LENGTH) { const e = seen.get(lit) ?? { n: 0, line: i + 1 }; e.n++; seen.set(lit, e); }
      });
      return [...seen.values()].filter(e => e.n >= MAGIC_MIN_REPEATS).map(e => e.line);
    },
  },
  'retro:comment-ratio': {
    applies: f => SLASH_LANGS.test(f) || HASH_LANGS.test(f),
    count: rows => {
      const comments = [], code = rows.filter(r => r.code.trim() && !r.blockComment).length;
      rows.forEach((r, i) => { if ((r.comment !== null && !r.code.trim()) || r.blockComment) comments.push(i + 1); });
      const excess = comments.length - Math.floor(code * COMMENT_SHARE);
      return excess > 0 ? comments.slice(-excess) : [];
    },
  },
  'retro:code-in-comment': {
    applies: f => SLASH_LANGS.test(f) || HASH_LANGS.test(f),
    count: rows => rows.flatMap((r, i) => r.comment && (CODE_WORD.test(r.comment) || CODE_END.test(r.comment)) ? [i + 1] : []),
  },
};

/** Built-in rules worth proposing for these repo files (a language rule only when the repo has that language). */
export const applicablePatterns = files => Object.entries(BUILTIN).filter(([, p]) => files.some(f => p.applies(f))).map(([id]) => id);

/**
 * Count rules over files. files: [{file, text}]; rules: rule ids (built-in or custom); custom: the `patterns` of .ratchet.json.
 * -> [{rule, file, line}]
 */
export function countPatterns(files, rules, custom = {}) {
  const out = [];
  for (const { file, text } of files) {
    let rows = null;
    for (const rule of rules) {
      const b = BUILTIN[rule], c = custom?.[rule];
      if (b && b.applies(file)) { rows ??= scan(text, file); for (const line of b.count(rows)) out.push({ rule, file, line }); }
      else if (!b && c && (!c.glob || matchGlob(c.glob, file))) {
        const re = new RegExp(c.regex, `${(c.flags ?? '').replace(/g/g, '')}g`);
        String(text).split('\n').forEach((l, i) => { for (let k = countRe(l, re); k > 0; k--) out.push({ rule, file, line: i + 1 }); });
      }
    }
  }
  return out;
}
