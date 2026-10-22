// node --test skills/branch-summary
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildReport } from './build-report.mjs';

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
  const md = '# __MD_JSON__ and __TITLE__\nbody __TITLE__';
  const html = buildReport(md, template);
  assert.ok(html.includes('<title>__MD_JSON__ and __TITLE__</title>'));
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
