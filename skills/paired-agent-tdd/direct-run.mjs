#!/usr/bin/env node
// Direct runner of paired-agent-tdd: the command line of zero-trust-review's sandbox-run.mjs, with NO confinement. The command runs with your user's rights, your
// network and your environment (PATH, HOME, version-manager shims all work), in --cwd. Use it for code you and your agents wrote; plan.sandbox: true selects the sandbox.
//   node direct-run.mjs --check                                     prints `direct`
//   node direct-run.mjs [--cwd DIR] [--timeout SEC] [--env K=V]... [--rw DIR]... [--ro DIR]... -- CMD ARG...
// --rw, --ro and --allow-port are accepted and ignored. --env overrides the inherited environment (the gates pass PYTHONPATH here).
// Ledger, as in sandbox-run.mjs: the command is appended to RUN/exec.jsonl (RUN = $ZT_RUN_DIR, checked by runctx.mjs of zero-trust-review) and a final stderr line
// `ZT-RUN <id> exit=<n>` names the entry, so a reviewer's `executed` proof still verifies. No trusted run dir = no ledger, never a failure.
// Exit: the command's code; 124 timeout; 127 cannot start; 64 usage error.
// In-process (ADR 0008 A18): runDirect() does the same work without a node process of its own; the CLI below is a thin wrapper around it.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

const KILL_GRACE_MS = 2000, OUT_HALF = 4000;
const tmpOf = env => { const t = env.TMPDIR || env.TMP || env.TEMP || '/tmp'; return t.length > 1 && t.endsWith('/') ? t.slice(0, -1) : t; }; // os.tmpdir() of a process started with env

// the ledger helpers of zero-trust-review (the run-dir trust checks live there); absent or untrusted = no ledger
async function ledgerOf(env) {
  try {
    const zt = resolve(env.ZT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'zero-trust-review')), rc = await import(pathToFileURL(join(zt, 'runctx.mjs')).href);
    const run = rc.resolveRun({ env, tmp: tmpOf(env) });
    return run ? { run: realpathSync(run), file: join(run, 'exec.jsonl'), append: rc.appendSafe } : null;
  } catch { return null; }
}

// In-process runs (trap: true) have no CLI process whose SIGINT/SIGTERM/SIGHUP handlers kill the detached command group, so while any runs this process traps those
// signals once: every live group gets SIGTERM, SIGKILL after the grace, then the handler is removed and the signal raised again (the conventional signal exit).
const live = new Set(); // { term(), killNow() } of each in-process command
let dying = false;
const TRAPPED = ['SIGINT', 'SIGTERM', 'SIGHUP'];
function onSignal(sig) {
  if (dying) { for (const c of live) c.killNow(); return; } // a second signal: no more grace
  dying = true;
  for (const c of live) c.term();
  const end = () => { for (const c of live) c.killNow(); for (const s of TRAPPED) process.removeListener(s, onSignal); process.kill(process.pid, sig); setImmediate(() => process.exit(128 + osConstants.signals[sig])); };
  const until = Date.now() + KILL_GRACE_MS;
  const wait = () => (live.size && Date.now() < until ? setTimeout(wait, 50) : end());
  wait();
}
function track(c) { if (!live.size) for (const s of TRAPPED) process.on(s, onSignal); live.add(c); }
function untrack(c) { if (live.delete(c) && !live.size && !dying) for (const s of TRAPPED) process.removeListener(s, onSignal); }

function capture() { // bounded memory: the first and last OUT_HALF chars of the combined output
  let head = '', tail = '', total = 0;
  return { add(s) { total += s.length; const room = OUT_HALF - head.length; head += s.slice(0, room); tail = (tail + s.slice(room)).slice(-OUT_HALF); }, get out() { return total > 2 * OUT_HALF ? `${head}\n...\n${tail}` : head + tail; } };
}

/**
 * Runs cmd in cwd as the CLI does, in this process. -> Promise<{ exit, run }>, run = the ledger id (the ZT-RUN line) or undefined.
 * env: ['K=V'...] (--env); procEnv: the environment the CLI process would have had (ledger lookup and the command's base env); procCwd: what a relative cwd resolves against.
 * stdout / stderr: streams to tee into (the CLI's own); onData(text): every piece of decoded text the CLI would have printed, in arrival order, ZT-RUN line last.
 * signal (AbortSignal): what SIGINT/SIGTERM/SIGHUP do to the CLI: SIGTERM to the process group, SIGKILL after a grace.
 * kill (AbortSignal): what SIGKILL does to the CLI: stop waiting at once (exit null, no ledger entry), after SIGKILL to the process group.
 * trap: false when the caller handles SIGINT/SIGTERM/SIGHUP itself (the CLI); else this process traps them while the command runs (see onSignal).
 */
export async function runDirect({ cwd = process.cwd(), timeout = 120, env = [], cmd = [], procEnv = process.env, procCwd, stdout, stderr, onData = () => {}, signal, kill, trap = true } = {}) {
  const say = text => { stderr?.write(text); onData(text); };
  const usage = msg => { say(`${msg}\n`); return { exit: 64 }; };
  if (!cmd.length) return usage('direct-run: no command after --');
  if (!Number.isFinite(Number(timeout)) || Number(timeout) < 1) return usage('direct-run: --timeout must be a positive number of seconds');
  const userEnv = {};
  for (const kv of env) { const i = kv.indexOf('='); if (i < 1) return usage(`direct-run: --env wants K=V, got ${kv}`); userEnv[kv.slice(0, i)] = kv.slice(i + 1); }
  const ledger = await ledgerOf(procEnv);

  const id = `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`, t0 = Date.now(), cap = capture();
  // NODE_TEST_CONTEXT is how an outer `node --test` tells its child to report over V8 serialization instead of TAP. Inherited, it turns a gate's
  // `node --test {file}` silent and the gates misread its result, so it never passes through unless --env sets it.
  const inherited = { ...procEnv };
  delete inherited.NODE_TEST_CONTEXT;
  return new Promise(done => {
    if (kill?.aborted || (trap && dying)) { done({ exit: null }); return; }
    const child = spawn(cmd[0], cmd.slice(1), { cwd: procCwd === undefined ? cwd : resolve(procCwd, cwd), env: { ...inherited, ...userEnv }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const tee = (src, dst) => {
      const dec = new StringDecoder('utf8'), add = s => { if (s) { cap.add(s); onData(s); } };
      if (dst) { dst.on('error', () => {}); src.pipe(dst, { end: false }); }
      src.on('data', d => add(dec.write(d))); src.on('end', () => add(dec.end()));
    };
    tee(child.stdout, stdout); tee(child.stderr, stderr);
    const killGroup = sig => { try { process.kill(-child.pid, sig); } catch { /* group already gone */ } };
    let killer; // the SIGKILL after the grace: cleared when the command ends (as the CLI process exited then), so it never hits a reused pgid
    const terminate = () => { killGroup('SIGTERM'); clearTimeout(killer); killer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS); killer.unref(); };
    let timedOut = false, finished = false;
    const timer = setTimeout(() => { timedOut = true; terminate(); }, Number(timeout) * 1000);
    const tracked = { term: terminate, killNow: () => killGroup('SIGKILL') };
    const release = () => { clearTimeout(timer); signal?.removeEventListener('abort', terminate); kill?.removeEventListener('abort', hardStop); untrack(tracked); };
    const hardStop = () => { if (finished) return; finished = true; release(); clearTimeout(killer); killGroup('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); done({ exit: null }); };
    if (trap && child.pid) track(tracked);
    signal?.addEventListener('abort', terminate, { once: true });
    kill?.addEventListener('abort', hardStop, { once: true });
    if (signal?.aborted) terminate();

    const finish = exit => {
      if (finished) return;
      finished = true;
      release();
      clearTimeout(killer);
      let line = '', run;
      if (ledger) {
        try { ledger.append(ledger.run, ledger.file, `${JSON.stringify({ id, ts: new Date(t0).toISOString(), cmd: cmd.join(' '), cwd, exit, sec: Math.round((Date.now() - t0) / 100) / 10, out: cap.out, backend: 'direct' })}\n`); line = `ZT-RUN ${id} exit=${exit}\n`; run = id; }
        catch (e) { say(`WARNING: ledger ${ledger.file} not written: ${e.message}\n`); }
      }
      const end = () => { onData(line); done({ exit, run }); };
      if (stdout) stdout.write('', () => stderr.write(line, end)); else end(); // flush the tee before the ZT-RUN line
    };
    child.on('error', e => { say(`direct-run: cannot start ${cmd[0]}: ${e.message}\n`); finish(127); });
    child.on('close', (code, sig) => finish(timedOut ? 124 : code ?? (sig ? 128 : 1)));
  });
}

async function cli(args) {
  const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
  if (args[0] === '--check') { process.stdout.write('direct\n'); process.exit(0); }
  const cut = args.indexOf('--'), flags = cut < 0 ? args : args.slice(0, cut), cmd = cut < 0 ? [] : args.slice(cut + 1);
  const one = { '--cwd': 'cwd', '--timeout': 'timeout' }, many = { '--env': 'env', '--rw': 'rw', '--ro': 'ro', '--allow-port': 'port' }, o = { cwd: process.cwd(), timeout: 120, env: [] };
  for (let i = 0; i < flags.length; i += 2) {
    const k = flags[i], v = flags[i + 1];
    if (v === undefined || !(k in one || k in many)) die(64, `direct-run: unknown or incomplete option ${k}`);
    if (k in one) o[one[k]] = v; else if (many[k] === 'env') o.env.push(v);
  }
  const stop = new AbortController();
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => stop.abort());
  const r = await runDirect({ ...o, cmd, stdout: process.stdout, stderr: process.stderr, signal: stop.signal, trap: false });
  process.exit(r.exit);
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) await cli(process.argv.slice(2));
