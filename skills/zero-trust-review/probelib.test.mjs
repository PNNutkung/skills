// Unit and fuzz checks for the probe plumbing the three speed flags add to probelib.mjs: the test-process cap, the head-run file that lets mutate.mjs reuse
// testprobe.mjs's unmutated run, and stopping a running command. Run: node --test probelib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlagError } from './flags.mjs';
import { HEAD_RUN_KIND, HEAD_RUN_REFUSED, HEAD_RUN_SCHEMA, backendOf, parseProbeArgs, baselineFrom, headRunDoc, limiter, readBaseline, runIn, testProcessSlots } from './probelib.mjs';

// a seeded generator, so a failing case can be replayed
const rng = seed => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const tick = ms => new Promise(r => setTimeout(r, ms));

test('should run everything at once when there is no limit', () => {
  assert.equal(limiter(null), null);
  assert.equal(testProcessSlots({}), null);
  assert.equal(testProcessSlots({ ZT_TEST_PROCESS_MAX: 'unlimited' }), null);
  assert.equal(typeof testProcessSlots({ ZT_TEST_PROCESS_MAX: '2' }), 'function');
  assert.throws(() => testProcessSlots({ ZT_TEST_PROCESS_MAX: '0' }), e => e instanceof FlagError && /ZT_TEST_PROCESS_MAX=0 is not valid/.test(e.message));
});

test('should never have more than max tasks running, finish every task and keep each result (fuzz)', async () => {
  const rand = rng(7);
  for (let round = 0; round < 40; round++) {
    const max = 1 + Math.floor(rand() * 4), n = Math.floor(rand() * 12);
    const run = limiter(max);
    let live = 0, peak = 0;
    const delays = Array.from({ length: n }, () => Math.floor(rand() * 3));
    const out = await Promise.all(delays.map(async (d, i) => {
      if (rand() < 0.3) await tick(d);
      return run(async () => {
        peak = Math.max(peak, ++live);
        await tick(d);
        live--;
        if (d === 2 && rand() < 0.2) throw new Error(`task ${i}`);
        return i;
      }).catch(e => e.message);
    }));
    assert.ok(peak <= max, `round ${round}: peak ${peak} > ${max}`);
    assert.deepEqual(out.map(x => (typeof x === 'string' ? Number(x.slice(5)) : x)), delays.map((_, i) => i));
    assert.equal(live, 0);
  }
});

const ID = { tree: 'a'.repeat(40), cmd: 'pytest -q {file}', env: ['K=V'], link: ['venv'], ro: ['/opt/py'], timeout: 120, runner: '/x/sandbox-run.mjs' };
const RESULTS = [{ file: 'tests/a.py', exit: 0, sec: 0.4 }, { file: 'tests/b.py', exit: 1, sec: 1.2 }];
const GOOD = JSON.stringify(headRunDoc(ID, RESULTS));

test('should describe the head run with a schema, the tree identity and each file\'s pass, exit and duration', () => {
  assert.deepEqual(JSON.parse(GOOD), { schema: HEAD_RUN_SCHEMA, kind: HEAD_RUN_KIND, identity: ID,
    tests: [{ file: 'tests/a.py', pass: true, exit: 0, sec: 0.4 }, { file: 'tests/b.py', pass: false, exit: 1, sec: 1.2 }] });
});

test('should give the head exits in the order asked when the identity matches', () => {
  assert.deepEqual(baselineFrom(GOOD, ID, ['tests/b.py', 'tests/a.py']), { exits: [1, 0] });
  assert.deepEqual(baselineFrom(GOOD, structuredClone(ID), ['tests/a.py']), { exits: [0] });
});

test('should refuse a head run that is missing, garbled, of another schema, from another tree, command or environment, or incomplete', () => {
  const doc = () => JSON.parse(GOOD);
  const edit = f => { const d = doc(); f(d); return JSON.stringify(d); };
  const cases = [
    [undefined, HEAD_RUN_REFUSED.missing],
    ['', HEAD_RUN_REFUSED.notJson], ['{', HEAD_RUN_REFUSED.notJson], ['null', HEAD_RUN_REFUSED.schema], ['[]', HEAD_RUN_REFUSED.schema],
    [edit(d => { d.schema = 2; }), HEAD_RUN_REFUSED.schema], [edit(d => { d.kind = 'other'; }), HEAD_RUN_REFUSED.schema],
    [edit(d => { delete d.identity; }), HEAD_RUN_REFUSED.identity],
    ...Object.keys(ID).map(k => [edit(d => { d.identity[k] = k === 'timeout' ? 121 : Array.isArray(ID[k]) ? [...ID[k], 'more'] : `${ID[k]}x`; }), HEAD_RUN_REFUSED.identity]),
    [edit(d => { d.identity.env = []; }), HEAD_RUN_REFUSED.identity], [edit(d => { d.identity.extra = 1; }), HEAD_RUN_REFUSED.identity],
    [edit(d => { d.identity.timeout = '120'; }), HEAD_RUN_REFUSED.identity],
    [edit(d => { d.tests = d.tests.slice(1); }), HEAD_RUN_REFUSED.tests], [edit(d => { d.tests = {}; }), HEAD_RUN_REFUSED.tests],
    [edit(d => { d.tests.push(d.tests[0]); }), HEAD_RUN_REFUSED.tests], [edit(d => { d.tests[0].exit = '0'; }), HEAD_RUN_REFUSED.tests],
    [edit(d => { d.tests[0].exit = 1.5; }), HEAD_RUN_REFUSED.tests], [edit(d => { d.tests[0].exit = 256; }), HEAD_RUN_REFUSED.tests],
    [edit(d => { d.tests[0].pass = false; }), HEAD_RUN_REFUSED.tests], [edit(d => { d.tests[1].pass = true; }), HEAD_RUN_REFUSED.tests],
    [edit(d => { d.tests[0].sec = -1; }), HEAD_RUN_REFUSED.tests], [edit(d => { d.tests[0] = null; }), HEAD_RUN_REFUSED.tests],
  ];
  for (const [text, reason] of cases) assert.deepEqual(baselineFrom(text, ID, ['tests/a.py', 'tests/b.py']), { reason }, String(text));
});

test('should never throw on a garbled head run file, and never accept one whose identity or results differ (fuzz)', () => {
  const rand = rng(42), files = ['tests/a.py', 'tests/b.py'];
  const garble = s => {
    const a = [...s];
    for (let k = 1 + Math.floor(rand() * 4); k > 0; k--) {
      const i = Math.floor(rand() * a.length), op = rand();
      if (op < 0.4) a[i] = String.fromCharCode(32 + Math.floor(rand() * 95));
      else if (op < 0.7) a.splice(i, 1);
      else a.splice(i, 0, String.fromCharCode(32 + Math.floor(rand() * 95)));
    }
    return rand() < 0.1 ? a.join('').slice(0, Math.floor(rand() * a.length)) : a.join('');
  };
  let accepted = 0;
  for (let i = 0; i < 3000; i++) {
    const text = garble(GOOD);
    const got = baselineFrom(text, ID, files);
    if (!got.exits) { assert.ok(Object.values(HEAD_RUN_REFUSED).includes(got.reason), got.reason); continue; }
    accepted++;
    const doc = JSON.parse(text);
    assert.deepEqual(doc.identity, ID, text);
    assert.deepEqual(got.exits, files.map(f => doc.tests.find(x => x.file === f).exit), text);
    assert.deepEqual(got.exits.map(e => e === 0), [true, false], `a garbled pass/fail was trusted: ${text}`);
  }
  assert.ok(accepted < 3000);
  for (let i = 0; i < 500; i++) {
    const bytes = Buffer.from(Array.from({ length: Math.floor(rand() * 64) }, () => Math.floor(rand() * 256))).toString('latin1');
    assert.ok(baselineFrom(bytes, ID, files).reason);
  }
});

test('should read a head run file, and say why when it cannot', t => {
  const dir = mkdtempSync(join(tmpdir(), 'plib-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'h.json'), GOOD);
  assert.deepEqual(readBaseline(join(dir, 'h.json'), ID, ['tests/a.py']), { exits: [0] });
  assert.deepEqual(readBaseline(join(dir, 'none.json'), ID, ['tests/a.py']), { reason: HEAD_RUN_REFUSED.missing });
  assert.deepEqual(readBaseline(dir, ID, ['tests/a.py']), { reason: HEAD_RUN_REFUSED.unreadable });
});

// a runner that behaves like sandbox-run.mjs on SIGTERM: the command runs in a group of its own, and the group is killed
const RUNNER = `
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
const a = process.argv.slice(2), cut = a.indexOf('--'), log = process.env.PLIB_LOG;
const child = spawn(a[cut + 1], a.slice(cut + 2), { stdio: 'inherit', detached: true });
appendFileSync(log, child.pid + '\\n');
process.on('SIGTERM', () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } });
child.on('exit', code => { process.stderr.write('ZT-RUN r1 exit=' + (code ?? 1) + '\\n'); process.exit(code ?? 1); });
`;
function runnerFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'plib-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'runner.mjs'), RUNNER);
  const log = join(dir, 'groups.log');
  process.env.PLIB_LOG = log;
  t.after(() => delete process.env.PLIB_LOG);
  const groups = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(Number) : []);
  return { dir, o: { runner: join(dir, 'runner.mjs'), env: [], ro: [], timeout: 60 }, groups };
}
const alive = g => { try { process.kill(-g, 0); return true; } catch { return false; } };
const REAP_WAIT_MS = 3000;
// killed processes are reaped asynchronously: poll until every group is gone or the wait is over
async function survivors(groups) {
  const until = performance.now() + REAP_WAIT_MS;
  while (groups.some(alive) && performance.now() < until) await tick(50);
  return groups.filter(alive);
}

test('should return the same fields as before when no stop signal is given', async t => {
  const { dir, o } = runnerFixture(t);
  const r = await runIn(o, dir, 'exit 3');
  assert.deepEqual(Object.keys(r), ['exit', 'sec', 'tail', 'run']);
  assert.deepEqual([r.exit, r.run], [3, 'r1']);
});

test('should stop a running command and its process tree when the signal aborts, and say it was stopped', async t => {
  const { dir, o, groups } = runnerFixture(t);
  const stop = new AbortController(), t0 = performance.now();
  const pending = runIn({ ...o, signal: stop.signal }, dir, 'sleep 30 & sleep 30; wait');
  await tick(300);
  stop.abort();
  const r = await pending;
  assert.equal(r.aborted, true);
  assert.ok(performance.now() - t0 < 10000);
  assert.deepEqual(await survivors(groups()), []);
});

test('should not start a command once the signal has aborted', async t => {
  const { dir, o, groups } = runnerFixture(t);
  const stop = new AbortController();
  stop.abort();
  const r = await runIn({ ...o, signal: stop.signal }, dir, 'exit 0');
  assert.equal(r.aborted, true);
  assert.deepEqual(groups(), []);
});

test('should not stop a command that finished before the signal aborted', async t => {
  const { dir, o } = runnerFixture(t);
  const stop = new AbortController();
  const r = await runIn({ ...o, signal: stop.signal }, dir, 'exit 0');
  stop.abort();
  assert.deepEqual([r.exit, r.aborted], [0, undefined]);
});

test('should wait for a free slot before starting a command, and not start it when stopped while waiting', async t => {
  const { dir, o, groups } = runnerFixture(t);
  const stop = new AbortController(), slots = limiter(1);
  const first = runIn({ ...o, slots, signal: stop.signal }, dir, 'sleep 30');
  const second = runIn({ ...o, slots, signal: stop.signal }, dir, 'exit 0');
  await tick(300);
  assert.equal(groups().length, 1, 'the second command waits for the slot');
  stop.abort();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual([a.aborted, b.aborted], [true, true]);
  assert.equal(groups().length, 1);
});

// RunnerExec (ADR 0003): a runner that is not a node file runs directly, so tests can use a sh stub; a .mjs/.js/.cjs runner still runs under node.
const SH_RUNNER = `#!/bin/sh
[ "$1" = --check ] && { echo shstub; exit 0; }
while [ "$1" != -- ]; do case "$1" in --cwd) cd "$2";; esac; shift 2; done
shift
"$@"; code=$?
echo "ZT-RUN s1 exit=$code" >&2
exit $code
`;
const runnerIn = (t, name, text, mode = 0o755) => {
  const dir = mkdtempSync(join(tmpdir(), 'plib-exec-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const runner = join(dir, name);
  writeFileSync(runner, text, { mode });
  return { dir, o: { runner, env: [], ro: [], timeout: 60 } };
};
const NODE_RUNNER = `const a = process.argv.slice(2);
if (a[0] === '--check') { console.log('nodestub'); process.exit(0); }
const { spawnSync } = await import('node:child_process');
const cut = a.indexOf('--'), cwd = a[a.indexOf('--cwd') + 1], cmd = a.slice(cut + 1);
const r = spawnSync(cmd[0], cmd.slice(1), { cwd, stdio: 'inherit' });
process.stderr.write('ZT-RUN n1 exit=' + r.status + '\\n');
process.exit(r.status);
`;

test('should run the runner directly when its name does not end in .mjs, .js or .cjs', async t => {
  for (const name of ['runner.sh', 'runner']) {
    const { dir, o } = runnerIn(t, name, SH_RUNNER);
    const r = await runIn(o, dir, 'echo hi; exit 4');
    assert.deepEqual([r.exit, r.run], [4, 's1'], name);
    assert.match(r.tail, /hi/);
    assert.equal(backendOf(o.runner), 'shstub', name);
  }
});

test('should run the runner under node when its name ends in .mjs, .js or .cjs, even without the exec bit', async t => {
  for (const name of ['runner.mjs', 'runner.js', 'runner.cjs']) {
    const text = name.endsWith('.cjs') ? NODE_RUNNER.replace("const { spawnSync } = await import('node:child_process');", "const { spawnSync } = require('node:child_process');") : NODE_RUNNER;
    const { dir, o } = runnerIn(t, name, text, 0o644);
    if (name === 'runner.js') writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const r = await runIn(o, dir, 'exit 5');
    assert.deepEqual([r.exit, r.run], [5, 'n1'], name);
    assert.equal(backendOf(o.runner), 'nodestub', name);
  }
});

test('should report the runner as not started when a direct runner lacks the exec bit', async t => {
  const { dir, o } = runnerIn(t, 'runner.sh', SH_RUNNER, 0o644);
  const r = await runIn(o, dir, 'exit 0');
  assert.notEqual(r.exit, 0);
  assert.equal(backendOf(o.runner), 'none');
});

// an in-process caller (tdd.mjs main) hands the runner its own environment and cwd instead of this process's (ADR 0003, A19)
const ENV_RUNNER = `#!/bin/sh
[ "$1" = --check ] && { echo "check:\${ZT_PROBE_SEEN:-unset}"; exit 0; }
echo "seen=\${ZT_PROBE_SEEN:-unset} pwd=$(pwd)"
`;

test('should start the runner with o.procEnv and o.procCwd when they are given, and with this process\'s env and cwd when they are not', async t => {
  const { dir, o } = runnerIn(t, 'runner', ENV_RUNNER);
  assert.equal(process.env.ZT_PROBE_SEEN, undefined);
  const plain = await runIn(o, dir, 'true');
  const seen = r => { const m = /seen=(\S+) pwd=(.*)/.exec(r.tail); return [m[1], realpathSync(m[2].trim())]; }; // real paths: /tmp and /var are links on macOS
  assert.deepEqual(seen(plain), ['unset', realpathSync(process.cwd())]);
  const given = await runIn({ ...o, procEnv: { ...process.env, ZT_PROBE_SEEN: 'yes' }, procCwd: dir }, dir, 'true');
  assert.deepEqual(seen(given), ['yes', realpathSync(dir)]);
  assert.equal(backendOf(o.runner, { ...process.env, ZT_PROBE_SEEN: 'yes' }), 'check:yes');
  assert.equal(backendOf(o.runner), 'check:unset');
  assert.equal(process.env.ZT_PROBE_SEEN, undefined);
});

test('should parse the given args and resolve paths against the given cwd when args and cwd are passed, leaving process.argv and cwd alone', t => {
  const dir = mkdtempSync(join(tmpdir(), 'plib-args-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'runner.mjs'), '');
  const argv = process.argv, here = process.cwd();
  const r = parseProbeArgs({}, { args: ['--repo', 'repo', '--base', 'HEAD', '--head', 'HEAD', '--scratch', 's', '--cmd', 'sh {file}', '--runner', 'runner.mjs', '--ro', 'ro'], cwd: dir });
  assert.deepEqual([r.repo, r.scratch, r.runner, r.extraRo[0]], [join(dir, 'repo'), join(dir, 's'), join(dir, 'runner.mjs'), join(dir, 'ro')]);
  assert.equal(process.argv, argv);
  assert.equal(process.cwd(), here);
});
