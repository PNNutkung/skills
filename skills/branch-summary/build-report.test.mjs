// node --test skills/branch-summary
// flags: defaults. The CLI tests below inherit the env and set no BRANCH_SUMMARY_* flag, so the format check runs at its default (on);
// see rules/flag-defaults-e2e.md.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import * as mod from './build-report.mjs';

// A namespace import, so a missing export fails its own tests instead of the whole file.
const { buildReport, checkReport, REQUIRED_HEADINGS, FORMAT_CHECK_FLAG } = mod;

const here = (name) => new URL(name, import.meta.url);
const template = readFileSync(here('./report-template.html'), 'utf8');
const hostile = readFileSync(here('./fixtures/hostile-report.md'), 'utf8');
const count = (text, pattern) => (text.match(pattern) || []).length;

function dataOf(html) {
  const m = html.match(/<script type="application\/json" id="md-source">([\s\S]*?)<\/script>/);
  assert.ok(m, 'data element missing');
  return JSON.parse(m[1]);
}

test('should round-trip the markdown exactly when it holds script tags, comments and replacement patterns', () => {
  const md = '# T\n</script><script>alert(1)</script>\n<!-- x -->\n$& $` $\' ' + String.fromCharCode(0x2028) + ' ' + String.fromCharCode(0x2029) + ' "q" \\n end';
  const html = buildReport(md, template);
  assert.equal(dataOf(html), md);
});

test('should add no script or comment markup when the markdown is hostile', () => {
  const html = buildReport(hostile, template);
  assert.equal(dataOf(html), hostile);
  assert.equal(count(html, /<script/gi), count(template, /<script/gi));
  assert.equal(count(html, /<\/script/gi), count(template, /<\/script/gi));
  assert.equal(count(html, /<!--/g), count(template, /<!--/g));
});

test('should escape the title when the first heading holds markup', () => {
  const html = buildReport('# <img src=x onerror=1> & "q"\nbody', template);
  assert.match(html, /<title>&lt;img src=x onerror=1&gt; &amp; &quot;q&quot;<\/title>/);
  assert.ok(!html.includes('<img src=x'));
});

test('should replace each placeholder once when the markdown contains the placeholders', () => {
  const md = '# __MD_JSON__ and __TITLE__ and __SCRIPT_HASH__\nbody __TITLE__';
  const html = buildReport(md, template);
  assert.ok(html.includes('<title>__MD_JSON__ and __TITLE__ and __SCRIPT_HASH__</title>'));
  assert.equal(dataOf(html), md);
});

test('should use a default title when the markdown has no top-level heading', () => {
  const html = buildReport('## only a second-level heading\ntext', template);
  assert.ok(html.includes('<title>Branch summary</title>'));
});

test('should exit 64 with a usage line when an argument is missing', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(here('./build-report.mjs')), 'only-one'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 64);
  assert.match(run.stderr, /usage: node build-report\.mjs/);
});

test('should write the report file when run with two paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'branch-summary-test-'));
  const mdPath = join(dir, 'report.md');
  const htmlPath = join(dir, 'report.html');
  writeFileSync(mdPath, hostile);
  const run = spawnSync(process.execPath, [fileURLToPath(here('./build-report.mjs')), mdPath, htmlPath], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), htmlPath);
  assert.equal(dataOf(readFileSync(htmlPath, 'utf8')), hostile);
});

test('should write the report file when run through a symlinked skill directory', () => {
  // The skill is installed as a symlink into a clone, so argv[1] is the link, not the real path.
  const dir = mkdtempSync(join(tmpdir(), 'branch-summary-link-'));
  const link = join(dir, 'skill');
  symlinkSync(fileURLToPath(here('./')), link);
  const mdPath = join(dir, 'report.md');
  const htmlPath = join(dir, 'report.html');
  writeFileSync(mdPath, '# Linked\n**Branch**: `x` | **Base**: `main` | **Files**: 1\nbody');
  const run = spawnSync(process.execPath, [join(link, 'build-report.mjs'), mdPath, htmlPath], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), htmlPath);
  assert.equal(dataOf(readFileSync(htmlPath, 'utf8')), '# Linked\n**Branch**: `x` | **Base**: `main` | **Files**: 1\nbody');
});

const cspOf = (html) => html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];

test('should allow exactly the inline script by hash when the report is built', () => {
  const html = buildReport(hostile, template);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  const hash = createHash('sha256').update(inline[0][1], 'utf8').digest('base64');
  assert.ok(cspOf(html).includes(`script-src 'sha256-${hash}' https://cdn.jsdelivr.net`));
});

test('should not allow unsafe script sources when the policy is read', () => {
  const csp = cspOf(buildReport(hostile, template));
  assert.match(csp, /^default-src 'none';/);
  const scriptSrc = csp.split(';').find((part) => part.trim().startsWith('script-src'));
  assert.ok(!/unsafe/.test(scriptSrc), scriptSrc);
});

test('should pin every CDN script to an exact version with an integrity hash', () => {
  const tags = template.match(/<script src="[^"]+"[^>]*><\/script>/g) || [];
  assert.equal(tags.length, 3);
  for (const tag of tags) {
    assert.match(tag, /src="https:\/\/cdn\.jsdelivr\.net\/npm\/[a-z]+@\d+\.\d+\.\d+\//, tag);
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/]{64}"/, tag);
    assert.match(tag, /crossorigin="anonymous"/, tag);
  }
});

test('should refuse a template without exactly one inline script', () => {
  assert.throws(() => buildReport('# t', '<script>a</script><script>b</script>__MD_JSON__'), /exactly one inline script/);
  assert.throws(() => buildReport('# t', '__MD_JSON__'), /exactly one inline script/);
});

// --- The format gate: checkReport and the CLI around it (docs/adr/0006-branch-summary-split.md, Gate) ---

const FULL = '# Add a cache\n\n**Branch**: `feat/cache` | **Base**: `main` | **Commits**: 2 | **Files**: 4\n\n## Summary\n\nAdds a cache.\n\n## Test Coverage\n\n- all covered\n';
const FAST = '# Fix a typo\n**Branch**: `fix/typo` | **Base**: `main` | **Files**: 1\n\nFixes a typo.\n\n**Files**: `README.md`: typo\n';

test('should accept a full report when it has the title, Summary and Test Coverage (Gate)', () => {
  assert.deepEqual(checkReport(FULL), { ok: true, missing: [] });
});

test('should accept the fast-path format when it has a title and a Branch line but no Summary (Gate)', () => {
  assert.deepEqual(checkReport(FAST), { ok: true, missing: [] });
});

test('should name the missing Summary when a full report drops it (Gate)', () => {
  assert.deepEqual(checkReport(FULL.replace('## Summary\n', '')), { ok: false, missing: ['## Summary'] });
});

test('should name the missing Test Coverage when a full report drops it (Gate)', () => {
  assert.deepEqual(checkReport(FULL.replace('## Test Coverage\n', '')), { ok: false, missing: ['## Test Coverage'] });
});

test('should name the missing title when the first heading is not a level-one heading (Gate)', () => {
  assert.deepEqual(checkReport(FULL.replace('# Add a cache\n', '')), { ok: false, missing: ['# <title>'] });
  assert.deepEqual(checkReport('## Summary\n# Late title\n## Test Coverage\n'), { ok: false, missing: ['# <title>'] });
  assert.equal(checkReport('#No space\n## Summary\n## Test Coverage\n').ok, false);
});

test('should not take a fast path when the Branch line has no title above it (Gate)', () => {
  assert.deepEqual(checkReport('**Branch**: `x`\ntext\n'), { ok: false, missing: ['# <title>', '## Summary', '## Test Coverage'] });
});

test('should ignore headings and Branch lines inside fenced code blocks when it looks for the required parts (Gate)', () => {
  const fenced = '# T\n\n```markdown\n## Summary\n**Branch**: x\n## Test Coverage\n```\n';
  assert.deepEqual(checkReport(fenced), { ok: false, missing: ['## Summary', '## Test Coverage'] });
  const titleInFence = '```\n# Not the title\n```\n## Summary\n## Test Coverage\n';
  assert.deepEqual(checkReport(titleInFence), { ok: false, missing: ['# <title>'] });
  const tilde = '# T\n~~~\n```\n## Summary\n~~~\n## Test Coverage\n';
  assert.deepEqual(checkReport(tilde), { ok: false, missing: ['## Summary'] });
  const unclosed = '# T\n## Test Coverage\n```mermaid\n## Summary\n';
  assert.deepEqual(checkReport(unclosed), { ok: false, missing: ['## Summary'] });
});

test('should accept CRLF line ends and a level-three Summary does not count when the report is checked (Gate)', () => {
  assert.equal(checkReport(FULL.replace(/\n/g, '\r\n')).ok, true);
  assert.deepEqual(checkReport(FULL.replace('## Summary', '### Summary')).missing, ['## Summary']);
  assert.deepEqual(checkReport(FULL.replace('## Summary', '## Summary of changes')).missing, ['## Summary']);
});

test('should name every part when the input is empty or not a string (Gate)', () => {
  const all = ['# <title>', '## Summary', '## Test Coverage'];
  assert.deepEqual(checkReport(''), { ok: false, missing: all });
  assert.deepEqual(checkReport(undefined), { ok: false, missing: all });
  assert.deepEqual(REQUIRED_HEADINGS.map((h) => h.label), all);
});

// Seeded PRNG (mulberry32), so a failure prints a seed that replays it.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fragments with known meaning; the oracle reads the fragment list, never the text.
const FRAGS = {
  title: { text: '# A title', h: 1 },
  title2: { text: '#   Spaced <b>title</b>  ', h: 1 },
  sum: { text: '## Summary', h: 2, name: 'Summary' },
  tc: { text: '## Test Coverage', h: 2, name: 'Test Coverage' },
  other: { text: '## Diagrams', h: 2, name: 'Diagrams' },
  h3sum: { text: '### Summary', h: 3 },
  h3: { text: '### Architecture', h: 3 },
  branch: { text: '**Branch**: `b` | **Base**: `main` | **Files**: 2', branch: true },
  nospace: { text: '#Summary' },
  text: { text: 'Plain text with ## Summary in the middle and </script>' },
  blank: { text: '' },
  list: { text: '- **Files**: `a.js`' },
  bt: { fence: '```' },
  btInfo: { fence: '```mermaid', close: '```' },
  tilde: { fence: '~~~', close: '~~~' },
  long: { fence: '````markdown', close: '````' },
};
const KEYS = Object.keys(FRAGS);
const INNER = ['title', 'sum', 'tc', 'branch', 'text', 'h3', 'blank'];

function randomReport(next) {
  const pick = (list) => list[Math.floor(next() * list.length)];
  const parts = [];
  const n = Math.floor(next() * 14);
  for (let i = 0; i < n; i++) {
    const key = pick(KEYS);
    const f = FRAGS[key];
    if (!f.fence) { parts.push({ key, inFence: false }); continue; }
    parts.push({ key, open: true });
    const inner = Math.floor(next() * 4);
    for (let k = 0; k < inner; k++) parts.push({ key: pick(INNER), inFence: true });
    if (next() < 0.9) parts.push({ key, close: true }); // sometimes left open: the rest of the text is code
    else { for (let k = 0; k < 3; k++) parts.push({ key: pick(INNER), inFence: true }); break; }
  }
  const lines = parts.map((p) => {
    const f = FRAGS[p.key];
    if (p.open) return f.fence;
    if (p.close) return f.close ?? f.fence;
    return f.text;
  });
  return { text: lines.join(next() < 0.2 ? '\r\n' : '\n'), parts };
}

function oracle(parts) {
  let first = null, branch = false;
  const names = new Set();
  for (const p of parts) {
    if (p.open || p.close || p.inFence) continue;
    const f = FRAGS[p.key];
    if (f.h && first === null) first = f.h;
    if (f.h === 2) names.add(f.name);
    if (f.branch) branch = true;
  }
  const title = first === 1;
  const missing = [];
  if (!title) missing.push('# <title>');
  if (!(title && branch)) {
    if (!names.has('Summary')) missing.push('## Summary');
    if (!names.has('Test Coverage')) missing.push('## Test Coverage');
  }
  return { ok: missing.length === 0, missing };
}

test('should never throw and agree with an independent oracle when it checks random markdown (Gate)', () => {
  const seed = Number(process.env.FUZZ_SEED) || 20261124;
  const next = rng(seed);
  let oks = 0;
  for (let i = 0; i < 3000; i++) {
    const { text, parts } = randomReport(next);
    let got;
    assert.doesNotThrow(() => { got = checkReport(text); }, `seed ${seed} case ${i}`);
    assert.deepEqual(got, oracle(parts), `seed ${seed} case ${i}:\n${text}`);
    if (got.ok) oks++;
  }
  assert.ok(oks > 50 && oks < 2950, `both outcomes are exercised (${oks} ok)`);
});

const SCRIPT = fileURLToPath(here('./build-report.mjs'));
const baseEnv = { ...process.env };
delete baseEnv[FORMAT_CHECK_FLAG ?? 'BRANCH_SUMMARY_FORMAT_CHECK_ENABLED'];

function runCli(markdown, env = baseEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'branch-summary-gate-'));
  const mdPath = join(dir, 'report.md');
  const htmlPath = join(dir, 'report.html');
  writeFileSync(mdPath, markdown);
  const run = spawnSync(process.execPath, [SCRIPT, mdPath, htmlPath], { encoding: 'utf8', env });
  return { run, htmlPath };
}

test('should write HTML byte for byte equal to buildReport when the report is valid and the flag is unset (Gate)', () => {
  for (const md of [FULL, FAST]) {
    const { run, htmlPath } = runCli(md);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, '');
    assert.equal(readFileSync(htmlPath, 'utf8'), buildReport(md, template));
  }
});

test('should exit 1, name report-format.md and write no HTML when the report has no Summary (Gate)', () => {
  const { run, htmlPath } = runCli(FULL.replace('## Summary\n', ''));
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /## Summary/);
  assert.ok(!/## Test Coverage/.test(run.stderr), 'names only what is missing');
  assert.match(run.stderr, /Read report-format\.md \(Section 5, Template\) and rewrite the report/);
  assert.ok(!existsSync(htmlPath), 'no HTML written');
});

test('should build the hostile fixture into the same HTML as buildReport when the gate is on (Gate)', () => {
  assert.deepEqual(checkReport(hostile), { ok: true, missing: [] });
  const { run, htmlPath } = runCli(hostile);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(htmlPath, 'utf8'), buildReport(hostile, template));
});

test('should refuse the hostile fixture without its Summary when the gate is on (Gate)', () => {
  const { run, htmlPath } = runCli(hostile.replace(/^## Summary\n/m, ''));
  assert.equal(run.status, 1);
  assert.ok(!existsSync(htmlPath));
});

test('should write the HTML anyway when the flag is false and the report has no Summary (Gate)', () => {
  const md = '# Only a title\nbody\n';
  for (const value of ['false', 'FALSE', ' false ']) {
    const { run, htmlPath } = runCli(md, { ...baseEnv, BRANCH_SUMMARY_FORMAT_CHECK_ENABLED: value });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(htmlPath, 'utf8'), buildReport(md, template));
  }
});

test('should still refuse a bad report when the flag is true or empty (Gate)', () => {
  for (const value of ['true', 'True', '']) {
    const { run, htmlPath } = runCli('# Only a title\n', { ...baseEnv, BRANCH_SUMMARY_FORMAT_CHECK_ENABLED: value });
    assert.equal(run.status, 1, `value ${JSON.stringify(value)}`);
    assert.ok(!existsSync(htmlPath));
  }
});

test('should exit 2 naming the valid values and write nothing when the flag is not true or false (Gate)', () => {
  for (const value of ['yes', '1', 'on']) {
    const { run, htmlPath } = runCli(FULL, { ...baseEnv, BRANCH_SUMMARY_FORMAT_CHECK_ENABLED: value });
    assert.equal(run.status, 2, `value ${value}`);
    assert.match(run.stderr, new RegExp(`BRANCH_SUMMARY_FORMAT_CHECK_ENABLED=${value} is not valid: use true or false`));
    assert.ok(!existsSync(htmlPath));
  }
});
