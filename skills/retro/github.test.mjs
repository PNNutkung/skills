import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksFromRest, prFromRest } from './github.mjs';

const rest = {
  pr: { number: 17, title: 'Read DoD from ADR', html_url: 'https://github.com/o/r/pull/17', merged_at: '2026-11-22T01:00:00Z', head: { ref: 'feat', sha: 'abc' }, base: { ref: 'main' } },
  commits: [{ sha: 'c1', commit: { committer: { date: '2026-11-21T10:00:00Z' }, message: 'fix: one\n\nbody' } }],
  comments: [{ user: { login: 'nut' }, body: 'looks good', created_at: '2026-11-21T11:00:00Z' }],
  reviewComments: [{ user: { login: 'bot' }, body: 'nit', created_at: '2026-11-21T12:00:00Z', path: 'a.mjs', line: 3 }],
  reviews: [{ user: { login: 'nut' }, body: 'ok', state: 'APPROVED', submitted_at: '2026-11-21T13:00:00Z' }],
};

test('should map the REST pull request to the gh pr view shape when GraphQL is not available', () => {
  const pr = prFromRest(rest);
  assert.deepEqual(
    { number: pr.number, title: pr.title, url: pr.url, mergedAt: pr.mergedAt, headRefName: pr.headRefName, baseRefName: pr.baseRefName },
    { number: 17, title: 'Read DoD from ADR', url: 'https://github.com/o/r/pull/17', mergedAt: '2026-11-22T01:00:00Z', headRefName: 'feat', baseRefName: 'main' });
  assert.deepEqual(pr.commits, [{ oid: 'c1', committedDate: '2026-11-21T10:00:00Z', messageHeadline: 'fix: one' }]);
  assert.deepEqual(pr.comments, [
    { author: { login: 'nut' }, body: 'looks good', createdAt: '2026-11-21T11:00:00Z' },
    { author: { login: 'bot' }, body: 'nit', createdAt: '2026-11-21T12:00:00Z', path: 'a.mjs', line: 3 },
  ]);
  assert.deepEqual(pr.reviews, [{ author: { login: 'nut' }, body: 'ok', state: 'APPROVED', submittedAt: '2026-11-21T13:00:00Z' }]);
});

test('should keep going when a REST list is missing or a user was deleted', () => {
  const pr = prFromRest({ pr: { ...rest.pr, merged_at: null }, commits: null, comments: [{ user: null, body: 'x', created_at: 't' }] });
  assert.equal(pr.mergedAt, null);
  assert.deepEqual(pr.commits, []);
  assert.deepEqual(pr.comments, [{ author: { login: 'ghost' }, body: 'x', createdAt: 't' }]);
  assert.deepEqual(pr.reviews, []);
});

test('should render check runs one per line like gh pr checks when the REST check runs are read', () => {
  const log = checksFromRest({ check_runs: [
    { name: 'test (22, ubuntu)', status: 'completed', conclusion: 'success', html_url: 'u1' },
    { name: 'wsl', status: 'in_progress', conclusion: null, html_url: 'u2' },
  ] });
  assert.equal(log, 'test (22, ubuntu)\tsuccess\tu1\nwsl\tin_progress\tu2\n');
  assert.equal(checksFromRest(null), '');
});
