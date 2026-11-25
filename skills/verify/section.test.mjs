import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markedSections } from './marker.mjs';
import { CAP, capOutput, fileHeader, mergeSections, renderSection } from './section.mjs';

const base = { id: 'AC1', env: 'cloud (local shell)', run: 'node --test a.test.mjs', result: 'pass', expect: 'exit 0', output: '✔ ok (AC1)\nℹ fail 0' };

test('should write env, run, result, expect, image and the output block under a marker when an item ran (Run)', () => {
  const s = renderSection({ ...base, image: 'out/shot.png' });
  const lines = s.split('\n');
  assert.equal(lines[0], '## AC1');
  assert.match(lines[1], /^<!-- verify: written by verify\.mjs; sha256:[0-9a-f]{16} -->$/);
  assert.deepEqual(lines.slice(2, 7), ['env: cloud (local shell)', 'run: node --test a.test.mjs', 'result: pass', 'expect: exit 0', 'image: out/shot.png']);
  assert.ok(s.includes('```\n✔ ok (AC1)\nℹ fail 0\n```\n'));
  assert.equal(markedSections(s).get('AC1').intact, true);
});

test('should keep output that holds fences or headings inside its block when the command printed them (Run edge)', () => {
  const s = renderSection({ ...base, output: 'a\n```\n## AC2\nb' });
  const m = markedSections(`${s}## AC2\nhand\n`);
  assert.equal(m.get('AC1').intact, true);
  assert.equal(m.has('AC2'), false);
  assert.ok(s.includes('\n ```\n'));
  assert.equal(renderSection({ ...base, run: 'a\nb' }).split('\n')[3], 'run: a b');
});

test('should cut long output to head and tail and say so when it is over the cap (Run edge)', () => {
  const long = `HEAD${'x'.repeat(CAP * 2)}TAIL`;
  const c = capOutput(long);
  assert.ok(c.length < CAP + 200);
  assert.ok(c.startsWith('HEAD') && c.endsWith('TAIL'));
  assert.match(c, /cut: the output was \d+ chars; the first and last \d+ are kept/);
  assert.equal(capOutput('short'), 'short');
});

test('should start a new file with the title and the sections when the verify file does not exist (Rerun)', () => {
  const md = mergeSections(null, [renderSection(base)], fileHeader('demo', '0008'));
  assert.ok(md.startsWith('# Verify: demo (ADR 0008)\n\n## AC1\n'));
  assert.equal(fileHeader('demo', null), '# Verify: demo (claims)');
});

test('should replace only the sections that ran and keep every other byte when the file has hand-written parts (Rerun)', () => {
  const pre = '# Verify: demo (ADR 0008)\n\nBooked: [cloud] by hand.\n\n';
  const ac2 = '## AC2\nenv: cloud\nrun: x\nresult: pass\n```\nhand\n```\n\n';
  const dog = '## Dogfood\nnotes ## not a heading\n';
  const old = pre + renderSection({ ...base, output: 'old ✔' }) + ac2 + dog;
  const merged = mergeSections(old, [renderSection({ ...base, output: 'new ✔' }), renderSection({ ...base, id: 'AC3', output: 'three' })], 'ignored');
  assert.ok(merged.startsWith(pre + '## AC1\n'));
  assert.ok(merged.includes('new ✔') && !merged.includes('old ✔'));
  assert.ok(merged.includes(ac2 + dog));
  assert.ok(merged.endsWith('## AC3\n' + renderSection({ ...base, id: 'AC3', output: 'three' }).split('\n').slice(1).join('\n')));
  assert.equal(markedSections(merged).get('AC1').intact, true);
});

test('should replace a hand-written section of the same id and keep a file with no final newline readable when it reruns (Rerun edge)', () => {
  const old = '# t\n\n## AC1\nresult: pass';
  const merged = mergeSections(old, [renderSection(base)], 'x');
  assert.ok(merged.startsWith('# t\n\n## AC1\n<!-- verify'));
  const again = mergeSections('# t', [renderSection(base)], 'x');
  assert.ok(again.startsWith('# t\n\n## AC1\n'));
});

test('should keep output of exactly the cap length whole when it is not over the cap (Run edge)', () => {
  assert.equal(capOutput('abcd', 4), 'abcd');
  assert.match(capOutput('abcde', 4), /\[cut: the output was 5 chars/);
});

test('should replace the section in place when the file starts with that section (Rerun edge)', () => {
  const merged = mergeSections(renderSection({ ...base, output: 'old ✔' }), [renderSection({ ...base, output: 'new ✔' })], 'x');
  assert.equal(merged, renderSection({ ...base, output: 'new ✔' }));
});

test('should keep the blank lines after a replaced section and end it with one newline when the old one had none (Rerun edge)', () => {
  const s = renderSection(base).trimEnd();
  assert.equal(mergeSections('# t\n\n## AC1\nold\n\n\n## B\nb\n', [renderSection(base)], 'x'), `# t\n\n${s}\n\n\n## B\nb\n`);
  assert.equal(mergeSections('# t\n\n## AC1\nold', [renderSection(base)], 'x'), `# t\n\n${s}\n`);
});

test('should cut output to the first and last half of the cap at 8000 chars when it is over the cap (Run edge)', () => {
  assert.equal(capOutput('abcdefghij', 4), 'ab\n... [cut: the output was 10 chars; the first and last 2 are kept] ...\nij');
  assert.equal(CAP, 8000);
  assert.equal(capOutput('x'.repeat(8000)), 'x'.repeat(8000));
  assert.match(capOutput('x'.repeat(8001)), /the output was 8001 chars; the first and last 4000 are kept/);
});
