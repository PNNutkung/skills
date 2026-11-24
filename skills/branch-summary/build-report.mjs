#!/usr/bin/env node
// Builds the branch-summary HTML report from a markdown file.
//
// The markdown is embedded as JSON data with every "<" escaped, never as markup, so
// text that came from a branch (a commit message holding "</script>", a comment
// holding "<!--") cannot close or reopen the tag around it. The page parses that
// JSON, renders it with marked, and sanitizes the result (see report-template.html).
//
// Before writing, the CLI checks the report has the parts report-format.md requires (checkReport): a `#` title,
// `## Summary` and `## Test Coverage`, or the small-change fast path (a `#` title, a `**Branch**:` line and no `##` section).
// A report that fails is not built: exit 1, the missing parts on stderr. BRANCH_SUMMARY_FORMAT_CHECK_ENABLED=false
// turns the check off; a value other than true or false exits 2.
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

export const FORMAT_CHECK_FLAG = 'BRANCH_SUMMARY_FORMAT_CHECK_ENABLED';

// The parts every full report needs (report-format.md, Section 5, Template). docs.test.mjs checks each is in report-format.md.
export const REQUIRED_HEADINGS = Object.freeze([
  Object.freeze({ level: 1, text: null, label: '# <title>' }),
  Object.freeze({ level: 2, text: 'Summary', label: '## Summary' }),
  Object.freeze({ level: 2, text: 'Test Coverage', label: '## Test Coverage' }),
]);

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;
const BRANCH_LINE = /^\*\*Branch\*\*:/;

/** -> { ok, missing: [label] }. Pure. Lines inside fenced code blocks do not count; an unclosed fence runs to the end. */
export function checkReport(markdown) {
  let fence = null;
  let first = null;
  let branch = false;
  const seen = new Set();
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    if (fence) {
      if (fence.test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    // A backtick fence's info string cannot hold a backtick (CommonMark), so ```a``` is inline code, not a fence.
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = new RegExp(`^ {0,3}\\${open[1][0]}{${open[1].length},}[ \\t]*$`);
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      if (first === null) first = h[1].length;
      seen.add(`${h[1].length} ${h[2].replace(/(^|[ \t]+)#+$/, '')}`); // drop a closing sequence: ## Summary ##
    } else if (BRANCH_LINE.test(line)) branch = true;
  }
  const title = first === 1;
  // The fast path (SKILL.md Section 1, step 9) is a title, a **Branch**: line and no `##` section. A full report that dropped
  // Summary still has its other `##` sections (and its own **Branch**: line), so it is not mistaken for the fast path.
  const fastPath = title && branch && ![...seen].some((k) => k.startsWith('2 '));
  const missing = REQUIRED_HEADINGS.filter((r) => (r.level === 1 ? !title : !fastPath && !seen.has(`${r.level} ${r.text}`))).map((r) => r.label);
  return { ok: missing.length === 0, missing };
}

class FlagError extends Error {}

/** NAME_ENABLED: true or false (any case); true when unset or empty. Anything else throws a FlagError naming the valid values. */
export function formatCheckEnabled(env = process.env) {
  const v = String(env?.[FORMAT_CHECK_FLAG] ?? '').trim().toLowerCase();
  if (!v || v === 'true') return true;
  if (v === 'false') return false;
  throw new FlagError(`${FORMAT_CHECK_FLAG}=${env[FORMAT_CHECK_FLAG]} is not valid: use true or false`);
}

// argv[1] is the link when the skill is installed as a symlink; import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mdPath, htmlPath] = process.argv.slice(2);
  if (!mdPath || !htmlPath) {
    console.error('usage: node build-report.mjs <report.md> <report.html>');
    process.exit(64);
  }
  let check;
  try {
    check = formatCheckEnabled();
  } catch (e) {
    console.error(`build-report: ${e.message}`);
    process.exit(2);
  }
  const markdown = readFileSync(mdPath, 'utf8');
  if (check) {
    const { ok, missing } = checkReport(markdown);
    if (!ok) {
      console.error(`build-report: ${mdPath} is missing ${missing.join(', ')}; no HTML was written.`);
      console.error('Read report-format.md (Section 5, Template) and rewrite the report, then run build-report.mjs again.');
      console.error(`report-format.md: ${fileURLToPath(new URL('./report-format.md', import.meta.url))}`);
      process.exit(1);
    }
  }
  const template = readFileSync(new URL('./report-template.html', import.meta.url), 'utf8');
  writeFileSync(htmlPath, buildReport(markdown, template));
  console.log(htmlPath);
}
