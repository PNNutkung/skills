import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from './runner.mjs';

test('should capture stdout and stderr with the exit code when a command runs in bash (Run)', async () => {
  const r = await runCommand('echo out; echo err 1>&2; exit 3', { cwd: process.cwd(), env: process.env, timeoutSec: Infinity });
  assert.equal(r.code, 3);
  assert.equal(r.timedOut, false);
  assert.match(r.output, /out/);
  assert.match(r.output, /err/);
});

test('should stop the whole process group and mark a timeout when the command runs past the limit (Timeout)', async () => {
  const t0 = Date.now();
  const r = await runCommand('sleep 30 & sleep 30; wait', { cwd: process.cwd(), env: process.env, timeoutSec: 1 });
  assert.equal(r.timedOut, true);
  assert.equal(r.seconds, 1);
  assert.ok(Date.now() - t0 < 10000, `${Date.now() - t0} ms`);
});

test('should finish without a timeout when the command ends before the limit (Timeout happy)', async () => {
  const r = await runCommand('echo fast', { cwd: process.cwd(), env: process.env, timeoutSec: 20 });
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 0);
});

test('should report the error and not hang when the command cannot start (Run fail)', async () => {
  const r = await runCommand('echo x', { cwd: '/no/such/dir/verify', env: process.env, timeoutSec: 60 });
  assert.equal(r.code, null);
  assert.match(r.output, /ENOENT|no such/i);
});

test('should drop the node test runner context from the env when the command runs a nested node --test (Run edge)', async () => {
  const r = await runCommand('echo "ctx=${NODE_TEST_CONTEXT:-none} keep=$KEEP"', { cwd: process.cwd(), env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8', KEEP: 'y' }, timeoutSec: Infinity });
  assert.match(r.output, /ctx=none keep=y/);
});
