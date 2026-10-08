#!/usr/bin/env node
// PreToolUse(Bash) hook for zero-trust-review. While a review run is active, a review SUBAGENT may not execute repo code or reach the network
// except through the skill's own sandbox-run.mjs (and may not write the run folder or marker dir); everything else it needs (git, grep, ls, ...) stays allowed.
//
// THIS GUARD CATCHES AGENT MISTAKES AND PLANTS (instructions planted in the code under review), NOT DETERMINED ATTACKERS; THE SANDBOX IS THE
// BOUNDARY. The observed failure it exists for: a review agent running a bare `python -c 'import pytest'`
// against the repo under review. The security boundary is the sandbox (sandbox-run.mjs), never this file. A determined or prompt-injected agent
// can defeat the guard with obfuscation: variable indirection, base64 into a file, eval-by-config, a script written then run via an allowed tool,
// `git` aliases or hooks already present in the repo's .git/config, `rm` of a whole parent folder, subshell `cd` leaking into later segments, etc.
//
// Active = hook input has agent_id AND runctx.readMarker() names a trusted run dir (marker owned by us, not a symlink, not group/world-writable,
// < 12 h old). Otherwise (main thread, no run, untrusted marker) it exits 0 with no output. Fail-open: any internal error exits 0 silently, logged
// to RUN/hook-errors.log (via runctx.appendSafe) when RUN is known, so a guard bug can never brick a session.
//
// Method: split the command into segments (on ; && || | & newline, inside $( ), backticks and ( ) groups), strip wrappers and env assignments,
// then judge each segment's program against an ALLOW-LIST (unknown program = deny). Redirect targets and file arguments are checked separately.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WHY_EXEC = 'would execute repo code or reach the network outside the sandbox';
const WHY_FILES = 'would change files outside the temp dir';
const WHY_ENV = 'is an environment switch that must not steer the sandbox runner, the run folder or the loaders';
const WHY_RUN_WRITE = 'would write into the run folder or the marker dir; only note.mjs, sandbox-run.mjs and the hooks write there';
const WHY_NOT_SKILL_SCRIPT = "is not the skill's own script; use the absolute path of the skill's sandbox-run.mjs/note.mjs";
const FIX_RUN = 'Run it as: node <skillDir>/sandbox-run.mjs --cwd DIR --rw DIR [--ro VENV] -- CMD (exit 86 = no sandbox: report the claim UNVERIFIABLE). '
  + 'Notes and checkpoints: node <skillDir>/note.mjs.';
const FIX_STATE = 'Work on a copy under the temp dir, or use read-only git (log, show, diff, archive). Notes and checkpoints: node <skillDir>/note.mjs.';

const deny = (what, why = WHY_EXEC, fix = FIX_RUN) => `zero-trust-review: ${what} ${why}. ${fix}`;

// names that live in the run folder / marker dir; only used when a target's directory is not statically known (e.g. "$RUN/exec.jsonl")
const RUN_FILES = ['exec.jsonl', 'obs.jsonl', 'hook-errors.log', '.skilldir', '.active'];
const SYSTEM_BIN = new Set(['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin', '/usr/sbin', '/sbin']);
const NODE_SCRIPTS = ['sandbox-run.mjs', 'note.mjs'];
const PLUGIN_SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'zero-trust-review');

// ---------- lexer ----------
// index of the `)` that closes a group opened `depth` levels before s[from], or -1
function matchClose(s, from, depth) {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

// the command text of every $( ), backtick and <( ) / >( ) inside text, looking through $(( )) bodies; null when text is not balanced with confidence
function substitutions(text) {
  const cmds = [];
  let depth = 0; // plain grouping parens, as in $(( (1+2)*3 ))
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== '`') j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) return null;
      cmds.push(text.slice(i + 1, j));
      i = j;
    } else if ((c === '$' || c === '<' || c === '>') && text[i + 1] === '(') {
      const arith = c === '$' && text[i + 2] === '(';
      const k = matchClose(text, i + (arith ? 3 : 2), arith ? 2 : 1);
      if (k < 0) return null;
      if (arith && text[k - 1] === ')' && k - 1 >= i + 3) {
        const inner = substitutions(text.slice(i + 3, k - 1));
        if (!inner) return null;
        cmds.push(...inner);
      } else cmds.push(text.slice(i + 2, k));
      i = k;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return null;
  }
  return depth === 0 ? cmds : null;
}

// Returns [{ words, redirs }]: one entry per simple command; words have quotes removed, redirs are the WRITE targets (> >> >| &> >&file).
// Substitutions leave a "$(…)" placeholder word in the outer command and their own commands become separate segments.
function parse(src) {
  const segs = [];
  const stack = [];
  const heredocs = [];
  const fresh = () => ({ words: [], redirs: [], word: null, pending: null, dq: false });
  let cur = fresh();

  const endWord = () => {
    if (cur.word === null) return;
    if (!cur.pending) cur.words.push(cur.word);
    else if (cur.pending.write && !/^(\d+|-)$/.test(cur.word)) cur.redirs.push(cur.word);
    cur.word = null;
    cur.pending = null;
  };
  const endSeg = () => {
    endWord();
    if (cur.words.length || cur.redirs.length) segs.push({ words: cur.words, redirs: cur.redirs });
    cur = fresh();
  };
  const open = (closer, placeholder) => { stack.push({ outer: cur, closer, placeholder }); cur = fresh(); };
  const close = () => {
    endSeg();
    const f = stack.pop();
    cur = f.outer;
    if (f.placeholder) cur.word = `${cur.word ?? ''}$(…)`;
  };
  // anything the guard cannot parse with confidence becomes a segment whose "program" is unknown, hence denied
  const unparsable = () => segs.push({ words: ['<unparsable-substitution>'], redirs: [] });
  const dollarParen = i => {
    if (src[i + 2] === '(') { // $(( arithmetic )) is not a command itself, but its body can hold $( ), backticks and <( ), which run
      const k = matchClose(src, i + 3, 2);
      if (k < 0) { unparsable(); return src.length; }
      if (src[k - 1] === ')' && k - 1 >= i + 3) {
        const cmds = substitutions(src.slice(i + 3, k - 1));
        if (cmds) for (const c of cmds) segs.push(...parse(c)); else unparsable();
        cur.word = `${cur.word ?? ''}$((…))`;
        return k;
      }
    }
    open(')', true);
    return i + 1;
  };
  const backtick = i => { if (stack.at(-1)?.closer === '`') close(); else open('`', true); return i; };
  const readHeredocBodies = i => {
    for (const h of heredocs.splice(0)) {
      let pos = i + 1;
      const body = [];
      while (pos < src.length) {
        let eol = src.indexOf('\n', pos);
        if (eol < 0) eol = src.length;
        const line = src.slice(pos, eol);
        pos = eol + 1;
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
        body.push(line);
      }
      i = pos - 1;
      // an unquoted heredoc still expands $( ) and backticks, which run
      if (!h.quoted) {
        const cmds = substitutions(body.join('\n'));
        if (cmds) for (const c of cmds) segs.push(...parse(c)); else unparsable();
      }
    }
    return i;
  };
  const readDelimiter = j => {
    while (src[j] === ' ' || src[j] === '\t') j++;
    let delim = '', quoted = false;
    while (j < src.length && !/[\s;&|<>()]/.test(src[j])) {
      if (src[j] === "'" || src[j] === '"') {
        const k = src.indexOf(src[j], j + 1), end = k < 0 ? src.length : k;
        delim += src.slice(j + 1, end);
        quoted = true;
        j = end + 1;
      } else if (src[j] === '\\') { delim += src[j + 1] ?? ''; quoted = true; j += 2; }
      else delim += src[j++];
    }
    return { delim, quoted, next: j };
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (cur.dq) {
      if (c === '"') cur.dq = false;
      else if (c === '\\') { cur.word += src[i + 1] ?? ''; i++; }
      else if (c === '$' && next === '(') i = dollarParen(i);
      else if (c === '`') i = backtick(i);
      else cur.word += c;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1), end = j < 0 ? src.length : j;
      cur.word = (cur.word ?? '') + src.slice(i + 1, end);
      i = end;
    } else if (c === '"') { cur.word ??= ''; cur.dq = true; }
    else if (c === '\\') { if (next !== '\n') cur.word = (cur.word ?? '') + (next ?? ''); i++; }
    else if (c === '#' && cur.word === null) { while (i + 1 < src.length && src[i + 1] !== '\n') i++; }
    else if (c === '\n') { endSeg(); i = readHeredocBodies(i); }
    else if (c === ';' || c === '|' || (c === '&' && next !== '>')) endSeg();
    else if (c === ' ' || c === '\t') endWord();
    else if (c === '$' && next === '(') i = dollarParen(i);
    else if (c === '`') i = backtick(i);
    else if (c === '(') { endSeg(); open(')', false); }
    else if (c === ')') { if (stack.at(-1)?.closer === ')') close(); else endSeg(); }
    else if (c === '<' || c === '>' || c === '&') {
      if (c !== '&' && next === '(') { open(')', true); i++; continue; } // <( ) and >( ) process substitution
      if (cur.word !== null && !/^\d+$/.test(cur.word)) endWord(); else cur.word = null; // 2> : the digit is the fd, not an argument
      let j = i, op = '';
      if (src[j] === '&') op += src[j++];
      while (src[j] === '<' || src[j] === '>') op += src[j++];
      if (src[j] === '&' || src[j] === '|') op += src[j++];
      if (op === '<<') {
        const strip = src[j] === '-';
        const { delim, quoted, next: after } = readDelimiter(strip ? j + 1 : j);
        heredocs.push({ delim, quoted, strip });
        i = after - 1;
      } else {
        cur.pending = { write: op.includes('>') };
        i = j - 1;
      }
    } else cur.word = (cur.word ?? '') + c;
  }
  while (stack.length) close();
  endSeg();
  return segs;
}

// ---------- wrappers ----------
// Wrappers run another command. An option not listed here is a DENY (never silently dropped): -S/--split-string and -C/--chdir carry a command or a
// directory, sudo/doas/su/runas/chroot are not wrappers at all. flags = options without a value; values = option -> check(value). Whatever remains after the options is judged like any command.
const NUMBER = v => /^-?\d+(\.\d+)?$/.test(v);
const DURATION = v => /^\d+(\.\d+)?[smhd]?$/.test(v);
const noSteering = v => !isSteering(v);
const anything = () => true;
const WRAPPERS = {
  env: { flags: ['-i', '-', '--ignore-environment'], values: { '-u': noSteering, '--unset': noSteering } },
  command: { flags: ['-p'] },
  time: { flags: ['-p'] },
  nohup: {},
  builtin: {},
  nice: { flags: [/^-\d+$/], values: { '-n': NUMBER, '--adjustment': NUMBER } },
  ionice: { flags: ['-t', '--ignore'], values: { '-c': NUMBER, '--class': NUMBER, '-n': NUMBER, '--classdata': NUMBER } },
  exec: { flags: ['-c', '-l'], values: { '-a': anything } },
  setsid: { flags: ['-w', '-f', '--wait', '--fork'] },
  stdbuf: { values: Object.fromEntries(['-i', '-o', '-e', '--input', '--output', '--error'].map(k => [k, v => /^(0|L|\d+[KMG]?)$/.test(v)])) },
  timeout: {
    flags: ['--foreground', '--preserve-status', '-v', '--verbose'],
    values: { '-k': DURATION, '--kill-after': DURATION, '-s': v => /^(SIG)?[A-Z0-9]+$/.test(v), '--signal': v => /^(SIG)?[A-Z0-9]+$/.test(v) },
    after: w => (DURATION(w[0] ?? '') ? (w.shift(), null) : 'needs a numeric duration right after its options'),
  },
};
const WHY_WRAPPER_OPTION = 'is a wrapper option the guard does not allow (it can run a command, change directory or steer the environment)';

// consumes the wrapper's options from w (the words after the wrapper); returns a denial string or null
function readWrapperOptions(wrapper, w) {
  const spec = WRAPPERS[wrapper];
  const bad = a => deny(`${wrapper} ${a}`, WHY_WRAPPER_OPTION);
  while (w.length && w[0].startsWith('-') && w[0] !== '--') {
    const a = w.shift();
    if ((spec.flags ?? []).some(f => (f instanceof RegExp ? f.test(a) : f === a))) continue;
    const long = a.startsWith('--');
    const name = long ? a.split('=')[0] : a.slice(0, 2);
    const check = spec.values && Object.hasOwn(spec.values, name) ? spec.values[name] : null;
    if (!check) return bad(a);
    const value = long ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : w.shift()) : (a.length > 2 ? a.slice(2) : w.shift());
    if (value === undefined || !check(value)) return bad(a);
  }
  if (w[0] === '--') w.shift();
  const problem = spec.after?.(w);
  return problem ? deny(wrapper, problem) : null;
}
const CONTROL = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{']);
const NOOP = new Set(['for', 'select', 'case', 'function', 'fi', 'done', 'esac', '}']);

const ASSIGNMENT = /^([A-Za-z_]\w*)\+?=/;
// environment switches that steer the sandbox runner, the run folder, the ledgers or the loaders: never settable from a review agent's command
const STEERING_VARS = new Set(['ZT_SANDBOX_FORCE', 'ZT_TESTS_ONLY', 'ZT_SANDBOX_PLAN', 'ZT_RUN_DIR', 'ZT_MARKER_DIR', 'ZT_LEDGER', 'XDG_RUNTIME_DIR', 'HOME', 'TMPDIR',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'NODE_OPTIONS', 'PYTHONSTARTUP', 'BASH_ENV',
  'PATH', 'ZT_SANDBOX_IMAGE', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
  // config-driven code execution through git and pagers/editors
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_EXTERNAL_DIFF', 'GIT_PAGER',
  'GIT_EDITOR', 'GIT_ASKPASS', 'GIT_EXEC_PATH', 'GIT_PROXY_COMMAND', 'GIT_TEMPLATE_DIR', 'PAGER', 'EDITOR', 'VISUAL']);
const isSteering = v => STEERING_VARS.has(v) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(v);

// -> { prog, args, assigns } (prog is undefined for an assignment-only segment), { denial } for a bad wrapper option, or null when the segment
// runs and sets nothing (`command -v`, flow-control header). assigns = names of VAR=val words in the prefix, including those after env/time/...
// A wrapper with nothing left to run (bare `env`, `nohup`, `timeout 5`) comes back as the program itself, so it is judged on its own: denied.
function unwrap(words) {
  const w = [...words];
  const assigns = [];
  let lastWrapper = null;
  const nothingToRun = () => (assigns.length ? { assigns } : null);
  while (w.length) {
    const head = w[0];
    const assignment = ASSIGNMENT.exec(head);
    if (assignment) assigns.push(assignment[1]);
    if (assignment || CONTROL.has(head)) { w.shift(); continue; }
    const wrapper = programName(head);
    if (head === 'command' && /^-[vV]$/.test(w[1] ?? '')) return nothingToRun();
    if (wrapper === null || !Object.hasOwn(WRAPPERS, wrapper)) break;
    lastWrapper = wrapper;
    w.shift();
    const denial = readWrapperOptions(wrapper, w);
    if (denial) return { denial };
  }
  if (!w.length && lastWrapper) return { prog: lastWrapper, args: [], assigns };
  if ((w[0] === 'for' || w[0] === 'select') && isSteering(w[1] ?? '')) return { denial: deny(`setting ${w[1]}`, WHY_ENV) };
  if (!w.length || NOOP.has(w[0])) return nothingToRun();
  return { prog: w[0], args: w.slice(1), assigns };
}

// ---------- paths ----------
const GLOB = /[*?[]/;
const TMPDIR_VAR = /\$\{TMPDIR\}|\$TMPDIR/g;

// realpath of the longest existing prefix plus the not-yet-existing rest
function realish(p) {
  const rest = [];
  for (let cur = p; ;) {
    try { return join(realpathSync(cur), ...rest.reverse()); } catch {
      const up = dirname(cur);
      if (up === cur) return p;
      rest.push(basename(cur));
      cur = up;
    }
  }
}

// -> { path (real), leaf (real parent + leaf name, symlink leaf not followed), tail (glob part, if any) } or null when not knowable statically
function locate(p, ctx) {
  const s = p.replace(TMPDIR_VAR, ctx.tmp).replace(/^~(?=\/|$)/, ctx.home);
  if (/[$`]|^~/.test(s) || (!isAbsolute(s) && ctx.cwd === null)) return null;
  const parts = s.split('/');
  const g = parts.findIndex(x => GLOB.test(x));
  const head = g < 0 ? s : parts.slice(0, g).join('/') || (isAbsolute(s) ? '/' : '.');
  const abs = resolve(ctx.cwd ?? '/', head);
  return { path: realish(abs), leaf: join(realish(dirname(abs)), basename(abs)), tail: g < 0 ? [] : parts.slice(g) };
}

const strictlyInside = (p, root) => p.startsWith(root + sep);
function underTemp(p, ctx) {
  const loc = locate(p, ctx);
  return !!loc && !loc.tail.includes('..') && strictlyInside(loc.path, ctx.tmp);
}

// the run folder or the marker dir themselves or anything inside them, glob included: only note.mjs, sandbox-run.mjs and the hooks write there.
// `destructive` (rm, mv) also protects the parents of the run folder.
function isProtected(p, ctx, destructive = false) {
  const loc = locate(p, ctx);
  if (!loc) return RUN_FILES.includes(basename(p));
  const { path, leaf, tail } = loc;
  const inside = root => [path, leaf].some(x => x === root || strictlyInside(x, root));
  return inside(ctx.marker) || inside(ctx.run) || (destructive && !tail.length && strictlyInside(ctx.run, path));
}

// ---------- argument helpers ----------
const operands = args => {
  const i = args.indexOf('--');
  const before = (i < 0 ? args : args.slice(0, i)).filter(a => !a.startsWith('-'));
  return i < 0 ? before : [...before, ...args.slice(i + 1)];
};
const hasFlag = (args, re) => args.some(a => re.test(a));

function cpDest(args) {
  const i = args.findIndex(a => a === '-t' || a === '--target-directory');
  if (i >= 0) return args[i + 1];
  const eq = args.find(a => a.startsWith('--target-directory='));
  return eq ? eq.slice('--target-directory='.length) : operands(args).at(-1);
}

// ---------- sed ----------
// sed can run commands (the e command, the e flag of s///) and write files (w, W, flag w, r, R). So only a tiny, fully parsed language is allowed:
// optional addresses plus p, d, q, s or y. Anything else (including -f, braces, a/i/c text, comments) is denied: when in doubt, deny.
const SED_DELIMS = '/|#,:@!%~_';
const SED_SHORT = 'nErszu';
const SED_LONG = new Set(['--quiet', '--silent', '--regexp-extended', '--separate', '--null-data', '--unbuffered', '--sandbox', '--posix']);
const sedInPlace = args => hasFlag(args, /^-[A-Za-z]*[iI]|^--in-place(=|$)/);

// index just past the [...] expression starting at s[i] ('[' ), or -1
function skipBracket(s, i) {
  let j = i + 1;
  if (s[j] === '^') j++;
  if (s[j] === ']') j++;
  while (j < s.length) {
    if (s[j] === '[' && ':.='.includes(s[j + 1] ?? '')) { const k = s.indexOf(s[j + 1] + ']', j + 2); if (k < 0) return -1; j = k + 2; }
    else if (s[j] === ']') return j + 1;
    else j++;
  }
  return -1;
}
// index just past the closing delim of a s///, y/// or address part starting at s[i]; \ escapes skip a char, regex parts skip [...]; -1 if unterminated
function scanDelimited(s, i, delim, isRegex) {
  while (i < s.length) {
    if (s[i] === '\\') i += 2;
    else if (s[i] === delim) return i + 1;
    else if (isRegex && s[i] === '[') { i = skipBracket(s, i); if (i < 0) return -1; }
    else i++;
  }
  return -1;
}

function sedScriptOk(s) {
  let i = 0;
  const blanks = () => { while (s[i] === ' ' || s[i] === '\t') i++; };
  const number = () => { const m = /^\d+/.exec(s.slice(i)); i += m ? m[0].length : 0; return !!m; };
  const regexAddress = () => {
    const delim = s[i] === '/' ? '/' : s[i] === '\\' && SED_DELIMS.includes(s[i + 1] ?? '\n') ? s[i + 1] : '';
    if (!delim) return false;
    i = scanDelimited(s, i + (delim === '/' && s[i] === '/' ? 1 : 2), delim, true);
    while (s[i] === 'I' || s[i] === 'M') i++;
    return i >= 0;
  };
  const address = () => {
    if (s[i] === '$') { i++; return true; }
    if (number()) return s[i] !== '~' || (i++, number());
    return regexAddress();
  };
  const delimited = parts => {
    const delim = s[i++];
    if (!SED_DELIMS.includes(delim ?? '\n')) return false;
    for (const isRegex of parts) { i = scanDelimited(s, i, delim, isRegex); if (i < 0) return false; }
    return true;
  };
  for (;;) {
    while (i < s.length && /[\s;]/.test(s[i])) i++;
    if (i >= s.length) return true;
    if (address()) {
      blanks();
      if (s[i] === ',') {
        i++;
        blanks();
        if (s[i] === '+' || s[i] === '~') { i++; if (!number()) return false; } else if (!address()) return false;
      }
    }
    if (i < 0) return false;
    blanks();
    if (s[i] === '!') { i++; blanks(); }
    const cmd = s[i++];
    if (cmd === 'q') number();
    else if (cmd === 's') { if (!delimited([true, false])) return false; while (/[gpiImM\d]/.test(s[i] ?? '')) i++; } // no e, no w flag
    else if (cmd === 'y') { if (!delimited([false, false])) return false; }
    else if (cmd !== 'p' && cmd !== 'd') return false;
    blanks();
    if (i < s.length && s[i] !== ';' && s[i] !== '\n') return false;
  }
}

function sedRule(args, ctx) {
  const scripts = [];
  let operands = [];
  let inPlace = false;
  const bad = why => deny('sed', why, FIX_STATE);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { operands.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq < 0 ? a : a.slice(0, eq);
      if (name === '--expression') scripts.push(eq < 0 ? args[++i] ?? '' : a.slice(eq + 1));
      else if (name === '--in-place') inPlace = true;
      else if (!SED_LONG.has(name)) return bad('uses an option that can run commands or write files (-f, ...)');
    } else if (a.length > 1 && a[0] === '-') {
      for (let j = 1; j < a.length; j++) {
        if (SED_SHORT.includes(a[j])) continue;
        if (a[j] === 'i' || a[j] === 'I') inPlace = true;
        else if (a[j] === 'e') scripts.push(a.slice(j + 1) || (args[++i] ?? ''));
        else return bad('uses an option that can run commands or write files (-f, ...)');
        break;
      }
    } else operands.push(a);
  }
  if (inPlace) operands = operands.filter(o => o !== ''); // macOS: -i ''
  if (!scripts.length) {
    const script = operands.shift();
    if (script === undefined) return bad('has no script');
    scripts.push(script);
  }
  if (!scripts.every(sedScriptOk)) return bad('script is outside the allowed subset (addresses + p, d, q, s, y; no e, w, r, -f)');
  return inPlace ? needTemp('sed -i', operands, ctx) : null;
}

// ---------- per-program rules: (args, ctx) => denial string | null ----------
const needTemp = (what, paths, ctx) => {
  return paths.every(p => underTemp(p, ctx)) ? null : deny(what, WHY_FILES, FIX_STATE);
};

// read subcommands only (an unknown one may be a user alias that runs a program, so it is denied too); fetch is kept for change-request refs
const GIT_READ = new Set(['log', 'show', 'diff', 'diff-tree', 'diff-index', 'diff-files', 'blame', 'annotate', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list', 'merge-base',
  'cat-file', 'status', 'grep', 'shortlog', 'describe', 'name-rev', 'for-each-ref', 'show-ref', 'ls-remote', 'archive', 'fetch', 'remote', 'branch', 'tag', 'reflog',
  'whatchanged', 'cherry', 'range-diff', 'version', 'count-objects', 'check-ignore', 'show-branch', 'symbolic-ref']);
const GIT_REMOTE_WRITERS = new Set(['add', 'set-url', 'remove', 'rm', 'rename', 'set-head', 'set-branches', 'prune', 'update']);
const GIT_BRANCH_CONFIG_WRITERS = /^(-u|--set-upstream(-to)?|--unset-upstream|--edit-description)(=|$)/;
// The guard does not inject -c core.fsmonitor= -c core.hooksPath=/dev/null -c core.pager=cat -c protocol.ext.allow=never itself; it DENIES any command that
// passes a -c for those keys (all of core.* and protocol.* are risky below), so nothing conflicts with git's own defaults. A ~/.gitconfig or .git/config
// changed through some other channel is out of the guard's reach once written, which is why every write there (redirect, tee, cp, mv, sed -i, git config,
// git remote set-url, ...) is denied up front.
// config keys that run a program, load other config, or change what a later git command executes
const GIT_RISKY_CONFIG = /^(core\.|diff\.(external|.*\.(command|textconv))|pager\.|alias\.|credential|filter\.|gpg|protocol\.|include|merge\.|mergetool|difftool|sequence\.|browser\.|web\.|man\.|interactive\.|trailer\.|uploadpack|receive\.)/i;
const GIT_OPTS_WITH_VALUE = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);
// options that run a program, open a pager or write an arbitrary file; git also accepts unique abbreviations, so any prefix of these is denied too
const GIT_DENIED_LONG = ['--open-files-in-pager', '--output', '--ext-diff', '--textconv', '--exec-path', '--upload-pack', '--receive-pack', '--exec', '--no-index'];

function gitConfigDenial(kv) {
  return GIT_RISKY_CONFIG.test(kv) ? deny(`git config ${kv.split('=')[0]}`, 'would run a program named by config or change what git runs', FIX_STATE) : null;
}
function gitRule(args) {
  let i = 0;
  for (; i < args.length; i++) { // global options up to the subcommand
    const a = args[i];
    if (a === '-c' || /^-c./.test(a)) {
      const denied = gitConfigDenial(a === '-c' ? args[++i] ?? '' : a.slice(2));
      if (denied) return denied;
    } else if (a === '--config-env' || a.startsWith('--config-env=')) {
      const denied = gitConfigDenial(a === '--config-env' ? args[++i] ?? '' : a.slice('--config-env='.length));
      if (denied) return denied;
    } else if (GIT_OPTS_WITH_VALUE.has(a)) i++;
    else if (!a.startsWith('-')) break;
  }
  const sub = args[i];
  if (sub === undefined ? args.some(a => a !== '--version') : !GIT_READ.has(sub)) {
    return deny(`git ${sub ?? args[0] ?? ''}`.trim(), 'is not a read-only git subcommand (it could change the repo under review, its config or hooks, or launch another program)', FIX_STATE);
  }
  if (sub === 'symbolic-ref' && (operands(args.slice(i + 1)).length > 1 || hasFlag(args.slice(i + 1), /^(-d|--delete|-m)$/))) {
    return deny('git symbolic-ref (write)', 'would change a ref', FIX_STATE);
  }
  if (sub === 'remote' && GIT_REMOTE_WRITERS.has(args[i + 1])) return deny(`git remote ${args[i + 1]}`, 'would write the repo config (remote URLs, hooks)', FIX_STATE);
  if (sub === 'branch' && hasFlag(args.slice(i + 1), GIT_BRANCH_CONFIG_WRITERS)) return deny('git branch (upstream/description)', 'would write the repo config', FIX_STATE);
  const denied = [...GIT_DENIED_LONG, ...(sub === 'archive' ? ['--remote'] : [])];
  const end = args.indexOf('--');
  for (const a of end < 0 ? args : args.slice(0, end)) {
    const name = a.split('=')[0];
    if (/^-O/.test(a) || (name.startsWith('--') && name.length > 2 && denied.some(d => d.startsWith(name)))) {
      return deny(`git ${name}`, 'would run a program, open a pager, write a file or read outside the repo', FIX_STATE);
    }
  }
  return null;
}

const DOCKER_RUN_FLAGS = ['--volume', '--mount', '--privileged', '--cap-add', '--device', '--security-opt', '--volumes-from'];
const DOCKER_HOST_NS = /^--(network|net|pid|ipc|uts|userns)$/;
function dockerRun(rest) {
  const named = rest.indexOf('--name');
  const name = named >= 0 ? rest[named + 1] : rest.find(a => a.startsWith('--name='))?.slice('--name='.length);
  const risky = rest.some((a, i) => /^-[A-Za-z]*v/.test(a) || DOCKER_RUN_FLAGS.some(f => a === f || a.startsWith(`${f}=`))
    || (DOCKER_HOST_NS.test(a) && rest[i + 1] === 'host') || /^--(network|net|pid|ipc|uts|userns)=host$/.test(a));
  return name?.startsWith('zt-') && !risky ? null
    : deny('docker run', 'needs --name zt-* and no volumes, mounts, privileges or host namespaces', FIX_STATE);
}
function dockerRule(args) {
  const [sub, ...rest] = args;
  if (!sub || sub.startsWith('-')) return deny('docker with global options', 'is not allowed', FIX_STATE);
  if (['ps', 'port', 'logs', 'inspect', 'pull'].includes(sub)) return null;
  if (sub === 'image') return ['ls', 'inspect'].includes(rest[0]) ? null : deny(`docker image ${rest[0] ?? ''}`.trim(), 'is not allowed', FIX_STATE);
  if (sub === 'rm') {
    const names = rest.filter(a => !a.startsWith('-'));
    return names.length && names.every(n => n.startsWith('zt-')) && rest.filter(a => a.startsWith('-')).every(a => a === '-f' || a === '--force')
      ? null : deny('docker rm', 'is only allowed for zt-* containers', FIX_STATE);
  }
  if (sub === 'run') return dockerRun(rest);
  return deny(`docker ${sub}`);
}

// tar: list or extract only, from a small set of known options (unknown = deny, so no --to-command, --checkpoint-action, -I/--use-compress-program,
// --rsh-command, -F/--info-script/--new-volume-script, --remove-files, create/append/update/delete forms). Extraction must land in the temp dir.
const TAR_SHORT = 'xtvzjJafCpkmOhPTX';
const TAR_SHORT_VALUE = 'fCTX';
const TAR_LONG = new Set(['extract', 'get', 'list', 'file', 'directory', 'verbose', 'gzip', 'gunzip', 'bzip2', 'xz', 'zstd', 'lzma', 'auto-compress', 'strip-components',
  'wildcards', 'no-wildcards', 'exclude', 'one-top-level', 'no-same-owner', 'no-same-permissions', 'touch', 'ignore-zeros', 'keep-old-files', 'skip-old-files',
  'keep-newer-files', 'overwrite', 'no-overwrite-dir', 'files-from', 'exclude-from', 'to-stdout', 'preserve-permissions']);
const TAR_LONG_VALUE = new Set(['file', 'directory', 'strip-components', 'exclude', 'files-from', 'exclude-from']);

function tarRule(args, ctx) {
  const bad = why => deny('tar', why, FIX_STATE);
  const modes = new Set();
  const dirs = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = a.slice(2, eq < 0 ? undefined : eq);
      if (!TAR_LONG.has(name)) return bad('uses an option that can run programs or write archives (--to-command, -I, --remove-files, create, ...)');
      if (name === 'extract' || name === 'get') modes.add('x');
      if (name === 'list') modes.add('t');
      if (TAR_LONG_VALUE.has(name)) { const v = eq < 0 ? args[++i] ?? '' : a.slice(eq + 1); if (name === 'directory') dirs.push(v); }
      continue;
    }
    const oldStyle = i === 0 && !a.startsWith('-');
    if (!oldStyle && !(a.startsWith('-') && a.length > 1)) continue;
    const letters = oldStyle ? a : a.slice(1);
    for (let j = 0; j < letters.length; j++) {
      const ch = letters[j];
      if (!TAR_SHORT.includes(ch)) return bad('uses an option that can run programs or write archives (-c, -I, -F, ...)');
      if (ch === 'x' || ch === 't') modes.add(ch);
      if (!TAR_SHORT_VALUE.includes(ch)) continue;
      const attached = oldStyle ? '' : letters.slice(j + 1); // GNU getopt: the rest of a bundle is the argument; old style takes the following args in order
      const value = attached || (args[++i] ?? '');
      if (ch === 'C') dirs.push(value);
      if (!oldStyle) break;
    }
  }
  if (modes.size !== 1) return bad('is only allowed to list (t) or extract (x)');
  if (modes.has('x') && !(dirs.length ? dirs.every(d => underTemp(d, ctx)) : underTemp('.', ctx))) return bad('may only extract into the temp dir (use -C DIR)');
  return null;
}

// A subagent may only use note.mjs to write its own notes, never to start or stop the run (the lead does that, in the main session where this guard
// does not act). The subcommand must be the very first argument, so no flag can change what runs.
const NOTE_SUBCOMMANDS = new Set(['begin', 'ck', 'env', 'notes', 'done', 'dying']);
const noteRule = rest => (NOTE_SUBCOMMANDS.has(rest[0] ?? '') ? null
  : deny(`note.mjs ${rest[0] ?? '(no subcommand)'}`, 'is not allowed: run lifecycle belongs to the lead', `Allowed subcommands, first on the line: ${[...NOTE_SUBCOMMANDS].join(', ')}.`));

// sandbox-run.mjs: `--check`, or `[--cwd|--rw|--ro|--timeout|--env|--run|--allow-port VALUE]... -- CMD ARG...`; nothing else before the `--`
const SANDBOX_VALUE_FLAGS = new Set(['--cwd', '--rw', '--ro', '--timeout', '--env', '--run', '--allow-port']);
function sandboxRule(rest) {
  const bad = what => deny(`sandbox-run.mjs ${what}`, 'is not the runner form the guard allows', 'Use: node <skillDir>/sandbox-run.mjs [--cwd DIR] [--rw DIR] [--ro DIR] [--timeout SEC] [--env K=V] [--allow-port N] -- CMD, or --check.');
  let sawCheck = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') return null;
    if (a === '--check') sawCheck = true;
    else if (SANDBOX_VALUE_FLAGS.has(a)) { if (rest[++i] === undefined || rest[i] === '--') return bad(a); }
    else if (!SANDBOX_VALUE_FLAGS.has(a.split('=')[0]) || !a.includes('=')) return bad(a);
  }
  return sawCheck ? null : bad('without -- CMD');
}

// node may run only the skill's own sandbox-run.mjs / note.mjs, named by an absolute (or ~/) path whose realpath is one of ctx.trusted
function nodeRule(args, ctx) {
  const script = args[0];
  if (script === undefined || script.startsWith('-')) return deny('node');
  const abs = script.replace(/^~(?=\/)/, ctx.home);
  let real = null;
  if (isAbsolute(abs)) { try { real = realpathSync(abs); } catch { /* unresolvable */ } }
  if (real && ctx.trusted.has(real)) return basename(real) === 'note.mjs' ? noteRule(args.slice(1)) : sandboxRule(args.slice(1));
  return NODE_SCRIPTS.includes(basename(script)) ? deny(`node ${script}`, WHY_NOT_SKILL_SCRIPT) : deny('node');
}

// sort: no --compress-program (--co = any abbreviation); an output file (-o, --output) is a write and must be under the temp dir
function sortRule(args, ctx) {
  if (hasFlag(args, /^--co/)) return deny('sort --compress-program', 'would run a program');
  const outputs = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    if (a.startsWith('--output')) outputs.push(a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i] ?? '');
    else if (/^-[A-Za-z]*o/.test(a)) outputs.push(a.slice(a.indexOf('o') + 1) || (args[++i] ?? ''));
  }
  return outputs.length ? needTemp('sort -o', outputs, ctx) : null;
}

const RULES = {
  node: nodeRule,
  git: gitRule,
  docker: dockerRule,
  tar: tarRule,
  rm: (args, ctx) => needTemp('rm', operands(args), ctx),
  mv: (args, ctx) => needTemp('mv', operands(args), ctx),
  mkdir: (args, ctx) => needTemp('mkdir', operands(args), ctx),
  touch: (args, ctx) => needTemp('touch', operands(args), ctx),
  tee: (args, ctx) => needTemp('tee', operands(args), ctx),
  cp: (args, ctx) => needTemp('cp', [cpDest(args) ?? ''], ctx), // sources are only read
  sed: sedRule,
  find: args => (hasFlag(args, /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/) ? deny('find -exec/-delete', 'would run commands or modify files') : null),
  rg: args => (hasFlag(args, /^--(pre|hostname-bin)(=|$)/) ? deny('rg --pre', 'would run a program') : null),
  sort: sortRule,
};
// awk programs are inspected as text. Denied: system(), any `|` outside strings and /regex/ literals (print | cmd, cmd | getline, |&), a `>` or `>>`
// redirect after print/printf (a comparison in a pattern or inside parentheses is fine), -f/-i/-l/-E/@include (program files and extensions we cannot see).
function awkScan(src) {
  let prev = ''; // last significant char: tells a /regex/ literal from a division
  let inPrint = false;
  let depth = 0;
  const found = { pipe: false, redirect: false };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') { for (i++; i < src.length && src[i] !== '"'; i += src[i] === '\\' ? 2 : 1); prev = '"'; }
    else if (c === '/' && (prev === '' || '(,~!{};&|=<>'.includes(prev))) {
      for (i++; i < src.length && src[i] !== '/'; i += src[i] === '\\' ? 2 : 1) if (src[i] === '[') { const k = src.indexOf(']', i + 2); if (k > 0) i = k; }
      prev = '/';
    } else if (c === '|') found.pipe = true;
    else if (/[A-Za-z_]/.test(c)) {
      const word = /^\w+/.exec(src.slice(i))[0];
      if (word === 'print' || word === 'printf') { inPrint = true; depth = 0; }
      i += word.length - 1;
      prev = 'a';
    } else {
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' || c === '\n' || c === '{' || c === '}') inPrint = false;
      else if (c === '>' && inPrint && depth <= 0) found.redirect = true;
      if (!/\s/.test(c)) prev = c;
    }
  }
  return found;
}
function awkProgram(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-v' || args[i] === '-F') i++;
    else if (args[i] === '--') return args[i + 1];
    else if (!args[i].startsWith('-')) return args[i];
  }
  return undefined;
}
const awkRule = args => {
  const program = awkProgram(args) ?? '';
  const { pipe, redirect } = awkScan(program);
  const bad = hasFlag(args, /^(-f|--file|-i|--include|-l|--load|-E|--exec|--source)/) || /\bsystem\s*\(|@(load|include)/.test(program) || pipe || redirect;
  return bad ? deny('awk', 'would run commands or write files', FIX_STATE) : null;
};
for (const name of ['awk', 'gawk', 'mawk', 'nawk']) RULES[name] = awkRule;

// The read-only allow-list is deliberately small: what review agents really use. Everything else is denied (unknown program), with the hint below.
// READERS may name files in the run folder as operands (to read them); their write forms are excluded in readsOnly.
const READERS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'ls', 'stat', 'sed', 'awk', 'gawk', 'mawk', 'nawk', 'sort', 'cut', 'tr', 'diff', 'jq',
  'basename', 'dirname', 'realpath', 'readlink', 'pwd', 'echo', 'printf', 'test', '[', '[[', 'date', 'find', 'cd', 'pushd', 'popd']);
// shell builtins and no-ops the same commands need around them
const SIMPLE = new Set([...READERS, 'true', 'false', ':', 'sleep', 'export', 'unset', 'set', 'exit', 'declare', 'typeset', 'readonly', 'local', 'read', 'mapfile',
  'readarray', 'getopts']);
// programs that used to be allowed or are tempting: denied with a pointer to the allowed ones (`sort a | uniq` is denied: use `sort -u`)
const NOT_ALLOWED_HINT = new Set(['uniq', 'xxd', 'tree', 'od', 'strings', 'column', 'file', 'cmp', 'nl', 'tac', 'rev', 'fold', 'paste', 'comm', 'du', 'df', 'md5sum',
  'md5', 'shasum', 'sha256sum', 'which', 'type', 'uname', 'whoami', 'id', 'hostname', 'less', 'more']);
// programs that run other programs with arguments we cannot see (stdin, a schedule, another session): no argument-sensitive rule can judge them
const STDIN_ARGS = new Set(['xargs', 'parallel', 'watch', 'entr', 'script', 'at', 'batch', 'crontab', 'launchctl', 'systemd-run', 'xdg-open', 'open']);
const WHY_NOT_ALLOWED = 'is not on the review allow-list';
const FIX_NOT_ALLOWED = 'Use grep/sort/awk (sort -u instead of uniq) or the Read tool.';

const readsOnly = (name, args) => READERS.has(name)
  && !(name === 'sort' && hasFlag(args, /^(-[A-Za-z]*o|--output)/))
  && !(name === 'sed' && sedInPlace(args))
  && !(name === 'find' && hasFlag(args, /^-f(print|printf|ls)/));

function touchesRunFiles(name, args, ctx) {
  if (name === 'cp') { const d = cpDest(args); return d !== undefined && isProtected(d, ctx); }
  if (readsOnly(name, args)) return false;
  const destructive = name === 'rm' || name === 'mv';
  return args.map(a => a.replace(/^(--?[\w-]+|[a-z]+)=/, '')).filter(a => a && !a.startsWith('-')).some(a => isProtected(a, ctx, destructive));
}

// bare name, or null for a path we must not run (./x, /repo/bin/x, ~/x); /usr/bin/git and friends count as `git`
const programName = prog => (!prog.includes('/') ? prog : SYSTEM_BIN.has(dirname(prog)) ? basename(prog) : null);

// shell builtins that assign variables: a steering variable must not be set through any of them, with or without `=`
const NAME_BUILTINS = new Set(['export', 'declare', 'typeset', 'readonly', 'local', 'unset']);
const READ_BUILTINS = new Set(['read', 'mapfile', 'readarray', 'getopts']);
const LISTING_BUILTINS = new Set(['export', 'declare', 'typeset', 'readonly', 'local']); // with no operand they print every variable, secrets included
const operandNames = args => args.filter(a => !/^[-+]/.test(a)).map(a => a.replace(/\+?=[\s\S]*$/, '').replace(/\[[\s\S]*$/, ''));
const WHY_ASSIGN = 'would assign a shell variable that can steer the sandbox, the run folder or the loaders';

function builtinDenial(name, args) {
  const hit = NAME_BUILTINS.has(name) ? operandNames(args).find(isSteering) : READ_BUILTINS.has(name) ? args.find(isSteering) : undefined;
  if (hit) return deny(`setting ${hit}`, WHY_ENV);
  if (name === 'printf' && hasFlag(args, /^-v/)) return deny('printf -v', WHY_ASSIGN);
  if (name === 'set' && hasFlag(args, /^-[A-Za-z]*[ao]|^\+[A-Za-z]*o/)) return deny('set -a/-o', WHY_ASSIGN);
  if (['declare', 'typeset', 'local'].includes(name) && hasFlag(args, /^-[A-Za-z]*n/)) return deny(`${name} -n`, 'creates a name reference that can assign any variable');
  if ((name === 'mapfile' || name === 'readarray') && hasFlag(args, /^-[A-Za-z]*C/)) return deny(`${name} -C`, 'would run a callback command');
  return null;
}
const listsEnvironment = (name, args) => (name === 'set' && !args.length) || (LISTING_BUILTINS.has(name) && !operandNames(args).length);

// Redirects follow the same write policy as cp/mv/tee: /dev/null, /dev/stdout, /dev/stderr, /dev/tty and paths under the temp dir only. That keeps
// an agent from writing ~/.gitconfig, ~/.config/git/*, .git/config, .git/hooks/*, shell rc files, ~/.ssh, ~/.claude and the marker dir: once such a file
// is changed, a later git/shell/ssh run executes what it names and this guard cannot see it any more, so the write itself is what is denied.
const DEV_TARGETS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty']);

function judge(seg, unwrapped, ctx) {
  for (const target of seg.redirs) {
    if (isProtected(target, ctx)) return deny(`redirecting into ${basename(target)}`, WHY_RUN_WRITE, FIX_STATE);
    if (!DEV_TARGETS.has(target) && !underTemp(target, ctx)) return deny(`redirecting into ${target}`, 'writes outside the temp dir', FIX_STATE);
  }
  if (!unwrapped) return null;
  if (unwrapped.denial) return unwrapped.denial;
  const { prog, args, assigns } = unwrapped;
  const name = prog === undefined ? undefined : programName(prog);
  const steering = assigns.find(isSteering);
  if (steering) return deny(`setting ${steering}`, WHY_ENV);
  if (prog === undefined) return null;
  const builtin = builtinDenial(name, args);
  if (builtin) return builtin;
  if (listsEnvironment(name, args)) return deny(name, 'would print the whole environment, which can hold secrets', FIX_STATE);
  if (name === null) return deny(prog, 'is a local executable and would run repo code');
  if (STDIN_ARGS.has(name)) return deny(prog, 'is not allowed', 'Reason: arguments supplied on stdin cannot be checked: pass the files explicitly.');
  if (name === 'node') return nodeRule(args, ctx);
  if (touchesRunFiles(name, args, ctx)) return deny(name, WHY_RUN_WRITE, FIX_STATE);
  if (Object.hasOwn(RULES, name)) return RULES[name](args, ctx);
  if (SIMPLE.has(name)) return null;
  return NOT_ALLOWED_HINT.has(name) ? deny(prog, WHY_NOT_ALLOWED, FIX_NOT_ALLOWED) : deny(prog);
}

// a `cd` to a statically known dir lets later relative paths resolve; an unknown target makes them unverifiable
function trackCd(unwrapped, ctx) {
  if (!unwrapped?.prog || !['cd', 'pushd'].includes(programName(unwrapped.prog))) return;
  const target = unwrapped.args.find(a => !a.startsWith('-'));
  const loc = target === undefined ? null : locate(target, ctx);
  ctx.cwd = loc && !loc.tail.length ? loc.path : null;
}

function decide(command, ctx) {
  for (const seg of parse(command)) {
    const unwrapped = unwrap(seg.words);
    const verdict = judge(seg, unwrapped, ctx);
    if (verdict) return verdict;
    trackCd(unwrapped, ctx);
  }
  return null;
}

// ---------- trusted skill scripts ----------
// RUN/.skilldir (written by note.mjs activate) names the skill dir when the skill is not part of the plugin; it counts only if it is a regular file
// (not a symlink) that we own and nobody else can write. Any problem = absent.
function skillDirFromRun(run) {
  try {
    const file = join(run, '.skilldir');
    const st = lstatSync(file);
    if (!st.isFile() || (typeof process.getuid === 'function' && st.uid !== process.getuid()) || (st.mode & 0o022) !== 0) return '';
    const dir = readFileSync(file, 'utf8').split('\n')[0].trim();
    return isAbsolute(dir) ? dir : '';
  } catch { return ''; }
}

// <real skill dir>/sandbox-run.mjs and note.mjs for the plugin's own skill dir and the dir named by RUN/.skilldir. A script that is itself a symlink
// to somewhere else is not trusted (its realpath is not <real dir>/<name>), so a link planted in a skill dir cannot redirect trust.
function trustedScripts(run) {
  const trusted = new Set();
  for (const dir of [PLUGIN_SKILL_DIR, skillDirFromRun(run)]) {
    if (!dir) continue;
    for (const name of NODE_SCRIPTS) {
      try {
        const file = join(realpathSync(dir), name);
        if (realpathSync(file) === file) trusted.add(file);
      } catch { /* not installed there */ }
    }
  }
  return trusted;
}

// ---------- main ----------
let run = '';
let appendSafe;
try {
  const runctx = await import('../skills/zero-trust-review/runctx.mjs');
  appendSafe = runctx.appendSafe;
  const input = JSON.parse(readFileSync(0, 'utf8'));
  run = input?.agent_id ? runctx.readMarker() : '';
  const command = input?.tool_input?.command;
  if (run && typeof command === 'string') {
    const reason = decide(command, {
      cwd: input.cwd || process.cwd(), tmp: realish(tmpdir()), home: homedir(), run, marker: realish(runctx.markerDir()), trusted: trustedScripts(run),
    });
    if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  }
} catch (err) {
  try {
    if (run) appendSafe(run, join(run, 'hook-errors.log'), `${new Date().toISOString()} zt-guard: ${String(err?.message ?? err).split('\n')[0]}\n`);
  } catch { /* RUN unwritable or runctx missing: nothing left to do, stay silent */ }
}
