// Offline checks for direct-run.mjs, the unconfined runner of paired-agent-tdd. Run: node --test direct-run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'direct-run.mjs');
const ZT = resolve(process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review'));
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-direct-')));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const tmp = join(dir, 'tmp'), work = join(dir, 'work');
for (const d of [tmp, work]) mkdirSync(d);
process.env.TMPDIR = tmp;
process.env.ZT_MARKER_DIR = join(dir, 'marker');
const { createRunDir } = await import(pathToFileURL(join(ZT, 'runctx.mjs')).href);
const run = createRunDir('direct-test'); // a trusted run folder: the only place the ledger is written

const go = (args, env = {}) => spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8', env: { ...process.env, ZT_RUN_DIR: '', ...env } });

test('--check prints direct and exits 0', () => {
  const r = go(['--check']);
  assert.deepEqual([r.status, r.stdout.trim()], [0, 'direct']);
});

test('the command runs in --cwd with the inherited environment plus --env; its output and exit code pass through; --rw, --ro and --allow-port are ignored', () => {
  const r = go(['--cwd', work, '--timeout', '10', '--rw', work, '--ro', '/usr', '--allow-port', '80', '--env', 'GREETING=hello', '--', 'sh', '-c', 'echo "$GREETING $(pwd) $HOME"; echo oops >&2; exit 3']);
  assert.equal(r.status, 3);
  assert.equal(r.stdout.trim(), `hello ${work} ${process.env.HOME}`, 'HOME is the real one: version-manager shims keep working');
  assert.match(r.stderr, /oops/);
});

test('a command over --timeout exits 124 and is stopped; one that cannot start exits 127; bad usage exits 64', () => {
  const t0 = Date.now();
  assert.equal(go(['--timeout', '1', '--', 'sh', '-c', 'sleep 30']).status, 124);
  assert.ok(Date.now() - t0 < 10000, 'the whole process group is stopped, not waited for');
  const gone = go(['--', 'no-such-command-xyz']);
  assert.deepEqual([gone.status, /cannot start no-such-command-xyz/.test(gone.stderr)], [127, true]);
  for (const bad of [['--bogus', '1', '--', 'true'], ['--cwd', work], ['--timeout', '0', '--', 'true'], ['--env', 'NOEQUALS', '--', 'true']]) assert.equal(go(bad).status, 64, bad.join(' '));
});

test('with a trusted run folder the command is in RUN/exec.jsonl and the last stderr line names the entry; without one nothing is written and nothing fails', () => {
  const r = go(['--cwd', work, '--', 'sh', '-c', 'echo recorded-line; exit 2'], { ZT_RUN_DIR: run });
  assert.equal(r.status, 2);
  const id = /ZT-RUN (\S+) exit=2\s*$/.exec(r.stderr)?.[1];
  assert.ok(id, r.stderr);
  const entry = readFileSync(join(run, 'exec.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).find(e => e.id === id);
  assert.deepEqual([entry.exit, entry.backend, entry.cwd, /recorded-line/.test(entry.out), Number.isNaN(Date.parse(entry.ts))], [2, 'direct', work, true, false]);
  const bare = go(['--cwd', work, '--', 'true']);
  assert.deepEqual([bare.status, /ZT-RUN/.test(bare.stderr)], [0, false]);
  const untrusted = go(['--cwd', work, '--', 'true'], { ZT_RUN_DIR: work });
  assert.deepEqual([untrusted.status, /ZT-RUN/.test(untrusted.stderr)], [0, false], 'a folder that is not a run folder of ours is never used');
});
