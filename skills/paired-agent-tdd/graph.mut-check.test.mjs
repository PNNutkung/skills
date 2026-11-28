// Mutation-gate gap tests for graph.mjs: the shape guards in check() and the agent counts of plan(). Run: node --test graph.mut-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODES, plan } from './graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

test('should exit 0 when graph.mjs --check finds the node graph, its guards and the embedded blocks consistent', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'graph.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ok - 18 nodes/);
});

test('should keep the call caps of the fast-mode nodes when the node table is read', () => {
  const cap = id => NODES.find(n => n.id === id).cap;
  assert.deepEqual(['test-writer', 'code-driver', 'judge', 'fixer'].map(cap), [40, 45, 20, 35]);
});

test('should count the default pipeline when no group runs solo', () => {
  const { counts, total } = plan(3, 0, 1);
  assert.equal(total, 15);
  assert.deepEqual(counts, { 'red-driver': 3, 'red-navigator': 3, 'green-driver': 3, 'green-navigator': 3, 'integration-tester': 0, reviewer: 1, fixer: 1, 'final-verifier': 1 });
});

test('should count one integration tester when integration is 1 and one tdd-driver per solo group without a writer', () => {
  assert.equal(plan(3, 1, 0).counts['integration-tester'], 1);
  const { counts, total } = plan(3, 0, 0, 3);
  assert.equal(counts['red-driver'], 0);
  assert.equal(counts['tdd-driver'], 3);
  assert.equal(counts['test-writer'], undefined);
  assert.equal(total, 7);
});

test('should count a test writer and a code driver per solo group when the writer is on', () => {
  const { counts, total } = plan(3, 0, 0, 3, true);
  assert.equal(counts['test-writer'], 3);
  assert.equal(counts['code-driver'], 3);
  assert.equal(counts['tdd-driver'], undefined);
  assert.equal(total, 10);
});
