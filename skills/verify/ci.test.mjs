import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciCheck } from './ci.mjs';

const runs = list => JSON.stringify({ total_count: list.length, check_runs: list });
const fake = (body, seen = []) => (args, cwd) => { seen.push({ args, cwd }); if (body instanceof Error) throw body; return body; };

test('should pass with name, status, conclusion and URL as evidence when the check run of HEAD succeeded (Envs)', () => {
  const seen = [];
  const r = ciCheck('test (node 24)', { sha: 'abc123', cwd: '/r', gh: fake(runs([{ name: 'other', status: 'completed', conclusion: 'failure', html_url: 'u0' }, { name: 'test (node 24)', status: 'completed', conclusion: 'success', html_url: 'https://x/1' }]), seen) });
  assert.equal(r.pass, true);
  assert.equal(r.output, 'name: test (node 24)\nstatus: completed\nconclusion: success\nhtml_url: https://x/1');
  assert.deepEqual(seen[0].args, ['api', 'repos/{owner}/{repo}/commits/abc123/check-runs?per_page=100']);
  assert.equal(seen[0].cwd, '/r');
});

test('should fail when the check run failed, is still running or is not there (Envs fail)', () => {
  assert.equal(ciCheck('t', { sha: 's', gh: fake(runs([{ name: 't', status: 'completed', conclusion: 'failure', html_url: 'u' }])) }).pass, false);
  const pending = ciCheck('t', { sha: 's', gh: fake(runs([{ name: 't', status: 'in_progress', conclusion: null, html_url: 'u' }])) });
  assert.equal(pending.pass, false);
  assert.match(pending.why.join(), /not completed/);
  assert.match(ciCheck('t', { sha: 's', gh: fake(runs([])) }).why.join(), /no check run named "t" on s/);
});

test('should fail with the gh error and not throw when gh fails or prints bad JSON (Envs edge)', () => {
  assert.match(ciCheck('t', { sha: 's', gh: fake(new Error('HTTP 404')) }).why.join(), /gh api failed: HTTP 404/);
  assert.match(ciCheck('t', { sha: 's', gh: fake('not json') }).why.join(), /gh api failed/);
});

test('should not pass when gh fails or the named check run is missing (Envs fail)', () => {
  assert.equal(ciCheck('t', { sha: 's', gh: fake(new Error('HTTP 404')) }).pass, false);
  assert.equal(ciCheck('t', { sha: 's', gh: fake(runs([{ name: 'other', status: 'completed', conclusion: 'success' }])) }).pass, false);
});

// gh answers by path: check runs, the PRs of a commit, one PR
const routes = map => (args) => { const hit = Object.entries(map).find(([k]) => args[1].includes(k)); if (!hit) throw new Error(`HTTP 404 ${args[1]}`); if (hit[1] instanceof Error) throw hit[1]; return hit[1]; };

test('should say the PR has a merge conflict when the check is missing and an open PR of the commit is dirty (Envs fail)', () => {
  const r = ciCheck('t', { sha: 's', gh: routes({ 'check-runs': runs([]), 'commits/s/pulls': JSON.stringify([{ number: 35, state: 'open' }]), 'pulls/35': JSON.stringify({ number: 35, mergeable_state: 'dirty' }) }) });
  assert.equal(r.pass, false);
  assert.match(r.why.join('; '), /no check run named "t" on s; PR #35 has a merge conflict with its base: CI does not run until it is fixed/);
});

test('should name only the missing check when the open PR has no conflict or the commit has no PR (Envs edge)', () => {
  const clean = ciCheck('t', { sha: 's', gh: routes({ 'check-runs': runs([]), 'commits/s/pulls': JSON.stringify([{ number: 35, state: 'open' }]), 'pulls/35': JSON.stringify({ mergeable_state: 'clean' }) }) });
  assert.deepEqual(clean.why, ['no check run named "t" on s']);
  const closed = ciCheck('t', { sha: 's', gh: routes({ 'check-runs': runs([]), 'commits/s/pulls': JSON.stringify([{ number: 9, state: 'closed' }]), 'pulls/9': JSON.stringify({ mergeable_state: 'dirty' }) }) });
  assert.deepEqual(closed.why, ['no check run named "t" on s']);
});

test('should not throw and name only the missing check when the PR lookup fails or prints bad JSON (Envs edge)', () => {
  assert.deepEqual(ciCheck('t', { sha: 's', gh: routes({ 'check-runs': runs([]), 'commits/s/pulls': new Error('HTTP 403') }) }).why, ['no check run named "t" on s']);
  assert.deepEqual(ciCheck('t', { sha: 's', gh: routes({ 'check-runs': runs([]), 'commits/s/pulls': '{"x":1}' }) }).why, ['no check run named "t" on s']);
  assert.deepEqual(ciCheck('t', { sha: 's', gh: routes({ 'check-runs': runs([]), 'commits/s/pulls': '[{"number":1,"state":"open"}]', 'pulls/1': 'not json' }) }).why, ['no check run named "t" on s']);
});
