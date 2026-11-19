import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isLocalTarget } from './target.mjs';

const SCRIPT = fileURLToPath(new URL('./target.mjs', import.meta.url));
const STAGING = 'https://staging.example.com';
const CHECK_ENV = `process.exit(process.env.BASE_URL==='${STAGING}'?0:9)`;
const run = (args) => spawnSync(process.execPath, [SCRIPT, 'run', ...args], { encoding: 'utf8' });

test('local hosts are local', () => {
  for (const u of ['http://localhost:3000', 'http://LOCALHOST.:3000', 'http://[::1]:8080', 'http://127.0.0.2', 'http://app.localhost', 'http://user:pass@localhost:3000'])
    assert.equal(isLocalTarget(u), true, u);
});

test('look-alikes and real hosts are not local', () => {
  for (const u of ['http://localhost.evil.example', 'http://127.0.0.1.nip.io', 'http://127.0.0.256', 'https://staging.example.com', 'not a url', 'file:///etc/passwd', 'javascript:localhost'])
    assert.equal(isLocalTarget(u), false, u);
});

test('a compose service name is local only when listed', () => {
  assert.equal(isLocalTarget('http://web:8000', ['web']), true);
  assert.equal(isLocalTarget('http://web:8000'), false);
});

test('run refuses a non-local target without confirmation and runs it with one', () => {
  const refused = run(['--url', STAGING, '--', process.execPath, '-e', CHECK_ENV]);
  assert.equal(refused.status, 3);
  assert.match(refused.stderr, /target https:\/\/staging\.example\.com is not local: ask the user, then pass --confirm-target https:\/\/staging\.example\.com/);

  const wrong = run(['--url', STAGING, '--confirm-target', `${STAGING}/`, '--', process.execPath, '-e', CHECK_ENV]);
  assert.equal(wrong.status, 3);

  const confirmed = run(['--url', STAGING, '--confirm-target', STAGING, '--', process.execPath, '-e', CHECK_ENV]);
  assert.equal(confirmed.status, 0);
});

test('run passes CMD exit code through and honours --env-name for a local target', () => {
  const r = run(['--url', 'http://localhost:3000', '--env-name', 'APP_URL', '--', process.execPath, '-e', "process.exit(process.env.APP_URL==='http://localhost:3000'?7:9)"]);
  assert.equal(r.status, 7);
});

test('run exits 2 on usage errors', () => {
  assert.equal(run(['--', process.execPath, '-e', '0']).status, 2);
  assert.equal(run(['--url', 'http://localhost']).status, 2);
  assert.equal(run(['--url', 'http://localhost', '--bogus', 'x', '--', process.execPath]).status, 2);
});
