#!/usr/bin/env node
// Direct runner of paired-agent-tdd: the command line of zero-trust-review's sandbox-run.mjs, with NO confinement. The command runs with your user's rights, your
// network and your environment (PATH, HOME, version-manager shims all work), in --cwd. Use it for code you and your agents wrote; plan.sandbox: true selects the sandbox.
//   node direct-run.mjs --check                                     prints `direct`
//   node direct-run.mjs [--cwd DIR] [--timeout SEC] [--env K=V]... [--rw DIR]... [--ro DIR]... -- CMD ARG...
// --rw, --ro and --allow-port are accepted and ignored. --env overrides the inherited environment (the gates pass PYTHONPATH here).
// Ledger, as in sandbox-run.mjs: the command is appended to RUN/exec.jsonl (RUN = $ZT_RUN_DIR, checked by runctx.mjs of zero-trust-review) and a final stderr line
// `ZT-RUN <id> exit=<n>` names the entry, so a reviewer's `executed` proof still verifies. No trusted run dir = no ledger, never a failure.
// Exit: the command's code; 124 timeout; 127 cannot start; 64 usage error.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

const KILL_GRACE_MS = 2000, OUT_HALF = 4000;
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const args = process.argv.slice(2);
if (args[0] === '--check') { process.stdout.write('direct\n'); process.exit(0); }

const cut = args.indexOf('--'), flags = cut < 0 ? args : args.slice(0, cut), cmd = cut < 0 ? [] : args.slice(cut + 1);
const one = { '--cwd': 'cwd', '--timeout': 'timeout' }, many = { '--env': 'env', '--rw': 'rw', '--ro': 'ro', '--allow-port': 'port' }, o = { cwd: process.cwd(), timeout: 120, env: [] };
for (let i = 0; i < flags.length; i += 2) {
  const k = flags[i], v = flags[i + 1];
  if (v === undefined || !(k in one || k in many)) die(64, `direct-run: unknown or incomplete option ${k}`);
  if (k in one) o[one[k]] = v; else if (many[k] === 'env') o.env.push(v);
}
if (!cmd.length) die(64, 'direct-run: no command after --');
if (!Number.isFinite(Number(o.timeout)) || Number(o.timeout) < 1) die(64, 'direct-run: --timeout must be a positive number of seconds');
const userEnv = {};
for (const kv of o.env) { const i = kv.indexOf('='); if (i < 1) die(64, `direct-run: --env wants K=V, got ${kv}`); userEnv[kv.slice(0, i)] = kv.slice(i + 1); }

// the ledger helpers of zero-trust-review (the run-dir trust checks live there); absent or untrusted = no ledger
let ledger = null;
try {
  const zt = resolve(process.env.ZT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'zero-trust-review')), rc = await import(pathToFileURL(join(zt, 'runctx.mjs')).href);
  const run = rc.resolveRun({ env: process.env });
  if (run) ledger = { run: realpathSync(run), file: join(run, 'exec.jsonl'), append: rc.appendSafe };
} catch { /* no ledger */ }

function capture() { // bounded memory: the first and last OUT_HALF chars of the combined output
  let head = '', tail = '', total = 0;
  return { add(s) { total += s.length; const room = OUT_HALF - head.length; head += s.slice(0, room); tail = (tail + s.slice(room)).slice(-OUT_HALF); }, get out() { return total > 2 * OUT_HALF ? `${head}\n...\n${tail}` : head + tail; } };
}
const tee = (src, dst, cap) => { const dec = new StringDecoder('utf8'); dst.on('error', () => {}); src.pipe(dst, { end: false }); src.on('data', d => cap.add(dec.write(d))); src.on('end', () => cap.add(dec.end())); };

const id = `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`, t0 = Date.now(), cap = capture();
const child = spawn(cmd[0], cmd.slice(1), { cwd: o.cwd, env: { ...process.env, ...userEnv }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
tee(child.stdout, process.stdout, cap); tee(child.stderr, process.stderr, cap);
const killGroup = sig => { try { process.kill(-child.pid, sig); } catch { /* group already gone */ } };
const terminate = () => { killGroup('SIGTERM'); setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref(); };
let timedOut = false, finished = false;
const timer = setTimeout(() => { timedOut = true; terminate(); }, Number(o.timeout) * 1000);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, terminate);

function finish(exit) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  let line = '';
  if (ledger) {
    try { ledger.append(ledger.run, ledger.file, `${JSON.stringify({ id, ts: new Date(t0).toISOString(), cmd: cmd.join(' '), cwd: o.cwd, exit, sec: Math.round((Date.now() - t0) / 100) / 10, out: cap.out, backend: 'direct' })}\n`); line = `ZT-RUN ${id} exit=${exit}\n`; }
    catch (e) { process.stderr.write(`WARNING: ledger ${ledger.file} not written: ${e.message}\n`); }
  }
  process.stdout.write('', () => process.stderr.write(line, () => process.exit(exit))); // flush the tee before exiting
}
child.on('error', e => { process.stderr.write(`direct-run: cannot start ${cmd[0]}: ${e.message}\n`); finish(127); });
child.on('close', (code, sig) => finish(timedOut ? 124 : code ?? (sig ? 128 : 1)));
