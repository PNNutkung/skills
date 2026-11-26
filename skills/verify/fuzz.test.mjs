// Fuzz: random plans, outputs and files never make the core throw, and never turn into a pass the input does not hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, lintExpect } from './expect.mjs';
import { markedSections, splitSections } from './marker.mjs';
import { checkPlan } from './plan.mjs';
import { mergeSections, renderSection } from './section.mjs';

let seed = 0x2545f491;
const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32; };
const pick = a => a[Math.floor(rand() * a.length)];
const RUNS = 500;
const OUT_PIECES = ['✔ ', 'ok 1 - ', 'ℹ pass 1', 'ℹ pass 0', 'ℹ fail 0', 'ℹ fail 2', '# fail 0', '(AC1)', 'AC1x', 'AC1', '\n', ' ', 'PASSED', '3 passed', '1 failed', 'Tests: 2 passed', '✓ ', '--- PASS: TestAC1', 'FAIL', 'ok', '```', '## X', 'é', '\u0000'];
const text = (pieces, n = 30) => Array.from({ length: Math.floor(rand() * n) }, () => pick(pieces)).join('');
const VALUES = [undefined, null, '', 'x', 'AC1', 'AC2', 'cloud', 'ci', 'staging', 'A1', 'A9', true, false, 0, 2, 'node --test', 'npm test', 'echo ok', 'ok', '/.*/', '/(/', '/AC1/', {}, []];
const entry = () => Object.fromEntries(['id', 'env', 'run', 'expect', 'exit', 'ci', 'remote', 'approved', 'accepted', 'image', 'flag'].filter(() => rand() < 0.5).map(k => [k, k === 'flag' && rand() < 0.5 ? { name: pick(['A_ENABLED', 'bad', 'B_MAX']), default: pick(['true', 'false', 'unlimited', undefined]) } : pick(VALUES)]));

test('should never throw and never accept a plan that misses an item when plans are random (Plan)', () => {
  const ctx = { items: [{ id: 'AC1' }, { id: 'AC2' }], booked: ['cloud'], newFlags: rand() < 0.5 ? ['A_ENABLED'] : [], answers: { A1: 'yes' } };
  for (let i = 0; i < RUNS; i++) {
    const plan = rand() < 0.1 ? pick(VALUES) : { items: Array.from({ length: Math.floor(rand() * 4) }, entry) };
    const r = checkPlan(plan, ctx);
    assert.equal(r.ok, r.errors.length === 0);
    if (r.ok) {
      const ids = r.entries.map(e => e.id);
      assert.ok(ids.includes('AC1') && ids.includes('AC2'), JSON.stringify(plan));
      for (const e of r.entries) if (e.kind === 'run' || e.kind === 'remote') assert.deepEqual(lintExpect(e), []);
    }
  }
});

test('should pass a node --test run only when the output really holds the preset lines when output is random (Presets, Expect)', () => {
  const e = { id: 'AC1', run: 'node --test t.mjs' };
  for (let i = 0; i < RUNS; i++) {
    const out = text(OUT_PIECES, 60);
    const r = judge(e, { code: rand() < 0.8 ? 0 : 1, output: out, timedOut: rand() < 0.05, seconds: 1 });
    if (r.pass) {
      assert.match(out, /^\s*(?:ℹ|#) fail 0\s*$/m);
      assert.match(out, /^\s*(?:ℹ|#) pass [1-9]\d*\s*$/m);
      assert.ok(out.split('\n').some(l => /^\s*(?:✔ |ok \d+ - )/.test(l) && /(?<![A-Za-z0-9])AC1(?![A-Za-z0-9])/.test(l)), out);
    }
  }
});

test('should never pass when a text expect is not in the random output or the exit is wrong (Expect)', () => {
  for (let i = 0; i < RUNS; i++) {
    const out = text(OUT_PIECES);
    const want = text(OUT_PIECES, 4) || 'x';
    const code = pick([0, 1, 2, null]);
    const r = judge({ id: 'X', run: 'node a.mjs', expect: want, exit: 0 }, { code, output: out, timedOut: false });
    assert.equal(r.pass, code === 0 && out.includes(want));
  }
});

test('should keep every hand-written byte and leave each new section intact when files and outputs are random (Rerun)', () => {
  for (let i = 0; i < RUNS; i++) {
    const hand = `# Verify\n\n${text(['note ', 'x', '\n', '- a\n'], 10)}\n## Hand\n${text(['h', ' ', '\n'], 10)}\n`;
    const ids = ['AC1', 'AC2'].filter(() => rand() < 0.7);
    const old = mergeSections(hand, ids.map(id => renderSection({ id, env: 'cloud', run: 'r', result: 'pass', output: text(OUT_PIECES) })), 'h');
    const id = pick(['AC1', 'AC2', 'AC3']);
    const merged = mergeSections(old, [renderSection({ id, env: 'cloud', run: 'r', result: pick(['pass', 'fail']), output: text(OUT_PIECES) })], 'h');
    assert.ok(merged.startsWith(hand.slice(0, hand.indexOf('## Hand'))));
    assert.ok(splitSections(merged).some(p => p.id === 'Hand' && hand.includes(p.text.trimEnd())));
    assert.equal(markedSections(merged).get(id).intact, true);
    for (const [, v] of markedSections(merged)) assert.equal(v.intact, true);
  }
});
