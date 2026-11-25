// Pure pass/fail rules for one run (ADR 0008 A4, A14): the exit code, the runner presets and the agent's expect, plus the lint of a weak expect.
const REGEX_FORM_RE = /^\/(.*)\/([a-z]*)$/s;
const BARE_WORDS = new Set(['ok', 'pass', 'passed', 'done', 'success', 'true', '✔']);
const TEST_LIKE_RE = /test|spec|e2e|check/i;
const VERBOSE_RE = /(?:^|\s)(?:-v+|--verbose)(?:\s|$)/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (id, flags = '') => new RegExp(`(?<![A-Za-z0-9])${esc(id)}(?![A-Za-z0-9])`, flags);

/** Runner presets: how to spot the runner in a command, and what its output must show. */
const PRESETS = [
  { name: 'node', label: 'node --test', re: /(?:^|[\s;&|(])node\b[^;&|]*\s--test(?=\s|$)/ },
  { name: 'pytest', label: 'pytest', re: /\bpytest\b/, verbose: true },
  { name: 'vitest', label: 'vitest', re: /\bvitest\b/ },
  { name: 'jest', label: 'jest', re: /\bjest\b/ },
  { name: 'go', label: 'go test', re: /\bgo\s+test\b/, verbose: true },
];

export function presetOf(run) {
  return PRESETS.find(p => p.re.test(String(run ?? '')))?.name ?? null;
}

const num = (re, out) => { const m = re.exec(out); return m ? Number(m[1]) : null; };

/** -> [what is missing] for a preset run. */
function presetMissing(name, id, out) {
  const miss = [];
  if (name === 'node') {
    if (!/^\s*(?:ℹ|#) fail 0\s*$/m.test(out)) miss.push('no "fail 0" summary line');
    if (!(num(/^\s*(?:ℹ|#) pass (\d+)\s*$/m, out) >= 1)) miss.push('no test passed ("pass N" with N >= 1)');
    if (!out.split('\n').some(l => /^\s*(?:✔ |ok \d+ - )/.test(l) && word(id).test(l))) miss.push(`no passing test named with ${id}`);
  } else if (name === 'pytest') {
    if (!(num(/\b(\d+) passed\b/, out) >= 1)) miss.push('no "N passed" with N >= 1');
    if (/\b\d+ (?:failed|errors?)\b/.test(out)) miss.push('a test failed or errored');
    if (!out.split('\n').some(l => /\bPASSED\b/.test(l) && word(id, 'i').test(l))) miss.push(`no PASSED line named with ${id}`);
  } else if (name === 'vitest' || name === 'jest') {
    const line = /^\s*Tests:?\s+(.*)$/m.exec(out)?.[1] ?? '';
    if (!(num(/\b(\d+) passed\b/, line) >= 1)) miss.push('no "Tests: N passed" line with N >= 1');
    if (/\b\d+ failed\b/.test(line)) miss.push('a test failed');
    if (!out.split('\n').some(l => /^\s*[✓✔] /.test(l) && word(id).test(l))) miss.push(`no ✓ line named with ${id}`);
  } else if (name === 'go') {
    const goId = new RegExp(`(?:(?<![A-Za-z0-9])|(?<=Test))${esc(id)}(?![a-z0-9])`);
    if (!out.split('\n').some(l => /^\s*--- PASS: /.test(l) && goId.test(l.replace(/^\s*--- PASS: /, '')))) miss.push(`no "--- PASS:" line named with ${id}`);
    if (!/^(?:ok|PASS)\b/m.test(out)) miss.push('no ok or PASS line');
    if (/^\s*(?:--- )?FAIL\b/m.test(out)) miss.push('a test failed');
  }
  return miss;
}

/** { kind: 'none' } | { kind: 'text', text } | { kind: 'regex', re } | { error } */
export function parseExpect(expect) {
  if (expect === undefined || expect === null) return { kind: 'none' };
  if (typeof expect !== 'string') return { error: 'expect must be text or /regex/flags' };
  const m = REGEX_FORM_RE.exec(expect);
  if (!m) return { kind: 'text', text: expect };
  try { return { kind: 'regex', re: new RegExp(m[1], m[2]) }; } catch (e) { return { error: `expect ${expect} is not a valid regex: ${e.message}` }; }
}

// a fresh RegExp without g/y, so lastIndex never carries over between tests
const matches = (re, s) => new RegExp(re.source, re.flags.replace(/[gy]/g, '')).test(s);

/** -> [error] for a weak expect (A14); [] when it is fine. */
export function lintExpect(entry) {
  const run = String(entry?.run ?? '');
  const id = entry?.id ?? '?';
  const e = parseExpect(entry?.expect);
  if (e.error) return [`${id}: ${e.error}`];
  const preset = PRESETS.find(p => p.name === presetOf(run));
  const errors = [];
  if (preset?.verbose && !VERBOSE_RE.test(run)) errors.push(`${id}: ${preset.label} needs -v so each passing test is listed with its name`);
  if (e.kind === 'none') {
    // any crash exits non-zero, so a must-fail check without its error line passes on the wrong failure
    if (wantExit(entry) !== 0) errors.push(`${id}: exit ${wantExit(entry)} is a must-fail check: add expect with the error line only this failure prints`);
    if (!preset && TEST_LIKE_RE.test(run)) errors.push(`${id}: "${run}" looks like a test run but has no expect and no preset runner: add expect with a line only a real pass prints (for example the passed count)`);
    return errors;
  }
  const raw = e.kind === 'text' ? e.text : e.re.source;
  if (BARE_WORDS.has(raw.trim().toLowerCase())) errors.push(`${id}: expect "${entry.expect}" is a bare word that matches almost any output: quote a line only this check prints`);
  else if (e.kind === 'text' ? e.text === '' : matches(e.re, '')) errors.push(`${id}: expect "${entry.expect}" matches empty output, so it proves nothing: make it require real text`);
  return errors;
}

const wantExit = entry => (Number.isInteger(entry?.exit) ? entry.exit : 0);

/** The expect: line of a section: what was checked. */
export function describeExpect(entry) {
  const parts = [`exit ${wantExit(entry)}`];
  const preset = PRESETS.find(p => p.name === presetOf(entry?.run));
  if (preset && wantExit(entry) === 0) parts.push(`${preset.label} preset: 0 failed, at least 1 passed, a passing test named with ${entry.id}`);
  const e = parseExpect(entry?.expect);
  if (e.kind === 'text') parts.push(`text "${e.text}"`);
  if (e.kind === 'regex') parts.push(`regex ${entry.expect}`);
  return parts.join('; ');
}

/** -> { pass, why[] } for one run: { code, output, timedOut, seconds }. */
export function judge(entry, { code, output, timedOut, seconds } = {}) {
  const out = String(output ?? '');
  if (timedOut) return { pass: false, why: [`timeout after ${seconds}s`] };
  const why = [];
  if (code !== wantExit(entry)) why.push(`exit ${code}, expected ${wantExit(entry)}`);
  const preset = presetOf(entry?.run);
  if (preset && wantExit(entry) === 0) why.push(...presetMissing(preset, String(entry.id), out));
  const e = parseExpect(entry?.expect);
  if (e.error) why.push(e.error);
  else if (e.kind === 'text' && !out.includes(e.text)) why.push(`output does not contain "${e.text}"`);
  else if (e.kind === 'regex' && !matches(e.re, out)) why.push(`output does not match ${entry.expect}`);
  return { pass: why.length === 0, why };
}

// a runner's own result line: its text is the test title, which can name anything, so it never shows the product's flag error
const RESULT_LINE_RE = /^\s*(?:[✔✖✓×]|ok \d|not ok \d|# Subtest|PASSED\b|FAILED\b|--- (?:PASS|FAIL)\b)|\b(?:PASSED|FAILED)(?:\s+\[\s*\d+%\])?\s*$/;
const bare = s => `(?<![A-Za-z0-9_])${esc(s)}(?![A-Za-z0-9_])`;

/** True when a line of the invalid flag run, other than a test result, names the flag and then the bad value (A3). */
export function flagErrorShown(output, name, value) {
  const re = new RegExp(`${bare(name)}.*${bare(value)}`);
  return String(output ?? '').split('\n').some(l => re.test(l) && !RESULT_LINE_RE.test(l));
}
