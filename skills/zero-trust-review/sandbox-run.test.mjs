// Tests for sandbox-run.mjs. Everything that EXECUTES runs against the real backend on this host (skipped, with a reason, when --check says none);
// the plan, env and argument logic is tested as pure exported functions. There is no unsandboxed mode to test with: that is the point.
// Run: node --test sandbox-run.test.mjs. The docker test skips unless ZT_SANDBOX_IMAGE is set.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNCHERS, LAUNCHER_PATH, buildEnv, buildPlan, checkMounts, checkToolEnv, dockerEnv, findGit, launcherBin, parseArgs, trustedBinary, validate, writableRoots } from './sandbox-run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = join(HERE, 'sandbox-run.mjs');
// the active marker lives in ZT_MARKER_DIR (see runctx.mjs): point it at a dir that does not exist so a live marker on this host can never
// make these tests write into a real run's ledger
const ISO = mkdtempSync(join(tmpdir(), 'zt-test-iso-'));
process.env.ZT_MARKER_DIR = join(ISO, 'no-marker');
// vars the tool refuses to start with (see checkToolEnv): stripped here so a host that sets one cannot fail the whole suite
const POISON = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'BASH_ENV', 'ENV', 'PERL5OPT', 'RUBYOPT', 'PYTHONSTARTUP', 'PYTHONHOME'];
const { ZT_SANDBOX_FORCE: _f, ZT_RUN_DIR: _r, ...CLEAN_ENV } = Object.fromEntries(Object.entries(process.env).filter(([k]) => !POISON.includes(k)));
const run = (args, env = {}) => new Promise(resolve => {
  const t0 = Date.now(), p = spawn(process.execPath, [RUN, ...args], { env: { ...CLEAN_ENV, ...env } });
  let stdout = '', stderr = '';
  p.stdout.on('data', d => (stdout += d));
  p.stderr.on('data', d => (stderr += d));
  p.on('close', code => resolve({ code, stdout, stderr, ms: Date.now() - t0 }));
});
// unresolved on purpose: tmpdir() is /var/... on macOS, a symlink into /private, which the runner must resolve itself.
// Under ISO: --rw is allowed only below the system temp dir, and ISO is below it, also for the runs that set TMPDIR=ISO.
const made = [];
const mk = () => { const d = mkdtempSync(join(ISO, 'zt-test-')); made.push(d); return d; };
after(() => [...made, ISO].forEach(d => rmSync(d, { recursive: true, force: true })));
const sh = (script, ...args) => ['--', '/bin/sh', '-c', script, ...args];
const lines = s => s.split('\n').filter(Boolean);
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const gone = async pids => { for (let i = 0; i < 20 && pids.some(alive); i++) await new Promise(r => setTimeout(r, 50)); return !pids.some(alive); };
const nodeRoot = dirname(dirname(realpathSync(process.execPath)));

const probe = spawnSync(process.execPath, [RUN, '--check'], { encoding: 'utf8', env: CLEAN_ENV });
const BACKEND = probe.status === 0 ? probe.stdout.trim() : probe.status === 86 ? 'none' : 'broken';
const real = BACKEND === 'none' ? { skip: 'no sandbox backend on this host (--check says none)' } : {};

test('--check prints the backend and exits 0, or "none" to stderr and exits 86', () => {
  if (BACKEND === 'none') return assert.match(probe.stderr, /^none$/m);
  assert.equal(probe.status, 0);
  assert.match(probe.stdout, /^(seatbelt|bwrap|docker)\n$/);
});

test('ZT_SANDBOX_FORCE=none: exit 86, UNVERIFIABLE on stderr, command never runs', async () => {
  const d = mk(), marker = join(d, 'ran');
  const r = await run(['--cwd', d, '--rw', d, ...sh('echo x > "$0"', marker)], { ZT_SANDBOX_FORCE: 'none' });
  assert.equal(r.code, 86);
  assert.match(r.stderr, /^UNVERIFIABLE: no sandbox backend/m);
  assert.equal(existsSync(marker), false);
  const c = await run(['--check'], { ZT_SANDBOX_FORCE: 'none' });
  assert.equal(c.code, 86);
  assert.match(c.stderr, /^none$/m);
});

test('no env var turns confinement off or changes what runs: unknown force values and the old test switches are ignored', async () => {
  const d = mk(), marker = join(d, 'ran'), cmd = ['--cwd', d, ...sh('echo x > "$0"', marker)]; // --cwd is readable, NOT writable: only a real sandbox stops this write
  for (const env of [{ ZT_SANDBOX_FORCE: 'passthrough', ZT_TESTS_ONLY: '1' }, { ZT_TESTS_ONLY: '1' }, { ZT_TESTS_ONLY: '1', ZT_SANDBOX_PLAN: 'seatbelt' }, { ZT_SANDBOX_FORCE: 'bogus' }]) {
    const r = await run(cmd, env);
    assert.equal(existsSync(marker), false, JSON.stringify(env));
    assert.doesNotMatch(r.stdout, /"argv"/, JSON.stringify(env));
    if (env.ZT_SANDBOX_FORCE) assert.equal(r.code, 86, JSON.stringify(env));
    assert.notEqual((await run(['--check'], env)).stdout.trim(), 'passthrough', JSON.stringify(env));
  }
});

const listen = async () => {
  const srv = createServer(s => { srv.hits++; s.destroy(); });
  srv.hits = 0;
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return srv;
};
const CONNECT_JS = "const s=require('net').connect(+process.argv[1],'127.0.0.1');s.on('connect',()=>{console.log('connected');process.exit(0)});s.on('error',e=>{console.log('blocked '+e.code);process.exit(3)})";
const connectCmd = port => [process.execPath, '-e', CONNECT_JS, String(port)];
const plain = (cmd, args) => new Promise(resolve => { // the same program with no sandbox around it, as a control
  const p = spawn(cmd, args, { env: CLEAN_ENV });
  let out = '';
  p.stdout.on('data', d => (out += d));
  p.on('close', () => resolve(out));
});

test('1. no network: TCP connect to a local listener fails inside, works unsandboxed', real, async () => {
  const srv = await listen(), d = mk();
  try {
    assert.equal((await plain(process.execPath, ['-e', CONNECT_JS, String(srv.address().port)])).trim(), 'connected', 'control: listener must be reachable unsandboxed');
    srv.hits = 0;
    const r = await run(['--cwd', d, '--ro', nodeRoot, '--', ...connectCmd(srv.address().port)]);
    assert.match(r.stdout, /^blocked/, r.stderr);
    assert.equal(srv.hits, 0);
  } finally { srv.close(); }
});

test('1b. --allow-port N opens 127.0.0.1:N only; other ports stay blocked; seatbelt only, others exit 86', real, async () => {
  const [a, b] = [await listen(), await listen()], d = mk();
  const [pa, pb] = [a.address().port, b.address().port], opts = ['--cwd', d, '--ro', nodeRoot];
  try {
    if (BACKEND !== 'seatbelt') {
      const r = await run([...opts, '--allow-port', String(pa), '--', ...connectCmd(pa)]);
      assert.equal(r.code, 86);
      assert.match(r.stderr, /^UNVERIFIABLE: --allow-port unsupported on this backend/m);
      return assert.equal(a.hits, 0);
    }
    const out = async (port, ...allow) => (await run([...opts, ...allow.flatMap(p => ['--allow-port', String(p)]), '--', ...connectCmd(port)])).stdout;
    assert.equal((await out(pa, pa)).trim(), 'connected');
    assert.match(await out(pb, pa), /^blocked/);
    assert.equal((await out(pb, pa, pb)).trim(), 'connected', 'repeatable');
    assert.match(await out(pa), /^blocked/, 'without the flag');
    assert.match(await out(pb), /^blocked/, 'without the flag');
    assert.equal(b.hits, 1);
  } finally { a.close(); b.close(); }
});

test('2. writes only under --rw and the runner temp dir (TMPDIR); --cwd is not writable', real, async () => {
  const cwd = mk(), rw = mk(), name = `.zt-sandbox-probe-${process.pid}`;
  const elsewhere = [HERE, homedir()];
  try {
    const r = await run(['--cwd', cwd, '--rw', rw, ...sh('for p in "$@" "$TMPDIR"; do (echo x > "$p/$0") 2>/dev/null && echo "w:$p" || echo "n:$p"; done', name, rw, cwd, ...elsewhere)]);
    const out = lines(r.stdout);
    assert.deepEqual(out.slice(0, 4), [`w:${rw}`, `n:${cwd}`, ...elsewhere.map(p => `n:${p}`)], r.stderr);
    assert.match(out[4], /^w:\//);
    assert.equal(out[4].slice(2).startsWith(realpathSync(tmpdir())), true);
    assert.equal(existsSync(out[4].slice(2)), false, 'runner temp dir removed after the run');
    assert.equal(existsSync(join(rw, name)), true);
    assert.equal(existsSync(join(cwd, name)), false);
  } finally { elsewhere.forEach(p => rmSync(join(p, name), { force: true })); }
});

test('3. reads are an allow-list: canary in $HOME and unlisted dirs are unreadable', real, async () => {
  const cwd = mk(), ro = mk(), rw = mk(), other = mk();
  const canary = join(homedir(), `.zt-sandbox-canary-${process.pid}`), secret = 'ZT-CANARY-CONTENT';
  const files = { cwd: join(cwd, 'f'), ro: join(ro, 'f'), rw: join(rw, 'f'), other: join(other, 'f') };
  Object.values(files).forEach(f => writeFileSync(f, secret));
  writeFileSync(canary, secret);
  try {
    const paths = [canary, files.other, files.cwd, files.ro, files.rw, '/etc/hosts'];
    const r = await run(['--cwd', cwd, '--ro', ro, '--rw', rw, ...sh('for p in "$@"; do cat "$p" >/dev/null 2>&1 && echo "r:$p" || echo "n:$p"; done', 'sh', ...paths)]);
    assert.deepEqual(lines(r.stdout), paths.map((p, i) => `${i < 2 ? 'n' : 'r'}:${p}`), r.stderr);
    const c = await run(['--cwd', cwd, '/bin/cat', canary]);
    assert.notEqual(c.code, 0);
    assert.equal((c.stdout + c.stderr).includes(secret), false);
  } finally { rmSync(canary, { force: true }); }
});

test('4. env is scrubbed to PATH LANG LC_ALL TERM TZ + --env; HOME is the runner temp dir', real, async () => {
  const d = mk();
  const r = await run(['--cwd', d, '--env', 'FOO=bar', '--env', 'EQ=a=b', '--', '/usr/bin/env'], { ZT_SECRET: '1', AWS_SECRET_ACCESS_KEY: 'x', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', TERM: 'xterm', TZ: 'UTC' });
  const env = Object.fromEntries(lines(r.stdout).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(Object.keys(env).sort(), ['EQ', 'FOO', 'HOME', 'LANG', 'LC_ALL', 'PATH', 'TERM', 'TMPDIR', 'TZ']);
  assert.equal(env.FOO, 'bar');
  assert.equal(env.EQ, 'a=b');
  assert.equal(env.HOME, env.TMPDIR);
  assert.notEqual(env.HOME, homedir());
  assert.equal(env.PATH, process.env.PATH);
});

test('5. timeout: sleep 30 with --timeout 1 returns 124 fast and leaves nothing alive', real, async () => {
  const d = mk();
  const r = await run(['--cwd', d, '--rw', d, '--timeout', '1', ...sh('sleep 30 & echo $! > "$0/kid"; echo $$ > "$0/sh"; wait', d)]);
  assert.equal(r.code, 124, r.stderr);
  assert.ok(r.ms < 5000, `took ${r.ms} ms`);
  assert.equal(await gone(['kid', 'sh'].map(f => +readFileSync(join(d, f), 'utf8'))), true);
});

test('5b. timeout: SIGTERM-ignoring tree is SIGKILLed after 2 s', real, async () => {
  const d = mk();
  const r = await run(['--cwd', d, '--rw', d, '--timeout', '1', ...sh('trap "" TERM; sleep 30 & echo $! > "$0/kid"; wait', d)]);
  assert.equal(r.code, 124, r.stderr);
  assert.ok(r.ms < 5000, `took ${r.ms} ms`);
  assert.equal(await gone([+readFileSync(join(d, 'kid'), 'utf8')]), true);
});

test('6. child exit code and stdout/stderr pass through', real, async () => {
  const r = await run(['--cwd', mk(), ...sh('echo out; echo err >&2; exit 7')]);
  assert.equal(r.code, 7);
  assert.equal(r.stdout, 'out\n');
  assert.match(r.stderr, /^err$/m);
});

test('usage errors exit 64 and never run anything', async () => {
  assert.equal((await run(['--cwd', mk()])).code, 64);
  assert.equal((await run(['--rw', '/nonexistent-zt-dir', '--', '/usr/bin/true'])).code, 64);
});

test('programs run inside: sh, git, node, python3', real, async () => {
  const cwd = mk(), py = spawnSync('python3', ['-c', 'import sys;print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
  const cases = [[[], ['/bin/sh', '-c', 'echo ok'], 'ok'], [[], ['git', '--version'], /^git version/], [['--ro', nodeRoot], [process.execPath, '-e', 'console.log(1)'], '1']];
  if (py) cases.push([['--ro', dirname(dirname(realpathSync(py)))], [realpathSync(py), '-c', 'print(1)'], '1']);
  for (const [opts, cmd, want] of cases) {
    const r = await run(['--cwd', cwd, ...opts, '--', ...cmd]);
    assert.equal(r.code, 0, `${cmd[0]}: ${r.stderr}`);
    typeof want === 'string' ? assert.equal(r.stdout.trim(), want, cmd[0]) : assert.match(r.stdout, want, cmd[0]);
  }
});

const VENV = '/Users/ptanavongchi/work/superset-BIIDEV-1364/venv';
test('venv python runs when its dir and the resolved interpreter prefix are passed via --ro', real.skip || !existsSync(VENV) ? { skip: real.skip || 'venv not on this host' } : {}, async () => {
  const prefix = dirname(dirname(realpathSync(join(VENV, 'bin/python'))));
  const r = await run(['--cwd', mk(), '--ro', VENV, '--ro', prefix, '--', join(VENV, 'bin/python'), '-c', 'import sys;print(sys.prefix)']);
  assert.equal(r.stdout.trim(), VENV, r.stderr);
});

test('docker backend: no network, read-only root, exit code passes through', process.env.ZT_SANDBOX_IMAGE ? {} : { skip: 'ZT_SANDBOX_IMAGE not set' }, async () => {
  const r = await run(['--cwd', mk(), ...sh('touch /zt-probe 2>/dev/null && echo rw || echo ro; exit 7')], { ZT_SANDBOX_FORCE: 'docker' });
  assert.equal(r.code, 7, r.stderr);
  assert.equal(r.stdout.trim(), 'ro');
});

// --- ledger: RUN/exec.jsonl, written by the runner after every command. Real backend only (the runner has no other mode). ---
// runctx.mjs trusts a run dir only if it is ours and closed to other users, AND (for --run / ZT_RUN_DIR) it lives under <tmpdir>/zt-review-<uid>/ or is
// the marker's own target. The runner's tmpdir() is ISO here, so BASE is the approved base; mkRun makes a 0700 run dir in it.
const LT = { TMPDIR: ISO };
const BASE = join(ISO, `zt-review-${process.getuid()}`);
mkdirSync(BASE, { mode: 0o700 });
const mkRun = () => mkdtempSync(join(BASE, 'r-'));
const rows = f => lines(readFileSync(f, 'utf8')).map(l => JSON.parse(l));
const yes = n => sh(`yes 0123456789abcdef | head -c ${n}`);
// a per-user marker dir (0700) holding .active (0600) that names runDir; ageH backdates its mtime. Returns the env that selects it.
const withMarker = (runDir, ageH = 0, { dirMode = 0o700, fileMode = 0o600 } = {}) => {
  const md = join(mk(), 'marker'), f = join(md, '.active');
  mkdirSync(md, { mode: 0o700 });
  writeFileSync(f, `${runDir}\nsecond line is ignored\n`, { mode: 0o600 });
  chmodSync(f, fileMode);
  chmodSync(md, dirMode);
  if (ageH) { const t = new Date(Date.now() - ageH * 3600e3); utimesSync(f, t, t); }
  return { ZT_MARKER_DIR: md };
};
const mode = f => statSync(f).mode & 0o777;

test('ledger: one line per command, exact fields, ZT-RUN is the last stderr line, exit code and passthrough unchanged, file is 0600', real, async () => {
  const d = mk(), runDir = mkRun(), cmd = sh('echo out; echo err >&2; exit 7');
  const r = await run(['--cwd', d, '--run', runDir, ...cmd], LT);
  assert.equal(r.code, 7);
  assert.equal(r.stdout, 'out\n');
  assert.match(r.stderr, /^err$/m);
  const [row, ...more] = rows(join(runDir, 'exec.jsonl'));
  assert.equal(more.length, 0);
  assert.deepEqual(Object.keys(row), ['id', 'ts', 'cmd', 'cwd', 'exit', 'sec', 'out', 'backend']);
  assert.match(row.id, /^r[0-9a-z]+-[0-9a-z]{4}$/);
  assert.equal(new Date(row.ts).toISOString(), row.ts);
  assert.deepEqual(row.cmd, cmd.slice(1));
  assert.equal(row.cwd, realpathSync(d));
  assert.equal(row.exit, 7);
  assert.equal(row.sec, Math.round(row.sec * 10) / 10);
  assert.equal(row.backend, BACKEND, 'always the real backend name');
  assert.deepEqual(lines(row.out).sort(), ['err', 'out']);
  assert.equal(lines(r.stderr).at(-1), `ZT-RUN ${row.id} exit=${row.exit}`);
  assert.equal(mode(join(runDir, 'exec.jsonl')), 0o600);
});

test('ledger is append-only: each command adds a line with its own id', real, async () => {
  const d = mk(), runDir = mkRun();
  for (const c of ['true', 'false']) await run(['--cwd', d, '--run', runDir, ...sh(c)], LT);
  const got = rows(join(runDir, 'exec.jsonl'));
  assert.deepEqual(got.map(x => x.exit), [0, 1]);
  assert.notEqual(got[0].id, got[1].id);
});

test('ledger out: <= 8000 chars kept whole; longer = first 4000 + "\\n...\\n" + last 4000; stdout still passes through whole', real, async () => {
  const d = mk(), runDir = mkRun();
  for (const n of [8000, 8001, 300000]) {
    const r = await run(['--cwd', d, '--run', runDir, ...yes(n)], LT);
    assert.equal(r.stdout.length, n, `stdout passthrough ${n}`);
  }
  const [a, b, c] = rows(join(runDir, 'exec.jsonl')), want = s => `${s.slice(0, 4000)}\n...\n${s.slice(-4000)}`;
  const full = n => Array.from({ length: Math.ceil(n / 17) }, () => '0123456789abcdef\n').join('').slice(0, n);
  assert.equal(a.out, full(8000));
  assert.equal(b.out, want(full(8001)));
  assert.equal(c.out, want(full(300000)));
  assert.equal(c.out.length, 8005);
});

test('ledger tee is live: output reaches the caller before the command ends', real, async () => {
  const p = spawn(process.execPath, [RUN, '--cwd', mk(), '--run', mkRun(), ...sh('echo first; sleep 2; echo second')], { env: { ...CLEAN_ENV, ...LT } });
  const t0 = Date.now(), closed = new Promise(r => p.on('close', r));
  const firstAt = await Promise.race([new Promise(r => p.stdout.once('data', () => r(Date.now() - t0))), closed.then(() => Infinity)]);
  assert.ok(firstAt < 1500, `first chunk after ${firstAt} ms`);
  await closed;
});

test('ledger dir resolution: --run beats ZT_RUN_DIR beats the active marker (a marker target may live anywhere we own)', real, async () => {
  const [d, viaMarker, viaEnv, viaFlag] = [mk(), mk(), mkRun(), mkRun()], marker = withMarker(viaMarker);
  const go = (args, env) => run(['--cwd', d, ...args, ...sh('true')], { ...LT, ...marker, ...env });
  await go(['--run', viaFlag], { ZT_RUN_DIR: viaEnv });
  await go([], { ZT_RUN_DIR: viaEnv });
  await go([], {});
  await go(['--run', viaMarker], {}); // explicit, but it IS the marker's own target
  assert.deepEqual([viaFlag, viaEnv, viaMarker].map(x => rows(join(x, 'exec.jsonl')).length), [1, 1, 2]);
});

test('ledger: marker older than 12 h is inactive; a fresh one is not; no run dir = no ledger and no ZT-RUN line', real, async () => {
  const [d, stale, fresh] = [mk(), mk(), mk()];
  const s = await run(['--cwd', d, ...sh('echo hi')], { ...LT, ...withMarker(stale, 13) });
  assert.equal(s.code, 0);
  assert.equal(s.stdout, 'hi\n');
  assert.equal(existsSync(join(stale, 'exec.jsonl')), false);
  assert.doesNotMatch(s.stderr, /ZT-RUN/);
  await run(['--cwd', d, ...sh('true')], { ...LT, ...withMarker(fresh, 11.9) });
  assert.equal(rows(join(fresh, 'exec.jsonl')).length, 1);
});

test('--run or ZT_RUN_DIR naming any other dir we own (not under the per-user base, not the marker target) writes no ledger', real, async () => {
  const [d, other] = [mk(), mk()];
  for (const [args, env] of [[['--run', other], {}], [[], { ZT_RUN_DIR: other }], [['--run', other], { ZT_RUN_DIR: other }]]) {
    const r = await run(['--cwd', d, ...args, ...sh('echo hi')], { ...LT, ...env });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'hi\n');
    assert.doesNotMatch(r.stderr, /ZT-RUN|ledger/);
  }
  assert.deepEqual(readdirSync(other), []);
});

test('a planted marker is ignored: world-writable marker file or dir, symlinked marker; the old shared <tmpdir>/zt-review/.active is not read at all', real, async () => {
  const d = mk(), target = mk(), legacyTmp = mk();
  const cases = [withMarker(target, 0, { fileMode: 0o666 }), withMarker(target, 0, { dirMode: 0o777 })];
  const link = withMarker(mk()), realFile = join(link.ZT_MARKER_DIR, '.real');
  writeFileSync(realFile, `${target}\n`, { mode: 0o600 });
  rmSync(join(link.ZT_MARKER_DIR, '.active'));
  symlinkSync(realFile, join(link.ZT_MARKER_DIR, '.active'));
  cases.push(link);
  mkdirSync(join(legacyTmp, 'zt-review'));
  writeFileSync(join(legacyTmp, 'zt-review', '.active'), `${target}\n`);
  cases.push({ TMPDIR: legacyTmp, ZT_MARKER_DIR: join(legacyTmp, 'absent') });
  for (const env of cases) {
    const r = await run(['--cwd', d, ...sh('echo hi')], { ...LT, ...env });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'hi\n');
    assert.doesNotMatch(r.stderr, /ZT-RUN/);
  }
  assert.equal(existsSync(join(target, 'exec.jsonl')), false);
});

test('an unsafe run dir (world-writable) from --run, ZT_RUN_DIR or the marker is skipped, never used; the next candidate wins', real, async () => {
  const [d, open, ok] = [mk(), mkRun(), mkRun()];
  chmodSync(open, 0o777);
  const go = (args, env) => run(['--cwd', d, ...args, ...sh('true')], { ...LT, ...env });
  await go(['--run', open], {});
  await go(['--run', open], { ZT_RUN_DIR: open, ...withMarker(open) });
  assert.equal(existsSync(join(open, 'exec.jsonl')), false);
  await go(['--run', open], { ZT_RUN_DIR: ok });
  assert.equal(rows(join(ok, 'exec.jsonl')).length, 1);
});

test('--ledger is not an option: exit 64, the command never runs; a run creates nothing but exec.jsonl in the run dir', real, async () => {
  const [d, runDir] = [mk(), mkRun()], marker = join(d, 'ran');
  const r = await run(['--cwd', d, '--rw', d, '--run', runDir, '--ledger', join(runDir, 'obs.jsonl'), ...sh('echo x > "$0"', marker)], LT);
  assert.equal(r.code, 64);
  assert.match(r.stderr, /unknown argument --ledger/);
  assert.equal(existsSync(marker), false);
  assert.deepEqual(readdirSync(runDir), []);
  assert.equal((await run(['--cwd', d, '--run', runDir, ...sh('true')], LT)).code, 0);
  assert.deepEqual(readdirSync(runDir), ['exec.jsonl']);
});

test('unsafe or unwritable ledger: one stderr warning, the command still runs, exit code and output unchanged, no ZT-RUN line, nothing followed', real, async () => {
  const d = mk(), elsewhere = mk(), victim = join(elsewhere, 'victim');
  writeFileSync(victim, 'untouched\n');
  const [planted, asDir, readOnly] = [mkRun(), mkRun(), mkRun()];
  symlinkSync(victim, join(planted, 'exec.jsonl')); // planted leaf symlink: O_NOFOLLOW must refuse it
  mkdirSync(join(asDir, 'exec.jsonl'));
  chmodSync(readOnly, 0o500); // still "ours and closed", but nothing can be created in it
  try {
    for (const [name, runDir] of Object.entries({ 'symlinked leaf': planted, 'leaf is a directory': asDir, 'read-only run dir': readOnly })) {
      const r = await run(['--cwd', d, '--run', runDir, ...sh('echo ok; exit 5')], LT);
      assert.equal(r.code, 5, name);
      assert.equal(r.stdout, 'ok\n', name);
      assert.equal(r.stderr.match(/^WARNING: .*ledger/gm)?.length, 1, `${name}: ${r.stderr}`);
      assert.doesNotMatch(r.stderr, /ZT-RUN/, name);
    }
  } finally { chmodSync(readOnly, 0o700); }
  assert.equal(readFileSync(victim, 'utf8'), 'untouched\n');
  assert.deepEqual(readdirSync(readOnly), []);
});

test('ledger also records a timeout (124) and a command that fails to start', real, async () => {
  const [d, runDir] = [mk(), mkRun()];
  assert.equal((await run(['--cwd', d, '--run', runDir, '--timeout', '1', ...sh('sleep 30')], LT)).code, 124);
  const r = await run(['--cwd', d, '--run', runDir, '--', '/nonexistent-zt-cmd'], LT);
  assert.notEqual(r.code, 0);
  const got = rows(join(runDir, 'exec.jsonl'));
  assert.deepEqual(got.map(x => x.exit), [124, r.code]);
  assert.match(got[1].out, /nonexistent-zt-cmd/);
  assert.equal(lines(r.stderr).at(-1), `ZT-RUN ${got[1].id} exit=${r.code}`);
});

test('ledger: a daemonized grandchild that escaped the process group and holds the pipes cannot hang the runner', real, async () => {
  const [d, runDir] = [mk(), mkRun()];
  const js = "const c=require('child_process').spawn('/bin/sleep',['5'],{detached:true,stdio:'inherit'});c.unref();console.log(c.pid)";
  const r = await run(['--cwd', d, '--run', runDir, '--ro', nodeRoot, '--', process.execPath, '-e', js], LT);
  try {
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.ms < 4000, `took ${r.ms} ms`);
    assert.equal(rows(join(runDir, 'exec.jsonl')).length, 1);
  } finally { const pid = +r.stdout.trim(); if (pid > 1) try { process.kill(pid); } catch { /* already gone */ } } // pid 0 would signal our own group
});

// --- --env: the caller's variables reach only the program inside the sandbox, never the launcher (sandbox-exec / bwrap / docker CLI), which runs unconfined ---
const usageOf = fn => { try { fn(); } catch (e) { return e.message; } return null; };
const DIR = mk();

test('--env names that load code outside the confinement are refused (usage error, exit 64), the command never runs', async () => {
  const marker = join(DIR, 'ran');
  const refused = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'NODE_OPTIONS', 'NODE_PATH', 'PERL5OPT', 'PERLLIB', 'RUBYOPT', 'RUBYLIB',
    'BASH_ENV', 'ENV', 'GCONV_PATH', 'IFS', 'PYTHONSTARTUP', 'PYTHONHOME', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS'];
  for (const name of refused) {
    const msg = usageOf(() => validate(parseArgs(['--cwd', DIR, '--env', 'FOO=ok', '--env', `${name}=/tmp/evil`, '--', '/bin/true'])));
    assert.match(msg ?? '', new RegExp(`--env ${name} is refused`), name);
    const r = await run(['--cwd', DIR, '--rw', DIR, '--env', `${name}=/tmp/evil`, ...sh('echo x > "$0"', marker)]);
    assert.equal(r.code, 64, name);
    assert.equal(existsSync(marker), false, name);
  }
  for (const ok of ['PYTHONPATH', 'LDX', 'ENVIRON', 'NODE_ENV', 'FOO']) {
    assert.equal(validate(parseArgs(['--cwd', DIR, '--env', `${ok}=1`, '--', '/bin/true'])).userEnv[ok], '1', ok);
  }
});

test('--ledger and unknown flags are usage errors in parseArgs', () => {
  assert.match(usageOf(() => parseArgs(['--ledger', 'x', '--', '/bin/true'])), /unknown argument --ledger/);
  assert.match(usageOf(() => parseArgs(['--bogus', '--', '/bin/true'])), /unknown argument --bogus/);
  assert.match(usageOf(() => parseArgs(['--env'])), /needs a value/);
  assert.match(usageOf(() => validate(parseArgs(['--cwd', DIR]))), /no command/);
});

const HOST = { PATH: '/host/evil:/usr/bin', LANG: 'C', FOO: 'from-host', LD_PRELOAD: '/evil.so', DYLD_INSERT_LIBRARIES: '/evil.dylib', NODE_OPTIONS: '--require /evil', SECRET: 's', DOCKER_HOST: 'unix:///d.sock', HOME: '/h' };
const BIN = { 'sandbox-exec': '/usr/bin/sandbox-exec', env: '/usr/bin/env', bwrap: '/usr/bin/bwrap', docker: '/usr/local/bin/docker' };
const ctx = (userEnv, bin = BIN) => {
  const tmp = '/zt-fake-base/tmp';
  return { cwd: '/w', rw: ['/w/out'], ro: ['/opt/x'], ports: [], cmd: ['/bin/echo', 'hi'], base: '/zt-fake-base', tmp, userEnv, image: 'img', hostEnv: HOST, bin, ...buildEnv(userEnv, tmp, HOST) };
};
const USER = { FOO: 'bar', EQ: 'a=b', PYTHONPATH: '/x', HOME: '/user-home' };

test('buildEnv: the launcher env has a FIXED PATH plus the allow-list and HOME/TMPDIR; the host PATH and user vars (even a user PATH or HOME) exist only for the inner program', () => {
  const { launcherEnv, env } = buildEnv(USER, '/t', HOST);
  assert.equal(LAUNCHER_PATH, '/usr/bin:/bin');
  assert.deepEqual(launcherEnv, { PATH: LAUNCHER_PATH, LANG: 'C', HOME: '/t', TMPDIR: '/t' });
  assert.deepEqual(env, { PATH: '/host/evil:/usr/bin', LANG: 'C', HOME: '/user-home', TMPDIR: '/t', FOO: 'bar', EQ: 'a=b', PYTHONPATH: '/x' });
  assert.deepEqual(buildEnv({}, '/t', {}).launcherEnv, { PATH: LAUNCHER_PATH, HOME: '/t', TMPDIR: '/t' });
  assert.equal(buildEnv({ PATH: '/mine' }, '/t', HOST).env.PATH, '/mine');
  assert.equal(buildEnv({ PATH: '/mine' }, '/t', HOST).launcherEnv.PATH, LAUNCHER_PATH);
});

test('dockerEnv: fixed PATH plus the host DOCKER_* vars, nothing else', () => {
  assert.deepEqual(dockerEnv({ ...HOST, DOCKER_CONFIG: '/c', DOCKER_CONTEXT: 'x', DOCKERISH: 'no', docker_host: 'no' }), { PATH: LAUNCHER_PATH, DOCKER_HOST: 'unix:///d.sock', DOCKER_CONFIG: '/c', DOCKER_CONTEXT: 'x' });
  assert.deepEqual(dockerEnv({}), { PATH: LAUNCHER_PATH });
});

test('buildPlan seatbelt: sandbox-exec and env are the resolved absolute paths and get only the fixed env; the program inside is env -i with the full env as K=V, then the command; nothing is written by planning', () => {
  const c = ctx(USER, { ...BIN, 'sandbox-exec': '/abs/sbx', env: '/abs/env' }), p = buildPlan('seatbelt', c), profile = join(c.base, 'profile.sb');
  assert.deepEqual(p.argv.slice(0, 4), ['/abs/sbx', '-f', profile, '/abs/env']);
  assert.equal(p.argv[4], '-i');
  assert.deepEqual(p.argv.slice(-2), ['/bin/echo', 'hi']);
  assert.deepEqual(p.argv.slice(5, -2).sort(), Object.entries(c.env).map(([k, v]) => `${k}=${v}`).sort());
  assert.deepEqual(p.env, c.launcherEnv);
  assert.equal(p.env.PATH, LAUNCHER_PATH);
  for (const k of ['FOO', 'EQ', 'PYTHONPATH', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'NODE_OPTIONS', 'SECRET']) assert.equal(k in p.env, false, k);
  assert.deepEqual(Object.keys(p.files), [profile]);
  assert.match(p.files[profile], /^\(version 1\)\n\(deny default\)/);
  assert.equal(existsSync(c.base), false);
});

test('buildPlan bwrap: argv[0] is the resolved absolute path; --clearenv first, then --setenv K V for the full env, all before the command; bwrap itself gets only the fixed env', () => {
  const c = ctx(USER, { ...BIN, bwrap: '/abs/bwrap' }), p = buildPlan('bwrap', c), a = p.argv;
  assert.equal(a[0], '/abs/bwrap');
  assert.equal(a[1], '--clearenv');
  const set = Object.fromEntries(a.flatMap((x, i) => (x === '--setenv' ? [[a[i + 1], a[i + 2]]] : [])));
  assert.deepEqual(set, c.env);
  assert.ok(a.lastIndexOf('--setenv') + 2 < a.indexOf('--'));
  assert.deepEqual(a.slice(-2), ['/bin/echo', 'hi']);
  assert.deepEqual(p.env, c.launcherEnv);
  assert.equal(p.env.PATH, LAUNCHER_PATH);
  for (const k of ['FOO', 'PYTHONPATH', 'LD_PRELOAD', 'NODE_OPTIONS', 'SECRET']) assert.equal(k in p.env, false, k);
});

test('buildPlan docker: argv[0] is the resolved absolute path; variables are -e flags for the container (the host PATH only if the caller passes --env PATH=); the CLI gets fixed PATH + DOCKER_* only', () => {
  const p = buildPlan('docker', ctx(USER, { ...BIN, docker: '/abs/docker' })), a = p.argv;
  assert.equal(a[0], '/abs/docker');
  for (const kv of ['FOO=bar', 'EQ=a=b', 'PYTHONPATH=/x']) assert.equal(a[a.indexOf(kv) - 1], '-e', kv);
  assert.equal(a.some(x => x.startsWith('PATH=')), false);
  assert.equal(buildPlan('docker', ctx({ PATH: '/p' })).argv.includes('PATH=/p'), true);
  assert.deepEqual(p.env, { PATH: LAUNCHER_PATH, DOCKER_HOST: 'unix:///d.sock' });
  assert.deepEqual(a.slice(-3), ['img', '/bin/echo', 'hi']);
  assert.equal(a[a.indexOf('--network') + 1], 'none');
});

test('docker stop runs the SAME resolved docker with the fixed env (a fake docker records how it was called)', () => {
  const d = mk(), rec = join(d, 'rec'), fake = join(d, 'docker');
  writeFileSync(fake, `#!/bin/sh\necho "$@" > "${rec}"\necho "$PATH" >> "${rec}"\nenv | grep -c '^FOO=' >> "${rec}"\n`, { mode: 0o755 });
  const p = buildPlan('docker', ctx(USER, { ...BIN, docker: fake }));
  p.stop();
  const [args, path, foo] = lines(readFileSync(rec, 'utf8'));
  assert.match(args, /^kill zt-sandbox-/);
  assert.equal(path, LAUNCHER_PATH);
  assert.equal(foo, '0');
});

// --- launchers are never found through PATH: fixed absolute candidates, each vetted (regular file, root/us, nothing writable by others on the way up) ---
const exe = (dir, name = 'bin') => { const f = join(dir, name); writeFileSync(f, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); chmodSync(f, 0o755); return f; };

test('launcher candidates are fixed absolute paths per launcher', () => {
  assert.deepEqual(LAUNCHERS.bwrap, ['/usr/bin/bwrap', '/bin/bwrap']);
  assert.deepEqual(LAUNCHERS.docker, ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker', '/Applications/OrbStack.app/Contents/MacOS/xbin/docker']);
  assert.deepEqual(LAUNCHERS['sandbox-exec'], ['/usr/bin/sandbox-exec']);
  assert.deepEqual(LAUNCHERS.env, ['/usr/bin/env']);
});

test('a fake bwrap or docker earlier on PATH is never chosen; only the fixed candidates can be', () => {
  const evil = mk();
  exe(evil, 'bwrap');
  exe(evil, 'docker');
  const saved = process.env.PATH;
  process.env.PATH = `${evil}:${saved}`;
  try {
    for (const name of ['bwrap', 'docker', 'sandbox-exec', 'env']) {
      const got = launcherBin(name);
      assert.ok(got === '' || LAUNCHERS[name].includes(got), `${name} -> ${got}`);
      assert.equal(got.startsWith(evil), false, name);
    }
    assert.equal(trustedBinary(['bwrap', 'docker']), '', 'bare names are not candidates');
  } finally { process.env.PATH = saved; }
});

test('trustedBinary accepts a root-owned system binary and walks the whole chain up to /', () => {
  assert.equal(trustedBinary(['/nonexistent/x', '/usr/bin/env']), '/usr/bin/env', 'first candidate that passes wins; missing ones are skipped');
  assert.equal(trustedBinary(['/bin/sh']), '/bin/sh');
});

test('trustedBinary rejects: a world- or group-writable dir anywhere up the chain, a writable file, another owner, a non-file, relative paths, symlinks into any of those', () => {
  const me = process.getuid(), mkdirs = (...parts) => { const d = join(mk(), ...parts); mkdirSync(d, { recursive: true }); return d; };
  const cases = {};
  const wDir = mkdirs('w'); exe(wDir); chmodSync(wDir, 0o777); cases['file in a world-writable dir'] = join(wDir, 'bin');
  const gDir = mkdirs('g'); exe(gDir); chmodSync(gDir, 0o775); cases['file in a group-writable dir'] = join(gDir, 'bin');
  const top = mkdirs('top', 'a', 'b'); exe(top); chmodSync(dirname(dirname(top)), 0o777); cases['world-writable GRANDPARENT'] = join(top, 'bin');
  const wFile = mkdirs('f'); exe(wFile); chmodSync(join(wFile, 'bin'), 0o777); cases['world-writable file'] = join(wFile, 'bin');
  const gFile = mkdirs('gf'); exe(gFile); chmodSync(join(gFile, 'bin'), 0o775); cases['group-writable file'] = join(gFile, 'bin');
  const asDir = mkdirs('dirbin', 'bin'); cases['a directory'] = asDir;
  cases['relative'] = 'usr/bin/env';
  cases['missing'] = join(mk(), 'nope');
  const evilTarget = mkdirs('t'); exe(evilTarget); chmodSync(evilTarget, 0o777);
  const linkDir = mkdirs('l'); symlinkSync(join(evilTarget, 'bin'), join(linkDir, 'bin')); cases['symlink to a file in a writable dir'] = join(linkDir, 'bin');
  const dirLink = mkdirs('dl'); symlinkSync(dirname(asDir), join(dirLink, 'bin')); cases['symlink to a directory'] = join(dirLink, 'bin');
  const loop = mkdirs('loop'); symlinkSync(join(loop, 'bin'), join(loop, 'bin')); cases['symlink loop'] = join(loop, 'bin');
  const viaDirLink = mkdirs('vd'); symlinkSync(evilTarget, join(viaDirLink, 'sub')); cases['path through a symlinked dir into a writable dir'] = join(viaDirLink, 'sub', 'bin');
  for (const [name, p] of Object.entries(cases)) assert.equal(trustedBinary([p], { uid: me }), '', name);
  // owner: ours but we claim to be someone else (and it is not root's): refused; root-owned system files still pass for any uid
  const mine = mkdirs('mine'); exe(mine);
  assert.equal(trustedBinary([join(mine, 'bin')], { uid: me + 1 }), '', 'owned by neither root nor the current user');
  assert.equal(trustedBinary(['/usr/bin/env'], { uid: me + 1 }), '/usr/bin/env');
});

test('probes use the vetted path and a fixed env: --check still works and never needs PATH', () => {
  const r = spawnSync(process.execPath, [RUN, '--check'], { encoding: 'utf8', env: { ...CLEAN_ENV, PATH: '/nonexistent-zt-path' } });
  assert.equal(r.stdout.trim() === BACKEND || BACKEND === 'none', true, `${r.stdout}${r.stderr}`);
});

test('PYTHONPATH works end to end inside the sandbox', real, async () => {
  const py = spawnSync('python3', ['-c', 'import sys;print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
  if (!py) return;
  const d = mk();
  writeFileSync(join(d, 'zt_mod.py'), 'X = 42\n');
  const r = await run(['--cwd', d, '--ro', dirname(dirname(realpathSync(py))), '--env', `PYTHONPATH=${d}`, '--', realpathSync(py), '-c', 'import zt_mod;print(zt_mod.X)']);
  assert.equal(r.stdout.trim(), '42', r.stderr);
});

// --- mount guard: what --cwd / --ro / --rw may expose or write. Checked in validate(), before anything is launched. ---
const HOME = realpathSync(userInfo().homedir);
const CRED = ['.ssh', '.aws', '.gnupg', '.config/gcloud', '.azure', '.kube', '.docker', '.claude', '.netrc', '.npmrc', '.pypirc', 'Library/Keychains', '.cache/zt-review'];
// runs a marker-writing command with extra args in front; `ran` says whether it ever started
const attempt = async (args, env = {}) => {
  const d = mk(), marker = join(d, 'ran');
  const r = await run(['--cwd', d, '--rw', d, ...args, ...sh('echo x > "$0"', marker)], { ...LT, ...env });
  return { r, ran: existsSync(marker) };
};

test('--ro/--rw/--cwd may not equal, contain or lie inside ANY run dir (the per-user base, other runs, the resolved run, the marker target) or the marker dir; the command never runs', async () => {
  const runDir = mkRun(), otherRun = mkRun(), inside = join(runDir, 'ck'), target = mk(), marker = withMarker(target), mdir = marker.ZT_MARKER_DIR;
  mkdirSync(inside);
  mkdirSync(join(mdir, 'sub'));
  const link = join(mk(), 'link');
  symlinkSync(otherRun, link);
  const cases = {
    'the run dir': runDir, 'inside the run dir': inside, 'the per-user base': dirname(runDir), 'another run dir under the base': otherRun, 'inside another run': join(otherRun, 'x'),
    'a symlink to another run': link, 'the tmpdir': ISO, 'the marker target (outside the base)': target, 'the marker dir': mdir, 'inside the marker dir': join(mdir, 'sub'),
    'the marker dir parent': dirname(mdir), 'home': HOME, '/': '/',
  };
  for (const flag of ['--ro', '--rw', '--cwd']) {
    for (const [name, p] of Object.entries(cases)) {
      const { r, ran } = await attempt(['--run', runDir, flag, p], marker);
      assert.equal(r.code, 64, `${flag} ${name}: ${r.stderr}`);
      assert.match(r.stderr, new RegExp(`${flag} .* is refused`), `${flag} ${name}`);
      assert.equal(ran, false, `${flag} ${name}`);
    }
  }
  // the run dir is found the same way the ledger finds it: ZT_RUN_DIR and the marker count too
  for (const flag of ['--ro', '--rw']) {
    for (const [name, env] of Object.entries({ 'ZT_RUN_DIR': { ZT_RUN_DIR: runDir }, 'the marker': withMarker(runDir) })) {
      const { r, ran } = await attempt([flag, runDir], env);
      assert.equal(r.code, 64, `${flag} ${name}: ${r.stderr}`);
      assert.equal(ran, false, `${flag} ${name}`);
    }
  }
  // no run dir resolves at all: the per-user base is still protected (every run lives there)
  const { r, ran } = await attempt(['--ro', dirname(runDir)], {});
  assert.equal(r.code, 64, r.stderr);
  assert.equal(ran, false);
});

test('--rw of an unrelated dir still works with a run dir active, and the ledger line is written', real, async () => {
  const runDir = mkRun(), other = mk(), scratch = mk(), marker = join(other, 'ran');
  const r = await run(['--cwd', other, '--rw', other, '--ro', scratch, '--ro', HERE, '--run', runDir, ...sh('echo x > "$0"', marker)], LT);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(existsSync(marker), true);
  assert.equal(rows(join(runDir, 'exec.jsonl')).length, 1);
});

test('--cwd/--ro/--rw may not equal or contain the home dir or /, nor equal, contain or lie inside a credential dir: validate refuses every one, wherever it exists', () => {
  const paths = {
    home: HOME, 'home with trailing slash': `${HOME}/`, 'home via ..': join(HOME, 'work', '..'), '/': '/', 'parent of home': dirname(HOME), '/etc/ssh': '/etc/ssh', 'inside /etc/ssh': '/etc/ssh/x',
    ...Object.fromEntries(CRED.flatMap(c => [[`~/${c}`, join(HOME, c)], [`inside ~/${c}`, join(HOME, c, 'deeper', 'x')]])),
    'parent of ~/.config/gcloud': join(HOME, '.config'), 'parent of ~/Library/Keychains': join(HOME, 'Library'), 'parent of ~/.cache/zt-review': join(HOME, '.cache'),
  };
  for (const flag of ['--cwd', '--ro', '--rw']) {
    for (const [name, p] of Object.entries(paths)) {
      const msg = usageOf(() => validate(parseArgs([flag, p, '--', '/bin/true'])));
      assert.match(msg ?? 'not refused', new RegExp(`^${flag} .* is refused`), `${flag} ${name}`);
    }
  }
});

test('credential and home mounts are refused at the CLI: exit 64 and the command never runs', async () => {
  for (const flag of ['--cwd', '--ro', '--rw']) {
    for (const p of [HOME, '/', join(HOME, '.ssh'), join(HOME, '.aws'), join(HOME, '.claude', 'projects'), '/etc/ssh', join(HOME, '.config'), join(HOME, 'Library')]) {
      const d = mk(), marker = join(d, 'ran');
      const r = await run(['--cwd', d, '--rw', d, flag, p, ...sh('echo x > "$0"', marker)], LT);
      assert.equal(r.code, 64, `${flag} ${p}: ${r.stderr}`);
      assert.match(r.stderr, /is refused/);
      assert.equal(existsSync(marker), false, `${flag} ${p}`);
    }
  }
});

test('a repo checkout, a venv and ~/.asdf inside home stay allowed for --ro; tmp scratch dirs are allowed for --rw', async () => {
  for (const [flag, p] of [['--ro', HERE], ['--ro', nodeRoot], ['--ro', join(HOME, '.asdf')], ['--ro', mk()], ['--rw', mk()]]) {
    assert.doesNotThrow(() => validate(parseArgs(['--cwd', mk(), flag, p, '--', '/bin/true'])), `${flag} ${p}`);
  }
  const r = await run(['--cwd', mk(), '--ro', HERE, '--ro', nodeRoot, '--', process.execPath, '-e', "console.log(require('fs').readdirSync(process.argv[1]).includes('sandbox-run.mjs'))", HERE], LT);
  if (BACKEND !== 'none') assert.equal(r.stdout.trim(), 'true', r.stderr);
});

const TMPMSG = /writes are allowed only under the system temp dir/;

test('--rw is an allow-list: only below the system temp dir (os.tmpdir(), /tmp, /private/tmp, by realpath); home, repos, rc files, LaunchAgents, /usr/local... are refused', () => {
  const tmpRoot = realpathSync(tmpdir());
  const refused = {
    '~/anything': join(HOME, 'anything'), 'a repo checkout in home': HERE, '~/Library/LaunchAgents': join(HOME, 'Library', 'LaunchAgents'), '~/.local/bin': join(HOME, '.local', 'bin'), '~/bin': join(HOME, 'bin'),
    '~/.zshrc': join(HOME, '.zshrc'), '~/.bashrc': join(HOME, '.bashrc'), '~/.gitconfig': join(HOME, '.gitconfig'), '~/.config/git': join(HOME, '.config', 'git'),
    '/usr/local': '/usr/local', '/opt/homebrew': '/opt/homebrew', '/etc': '/etc', 'the tmp root itself': tmpRoot, '/tmp itself': '/tmp', '/private': '/private',
  };
  for (const [name, p] of Object.entries(refused)) {
    const msg = usageOf(() => validate(parseArgs(['--cwd', mk(), '--rw', p, '--', '/bin/true'])));
    assert.match(msg ?? 'not refused', /^--rw .* is refused/, name);
    if (!/overlaps|home dir/.test(msg)) assert.match(msg, TMPMSG, name); // /etc and ~/.config/git overlap a credential dir on some hosts; the rest is the allow-list
  }
  assert.match(usageOf(() => validate(parseArgs(['--rw', join(HOME, 'anything'), '--', '/bin/true']))), TMPMSG);
});

test('--rw outside the temp dir is refused at the CLI: exit 64 and the command never runs; --ro of the same places is not affected by this rule', async () => {
  for (const p of [join(HOME, 'anything'), HERE, join(HOME, 'Library', 'LaunchAgents'), '/usr/local']) {
    const { r, ran } = await attempt(['--rw', p]);
    assert.equal(r.code, 64, `${p}: ${r.stderr}`);
    assert.match(r.stderr, TMPMSG);
    assert.equal(ran, false, p);
  }
  assert.doesNotThrow(() => validate(parseArgs(['--cwd', mk(), '--ro', HERE, '--ro', '/usr/local', '--', '/bin/true'])));
});

test('--rw: a symlink in tmp that points into home (or at a repo) is judged by where it lands: refused; one pointing at a tmp dir is fine', () => {
  const lnk = target => { const l = join(mk(), 'l'); symlinkSync(target, l); return l; };
  for (const target of [join(HOME, '.asdf'), HERE, HOME, '/usr/local']) {
    assert.match(usageOf(() => validate(parseArgs(['--rw', lnk(target), '--', '/bin/true']))) ?? 'not refused', /^--rw .* is refused/, target);
  }
  assert.match(usageOf(() => validate(parseArgs(['--rw', lnk(join(HOME, '.asdf')), '--', '/bin/true']))), TMPMSG);
  assert.doesNotThrow(() => validate(parseArgs(['--rw', lnk(mk()), '--', '/bin/true'])));
});

test('/tmp and /private/tmp count as the temp dir', () => {
  const d = mkdtempSync('/tmp/zt-test-'); // real /tmp, whatever TMPDIR says
  made.push(d);
  assert.doesNotThrow(() => validate(parseArgs(['--rw', d, '--', '/bin/true'])));
  assert.doesNotThrow(() => validate(parseArgs(['--rw', join('/private/tmp', d.split('/').pop()), '--', '/bin/true'])));
});

test('writableRoots: a TMPDIR the caller points into or over home (an agent can export it) is dropped; real temp dirs are kept', () => {
  const home = '/zt-fake-home/user'; // outside ISO, so the real temp dirs do not overlap it
  assert.ok(writableRoots(home, ISO).includes(realpathSync(ISO)));
  for (const evil of [home, join(home, 'work'), join(home, '.ssh'), dirname(home), '/']) {
    const kept = writableRoots(home, evil);
    assert.equal(kept.some(r => r === home || r.startsWith(`${home}/`) || home.startsWith(`${r}/`)), false, evil);
  }
});

test('a TMPDIR pointing into home does not widen --rw: still refused, command never runs', async () => {
  for (const evil of [HOME, join(HOME, 'work')]) {
    const { r, ran } = await attempt(['--rw', join(HOME, 'work', 'zt-nonexistent-scratch')], { TMPDIR: evil });
    assert.equal(r.code, 64, `TMPDIR=${evil}: ${r.stderr}`);
    assert.match(r.stderr, /is refused/);
    assert.equal(ran, false);
  }
});

// --- second layer: a writable mount over a git checkout lets code plant hooks and config that the host later runs ---
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
const GITMSG = /git checkout .*git archive copy/;
function repos() {
  const repo = mk(), parent = mk(), wt = mk(), copy = mk();
  git(repo, 'init', '-q');
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'x');
  writeFileSync(join(wt, '.git'), `gitdir: ${join(repo, '.git', 'worktrees', 'wt')}\n`); // what `git worktree add` leaves: a .git FILE
  mkdirSync(join(parent, 'a', 'b'), { recursive: true });
  git(join(parent, 'a', 'b'), 'init', '-q');
  spawnSync('sh', ['-c', 'git -C "$0" archive HEAD | tar -x -C "$1"', repo, copy], { encoding: 'utf8' });
  return { repo, parent, wt, copy };
}

test('--rw over a git checkout is refused: the repo, a subdir, its .git, a worktree (.git file), a parent that contains a repo; a git archive copy is allowed', async () => {
  const { repo, parent, wt, copy } = repos();
  assert.equal(existsSync(join(copy, 'src', 'a.txt')), true, 'the archive copy has the files');
  assert.equal(existsSync(join(copy, '.git')), false, 'and no .git');
  const refused = { 'the repo': repo, 'a subdir of the repo': join(repo, 'src'), 'a not-yet-existing subdir': join(repo, 'src', 'new'), 'its .git': join(repo, '.git'), 'inside .git': join(repo, '.git', 'hooks'), 'a worktree (.git file)': wt, 'a parent that contains a repo': parent };
  for (const [name, p] of Object.entries(refused)) {
    assert.match(usageOf(() => validate(parseArgs(['--cwd', mk(), '--rw', p, '--', '/bin/true']))) ?? 'not refused', GITMSG, name);
  }
  assert.doesNotThrow(() => validate(parseArgs(['--rw', copy, '--', '/bin/true'])));
  assert.doesNotThrow(() => validate(parseArgs(['--rw', join(copy, 'src'), '--', '/bin/true'])));
  assert.doesNotThrow(() => validate(parseArgs(['--ro', repo, '--', '/bin/true'])), 'reading a repo is fine');
  for (const p of [repo, join(repo, '.git'), wt]) { // and the real thing: the command never runs
    const { r, ran } = await attempt(['--rw', p]);
    assert.equal(r.code, 64, `${p}: ${r.stderr}`);
    assert.match(r.stderr, GITMSG);
    assert.equal(ran, false, p);
  }
});

test('findGit: ancestors up to (not including) home, descendants within a limit; node_modules and symlinks are not walked; too big = unverifiable = refused', () => {
  const NOHOME = { home: '/nonexistent-home' };
  const root = realpathSync(mk());
  assert.equal(findGit(root, NOHOME), '');
  mkdirSync(join(root, 'a', 'b', 'c'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'pkg', '.git'), { recursive: true });
  symlinkSync(realpathSync(HERE), join(root, 'link-to-a-repo-dir'));
  assert.equal(findGit(root, NOHOME), '', 'node_modules and symlinks are skipped');
  mkdirSync(join(root, 'a', 'b', 'c', '.git'));
  assert.equal(findGit(root, NOHOME), join(root, 'a', 'b', 'c', '.git'));
  assert.equal(findGit(join(root, 'a', 'b', 'c', 'deeper'), NOHOME), join(root, 'a', 'b', 'c', '.git'), 'ancestor');
  assert.equal(findGit(join(root, 'a', 'b', 'c', 'deeper'), { home: join(root, 'a', 'b', 'c') }), '', 'the walk up stops before home');
  const big = realpathSync(mk());
  for (let i = 0; i < 10; i++) mkdirSync(join(big, `d${i}`));
  assert.equal(findGit(big, { ...NOHOME, max: 3 }), '?');
  assert.equal(findGit(big, { ...NOHOME, max: 50 }), '');
  assert.match(usageOf(() => checkMounts({ cwd: mk(), rw: [big] }, { home: '/nonexistent-home', tmpRoots: [realpathSync(ISO)], gitScanMax: 3 })), /too many directories/);
});

test('checkMounts with a fake home: symlinks cannot dodge it; ro of repo/venv/.asdf passes, rw only below the temp roots; every run dir and the marker dir are off limits for ro and rw', () => {
  const home = realpathSync(mk()), base = realpathSync(mk()), runDir = join(base, 'run1'), otherRun = join(base, 'run2'), markerDir = realpathSync(mk()), markerTarget = realpathSync(mk());
  const scratch = realpathSync(mk()), tmpRoots = [scratch];
  mkdirSync(runDir);
  mkdirSync(otherRun);
  const ctx = { home, base, runDir, markerDir, markerTarget, tmpRoots };
  for (const c of [...CRED.filter(x => !/netrc|npmrc|pypirc/.test(x)), 'repo', 'venv/bin', '.asdf/installs/python/3.12', 'work/proj']) mkdirSync(join(home, c), { recursive: true });
  mkdirSync(join(scratch, 'copy'));
  const lnk = target => { const l = join(mk(), 'l'); symlinkSync(target, l); return l; };
  symlinkSync(join(home, '.ssh'), join(home, 'repo', 'k')); // a link planted inside an allowed dir
  const check = (kind, p) => usageOf(() => checkMounts({ cwd: kind === 'cwd' ? p : mk(), ro: kind === 'ro' ? [p] : [], rw: kind === 'rw' ? [p] : [] }, ctx));
  const refusedPaths = {
    '.ssh': join(home, '.ssh'), 'link to .ssh': lnk(join(home, '.ssh')), 'link inside .claude': lnk(join(home, '.claude')), 'link to home': lnk(home), 'link to /': lnk('/'),
    'link to .config (parent of gcloud)': lnk(join(home, '.config')), 'nested link .ssh via repo': join(home, 'repo', 'k'), 'home': home,
    'base': base, 'run1': runDir, 'inside run1': join(runDir, 'x', 'y'), 'run2 (not the resolved one)': otherRun, 'parent of base': dirname(base), 'link to base': lnk(base), 'link to run2': lnk(otherRun),
    'marker dir': markerDir, 'inside marker dir': join(markerDir, 'x'), 'link to marker dir': lnk(markerDir), 'marker target': markerTarget, 'link to marker target': lnk(markerTarget),
  };
  const allowedRo = { repo: join(home, 'repo'), venv: join(home, 'venv'), '.asdf': join(home, '.asdf'), 'python install': join(home, '.asdf/installs/python/3.12'), 'work/proj': join(home, 'work/proj'), 'link to repo': lnk(join(home, 'repo')), 'scratch copy': join(scratch, 'copy'), 'sibling of base': `${base}-copy` };
  for (const kind of ['cwd', 'ro', 'rw']) {
    for (const [name, p] of Object.entries(refusedPaths)) assert.match(check(kind, p) ?? 'not refused', /is refused/, `${kind}: ${name}`);
  }
  for (const kind of ['cwd', 'ro']) for (const [name, p] of Object.entries(allowedRo)) assert.equal(check(kind, p), null, `${kind}: ${name}`);
  // rw: only below a temp root (strictly), by realpath
  for (const [name, p] of Object.entries({ 'scratch copy': join(scratch, 'copy'), 'new dir in scratch': join(scratch, 'new', 'deeper'), 'link to a scratch dir': lnk(join(scratch, 'copy')) })) assert.equal(check('rw', p), null, `rw: ${name}`);
  for (const [name, p] of Object.entries({ repo: join(home, 'repo'), venv: join(home, 'venv'), '.asdf': join(home, '.asdf'), 'work/proj': join(home, 'work/proj'), 'the temp root itself': scratch, 'link to repo': lnk(join(home, 'repo')), 'sibling of base': `${base}-copy` })) {
    assert.match(check('rw', p) ?? 'not refused', TMPMSG, `rw: ${name}`);
  }
  // reading evidence is refused too (ledgers hold command output)
  assert.match(check('ro', runDir), /is refused/);
});
