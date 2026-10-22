#!/usr/bin/env node
// Builds the branch-summary HTML report from a markdown file.
//
// The markdown is embedded as JSON data with every "<" escaped, never as markup, so
// text that came from a branch (a commit message holding "</script>", a comment
// holding "<!--") cannot close or reopen the tag around it. The page parses that
// JSON, renders it with marked, and sanitizes the result (see report-template.html).
//
// usage: node build-report.mjs <report.md> <report.html>
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function buildReport(markdown, template) {
  const heading = markdown.match(/^#[ \t]+(.+?)[ \t]*$/m);
  const title = (heading ? heading[1] : 'Branch summary').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  const json = JSON.stringify(markdown)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
  // The CSP lets the template's one inline script run, by hash, and no other inline code.
  const inline = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (inline.length !== 1) throw new Error('the template must hold exactly one inline script');
  const scriptHash = createHash('sha256').update(inline[0][1], 'utf8').digest('base64');
  const values = { __TITLE__: title, __MD_JSON__: json, __SCRIPT_HASH__: scriptHash };
  // One pass over the template: replaced text is never scanned for placeholders again.
  return template.replace(/__TITLE__|__MD_JSON__|__SCRIPT_HASH__/g, (m) => values[m]);
}

// argv[1] is the link when the skill is installed as a symlink; import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mdPath, htmlPath] = process.argv.slice(2);
  if (!mdPath || !htmlPath) {
    console.error('usage: node build-report.mjs <report.md> <report.html>');
    process.exit(64);
  }
  const template = readFileSync(new URL('./report-template.html', import.meta.url), 'utf8');
  writeFileSync(htmlPath, buildReport(readFileSync(mdPath, 'utf8'), template));
  console.log(htmlPath);
}
