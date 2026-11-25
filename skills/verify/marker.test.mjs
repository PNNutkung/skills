// Tests for the section marker that tells code-written verify sections from hand-written text (Guard, Run, Rerun).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bodyHash, markedSections, markerLine, splitSections } from './marker.mjs';

const BODY = 'env: cloud (local shell)\nrun: node --test x.test.mjs\nresult: pass\n```\nok\n```';
const section = (id, body) => `## ${id}\n${markerLine(body)}\n${body}\n`;

test('should hash the trimmed body to 16 hex of sha256 when given a body (Run)', () => {
  const want = createHash('sha256').update(BODY).digest('hex').slice(0, 16);
  assert.equal(bodyHash(BODY), want);
  assert.equal(bodyHash(`\n\n${BODY}\n  \n`), want, 'surrounding blank space does not count');
  assert.match(bodyHash(''), /^[0-9a-f]{16}$/);
  assert.notEqual(bodyHash(BODY), bodyHash(BODY.replace('pass', 'fail')));
});

test('should write the marker comment with the body hash when a body is given (Run)', () => {
  assert.equal(markerLine(BODY), `<!-- verify: written by verify.mjs; sha256:${bodyHash(BODY)} -->`);
});

test('should list only marked sections with their body and an intact hash when the file mixes code and hand text (Guard)', () => {
  const md = `# Verify: demo (ADR 0008)\n\nintro\n\n${section('AC1', BODY)}\n## AC2\nresult: pass\nhand written\n\n${section('AC3', 'result: fail')}`;
  const m = markedSections(md);
  assert.deepEqual([...m.keys()], ['AC1', 'AC3']);
  assert.equal(m.get('AC1').body.trim(), BODY);
  assert.equal(m.get('AC1').hash, bodyHash(BODY));
  assert.equal(m.get('AC1').intact, true);
  assert.equal(m.get('AC3').intact, true);
});

test('should mark a section not intact when its body was changed by hand (Guard)', () => {
  const md = section('AC1', BODY).replace('result: pass', 'result: pass ');
  assert.equal(markedSections(md).get('AC1').intact, false, 'a trailing blank inside a line counts');
  const edited = section('AC1', BODY).replace('ok', 'all good');
  assert.equal(markedSections(edited).get('AC1').intact, false);
});

test('should treat a marker that is not the first line after the heading as hand text when it is further down (Guard)', () => {
  const md = `## AC1\nnote\n${markerLine(BODY)}\n${BODY}\n`;
  assert.equal(markedSections(md).size, 0);
});

test('should keep a ## line inside a fenced output block in the section when the output has one (Rerun)', () => {
  const body = 'result: pass\n```\n## not a heading\nmore\n```';
  const md = `${section('AC1', body)}## AC2\nhand\n`;
  const m = markedSections(md);
  assert.equal(m.get('AC1').intact, true);
  assert.equal(m.get('AC1').body.trim(), body);
  assert.deepEqual(splitSections(md).map((s) => s.id), ['AC1', 'AC2']);
});

test('should return the file text unchanged when the split sections are joined (Rerun)', () => {
  const md = `# Verify: demo\n\npre\n${section('AC1', BODY)}\n## AC2\nx\n## AC3 two words\ny`;
  const parts = splitSections(md);
  assert.equal(parts.map((p) => p.text).join(''), md);
  assert.equal(parts[0].id, null, 'text before the first heading');
});

test('should return an empty map when the file is empty or has no headings (Guard)', () => {
  assert.equal(markedSections('').size, 0);
  assert.equal(markedSections('just text\n<!-- verify: written by verify.mjs; sha256:0000000000000000 -->').size, 0);
  assert.equal(markedSections(undefined).size, 0);
});

test('should mark a section not intact when the marker hash is malformed (Guard)', () => {
  const md = `## AC1\n<!-- verify: written by verify.mjs; sha256:zz -->\n${BODY}\n`;
  const s = markedSections(md).get('AC1');
  assert.equal(s?.intact ?? false, false);
});

// Fuzz: random markdown never throws, every split joins back to the input, and a changed body never stays intact.
test('should never throw and never call a changed body intact when the input is random (Guard) (Rerun)', () => {
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const pieces = ['## AC1', '## AC2', '##', '## ', '```', 'text', '', 'result: pass', markerLine('x'), '<!-- verify: written by verify.mjs; sha256:', '\r', ' ## AC9'];
  for (let i = 0; i < 1500; i++) {
    const md = Array.from({ length: Math.floor(rand() * 15) }, () => pick(pieces)).join(pick(['\n', '\n\n', '']));
    const parts = splitSections(md);
    assert.equal(parts.map((p) => p.text).join(''), md);
    for (const [, s] of markedSections(md)) assert.equal(s.intact, bodyHash(s.body) === s.hash);
    const body = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => pick(['a', 'b', 'result: pass', '```'])).join('\n');
    const good = section('AC1', body);
    assert.equal(markedSections(good).get('AC1')?.intact, true, JSON.stringify(body));
  }
});

test('should split an empty file into no parts when the text is empty (Rerun edge)', () => {
  assert.deepEqual(splitSections(''), []);
  assert.deepEqual(splitSections('## A\n'), [{ id: 'A', text: '## A\n' }]);
});
