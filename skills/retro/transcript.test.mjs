import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript } from './transcript.mjs';

const L = o => JSON.stringify(o);
const asst = (id, content, usage, t) => L({ type: 'assistant', sessionId: 's1', cwd: '/r', timestamp: t, message: { id, model: 'm', role: 'assistant', content, usage } });
const user = (content, t, extra = {}) => L({ type: 'user', sessionId: 's1', cwd: '/r', timestamp: t, message: { role: 'user', content }, ...extra });
const U = { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 };

export const SAMPLE = [
  L({ type: 'queue-operation', timestamp: '2026-11-22T01:00:00Z' }),
  user('fix the export, my key is ghp_' + 'k'.repeat(36), '2026-11-22T01:00:01Z'),
  asst('m1', [{ type: 'thinking', thinking: '' }], U, '2026-11-22T01:00:02Z'),
  asst('m1', [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/r/hooks/hooks.json' } }], U, '2026-11-22T01:00:03Z'),
  user([{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(5000) }], '2026-11-22T01:00:04Z'),
  asst('m2', [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'node --test hooks/' } }], { ...U, output_tokens: 20 }, '2026-11-22T01:00:05Z'),
  user([{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: [{ type: 'text', text: 'Exit code 1\nnot ok 3' }] }], '2026-11-22T01:00:06Z'),
  asst('m3', [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'node --test hooks/' } }], U, '2026-11-22T01:00:07Z'),
  user([{ type: 'tool_result', tool_use_id: 't3', is_error: true, content: 'Exit code 1' }], '2026-11-22T01:00:08Z'),
  asst('m4', [{ type: 'tool_use', id: 't4', name: 'Read', input: { file_path: '/r/hooks/hooks.json' } }], U, '2026-11-22T01:00:09Z'),
  user([{ type: 'tool_result', tool_use_id: 't4', content: 'ok' }], '2026-11-22T01:00:10Z'),
  user('no, the hooks.json order matters', '2026-11-22T01:00:11Z'),
  user('<system-reminder>meta</system-reminder>', '2026-11-22T01:00:12Z', { isMeta: true }),
  '{not json',
].join('\n');

test('should sum tokens once per message and find the time span when a transcript is parsed (RSrc)', () => {
  const t = parseTranscript(SAMPLE);
  assert.deepEqual(t.tokens, { input: 8, output: 50, cacheRead: 400, cacheCreate: 200 });
  assert.equal(t.sessionId, 's1');
  assert.deepEqual(t.cwds, ['/r']);
  assert.equal(t.start, '2026-11-22T01:00:00Z');
  assert.equal(t.end, '2026-11-22T01:00:12Z');
  assert.equal(t.badLines, 1);
});

test('should list repeated reads, failed commands and big results with their line numbers when tools ran (RSrc, CMatt)', () => {
  const t = parseTranscript(SAMPLE);
  assert.deepEqual(t.reads, [{ file: '/r/hooks/hooks.json', times: 2, lines: [4, 10] }]);
  assert.deepEqual(t.failedCommands, [{ cmd: 'node --test hooks/', times: 2, lines: [7, 9] }]);
  assert.equal(t.bigResults[0].line, 5);
  assert.equal(t.bigResults[0].bytes, 5000);
  assert.equal(t.toolCalls, 4);
});

test('should keep the user\'s own messages redacted with line numbers when meta messages are mixed in (RSrc, ERedact)', () => {
  const t = parseTranscript(SAMPLE);
  assert.deepEqual(t.userMessages.map(m => m.line), [2, 12]);
  assert.ok(!JSON.stringify(t).includes('ghp_k'));
  assert.equal(t.redacted, 1);
});

test('should return an empty summary instead of throwing when lines are random (RSrc fuzz)', () => {
  const pieces = ['{', '}', '"type":"assistant"', '"message":', 'null', '[', ']', ',', '"usage":{"output_tokens":"x"}', '\n', '"content":5'];
  let seed = 5;
  for (let i = 0; i < 300; i++) {
    let text = '';
    for (let j = 0; j < 30; j++) text += pieces[(seed = (seed * 48271) % 2147483647) % pieces.length];
    const t = parseTranscript(text);
    assert.ok(Number.isFinite(t.tokens.output));
  }
});
