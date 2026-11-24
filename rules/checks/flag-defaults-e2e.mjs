#!/usr/bin/env node
// Every skill with a flag that defaults ON keeps an end-to-end test that runs with that skill's flags unset (rules/flag-defaults-e2e.md).
//   node rules/checks/flag-defaults-e2e.mjs [--root <repo>]
// Prints one JSON line. Exit 0 ok, 1 violations, 2 usage error. Node 22+, no dependencies.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OWNERS = { BRANCH: 'branch-summary', CHECKS: 'rules/checks', DOD: 'definition-of-done', PTDD: 'paired-agent-tdd', QA: 'qa-sweep', RETRO: 'retro', WORKFLOW: 'dev-workflow', ZT: 'zero-trust-review' };
export const MARKER = /\bflags:\s*defaults\b/;
const SPAWN = /\b(?:spawnSync|spawn|execFileSync|execFile|fork)\s*\(/;

const cell = s => s.trim().replace(/^`([^`]*)`$/, '$1').trim();

// The rows of the README's `## Flags` table: [{ name, values, default }].
export function parseFlags(readme) {
  const lines = readme.split('\n');
  const at = lines.findIndex(l => /^##\s+Flags\s*$/.test(l));
  if (at < 0) return [];
  const out = [];
  let header = null;
  for (const line of lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    if (!line.trim().startsWith('|')) { if (header && out.length) break; continue; }
    const cells = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => cell(c.replace(/\\\|/g, '|')));
    if (!header) { header = cells.map(c => c.toLowerCase()); continue; }
    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
    const get = k => cells[header.indexOf(k)] ?? '';
    out.push({ name: get('flag'), values: get('values'), default: get('default') });
  }
  return out;
}

export const isOn = f => f.default === 'true' || /_MODE$/.test(f.name);
export const ownerOf = name => OWNERS[name.split('_')[0]] ?? null;

// One pass over JS source: comments blanked (same offsets), comment texts, and the [start, end) spans of top-level test(...) / it(...) calls.
// Strings, template literals (with ${} nesting) and regex literals are skipped, so a `test(` inside a fixture string is not a test.
export function scanSource(src) {
  const out = src.split('');
  const comments = [];
  const tops = [];
  const stack = []; // { tpl: true } | { braces: n }
  let depth = 0, i = 0, last = '', lastWord = '', open = null;
  const REGEX_AFTER = new Set('(,=:[!&|?{}};+-*%<>~^'.split(''));
  const REGEX_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await']);
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const top = () => stack[stack.length - 1];
  while (i < src.length) {
    if (top()?.tpl) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; last = '`'; lastWord = ''; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ braces: 0 }); i += 2; last = '{'; continue; }
      i++; continue;
    }
    const c = src[i], n = src[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; comments.push(src.slice(i, end)); blank(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; comments.push(src.slice(i, end)); blank(i, end); i = end; continue; }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < src.length && src[k] !== c && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1;
      i = k + 1; last = c; lastWord = ''; continue;
    }
    if (c === '`') { stack.push({ tpl: true }); i++; continue; }
    if (c === '/' && (last === '' || REGEX_AFTER.has(last) || REGEX_WORDS.has(lastWord))) {
      let k = i + 1, cls = false;
      while (k < src.length && src[k] !== '\n') {
        if (src[k] === '\\') { k += 2; continue; }
        if (src[k] === '[') cls = true; else if (src[k] === ']') cls = false; else if (src[k] === '/' && !cls) break;
        k++;
      }
      k++;
      while (k < src.length && /[a-z]/i.test(src[k])) k++;
      i = k; last = '/'; lastWord = ''; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let k = i;
      while (k < src.length && /[\w$]/.test(src[k])) k++;
      const word = src.slice(i, k);
      if ((word === 'test' || word === 'it') && depth === 0 && !stack.length && last !== '.' && open === null) {
        let p = k;
        while (p < src.length && /\s/.test(src[p])) p++;
        if (src[p] === '(') open = i;
      }
      i = k; last = 'a'; lastWord = word; continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      if (c === '{' && top() && !top().tpl) top().braces++;
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      if (c === '}' && top() && !top().tpl) {
        if (top().braces === 0) { stack.pop(); i++; continue; }
        top().braces--;
      }
      depth--;
      if (depth === 0 && open !== null && c === ')') { tops.push([open, i + 1]); open = null; }
    }
    last = c; lastWord = '';
    i++;
  }
  return { code: out.join(''), comments, tops };
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The flags that `text` assigns: a key (NAME: 'NAME': "NAME":), NAME= (shell/env), or a property set (.NAME = / ['NAME'] =).
export function assigned(text, names) {
  return names.filter(n => {
    const N = esc(n);
    return new RegExp(`(?<![\\w$])(['"]?)${N}\\1\\s*:`).test(text)
      || new RegExp(`(?<![\\w$.])${N}=(?!=)`).test(text)
      || new RegExp(`\\.${N}\\s*=(?!=)`).test(text)
      || new RegExp(`\\[\\s*['"]${N}['"]\\s*\\]\\s*=(?!=)`).test(text);
  });
}

// Why one test file does not qualify as the defaults test for `on` (empty list: it qualifies).
export function analyzeFile(src, on) {
  const { code, comments, tops } = scanSource(src);
  const problems = [];
  if (!comments.some(c => MARKER.test(c))) problems.push('no `flags: defaults` marker comment');
  if (!SPAWN.test(code)) problems.push('spawns no process (spawnSync, spawn, execFile, execFileSync or fork)');
  if (!tops.length) { problems.push('no top-level test( or it( block'); return problems; }
  const pre = assigned(code.slice(0, tops[0][0]), on);
  if (pre.length) problems.push(`the module prelude assigns ${pre.join(', ')}`);
  const clean = tops.filter(([a, b]) => !assigned(code.slice(a, b), on).length);
  if (!clean.length) problems.push(`every top-level test block assigns one of ${on.join(', ')}`);
  return problems;
}

// files: [{ name, text }]. ok when one file qualifies; otherwise the marked files and why each fails.
export function checkSkill(files, on) {
  const results = files.map(f => ({ file: f.name, problems: analyzeFile(f.text, on) }));
  const good = results.find(r => !r.problems.length);
  if (good) return { ok: true, file: good.file };
  const marked = results.filter(r => !r.problems.includes('no `flags: defaults` marker comment'));
  if (!marked.length) return { ok: false, problems: [`no test file carries the \`flags: defaults\` marker (checked ${files.length}: ${files.map(f => f.name).join(', ') || 'none'})`] };
  return { ok: false, problems: marked.map(r => `${r.file}: ${r.problems.join('; ')}`) };
}

// readme: README.md text; filesBySkill: { skill: [{ name, text }] }.
export function checkRepo(readme, filesBySkill) {
  const flags = parseFlags(readme);
  const violations = [];
  if (!flags.length) violations.push('README.md has no `## Flags` table');
  const onBySkill = {};
  for (const f of flags.filter(isOn)) {
    const owner = ownerOf(f.name);
    if (!owner) { violations.push(`${f.name}: unknown prefix; add it to OWNERS in rules/checks/flag-defaults-e2e.mjs`); continue; }
    (onBySkill[owner] ??= []).push(f.name);
  }
  for (const f of flags.filter(f => !isOn(f) && !ownerOf(f.name))) violations.push(`${f.name}: unknown prefix; add it to OWNERS in rules/checks/flag-defaults-e2e.mjs`);
  const skills = {};
  for (const [skill, on] of Object.entries(onBySkill)) {
    const r = checkSkill(filesBySkill[skill] ?? [], on);
    skills[skill] = { flagsOn: on, ...r };
    if (!r.ok) violations.push(...r.problems.map(p => `${skill}: ${p}`));
  }
  return { ok: !violations.length, skills, violations };
}

export function loadRepo(root) {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const filesBySkill = {};
  for (const skill of Object.values(OWNERS)) {
    const dir = join(root, 'skills', skill);
    if (!existsSync(dir)) continue;
    filesBySkill[skill] = readdirSync(dir).filter(n => n.endsWith('.test.mjs')).sort().map(name => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
  }
  return { readme, filesBySkill };
}

function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--root' && argv[k + 1]) root = resolve(argv[++k]);
    else { console.log(JSON.stringify({ ok: false, error: `usage: flag-defaults-e2e.mjs [--root <repo>] (got ${argv[k]})` })); return 2; }
  }
  if (!existsSync(join(root, 'README.md'))) { console.log(JSON.stringify({ ok: false, error: `no README.md in ${root}` })); return 2; }
  const { readme, filesBySkill } = loadRepo(root);
  const r = checkRepo(readme, filesBySkill);
  console.log(JSON.stringify(r));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
