// Pure: find a command or MCP call that creates an issue or a pull request, and where its body comes from (ADR 0012, Guard, GuardMcp).
// Pattern matching on the command text, no shell evaluation: it catches agent mistakes, not a determined attacker.
import { basename } from 'node:path';

const SEGMENT_SPLIT_RE = /&&|\|\||[;|&\n()`]|\$\(/g;
const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'builtin']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
// gh/glab flags that take a value, so the value is not read as a positional
const VALUE_FLAGS = new Set(['-R', '--repo', '--hostname', '-t', '--title', '-a', '--assignee', '-l', '--label', '-m', '--milestone', '-p', '--project',
  '-B', '--base', '-H', '--head', '-r', '--reviewer', '-T', '--template', '--target-branch', '--source-branch', '-s']);
const CREATES = { gh: { issue: 'issue', pr: 'pr' }, glab: { issue: 'issue', mr: 'pr' } };
const BODY = { gh: ['-b', '--body'], glab: ['-d', '--description'] };
const BODY_FILE = { gh: ['-F', '--body-file'], glab: [] };
const NO_BODY = new Set(['--fill', '--fill-first', '--fill-verbose', '-f', '-w', '--web', '-T', '--template', '--recover', '-e', '--editor']);
const FIX = 'pass the body as text or with --body-file <file>';

// a word is a run of quoted and unquoted parts (--body="a b" is one word); quotes are removed, their text kept
const unquote = t => t.replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/gs, (m, d, s) => (d !== undefined ? d.replace(/\\(["\\$`])/g, '$1') : s));
const tokenize = seg => (seg.match(/(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s"'])+/g) ?? []).map(unquote);
const stripPrefix = tokens => { let i = 0; while (i < tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++; return tokens.slice(i); };

/** Simple commands of a command line with their offsets; quoted spans are blanked before splitting. */
function segments(command) {
  const masked = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, m => ' '.repeat(m.length));
  const out = [];
  let start = 0;
  for (const m of masked.matchAll(SEGMENT_SPLIT_RE)) { out.push({ text: command.slice(start, m.index), at: start }); start = m.index + m[0].length; }
  out.push({ text: command.slice(start), at: start });
  return out;
}
const positionals = args => { const out = []; for (let i = 0; i < args.length; i++) { if (VALUE_FLAGS.has(args[i])) { i++; continue; } if (!args[i].startsWith('-')) out.push(args[i]); } return out; };

/** The value of the first listed flag: `--flag value`, `--flag=value` or `-fvalue` is not read (gh needs a space or =). */
function flagValue(args, names) {
  for (let i = 0; i < args.length; i++) {
    for (const n of names) {
      if (args[i] === n) return { value: args[i + 1] ?? '' };
      if (n.startsWith('--') && args[i].startsWith(`${n}=`)) return { value: args[i].slice(n.length + 1) };
    }
  }
  return null;
}

const HEREDOC_SUB_RE = /^\$\(\s*cat\s+<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[\t ]*\2[\t ]*\n?\s*\)$/;
const CAT_FILE_RE = /^\$\(\s*(?:cat\s+|<\s*)(["']?)([^\s"'<>|;&()$`]+)\1\s*\)$/;
const HEREDOC_RE = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[\t]*\2(?:\n|$)/;

function bodyFrom(value) {
  const sub = HEREDOC_SUB_RE.exec(value);
  if (sub) return { body: sub[3] };
  const cat = CAT_FILE_RE.exec(value);
  if (cat) return { bodyFile: cat[2] };
  if (/\$[({A-Za-z_]|`/.test(value)) return { unreadable: `the body uses a shell variable or command the guard cannot read; ${FIX}` };
  return { body: value.replace(/\\n/g, '\n') };
}

/**
 * {prog, kind: 'issue'|'pr', body | bodyFile | unreadable} for the first `gh issue create`, `gh pr create`, `glab issue create` or
 * `glab mr create` in the command line, else null.
 */
export function createCall(command, depth = 0) {
  const cmd = String(command ?? '');
  for (const seg of segments(cmd)) {
    const t = stripPrefix(tokenize(seg.text));
    const prog = basename(t[0] ?? '');
    const c = t.findIndex(x => /^-[A-Za-z]*c$/.test(x));
    if (SHELLS.has(prog) && c > 0 && t[c + 1] && depth < 3) { const inner = createCall(t[c + 1], depth + 1); if (inner) return inner; continue; }
    const kinds = CREATES[prog];
    if (!kinds) continue;
    const args = t.slice(1);
    const pos = positionals(args);
    const kind = kinds[pos[0]];
    if (!kind || pos[1] !== 'create') continue;
    const out = { prog, kind };
    const file = flagValue(args, BODY_FILE[prog]);
    if (file) {
      if (file.value !== '-') return { ...out, bodyFile: file.value };
      const doc = HEREDOC_RE.exec(cmd.slice(seg.at));
      return doc ? { ...out, body: doc[3] } : { ...out, unreadable: `the body comes from stdin, which the guard cannot read; ${FIX}` };
    }
    const inline = flagValue(args, BODY[prog]);
    if (inline) return { ...out, ...bodyFrom(inline.value) };
    const none = args.find(a => NO_BODY.has(a));
    return { ...out, unreadable: none ? `${none} fills the body from somewhere the guard cannot read; ${FIX}` : `no body given (an editor would open); ${FIX}` };
  }
  return null;
}

const MCP_SYSTEM_RE = /^mcp__[^_]*(?:git(?:hub|lab))/i;
const MCP_CREATE = [
  { re: /__create_issue$/i, kind: 'issue' },
  { re: /__issue_write$/i, kind: 'issue', method: 'create' },
  { re: /__create_pull_request$/i, kind: 'pr' },
  { re: /__create_merge_request$/i, kind: 'pr' },
];

/** {kind, body} when an MCP tool creates an issue or a pull request on GitHub or GitLab, else null. */
export function mcpCreate(name, input) {
  const n = String(name ?? '');
  if (!MCP_SYSTEM_RE.test(n)) return null;
  const ti = input && typeof input === 'object' ? input : {};
  for (const m of MCP_CREATE) {
    if (!m.re.test(n)) continue;
    if (m.method && String(ti.method ?? '').toLowerCase() !== m.method) return null;
    return { kind: m.kind, body: String(ti.body ?? ti.description ?? '') };
  }
  return null;
}
