// Unit and fuzz tests for the pure ADR code. Run: node --test skills/definition-of-done/adr.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOD_HEADING, adrFileName, checkAdr, checkAdrSources, checkQuestions, matchGlob, nextNumber, parseAdr, parseFrontmatter, parseQuestions,
  renderAdr, setTouches, syncTouches, toPlanDod, toRequirements, upsertIndex,
} from './adr.mjs';

const QUESTIONS = `Q1: Which pages get the button?
context: the ticket names sales only (ticket line 2)
(A) both
  + one consistent feature
  - two pages to test
(B) sales
  + smaller change
  - stock users ask again
recommended: A, the ticket comment asks for stock too
time: 2026-11-21T13:20:04Z
Q2: Over 10,000 rows?
(A) export all, streamed
  + nothing is lost
  - a long request can time out
(B) cap at 10,000 and warn
  + fast and predictable
  - users with big reports get a partial file
recommended: B, a long request would time out
time: t
Q3: Feature flag?
(A) REPORT_EXPORT, default off
  + safe rollout
  - one more flag to remove later
(B) no flag
  + less code
  - no way back without a deploy
recommended: A
time: t
`;
const ANSWERS = 'A1: A\ntime: t\nA2: B\ntime: t\nA3: A\ntime: t\nA4: ไม่เปลี่ยน API เดิม\ntime: t\n';
const QUESTIONS_ALL = QUESTIONS + `Q4: Backward compatibility?
(A) keep the API as is
  + no client breaks
  - old endpoint stays
(B) version the API
  + clean design
  - clients must move
recommended: A
time: t
`;
const TICKET = 'title: Export reports\nUsers need to download the sales report as CSV.\nผู้ใช้ต้องการ export รายงานสต็อกด้วย\n';
const SPEC = { 'docs/reports.md': 'line one\nReports list sales and stock.\nline three\n' };
const show = p => SPEC[p] ?? null;
const u = (ref, quote, question = 'Q?') => ({ kind: 'user', ref, quote, question });

function dod() {
  return {
    slug: 'report-export',
    title: 'Report export',
    touches: ['src/reports/**', 'e2e/reports/**'],
    items: [
      { id: 'AC1', text: 'the export button is on sales and stock', source: u('A1', 'A') },
      { id: 'AC2', text: 'the sales report downloads as CSV', kinds: ['happy', 'fail'], kindsReason: 'no edge', source: { kind: 'ticket', ref: '#42', quote: 'Users need to download the sales report as CSV.' } },
      { id: 'AC3', text: 'reports cover sales and stock', kinds: ['happy'], kindsReason: 'listing', source: { kind: 'spec', ref: 'docs/reports.md:2', quote: 'Reports list sales and stock.' } },
      { id: 'AC4', text: 'over 10,000 rows are capped with a warning', source: u('A2', 'B') },
    ],
    required: {
      featureFlag: { value: 'REPORT_EXPORT, default off', source: u('A3', 'A') },
      backwardCompat: { value: 'no API change', source: u('A4', 'ไม่เปลี่ยน API เดิม') },
      nonGoals: { value: ['xlsx'], source: { kind: 'ticket', ref: '#42', quote: 'ผู้ใช้ต้องการ export รายงานสต็อกด้วย' } },
      verifyEnv: { value: 'staging', source: u('A3', 'A') },
      testTiers: { value: ['unit', 'e2e'], source: u('A4', 'ไม่เปลี่ยน API เดิม') },
    },
    unconfirmed: [],
  };
}
const SRC = { answers: ANSWERS, questions: QUESTIONS_ALL, ticket: TICKET };
const render = (over = {}) => renderAdr({ dod: dod(), ...SRC, number: 7, date: '2026-11-21', ...over });

// ---------- questions.md ----------
test('should parse each question with its options, pros, cons and recommendation when questions.md is well formed', () => {
  const q = parseQuestions(QUESTIONS).get(2);
  assert.equal(q.text, 'Over 10,000 rows?');
  assert.deepEqual(q.options.map(o => [o.key, o.label, o.pros, o.cons]), [
    ['A', 'export all, streamed', ['nothing is lost'], ['a long request can time out']],
    ['B', 'cap at 10,000 and warn', ['fast and predictable'], ['users with big reports get a partial file']],
  ]);
  assert.equal(q.recommended, 'B, a long request would time out');
  assert.equal(parseQuestions(QUESTIONS).get(1).context, 'the ticket names sales only (ticket line 2)');
});

// ---------- render ----------
test('should render an English ADR with touches, quoted context, decisions with trade-offs and a hashed DoD section when the sources are complete', () => {
  const r = render();
  assert.deepEqual(r.errors, []);
  const t = r.text;
  assert.match(t, /^---\ntouches:\n {2}- "src\/reports\/\*\*"\n {2}- "e2e\/reports\/\*\*"\ndod: report-export\n---\n# 7\. Report export\n/);
  assert.match(t, /^Status: Accepted$/m);
  assert.match(t, /^T1: Users need to download the sales report as CSV\.$/m);
  assert.match(t, /^S1: Reports list sales and stock\. \(docs\/reports\.md:2\)$/m);
  assert.match(t, /^### A2: Over 10,000 rows\?$/m);
  assert.match(t, /^ {2}- con: users with big reports get a partial file$/m);
  assert.match(t, /^Answer: B \(cap at 10,000 and warn\)$/m);
  assert.match(t, /^Trade-off accepted: users with big reports get a partial file$/m);
  assert.match(t, /^- A2: users with big reports get a partial file$/m, 'consequences list every accepted trade-off');
  assert.match(t, new RegExp(`^${DOD_HEADING}$`, 'm'));
  assert.match(t, /^- \[ \] AC1 \(happy, fail, edge\): the export button is on sales and stock \(A1\)$/m);
  assert.match(t, /^- \[ \] AC2 \(happy, fail\): the sales report downloads as CSV \(T1\)$/m);
  assert.match(t, /^- \[ \] AC3 \(happy\): reports cover sales and stock \(S1\)$/m);
  assert.match(t, /^- non-goals: xlsx \(T2\)$/m);
  assert.match(t, /^- test tiers: unit, e2e \(A4\)$/m);
});

test('should cite the accepting answer when an item is an accepted assumption', () => {
  const d = dod();
  d.items.push({ id: 'AC5', text: 'UTF-8 with BOM', source: { kind: 'assumed' }, accepted: 'A4' });
  assert.match(render({ dod: d }).text, /^- \[ \] AC5 \(happy, fail, edge\): UTF-8 with BOM \(A4\)$/m);
});

test('should refuse to render when touches is missing or an answer has no saved question with pros and cons', () => {
  const d = dod(); delete d.touches;
  assert.ok(render({ dod: d }).errors.some(e => /touches/.test(e)));
  assert.ok(render({ questions: QUESTIONS }).errors.some(e => /Q4 is not in questions\.md/.test(e)));
  const noCon = QUESTIONS_ALL.replace('  - stock users ask again\n', '');
  assert.ok(render({ questions: noCon }).errors.some(e => /Q1 \(B\) needs at least one pro and one con/.test(e)));
  const oneOption = QUESTIONS_ALL.replace(/\(B\) no flag\n {2}\+ less code\n {2}- no way back without a deploy\n/, '');
  assert.ok(render({ questions: oneOption }).errors.some(e => /Q3 needs at least two options/.test(e)));
});

test('should say no single option was picked when the answer is free text', () => {
  assert.match(render().text, /### A4: Backward compatibility\?[\s\S]*?Answer: ไม่เปลี่ยน API เดิม\nTrade-off accepted: none recorded \(the answer picks no single option\)/);
});

// ---------- parse + check (what ptdd and qa-sweep run, with only the committed file) ----------
test('should pass checkAdr and parse the items and required sections when the ADR is as rendered', () => {
  const text = render().text;
  assert.deepEqual(checkAdr(text, { show }), []);
  const p = parseAdr(text);
  assert.deepEqual(p.touches, ['src/reports/**', 'e2e/reports/**']);
  assert.equal(p.slug, 'report-export');
  assert.deepEqual(p.section.items.map(i => [i.id, i.kinds, i.refs]), [['AC1', ['happy', 'fail', 'edge'], ['A1']], ['AC2', ['happy', 'fail'], ['T1']], ['AC3', ['happy'], ['S1']], ['AC4', ['happy', 'fail', 'edge'], ['A2']]]);
  assert.equal(p.section.required.featureFlag.value, 'REPORT_EXPORT, default off');
});

test('should still pass checkAdr when the agent rewrites the prose around the labeled lines', () => {
  const text = render().text.replace('## Consequences\n', '## Consequences\n\nWe chose a cap because the gateway times out at 30 s.\n').replace(/^Options considered.*$/m, 'Options we weighed:');
  assert.deepEqual(checkAdr(text, { show }), []);
});

test('should fail checkAdr with a clear message when the file has no Definition of done section', () => {
  assert.match(checkAdr('# 1. Use Postgres\n\nStatus: Accepted\n').join('\n'), /not an ADR with a "## Definition of done" section/);
  assert.match(checkAdr('{"slug":"x"}').join('\n'), /not an ADR/);
});

test('should fail checkAdr when the Definition of done section is edited by hand', () => {
  const text = render().text.replace('over 10,000 rows are capped with a warning', 'over 20,000 rows are capped');
  assert.match(checkAdr(text, { show }).join('\n'), /edited by hand.*re-run dod\.mjs adr/);
});

test('should fail checkAdr when a cited decision loses its answer, an option loses its con, or a ref points nowhere', () => {
  const base = render().text;
  assert.match(checkAdr(base.replace('Answer: B (cap at 10,000 and warn)\n', ''), { show }).join('\n'), /A2 has no "Answer:" line/);
  assert.match(checkAdr(base.replace('  - con: two pages to test\n', ''), { show }).join('\n'), /A1 \(A\) needs at least one pro and one con/);
  assert.match(checkAdr(base.replace(/^T1: .*\n/m, ''), { show }).join('\n'), /AC2 cites T1, which is not in the ADR/);
});

test('should fail checkAdr when a spec quote is no longer at its line in the repo', () => {
  assert.match(checkAdr(render().text, { show: () => 'changed\n' }).join('\n'), /S1: quote not found within 2 lines of docs\/reports\.md:2/);
});

// ---------- adr-check (at adr time, with the run folder's sources) ----------
test('should pass checkAdrSources when every quote, question, option, pro and con survives the rewrite', () => {
  const text = render().text.replace('## Context\n', '## Context\n\nThe sales team asked for this in Q3.\n');
  assert.deepEqual(checkAdrSources(text, { dod: dod(), ...SRC, show }), []);
});

test('should fail checkAdrSources when the agent drops or rewords a pro, con or answer', () => {
  const text = render().text.replace('  - pro: fast and predictable', '  - pro: quick');
  assert.match(checkAdrSources(text, { dod: dod(), ...SRC, show }).join('\n'), /dropped from the ADR: "fast and predictable" \(Q2 \(B\) pro\)/);
});

test('should fail checkAdrSources when the DoD section no longer matches the DoD', () => {
  const d = dod(); d.items[0].text = 'something else';
  assert.match(checkAdrSources(render().text, { dod: d, ...SRC, show }).join('\n'), /does not match the DoD.*re-run dod\.mjs adr/);
});

// ---------- the shapes ptdd and qa-sweep take ----------
test('should give paired-agent-tdd dod[] items with id, text, kinds and a source naming the ADR', () => {
  const items = toPlanDod(parseAdr(render().text), 'docs/adr/0007-report-export.md');
  assert.deepEqual(items[1], { id: 'AC2', text: 'the sales report downloads as CSV', kinds: ['happy', 'fail'], source: 'docs/adr/0007-report-export.md T1' });
});

test('should give qa-sweep spec requirements whose ref line holds the quote, and the dod ref for the report', () => {
  const text = render().text, file = 'docs/adr/0007-report-export.md';
  const reqs = toRequirements(parseAdr(text), file);
  const lines = text.split('\n');
  for (const r of reqs) {
    const [, line] = r.source.ref.split(':');
    assert.equal(r.source.kind, 'spec');
    assert.ok(lines[Number(line) - 1].includes(r.source.quote), `${r.id} ${r.source.ref}`);
  }
  assert.equal(reqs[0].dod, 'A1');
  assert.equal(reqs[0].source.quote, 'A (both)');
});

// ---------- touches, globs, renames ----------
test('should match globs with *, ** and ? and treat a bare path as a folder or a file', () => {
  assert.ok(matchGlob('src/reports/**', 'src/reports/a/b.ts'));
  assert.ok(!matchGlob('src/reports/**', 'src/reportsx/a.ts'));
  assert.ok(matchGlob('src/*.ts', 'src/a.ts') && !matchGlob('src/*.ts', 'src/a/b.ts'));
  assert.ok(matchGlob('**/*.md', 'README.md') && matchGlob('**/*.md', 'docs/x/y.md'));
  assert.ok(matchGlob('src/?.ts', 'src/a.ts') && !matchGlob('src/?.ts', 'src/ab.ts'));
  assert.ok(matchGlob('src/reports', 'src/reports/a.ts') && matchGlob('src/a.ts', 'src/a.ts') && !matchGlob('src/a', 'src/ab.ts'));
  assert.ok(matchGlob('a.b+c/(x).ts', 'a.b+c/(x).ts'), 'regex metacharacters are literal');
});

test('should rewrite the glob prefix when the whole folder moved', () => {
  const r = syncTouches(['src/reports/**'], [['src/reports/a.ts', 'src/export/a.ts'], ['src/reports/x/b.ts', 'src/export/x/b.ts']], ['src/export/a.ts', 'src/export/x/b.ts']);
  assert.deepEqual(r.touches, ['src/export/**']);
  assert.deepEqual(r.changes, [{ from: 'src/reports/**', to: 'src/export/**' }]);
  assert.deepEqual(r.warnings, []);
});

test('should keep the old glob and add the new one when only part of the folder moved', () => {
  const r = syncTouches(['src/reports/**'], [['src/reports/a.ts', 'src/export/a.ts']], ['src/export/a.ts', 'src/reports/b.ts']);
  assert.deepEqual(r.touches, ['src/reports/**', 'src/export/**']);
  assert.deepEqual(r.changes, [{ added: 'src/export/**', next: 'src/reports/**' }]);
});

test('should follow a renamed file named literally and ignore a rename the glob still matches', () => {
  assert.deepEqual(syncTouches(['src/a.ts'], [['src/a.ts', 'lib/a.ts']], ['lib/a.ts']).touches, ['lib/a.ts']);
  const same = syncTouches(['src/*.ts'], [['src/a.ts', 'src/b.ts']], ['src/b.ts']);
  assert.deepEqual([same.touches, same.changes], [['src/*.ts'], []]);
});

test('should add the new paths and warn when files moved to several places', () => {
  const r = syncTouches(['src/reports/*.ts'], [['src/reports/a.ts', 'lib/a.ts'], ['src/reports/b.ts', 'app/z/b.ts']], ['lib/a.ts', 'app/z/b.ts']);
  assert.deepEqual(r.touches, ['lib/a.ts', 'app/z/b.ts']);
  assert.match(r.warnings.join('\n'), /src\/reports\/\*\.ts: files moved to several places/);
});

test('should warn about a glob that matches no file', () => {
  assert.match(syncTouches(['gone/**'], [], ['src/a.ts']).warnings.join('\n'), /gone\/\*\* matches no file/);
});

test('should replace only the touches list when setTouches edits the frontmatter', () => {
  const text = render().text;
  const next = setTouches(text, ['src/export/**']);
  assert.deepEqual(parseFrontmatter(next).touches, ['src/export/**']);
  assert.equal(next.slice(next.indexOf('\n# 7.')), text.slice(text.indexOf('\n# 7.')));
  assert.deepEqual(checkAdr(next, { show }), [], 'the DoD hash does not cover the frontmatter');
});

// ---------- index and numbering ----------
test('should write the index between markers and leave the rest of the README alone', () => {
  const entries = [{ n: 7, file: '0007-report-export.md', title: 'Report export', status: 'Accepted', touches: ['src/reports/**'] }, { n: 6, file: '0006-cache.md', title: 'Cache', status: 'Superseded', touches: [] }];
  const fresh = upsertIndex(null, entries);
  assert.match(fresh, /<!-- adr-index[^>]*-->\n\| # \| Title \| Status \| Touches \|\n\|---\|---\|---\|---\|\n\| \[6\]\(0006-cache\.md\) \| Cache \| Superseded \| {2}\|\n\| \[7\]\(0007-report-export\.md\) \| Report export \| Accepted \| `src\/reports\/\*\*` \|\n<!-- \/adr-index -->/);
  const mine = '# Our decisions\n\nHand-written intro.\n';
  const once = upsertIndex(mine, entries);
  assert.ok(once.startsWith(mine));
  assert.equal(upsertIndex(once, entries), once, 'idempotent');
  assert.equal(upsertIndex(once, entries.slice(0, 1)).match(/<!-- adr-index/g).length, 1);
});

test('should number the next ADR after the highest existing one', () => {
  assert.equal(nextNumber(['0001-a.md', '0012-b.md', 'README.md', '0003-c.md']), 13);
  assert.equal(nextNumber([]), 1);
  assert.equal(adrFileName(7, 'report-export'), '0007-report-export.md');
});

// ---------- fuzz ----------
let seed = 7;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const ALPHABET = ['a', 'Z', ' ', '\n', '\t', '#', '-', '*', '[', ']', '(', ')', 'x', ':', 'A1', 'T1', '## Definition of done\n', '- [ ] ', '---\n', 'ไ', '😀', '"', '\\', '/', '?', '**'];
const junk = (n = 60) => Array.from({ length: rnd(n) }, () => ALPHABET[rnd(ALPHABET.length)]).join('');

test('should never throw and always return string errors when checkAdr reads random text', () => {
  for (let i = 0; i < 500; i++) {
    const t = rnd(3) ? junk() : render().text.slice(0, rnd(3000)) + junk(10);
    const errs = checkAdr(t, { show: rnd(2) ? show : () => { throw new Error('boom'); } });
    assert.ok(Array.isArray(errs) && errs.every(e => typeof e === 'string'), t);
  }
});

test('should never throw when matchGlob and syncTouches get random globs and paths', () => {
  const path = () => junk(12).replace(/\n/g, '');
  for (let i = 0; i < 500; i++) {
    const g = path(), p = path();
    assert.equal(typeof matchGlob(g, p), 'boolean');
    const r = syncTouches([g, path()], [[p, path()]], [path(), p]);
    assert.ok(Array.isArray(r.touches) && Array.isArray(r.warnings));
  }
});

test('should keep a rendered ADR valid when random prose is added outside the DoD section', () => {
  for (let i = 0; i < 100; i++) {
    const extra = junk(40).replace(/^#+ /gm, '').replace(/^(?:[ATS]\d+:|Answer:|- \(|- \[| {2}- )/gm, 'x');
    const text = render().text.replace('## Consequences\n', `## Consequences\n\n${extra.replace(/^---$/gm, '')}\n`);
    assert.deepEqual(checkAdr(text, { show }), [], extra);
  }
});

test('should list every question that adr would refuse when questions.md is checked on its own', () => {
  assert.deepEqual(checkQuestions(QUESTIONS), []);
  assert.deepEqual(checkQuestions('Q3: Only one?\n(A) yes\n  + quick\n  - none\n\nQ1: Half?\n(A) a\n  + p\n(B) b\n  - c\n'),
    ['Q1 (A) needs at least one pro and one con', 'Q1 (B) needs at least one pro and one con', 'Q3 needs at least two options']);
  assert.deepEqual(checkQuestions(''), []);
});
