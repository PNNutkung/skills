// Unit tests for rules.mjs, the one reader of rule ids (rules/*.md), rules/enforcers.json and docs/retro/rule-hits.json (ADR 0013), plus a
// seeded fuzz of the rule id parser. Run: node --test skills/retro/rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENFORCERS_FILE, HITS_FILE, RULE_LEVELS, RULE_STATUSES,
  RulesFileError, addHits, isUnenforced, levelErrors, markRepeats, parseRuleIds, readEnforcers, readHits, ruleFiles,
} from './rules.mjs';

const P = 'rules/paths.md';
const ID_SHAPE = /^paths\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const tmpRepo = () => mkdtempSync(join(tmpdir(), 'retro-rules-'));
const put = (root, rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
const deepFreeze = o => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const startsAt = (errors, line) => errors.filter(e => e.startsWith(`${P}:${line}: `));

test('should export the statuses, levels and file names when the module loads', () => {
  assert.deepEqual(RULE_STATUSES, ['enforced', 'partial', 'judgment']);
  assert.deepEqual(RULE_LEVELS, ['check', 'ratchet', 'hook', 'type', 'test']);
  assert.equal(ENFORCERS_FILE, 'rules/enforcers.json');
  assert.equal(HITS_FILE, 'docs/retro/rule-hits.json');
});

// parseRuleIds

test('should return each id with its line when every top-level bullet ends with a rule comment', () => {
  const text = '# Paths\n\nLead paragraph.\n\n- one <!-- rule: paths/one -->\n- two <!--rule:paths/two-b-->  \n- three <!--   rule:   paths/x3   -->\n';
  assert.deepEqual(parseRuleIds(P, text), { ids: [{ id: 'paths/one', line: 5 }, { id: 'paths/two-b', line: 6 }, { id: 'paths/x3', line: 7 }], errors: [] });
});

test('should return no ids and no errors when the file has no bullets', () => {
  assert.deepEqual(parseRuleIds(P, '# Paths\n\nOnly a paragraph.\n'), { ids: [], errors: [] });
  assert.deepEqual(parseRuleIds(P, ''), { ids: [], errors: [] });
});

test('should report the path and line when a bullet has no id (BulletIds)', () => {
  const r = parseRuleIds(P, '# Paths\n\n- no id here\n- ok <!-- rule: paths/ok -->\n');
  assert.equal(r.errors.length, 1);
  assert.equal(startsAt(r.errors, 3).length, 1);
  assert.deepEqual(r.ids, [{ id: 'paths/ok', line: 4 }]);
});

test('should report the line when the id sits on a continuation line instead of the first line', () => {
  const r = parseRuleIds(P, '- text\n  more text <!-- rule: paths/late -->\n');
  assert.equal(startsAt(r.errors, 1).length, 1);
  assert.ok(!r.ids.some(i => i.id === 'paths/late'));
});

test('should report the line when the rule comment is followed by more text', () => {
  const r = parseRuleIds(P, '- a <!-- rule: paths/a --> trailing words\n');
  assert.equal(startsAt(r.errors, 1).length, 1);
});

test('should report the line when the id has another file stem (IdShape)', () => {
  const r = parseRuleIds(P, '\n- x <!-- rule: performance/x -->\n');
  assert.equal(r.errors.length, 1);
  assert.equal(startsAt(r.errors, 2).length, 1);
});

test('should report the line when the slug is not lowercase kebab (IdShape)', () => {
  for (const bad of ['paths/Real-Path', 'paths/real_path', 'paths/real--path', 'paths/-real', 'paths/real-', 'paths/', 'paths/a b', 'paths/a/b']) {
    const r = parseRuleIds(P, `- x <!-- rule: ${bad} -->\n`);
    assert.equal(startsAt(r.errors, 1).length, 1, bad);
  }
});

test('should report the second line when one id is used twice in the file (IdShape)', () => {
  const r = parseRuleIds(P, '- a <!-- rule: paths/same -->\n- b <!-- rule: paths/same -->\n');
  assert.equal(r.errors.length, 1);
  assert.equal(startsAt(r.errors, 2).length, 1);
});

test('should ignore bullets inside a fenced code block when the fence is plain or indented', () => {
  const text = [
    '- real <!-- rule: paths/real -->',
    '',
    '```',
    '- not a rule',
    '```',
    '',
    '  ```bash',
    '- not a rule either',
    '  ```',
    '- after <!-- rule: paths/after -->',
  ].join('\n');
  assert.deepEqual(parseRuleIds(P, text), { ids: [{ id: 'paths/real', line: 1 }, { id: 'paths/after', line: 10 }], errors: [] });
});

test('should keep a fence open when a marker of another kind or a shorter one comes before the close (BulletIds)', () => {
  const text = [
    '````md',
    '```',
    '- inside the outer fence',
    '```',
    '~~~',
    '- still inside',
    '````',
    '- after <!-- rule: paths/after -->',
  ].join('\n');
  assert.deepEqual(parseRuleIds(P, text), { ids: [{ id: 'paths/after', line: 8 }], errors: [] });
});

test('should treat nested bullets and indented lines as part of the bullet above when they have no id (BulletIds)', () => {
  const text = '- parent <!-- rule: paths/p -->\n  - child with no id\n    - grandchild\n  more text of the parent\n\n  indented paragraph\n';
  assert.deepEqual(parseRuleIds(P, text), { ids: [{ id: 'paths/p', line: 1 }], errors: [] });
});

test('should ignore paragraphs, headings, table rows and other list markers when they are not top-level dash bullets (BulletIds)', () => {
  const text = '# Heading - with dash\n\nA paragraph - with dash.\n\n| a | - |\n|---|---|\n\n* star item\n1. numbered\n-no space\n---\n  - indented bullet\n';
  assert.deepEqual(parseRuleIds(P, text), { ids: [], errors: [] });
});

test('should count lines the same way when the file has CRLF line ends', () => {
  const r = parseRuleIds(P, '# Paths\r\n\r\n- one <!-- rule: paths/one -->\r\n- none\r\n');
  assert.deepEqual(r.ids, [{ id: 'paths/one', line: 3 }]);
  assert.equal(r.errors.length, 1);
  assert.equal(startsAt(r.errors, 4).length, 1);
});

test('should use the file name without .md as the stem when the path is nested', () => {
  const r = parseRuleIds('rules/flag-defaults-e2e.md', '- a <!-- rule: flag-defaults-e2e/a -->\n');
  assert.deepEqual(r, { ids: [{ id: 'flag-defaults-e2e/a', line: 1 }], errors: [] });
});

// ruleFiles

test('should list rules/*.md sorted without README and subfolders when ruleFiles reads a repo (CheckScope)', () => {
  const root = tmpRepo();
  for (const f of ['rules/zeta.md', 'rules/alpha.md', 'rules/README.md', 'rules/notes.txt', 'rules/sub/deep.md', 'other/x.md']) put(root, f, '- x\n');
  assert.deepEqual(ruleFiles(root), ['rules/alpha.md', 'rules/zeta.md']);
});

// readEnforcers

test('should return null entries when rules/enforcers.json is missing', () => {
  assert.deepEqual(readEnforcers(tmpRepo()), { entries: null });
});

test('should return the parsed entries when rules/enforcers.json is a JSON object', () => {
  const root = tmpRepo();
  const entries = { 'paths/realpath': { status: 'judgment', enforcers: [], reason: 'needs a person' } };
  put(root, 'rules/enforcers.json', JSON.stringify(entries));
  assert.deepEqual(readEnforcers(root), { entries });
});

test('should throw naming rules/enforcers.json when the file is not JSON or not an object', () => {
  for (const bad of ['{ not json', '42', '"text"', 'null']) {
    const root = tmpRepo();
    put(root, 'rules/enforcers.json', bad);
    assert.throws(() => readEnforcers(root), e => e instanceof RulesFileError && /rules\/enforcers\.json/.test(e.message), bad);
  }
});

// readHits

test('should return an empty list when rule-hits.json is missing', () => {
  assert.deepEqual(readHits(tmpRepo()), []);
});

test('should return the hits when rule-hits.json is a JSON array', () => {
  const root = tmpRepo();
  const hits = [{ rule: 'paths/realpath', date: '2026-11-22', branch: 'old', finding: 'F1' }];
  put(root, 'docs/retro/rule-hits.json', JSON.stringify(hits));
  assert.deepEqual(readHits(root), hits);
});

test('should throw naming rule-hits.json when the file is not JSON or not an array', () => {
  for (const bad of ['[ broken', '{}', '"x"']) {
    const root = tmpRepo();
    put(root, 'docs/retro/rule-hits.json', bad);
    assert.throws(() => readHits(root), e => e instanceof RulesFileError && /rule-hits\.json/.test(e.message), bad);
  }
});

// isUnenforced

test('should say unenforced when there are no entries, no entry for the rule, or a judgment or partial status (Unenforced)', () => {
  const entries = { 'a/j': { status: 'judgment' }, 'a/p': { status: 'partial' }, 'a/e': { status: 'enforced' } };
  assert.equal(isUnenforced(null, 'a/e'), true);
  assert.equal(isUnenforced(entries, 'a/none'), true);
  assert.equal(isUnenforced(entries, 'a/j'), true);
  assert.equal(isUnenforced(entries, 'a/p'), true);
});

test('should say enforced when the rule status is enforced', () => {
  assert.equal(isUnenforced({ 'a/e': { status: 'enforced', enforcers: ['x'] } }, 'a/e'), false);
});

test('should not treat inherited object keys as entries when the rule is named like a prototype key', () => {
  assert.equal(isUnenforced({}, 'constructor'), true);
  assert.equal(isUnenforced({}, '__proto__'), true);
});

// addHits

test('should append one hit per finding with a rule in findings order when addHits runs (RuleHits)', () => {
  const hits = deepFreeze([{ rule: 'old/r', date: '2026-01-01', branch: 'old', finding: 'F9' }]);
  const findings = deepFreeze([
    { id: 'F1', rule: 'paths/b', verify: 'passed' },
    { id: 'F2', verify: 'passed' },
    { id: 'F3', rule: '', verify: 'passed' },
    { id: 'F4', rule: 42, verify: 'passed' },
    { id: 'F5', rule: 'paths/a', verify: 'passed' },
  ]);
  const out = addHits(hits, findings, { date: '2026-11-27', branch: 'feat' });
  assert.deepEqual(out, [
    { rule: 'old/r', date: '2026-01-01', branch: 'old', finding: 'F9' },
    { rule: 'paths/b', date: '2026-11-27', branch: 'feat', finding: 'F1' },
    { rule: 'paths/a', date: '2026-11-27', branch: 'feat', finding: 'F5' },
  ]);
  assert.notEqual(out, hits);
  assert.equal(hits.length, 1);
});

test('should skip findings that did not pass and hits already in the file when addHits runs again (RuleHits)', () => {
  const hits = deepFreeze([{ rule: 'paths/a', date: '2026-11-26', branch: 'feat', finding: 'F1' }]);
  const findings = deepFreeze([
    { id: 'F1', rule: 'paths/a', verify: 'passed' },
    { id: 'F2', rule: 'paths/b', verify: 'not-passed' },
    { id: 'F3', rule: 'paths/c', verify: 'no-evidence' },
    { id: 'F4', rule: 'paths/d' },
    { id: 'F5', rule: 'paths/e', verify: 'passed' },
  ]);
  assert.deepEqual(addHits(hits, findings, { date: '2026-11-27', branch: 'feat' }), [
    { rule: 'paths/a', date: '2026-11-26', branch: 'feat', finding: 'F1' },
    { rule: 'paths/e', date: '2026-11-27', branch: 'feat', finding: 'F5' },
  ]);
  assert.equal(addHits(hits, findings, { date: '2026-11-27', branch: 'other' }).length, 3);
});

test('should return a copy equal to the old hits when no finding names a rule', () => {
  const hits = [{ rule: 'old/r', date: 'd', branch: 'b', finding: 'F1' }];
  const out = addHits(hits, [{ id: 'F1' }], { date: 'd2', branch: 'b2' });
  assert.deepEqual(out, hits);
  assert.notEqual(out, hits);
});

// markRepeats

const ev = n => Array.from({ length: n }, (_, i) => ({ kind: 'file', ref: `a.md:${i + 1}`, quote: 'x' }));

test('should mark a repeat with its earlier hits when another branch already hit the rule (Repeat)', () => {
  const hits = deepFreeze([
    { rule: 'paths/r', date: '2026-11-22', branch: 'old', finding: 'F2' },
    { rule: 'paths/r', date: '2026-11-27', branch: 'feat', finding: 'F1' },
    { rule: 'paths/other', date: '2026-11-20', branch: 'x', finding: 'F1' },
  ]);
  const findings = deepFreeze([{ id: 'F1', rule: 'paths/r', evidence: ev(1) }]);
  const [f] = markRepeats(findings, hits, { branch: 'feat' });
  assert.equal(f.repeat, true);
  assert.deepEqual(f.earlierHits, [{ rule: 'paths/r', date: '2026-11-22', branch: 'old', finding: 'F2' }]);
  assert.equal(f.id, 'F1');
  assert.equal(findings[0].repeat, undefined);
});

test('should not mark a repeat when the only hit of the rule is from the same branch', () => {
  const hits = [{ rule: 'paths/r', date: '2026-11-27', branch: 'feat', finding: 'F1' }];
  const [f] = markRepeats([{ id: 'F1', rule: 'paths/r', evidence: ev(1) }], hits, { branch: 'feat' });
  assert.equal(f.repeat, false);
});

test('should not mark a repeat when there are no hits and one evidence item', () => {
  const [f] = markRepeats([{ id: 'F1', rule: 'paths/r', evidence: ev(1) }], [], { branch: 'feat' });
  assert.equal(f.repeat, false);
});

test('should mark a repeat with empty earlier hits when the finding cites at least 2 evidence items', () => {
  const [f] = markRepeats([{ id: 'F1', rule: 'paths/r', evidence: ev(2) }], [], { branch: 'feat' });
  assert.equal(f.repeat, true);
  assert.deepEqual(f.earlierHits, []);
});

test('should return a finding unchanged with no repeat key when it names no rule', () => {
  const input = { id: 'F1', title: 't', evidence: ev(3), verify: 'passed', reasons: [] };
  const out = markRepeats([input], [{ rule: 'paths/r', date: 'd', branch: 'old', finding: 'F1' }], { branch: 'feat' });
  assert.deepEqual(out, [input]);
  assert.ok(!Object.hasOwn(out[0], 'repeat'));
  assert.ok(!Object.hasOwn(out[0], 'earlierHits'));
});

test('should not mutate the findings or hits when markRepeats runs', () => {
  const hits = deepFreeze([{ rule: 'paths/r', date: 'd', branch: 'old', finding: 'F1' }]);
  const findings = deepFreeze([{ id: 'F1', rule: 'paths/r', evidence: ev(1) }, { id: 'F2' }]);
  const out = markRepeats(findings, hits, { branch: 'feat' });
  assert.notEqual(out, findings);
  assert.equal(out.length, 2);
});

// levelErrors

const judgment = { 'paths/r': { status: 'judgment', enforcers: [], reason: 'needs a person' } };
const repeatF = { id: 'F1', rule: 'paths/r', repeat: true, earlierHits: [] };
const needs = 'F1: repeat of unenforced rule paths/r needs a proposal with level (check|ratchet|hook|type|test) or noLevel "<why>"';

test('should pass when a repeat of an unenforced rule has a proposal with a known level', () => {
  for (const level of RULE_LEVELS) assert.deepEqual(levelErrors([repeatF], [{ id: 'P1', finding: 'F1', level }], judgment), [], level);
});

test('should pass when a repeat of an unenforced rule has a proposal with a noLevel reason', () => {
  assert.deepEqual(levelErrors([repeatF], [{ id: 'P1', finding: 'F1', noLevel: 'only a person can judge this' }], judgment), []);
});

test('should name the finding when a repeat of an unenforced rule has no proposal', () => {
  assert.deepEqual(levelErrors([repeatF], [], judgment), [needs]);
});

test('should name the finding when its proposal has an empty noLevel', () => {
  assert.deepEqual(levelErrors([repeatF], [{ id: 'P1', finding: 'F1', noLevel: '' }], judgment), [needs]);
});

test('should name the finding when the only proposal with a level is for another finding', () => {
  assert.deepEqual(levelErrors([repeatF], [{ id: 'P1', finding: 'F2', level: 'check' }], judgment), [needs]);
});

test('should name the proposal when its level is not a known level', () => {
  const errs = levelErrors([repeatF], [{ id: 'P1', finding: 'F1', level: 'lint' }], judgment);
  assert.ok(errs.includes('P1: level lint is not one of check, ratchet, hook, type, test'), JSON.stringify(errs));
  assert.ok(errs.includes(needs), JSON.stringify(errs));
});

test('should need a level when the rule has no entry or there are no entries', () => {
  assert.deepEqual(levelErrors([repeatF], [], {}), [needs]);
  assert.deepEqual(levelErrors([repeatF], [], null), [needs]);
  assert.deepEqual(levelErrors([repeatF], [], { 'paths/r': { status: 'partial', enforcers: ['x'], reason: 'half' } }), [needs]);
});

test('should need nothing when the repeated rule is enforced', () => {
  assert.deepEqual(levelErrors([repeatF], [], { 'paths/r': { status: 'enforced', enforcers: ['rules/checks/x.mjs'], reason: '' } }), []);
});

test('should need nothing when the finding is not a repeat or names no rule', () => {
  assert.deepEqual(levelErrors([{ ...repeatF, repeat: false }, { id: 'F2' }], [], judgment), []);
});

// fuzz

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('should never throw and return well-formed ids and errors when it parses 300 random markdown documents', () => {
  const rnd = mulberry32(0x5eed44);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const word = () => pick(['real', 'path', 'a', 'x1', 'spawn-timeout', 'Bad', 'with_under', 'ok-2', '', 'é', '日本', '--', 'paths']);
  const unicode = () => String.fromCodePoint(...Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => pick([0x41, 0x2d, 0x20, 0x3c, 0x21, 0x3e, 0xe9, 0x65e5, 0x1f600, 0x200b, 0x09, 0x23, 0x60])));
  const frags = [
    () => `- rule text <!-- rule: paths/${word()} -->`,
    () => `- rule text <!-- rule: paths/${word()}-${word()} -->  `,
    () => `- rule text <!--rule:${pick(['paths', 'perf', 'Paths', ''])}/${word()}-->`,
    () => `- bullet with no marker ${unicode()}`,
    () => `- ${unicode()} <!-- rule: paths/${word()} --> tail`,
    () => `  - nested ${unicode()}`,
    () => `    deeper ${unicode()} <!-- rule: paths/${word()} -->`,
    () => pick(['```', '```js', '  ```', '~~~', '````']),
    () => `# heading ${unicode()}`,
    () => `| a | - ${unicode()} |`,
    () => `paragraph ${unicode()} - not a bullet`,
    () => '',
    () => '-',
    () => '- ',
    () => '<!-- rule: paths/loose -->',
    () => unicode(),
  ];
  for (let doc = 0; doc < 300; doc++) {
    const eol = rnd() < 0.3 ? '\r\n' : '\n';
    const text = Array.from({ length: Math.floor(rnd() * 25) }, () => pick(frags)()).join(eol) + (rnd() < 0.5 ? eol : '');
    const lineCount = text.split(/\r?\n/).length;
    let r;
    assert.doesNotThrow(() => { r = parseRuleIds(P, text); }, `doc ${doc}: ${JSON.stringify(text)}`);
    assert.ok(Array.isArray(r.ids) && Array.isArray(r.errors), `doc ${doc}`);
    const seen = new Set();
    for (const { id, line } of r.ids) {
      assert.match(id, ID_SHAPE, `doc ${doc}: ${JSON.stringify(text)}`);
      assert.ok(!seen.has(id), `doc ${doc}: duplicate ${id}`);
      seen.add(id);
      assert.ok(Number.isInteger(line) && line >= 1 && line <= lineCount, `doc ${doc}: line ${line}`);
      assert.ok(text.split(/\r?\n/)[line - 1].startsWith('- '), `doc ${doc}: line ${line} is not a bullet`);
    }
    for (const e of r.errors) {
      const m = /^rules\/paths\.md:(\d+): \S/.exec(e);
      assert.ok(m, `doc ${doc}: ${e}`);
      const n = Number(m[1]);
      assert.ok(n >= 1 && n <= lineCount, `doc ${doc}: error line ${n} of ${lineCount}`);
    }
  }
});
