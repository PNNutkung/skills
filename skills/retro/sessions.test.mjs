import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTranscripts, selectSessions, sinceWindow, workWindow } from './sessions.mjs';

const metas = [
  { path: '/p/-r/s1.jsonl', sessionId: 's1', cwds: ['/r'], start: '2026-11-22T01:00:00Z', end: '2026-11-22T02:00:00Z' },
  { path: '/p/-r/s1/subagents/a.jsonl', sessionId: 's1', cwds: ['/r'], start: '2026-11-22T01:10:00Z', end: '2026-11-22T01:20:00Z', subagent: true },
  { path: '/p/-r/s2.jsonl', sessionId: 's2', cwds: ['/r/src'], start: '2026-11-20T01:00:00Z', end: '2026-11-20T02:00:00Z' },
  { path: '/p/-other/s3.jsonl', sessionId: 's3', cwds: ['/rother'], start: '2026-11-22T01:00:00Z', end: '2026-11-22T02:00:00Z' },
];

test('should pick sessions in the repo whose time overlaps the work when no ids are given (SMatch)', () => {
  const got = selectSessions(metas, { repo: '/r', from: '2026-11-22T00:30:00Z', to: '2026-11-22T03:00:00Z' });
  assert.deepEqual(got.map(m => m.path), ['/p/-r/s1.jsonl', '/p/-r/s1/subagents/a.jsonl']);
});

test('should use exactly the given sessions when --session is passed (SMatch)', () => {
  assert.deepEqual(selectSessions(metas, { repo: '/r', from: '2026-11-22T00:00:00Z', to: '2026-11-22T00:01:00Z', ids: ['s2'] }).map(m => m.sessionId), ['s2']);
});

test('should widen commit times by an hour and read days, hours or a date when --since is given (RScope, SMatch)', () => {
  assert.deepEqual(workWindow(['2026-11-22T05:00:00Z', '2026-11-22T03:00:00Z']), { from: '2026-11-22T02:00:00.000Z', to: '2026-11-22T06:00:00.000Z' });
  const now = Date.parse('2026-11-22T12:00:00Z');
  assert.equal(sinceWindow('7d', now).from, '2026-11-15T12:00:00.000Z');
  assert.equal(sinceWindow('12h', now).from, '2026-11-22T00:00:00.000Z');
  assert.equal(sinceWindow('2026-11-01', now).from, '2026-11-01T00:00:00.000Z');
  assert.throws(() => sinceWindow('soon', now), /--since/);
});

test('should list main and subagent transcripts when the projects folder is read (RSrc)', () => {
  const root = mkdtempSync(join(tmpdir(), 'retro-proj-'));
  mkdirSync(join(root, '-r', 's1', 'subagents'), { recursive: true });
  writeFileSync(join(root, '-r', 's1.jsonl'), '{"type":"user","sessionId":"s1","cwd":"/r","timestamp":"2026-11-22T01:00:00Z","message":{"content":"hi"}}\n');
  writeFileSync(join(root, '-r', 's1', 'subagents', 'agent-1.jsonl'), '{"type":"user","sessionId":"s1","cwd":"/r","timestamp":"2026-11-22T01:05:00Z","message":{"content":"x"}}\n');
  writeFileSync(join(root, '-r', 'notes.txt'), 'x');
  const got = listTranscripts(root);
  assert.deepEqual(got.map(m => [m.path.slice(root.length), m.subagent, m.sessionId]), [['/-r/s1.jsonl', false, 's1'], ['/-r/s1/subagents/agent-1.jsonl', true, 's1']]);
  assert.deepEqual(listTranscripts(join(root, 'missing')), []);
});
