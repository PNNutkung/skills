// Parity of the in-process direct runner (runDirect, ADR 0008 A18) with the spawned direct-run.mjs: the same command through probelib.runIn both ways gives the
// same exit, output tail, ZT-RUN line and ledger entry (ids, timestamps and durations aside). Run: node --test direct-run.inproc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDirect } from './direct-run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'direct-run.mjs');
const ZT = resolve(process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review'));
const lib = await import(pathToFileURL(join(ZT, 'probelib.mjs')).href);
const { createRunDir } = await import(pathToFileURL(join(ZT, 'runctx.mjs')).href);
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-inproc-')));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const tmp = join(dir, 'tmp'), work = join(dir, 'work');
for (const d of [tmp, work]) mkdirSync(d);
const ENV = { ...process.env, TMPDIR: tmp, ZT_MARKER_DIR: join(dir, 'marker') }; // injected, never this process's: runDirect must read the ledger's run dir from procEnv
const run = createRunDir('inproc-test', { tmp });
const procEnv = { ...ENV, ZT_RUN_DIR: run };

const ledger = () => { try { return readFileSync(join(run, 'exec.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
const entryOf = id => ledger().find(e => e.id === id);
const probe = (extra = {}) => ({ runner: RUNNER, env: [], ro: [], timeout: 10, tail: 1200, procEnv, ...extra });
const ID = /r[0-9a-z]+-[0-9a-z]{4}/g;
const same = r => ({ exit: r.exit, tail: r.tail.replace(ID, '<id>'), hasRun: Boolean(r.run), aborted: r.aborted });
const entry = id => { const e = entryOf(id); if (!e) return e; const { id: _i, ts: _t, sec: _s, ...rest } = e; return rest; };
const alive = pid => { try { process.kill(pid, 0); } catch { return false; } try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; } }; // a zombie is dead
const tick = ms => new Promise(r => setTimeout(r, ms));
const REAP_WAIT_MS = 3000;
async function gone(pid) { // killed processes are reaped asynchronously
  const until = performance.now() + REAP_WAIT_MS;
  while (alive(pid) && performance.now() < until) await tick(50);
  return !alive(pid);
}

// one command both ways, at the same time; o2 may add per-call options (a stop signal)
async function both(command, extra = {}, cwd = work, signals = () => ({})) {
  const [spawned, inproc] = await Promise.all([lib.runIn({ ...probe(extra), ...signals() }, cwd, command), lib.runIn({ ...probe(extra), inproc: runDirect, ...signals() }, cwd, command)]);
  return { spawned, inproc };
}
const assertParity = ({ spawned, inproc }, msg) => {
  assert.deepEqual(same(inproc), same(spawned), msg);
  assert.deepEqual(entry(inproc.run), entry(spawned.run), `${msg}: ledger`);
};

test('should give the same exit, output, ZT-RUN line and ledger entry when a passing command runs in-process or through the spawned runner (Parity)', async () => {
  const r = await both('echo "out $PYTHONPATH"; sleep 0.1; echo err >&2');
  assertParity(r, 'pass');
  assert.equal(r.inproc.exit, 0);
  assert.match(r.inproc.tail, new RegExp(`out ${work}\\nerr\\nZT-RUN ${r.inproc.run} exit=0$`), 'the ZT-RUN line is the last line, as the CLI prints it');
  assert.deepEqual([entryOf(r.inproc.run).backend, entryOf(r.inproc.run).cmd, entryOf(r.inproc.run).cwd], ['direct', `sh -c echo "out $PYTHONPATH"; sleep 0.1; echo err >&2`, work]);
});

test('should give the same failing exit code and ledger entry when the command fails in-process or spawned (Parity)', async () => {
  const r = await both('echo failing; exit 3');
  assertParity(r, 'fail');
  assert.equal(r.inproc.exit, 3);
});

test('should exit 124 and kill the whole process group, a background child too, when a command runs over its timeout in-process or spawned (Parity)', async () => {
  for (const d of ['s', 'i']) mkdirSync(join(work, d), { recursive: true });
  const t0 = Date.now();
  const [spawned, inproc] = await Promise.all([lib.runIn(probe({ timeout: 1 }), join(work, 's'), 'sleep 30 & echo $! > bg.pid; sleep 30'),
    lib.runIn(probe({ timeout: 1, inproc: runDirect }), join(work, 'i'), 'sleep 30 & echo $! > bg.pid; sleep 30')]);
  assert.ok(Date.now() - t0 < 8000, 'stopped, not waited for');
  assert.deepEqual([spawned.exit, inproc.exit], [124, 124]);
  assert.deepEqual(same(inproc), same(spawned));
  const { cwd: _a, ...e1 } = entry(spawned.run), { cwd: _b, ...e2 } = entry(inproc.run);
  assert.deepEqual(e2, e1, 'ledger');
  for (const d of ['s', 'i']) assert.ok(await gone(Number(readFileSync(join(work, d, 'bg.pid'), 'utf8'))), `${d}: the background child is killed with its group`);
});

test('should exit 127 with the same message when the command cannot start in-process or spawned (Parity)', async () => {
  const r = await both('true', {}, join(work, 'no-such-dir'));
  assertParity(r, 'cannot start');
  assert.equal(r.inproc.exit, 127);
  assert.match(r.inproc.tail, /direct-run: cannot start sh: /);
  const cli = await runDirect({ cwd: work, cmd: ['no-such-command-xyz'], procEnv });
  assert.deepEqual([cli.exit, entryOf(cli.run)?.exit], [127, 127], 'a missing program is 127 and still in the ledger');
});

test('should keep the same bounded ledger output and tail when the output is larger than the capture bound (Parity)', async () => {
  const r = await both('i=0; while [ $i -lt 3000 ]; do echo "line $i"; i=$((i+1)); done');
  assertParity(r, 'big output');
  const out = entryOf(r.inproc.run).out;
  assert.ok(out.length < 8100 && out.includes('\n...\n') && out.startsWith('line 0\n') && out.endsWith('line 2999\n'), 'head and tail of the output, not all of it');
  assert.match(r.inproc.tail, /line 2999\nZT-RUN \S+ exit=0$/);
});

test('should decode a character split across output chunks the same way when the runner runs in-process or spawned (Parity)', async () => {
  const r = await both("printf 'caf\\303'; sleep 0.2; printf '\\251 \\340\\270'; sleep 0.2; printf '\\201 ok\\n'");
  assertParity(r, 'unicode');
  assert.match(r.inproc.tail, /^café ก ok\n/);
  assert.match(entryOf(r.inproc.run).out, /^café ก ok\n$/);
});

test('should stop the command and its process group and say aborted when the stop signal fires, in-process as spawned (Parity)', async () => {
  for (const d of ['sa', 'ia']) mkdirSync(join(work, d), { recursive: true });
  const ac = new AbortController();
  const p = Promise.all([lib.runIn({ ...probe(), signal: ac.signal }, join(work, 'sa'), 'sleep 30 & echo $! > bg.pid; sleep 30'),
    lib.runIn({ ...probe({ inproc: runDirect }), signal: ac.signal }, join(work, 'ia'), 'sleep 30 & echo $! > bg.pid; sleep 30')]);
  await tick(500);
  ac.abort();
  const [spawned, inproc] = await p;
  assert.equal(inproc.aborted, true);
  assert.deepEqual(same(inproc), same(spawned));
  const { cwd: _a, ...e1 } = entry(spawned.run), { cwd: _b, ...e2 } = entry(inproc.run);
  assert.deepEqual(e2, e1, 'ledger');
  for (const d of ['sa', 'ia']) assert.ok(await gone(Number(readFileSync(join(work, d, 'bg.pid'), 'utf8'))), `${d}: the group is gone`);
});

test('should tee the output to the given streams and give the ZT-RUN line last when the CLI path runs runDirect (Parity)', async () => {
  const out = new PassThrough(), err = new PassThrough();
  let o = '', e = '', seen = '';
  out.on('data', d => (o += d)); err.on('data', d => (e += d));
  const r = await runDirect({ cwd: work, cmd: ['sh', '-c', 'echo to-out; echo to-err >&2; exit 5'], procEnv, stdout: out, stderr: err, onData: d => (seen += d) });
  assert.deepEqual([r.exit, o, e], [5, 'to-out\n', `to-err\nZT-RUN ${r.run} exit=5\n`]);
  assert.ok(seen.endsWith(`ZT-RUN ${r.run} exit=5\n`));
});

test('should exit 64 with the usage message and write no ledger entry when runDirect gets no command, a bad timeout or a bad --env (Parity)', async () => {
  const before = ledger().length;
  for (const [o, msg] of [[{ cmd: [] }, /no command after --/], [{ cmd: ['true'], timeout: 0 }, /--timeout must be a positive number/], [{ cmd: ['true'], env: ['NOEQUALS'] }, /--env wants K=V, got NOEQUALS/]]) {
    let seen = '';
    const r = await runDirect({ cwd: work, procEnv, onData: d => (seen += d), ...o });
    assert.equal(r.exit, 64);
    assert.match(seen, msg);
  }
  assert.equal(ledger().length, before);
});

test('should drop an inherited NODE_TEST_CONTEXT and apply --env when runDirect starts the command (Parity)', async () => {
  let seen = '';
  await runDirect({ cwd: work, cmd: ['sh', '-c', 'echo "ctx=${NODE_TEST_CONTEXT-unset} g=$G"'], env: ['G=hi'], procEnv: { ...procEnv, NODE_TEST_CONTEXT: 'child-v8' }, onData: d => (seen += d) });
  assert.match(seen, /^ctx=unset g=hi\n/);
});

const KILL_GRACE_MS = 2000; // direct-run.mjs's grace between SIGTERM and SIGKILL
test('should send no late SIGKILL after the command ended and ignore the stop signal after a hard stop when runDirect runs in-process (Parity)', async t => {
  const orig = process.kill, calls = [];
  process.kill = (pid, sig) => { calls.push([pid, sig]); return orig.call(process, pid, sig); };
  t.after(() => { process.kill = orig; });
  const ac = new AbortController(), r = runDirect({ cwd: work, cmd: ['sh', '-c', 'sleep 30'], procEnv, signal: ac.signal });
  await tick(200);
  ac.abort();
  await r;
  const group = calls.find(([, s]) => s === 'SIGTERM')?.[0];
  assert.ok(group < 0, 'the stop signal sent SIGTERM to the group');
  await tick(KILL_GRACE_MS + 300);
  assert.deepEqual(calls.filter(([p, s]) => p === group && s === 'SIGKILL'), [], 'the group was gone: its pgid may be reused, nothing kills it later');
  const term = new AbortController(), hard = new AbortController(), h = runDirect({ cwd: work, cmd: ['sh', '-c', 'sleep 30'], procEnv, signal: term.signal, kill: hard.signal });
  await tick(200);
  hard.abort();
  assert.equal((await h).exit, null);
  calls.length = 0;
  term.abort();
  await tick(50);
  assert.deepEqual(calls, [], 'a hard stop removes the stop listener');
});

// A process that runs runDirect in-process (tdd.mjs, testprobe.mjs, mutate.mjs) and gets Ctrl-C, SIGHUP or SIGTERM: the detached command group must not outlive it
const SIGNALLED = `import { runIn } from ${JSON.stringify(pathToFileURL(join(ZT, 'probelib.mjs')).href)}; import { runDirect } from ${JSON.stringify(pathToFileURL(RUNNER).href)};
await runIn({ runner: ${JSON.stringify(RUNNER)}, env: [], ro: [], timeout: 60, inproc: runDirect }, process.argv[1], 'sleep 300 & echo $! > bg.pid; wait');`;
test('should kill the command group and end by the signal when a process running commands in-process gets SIGINT, SIGTERM or SIGHUP (RunnerFlag, Parity)', async t => {
  await Promise.all(['SIGINT', 'SIGTERM', 'SIGHUP'].map(async sig => {
    const d = join(work, `sig-${sig}`);
    mkdirSync(d, { recursive: true });
    const p = spawn(process.execPath, ['--input-type=module', '-e', SIGNALLED, d], { stdio: 'ignore', env: ENV });
    const ended = new Promise(r => p.on('close', (code, s) => r({ code, s })));
    const pidFile = join(d, 'bg.pid'), until = performance.now() + 10000;
    while (!existsSync(pidFile) && performance.now() < until) await tick(50);
    await tick(100);
    const bg = Number(readFileSync(pidFile, 'utf8'));
    t.after(() => { try { process.kill(bg, 'SIGKILL'); } catch { /* gone */ } });
    p.kill(sig);
    const end = await ended;
    assert.ok(end.s === sig || end.code === 128 + osConstants.signals[sig], `${sig}: the conventional signal exit, got ${JSON.stringify(end)}`);
    assert.ok(await gone(bg), `${sig}: the background child of the command is gone`);
  }));
});
