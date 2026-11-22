import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERIFY, verifyFinding, verifyAll } from './evidence.mjs';

const files = { 'src/a.ts': 'line1\nconst a = x as Foo;\nline3\nline4\nline5\nline6' };
const transcripts = { '/t/s1.jsonl': ['{"a":1}', '{"type":"user","message":{"content":"no, the hooks.json order matters"}}', '{"k":"ghp_' + 'z'.repeat(36) + '"}'] };
const ctx = {
  readFile: p => files[p] ?? null,
  transcriptLine: (p, n) => transcripts[p]?.[n - 1] ?? null,
  commit: sha => (sha === 'abc1234' ? 'fix: try was in a comment\n\ndiff ...' : null),
  runFile: name => ({ 'pr.json': '[{"body":"why is this cast here?"}]', 'ci.log': 'Error: lint step missing' }[name] ?? null),
  metric: key => ({ 'steering.0.bytes': 9312, 'guardrail.ciLint': false }[key]),
};
const f = evidence => ({ id: 'F1', title: 't', category: 'navigation', evidence });

test('should pass a finding when every piece of its evidence checks out in code (EProof)', () => {
  const r = verifyFinding(f([
    { kind: 'file', ref: 'src/a.ts:3', quote: 'x as Foo' },
    { kind: 'transcript', ref: '/t/s1.jsonl:2', quote: 'the hooks.json order matters' },
    { kind: 'commit', ref: 'abc1234', quote: 'try was in a comment' },
    { kind: 'pr', ref: 'pr.json', quote: 'why is this cast here?' },
    { kind: 'ci', ref: 'ci.log', quote: 'lint step missing' },
    { kind: 'metric', ref: 'steering.0.bytes', quote: '9312' },
    { kind: 'metric', ref: 'guardrail.ciLint', quote: 'false' },
  ]), ctx);
  assert.equal(r.verify, VERIFY.passed, JSON.stringify(r.reasons));
});

test('should mark not-passed with the reason when cited evidence does not match (EProof)', () => {
  for (const [ev, why] of [
    [{ kind: 'file', ref: 'src/a.ts:6', quote: 'x as Foo' }, /not within 2 lines/],
    [{ kind: 'file', ref: 'src/missing.ts:1', quote: 'x' }, /cannot read/],
    [{ kind: 'file', ref: 'src/a.ts', quote: 'x' }, /file:line/],
    [{ kind: 'transcript', ref: '/t/s1.jsonl:1', quote: 'order matters' }, /not on line 1/],
    [{ kind: 'transcript', ref: '/t/s1.jsonl:3', quote: 'ghp_' + 'z'.repeat(36) }, /redact/],
    [{ kind: 'commit', ref: 'deadbee', quote: '' }, /no commit/],
    [{ kind: 'metric', ref: 'steering.0.bytes', quote: '100' }, /is 9312/],
    [{ kind: 'pr', ref: 'pr.json', quote: '' }, /empty quote/],
    [{ kind: 'guess', ref: 'x', quote: 'y' }, /unknown evidence kind/],
  ]) {
    const r = verifyFinding(f([ev]), ctx);
    assert.equal(r.verify, VERIFY.notPassed, JSON.stringify(ev));
    assert.match(r.reasons.join(' '), why);
  }
});

test('should mark no-evidence when a finding cites nothing (EProof)', () => {
  assert.equal(verifyFinding(f([]), ctx).verify, VERIFY.noEvidence);
  assert.equal(verifyFinding({ id: 'F2', title: 'x' }, ctx).verify, VERIFY.noEvidence);
});

test('should count each verify status when a whole findings list is checked (EProof)', () => {
  const r = verifyAll([f([]), f([{ kind: 'ci', ref: 'ci.log', quote: 'lint step missing' }]), f([{ kind: 'ci', ref: 'ci.log', quote: 'nope' }])], ctx);
  assert.deepEqual(r.counts, { passed: 1, 'not-passed': 1, 'no-evidence': 1 });
});

test('should never throw and never pass without evidence when findings are random (EProof fuzz)', () => {
  const vals = [null, 5, 'x', [], {}, { kind: 'file' }, { kind: 'file', ref: 7 }, { kind: 'metric', ref: '__proto__', quote: 'x' }, { kind: 'file', ref: '../../etc/passwd:1', quote: 'root' }];
  for (const a of vals) for (const b of vals) {
    const r = verifyFinding({ id: 'X', evidence: [a, b].filter(v => v !== null) }, ctx);
    assert.ok(Object.values(VERIFY).includes(r.verify));
    assert.notEqual(r.verify, VERIFY.passed);
  }
});
