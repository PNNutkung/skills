// Keeps SKILL.md small, report-format.md word for word what left SKILL.md, the build-report gate in step with report-format.md,
// and evals.json in shape (docs/adr/0006-branch-summary-split.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as report from './build-report.mjs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const SKILL_BYTES_MAX = 16000;
const skill = read('./SKILL.md');
const original = read('./fixtures/skill-sections-3-5.orig.md');
const formatText = () => read('./report-format.md');

// The cap check, as a pure function so its failing branch is tested too.
function capProblem(text) {
  const bytes = Buffer.byteLength(text, 'utf8');
  return bytes <= SKILL_BYTES_MAX ? null : `SKILL.md is ${bytes} bytes, over 16,000: move long text into report-format.md`;
}

// The lines of `orig` that are not in `target`, in order: each line must be found after the one before it.
function lostLines(orig, target) {
  const want = orig.split('\n');
  const have = target.split('\n');
  const lost = [];
  let at = 0;
  for (const line of want) {
    const k = have.indexOf(line, at);
    if (k < 0) lost.push(line);
    else at = k + 1;
  }
  return lost;
}

test('should keep SKILL.md at most 16,000 bytes when the skill is loaded (Cap, CapTest)', () => {
  const problem = capProblem(skill);
  assert.equal(problem, null, problem ?? '');
});

test('should fail with a message naming report-format.md when SKILL.md is over 16,000 bytes (CapTest)', () => {
  assert.equal(capProblem('x'.repeat(16001)), 'SKILL.md is 16001 bytes, over 16,000: move long text into report-format.md');
});

test('should count bytes, not characters, and pass at exactly 16,000 bytes when the text is at the cap (CapTest)', () => {
  assert.equal(capProblem('x'.repeat(16000)), null);
  assert.match(capProblem('é'.repeat(8001)), /^SKILL\.md is 16002 bytes/);
});

test('should hold every line that left SKILL.md unchanged and in order when report-format.md is read (NoLoss)', () => {
  assert.ok(original.startsWith('## Section 3 -- Mermaid Diagram Generation\n'), 'the frozen copy starts at Section 3');
  assert.deepEqual(lostLines(original, formatText()), []);
});

test('should report the line when a moved line is dropped or reworded (NoLoss)', () => {
  const text = formatText();
  const dropped = text.replace(/^\| \*\*Low\*\* \|.*\n/m, '');
  assert.notEqual(dropped, text, 'the Low severity row is in report-format.md');
  assert.equal(lostLines(original, dropped).length, 1);
  assert.match(lostLines(original, dropped)[0], /^\| \*\*Low\*\* \|/);
  const reworded = text.replace('Generate **up to 5 diagrams**', 'Generate **up to 6 diagrams**');
  assert.deepEqual(lostLines(original, reworded), [original.split('\n')[2]]);
});

test('should report a line when two moved lines swap places (NoLoss)', () => {
  const lines = formatText().split('\n');
  const a = lines.indexOf('## Section 4 -- Workaround Detection');
  const b = lines.indexOf('## Section 5 -- Output Template');
  [lines[a], lines[b]] = [lines[b], lines[a]];
  assert.ok(lostLines(original, lines.join('\n')).length > 0);
});

test('should name report-format.md in a mandatory read step and drop the moved sections when SKILL.md is read (Split)', () => {
  assert.match(skill, /^## Section 3 -- Report format \(read before drafting\)$/m);
  const step = skill.slice(skill.indexOf('## Section 3 -- Report format'));
  assert.match(step, /Read `\$SK\/report-format\.md`/);
  for (const part of [/Mermaid/, /workaround/i, /severity/i, /template/i, /omission rule/i, /output format/i, /output destination/i, /HTML report/]) {
    assert.match(step, part, String(part));
  }
  assert.match(skill, /BRANCH_SUMMARY_FORMAT_CHECK_ENABLED/);
  for (const gone of ['## Section 4 -- Workaround Detection', '## Section 5 -- Output Template', '### Template', '# <short-brief-title-describing-the-changes>']) {
    assert.ok(!skill.includes(gone), `SKILL.md still holds ${gone}`);
  }
});

test('should point the fast path and the breaking-change rule at report-format.md when Sections 0-2 name a moved part (Split)', () => {
  const head = skill.slice(0, skill.indexOf('## Section 3 -- Report format'));
  assert.ok(!/\bSection [345]\b/.test(head.replace(/Section 3 below/g, '')), 'no reference to a moved section number');
  assert.ok(!/template below/.test(head));
  for (const line of head.split('\n').filter((l) => /template|omission rule/i.test(l))) {
    assert.match(line, /report-format\.md/, line);
  }
  assert.match(head.split('\n').slice(0, 15).join('\n'), /report-format\.md/, 'the read is named before Section 0');
});

test('should start report-format.md with a header and then Section 3 when the file is read (Split)', () => {
  const text = formatText();
  assert.match(text, /^# /);
  assert.ok(text.indexOf('## Section 3 -- Mermaid Diagram Generation') > 0);
});

test('should find each heading the gate requires in report-format.md when the gate and the doc are compared (Gate)', () => {
  const text = formatText();
  assert.ok(Array.isArray(report.REQUIRED_HEADINGS) && report.REQUIRED_HEADINGS.length === 3, 'REQUIRED_HEADINGS is exported');
  for (const h of report.REQUIRED_HEADINGS) {
    if (h.level === 1) assert.match(text, /^# \S/m, h.label);
    else assert.ok(text.split('\n').includes(h.label), `${h.label} is in report-format.md`);
  }
  assert.deepEqual(report.REQUIRED_HEADINGS.map((h) => h.label), ['# <title>', '## Summary', '## Test Coverage']);
});

test('should parse with two or more cases that expect the required sections, the read and the fast path when evals.json is read (Evals)', () => {
  const evals = JSON.parse(read('./evals.json'));
  assert.ok(Array.isArray(evals) && evals.length >= 2 && evals.length <= 3, String(evals.length));
  for (const e of evals) {
    assert.deepEqual(e.skills, ['branch-summary']);
    assert.equal(typeof e.query, 'string');
    assert.ok(e.query.length > 0);
    assert.ok(Array.isArray(e.files));
    assert.ok(Array.isArray(e.expected_behavior) && e.expected_behavior.length > 0);
    for (const b of e.expected_behavior) assert.equal(typeof b, 'string');
  }
  const all = evals.flatMap((e) => e.expected_behavior).join('\n');
  for (const want of [/report-format\.md/, /## Summary/, /## Test Coverage/, /title/i, /fast path|condensed/i]) assert.match(all, want, String(want));
});
