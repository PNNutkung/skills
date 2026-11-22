import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from './redact.mjs';

test('should hide token-like strings and count them when text holds secrets (ERedact)', () => {
  const secrets = ['ghp_' + 'a'.repeat(36), 'github_pat_' + 'B'.repeat(40), 'sk-ant-api03-' + 'x'.repeat(40), 'sk-' + 'Z'.repeat(40), 'xoxb-123-456-abcdef', 'AKIA' + 'ABCDEFGHIJKLMNOP', 'glpat-' + 'q'.repeat(20)];
  for (const s of secrets) {
    const r = redact(`use ${s} now`);
    assert.ok(!r.text.includes(s), s);
    assert.match(r.text, /use \[redacted\] now/);
    assert.equal(r.count, 1, s);
  }
});

test('should hide values of secret-named assignments and bearer headers when they appear (ERedact)', () => {
  assert.equal(redact('API_KEY=abc123def456').text, 'API_KEY=[redacted]');
  assert.equal(redact('password: "hunter2hunter"').text, 'password: "[redacted]"');
  assert.equal(redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc').text, 'Authorization: Bearer [redacted]');
  assert.match(redact('-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----').text, /^\[redacted\]$/);
});

test('should leave ordinary text alone when nothing looks secret (ERedact)', () => {
  for (const s of ['run node --test', 'the token budget is 2 per group', 'sha 0123abcd', 'สวัสดี password policy']) assert.deepEqual(redact(s), { text: s, count: 0 });
});

test('should be idempotent and never leak a planted secret when input is random (ERedact fuzz)', () => {
  const secret = 'ghp_' + 'Q'.repeat(36);
  let seed = 11;
  const pick = a => a[(seed = (seed * 16807) % 2147483647) % a.length];
  for (let i = 0; i < 400; i++) {
    const text = Array.from({ length: 12 }, () => pick([' ', '=', ':', '"', 'token', secret, 'abc', '\n', 'Bearer ', 'x'.repeat(5), 'ก'])).join('');
    const once = redact(text);
    assert.ok(!once.text.includes(secret));
    assert.deepEqual(redact(once.text), { text: once.text, count: 0 });
  }
});
