#!/usr/bin/env node
// Sandbox runner for zero-trust-review: runs untrusted code with no network, reads limited to an allow-list, writes limited to
// --rw dirs plus a private TMPDIR, and an allow-listed env. Never falls back to running unsandboxed, and no env var can switch confinement off.
//   node sandbox-run.mjs --check
//   node sandbox-run.mjs [--cwd DIR] [--rw DIR]... [--ro DIR]... [--timeout SEC] [--env K=V]... [--allow-port N]... [--run DIR] -- CMD ARG...
// Callers must pass interpreter and venv/toolchain dirs as --ro and use real interpreter paths: version-manager shims (asdf, pyenv)
// read $HOME, which is not readable inside. --cwd is readable, not writable (pass it as --rw too if the command must write).
// Ledger: every command is appended to RUN/exec.jsonl and a final stderr line `ZT-RUN <id> exit=<n>` names the entry. RUN comes from runctx.mjs
// (--run, else $ZT_RUN_DIR, else the per-user active marker); a candidate that is not ours or is open to other users is skipped, never used.
// The file is always RUN/exec.jsonl: there is no way to pick another one. No trusted run dir = no ledger. A ledger that cannot be written warns
// on stderr and never changes the child's exit code or output.
// Launchers (sandbox-exec, env, bwrap, docker) are never looked up through PATH: each comes from a fixed list of absolute paths and is used only if
// it is a regular file owned by root or us with nothing group/world-writable on the way up to /. They run with PATH=/usr/bin:/bin (docker also gets the
// host's DOCKER_* vars); the caller's PATH and --env PATH= reach only the program inside.
// The tool refuses to start (exit 64, before anything else) if its own env has LD_*/DYLD_* loader vars, NODE_OPTIONS and friends: see checkToolEnv.
// Env vars read: ZT_SANDBOX_FORCE (none|seatbelt|bwrap|docker: only ever forces a REAL backend or exit 86), ZT_SANDBOX_IMAGE (docker image),
// LANG LC_ALL TERM TZ and PATH (all forwarded to the program inside only), DOCKER_* (docker CLI only), TMPDIR (runner temp dir), and via runctx.mjs
// ZT_RUN_DIR, ZT_MARKER_DIR, XDG_RUNTIME_DIR, HOME (ledger location).
// Mounts: --rw (a writable --cwd is one too) is an ALLOW-LIST: strictly below the system temp dir (os.tmpdir(), /tmp, /private/tmp, by realpath) and not over a
// git checkout (a .git dir or worktree file at or above it, or anywhere below it): `git archive` copies are fine. And --cwd/--ro/--rw may not equal or contain the home dir or /, nor equal, contain or lie inside a credential dir (~/.ssh, ~/.aws, ...) or
// evidence (the per-user base <tmpdir>/zt-review-<uid> with EVERY run in it, the resolved run dir, the marker's target, the marker dir; ledgers hold
// command output, so reading is refused too): refused before launch, judged by realpath. A repo, a venv or ~/.asdf inside home is fine.
// The pure parts (parseArgs, validate, checkMounts, buildEnv, buildPlan) are exported for the tests; running the file executes them.
// Exit: the child's code; 124 timeout; 86 no usable backend (or --allow-port unsupported); 64 usage error; 127 cannot start.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { constants, tmpdir, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { appendSafe, markerDir, readMarker, resolveRun } from './runctx.mjs';

const EXIT = { usage: 64, noBackend: 86, timeout: 124, cannotStart: 127 };
const KILL_GRACE_MS = 2000;
const OUT_HALF = 4000; // ledger "out" keeps the first and last OUT_HALF chars
const DRAIN_MS = 1000; // after the child exits, how long a pipe held open by an escaped grandchild may delay the ledger line
const ENV_ALLOW = ['PATH', 'LANG', 'LC_ALL', 'TERM', 'TZ'];
// --env names that change what loads or runs outside the confinement (or in any interpreter's startup). PYTHONPATH stays allowed: it points into the sandboxed copy.
const ENV_REFUSED = /^(LD_|DYLD_)|^(NODE_OPTIONS|NODE_PATH|PERL5OPT|PERLLIB|RUBYOPT|RUBYLIB|BASH_ENV|ENV|GCONV_PATH|IFS|PYTHONSTARTUP|PYTHONHOME|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS)$/;
const MACOS_READ = ['/usr', '/bin', '/sbin', '/System', '/Library', '/opt/homebrew', '/private/etc', '/dev', '/private/var/db/timezone', '/private/var/select'];
const MACOS_SYMLINKS = ['/etc', '/var', '/tmp']; // the kernel stats these to follow them into /private
const MACOS_DEV_WRITE = ['/dev/null', '/dev/dtracehelper'];

// What the tool itself must not be started with: a prompt-injected agent can export these in its own shell before calling it, and they would load code
// into this process or its launchers before any confinement. (note.mjs keeps its own copy of this list.)
const POISON_ENV = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'BASH_ENV', 'ENV', 'PERL5OPT', 'RUBYOPT', 'PYTHONSTARTUP', 'PYTHONHOME'];
export function checkToolEnv(env = process.env) {
  const set = POISON_ENV.filter(k => Object.hasOwn(env, k));
  if (set.length) usage(`refusing to run: ${set.join(', ')} in the environment can change what loads or runs outside the confinement; unset ${set.length > 1 ? 'them' : 'it'}`);
}

const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
class Usage extends Error {}
const usage = msg => { throw new Usage(msg); };
const probe = (cmd, args, env) => spawnSync(cmd, args, { stdio: 'ignore', env }).status === 0;

export const LAUNCHER_PATH = '/usr/bin:/bin';
export const LAUNCHERS = {
  'sandbox-exec': ['/usr/bin/sandbox-exec'],
  env: ['/usr/bin/env'],
  bwrap: ['/usr/bin/bwrap', '/bin/bwrap'],
  docker: ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker', '/Applications/OrbStack.app/Contents/MacOS/xbin/docker'],
};

/** The first candidate that is safe to run OUTSIDE the confinement, or ''. Absolute paths only; every step of the way is lstat-ed, symlinks are followed to their real file. */
export function trustedBinary(candidates, { uid = typeof process.getuid === 'function' ? process.getuid() : undefined } = {}) {
  // a symlink's own mode bits mean nothing (777 on Linux): its owner matters, because the owner can retarget it
  const bad = p => { const st = lstatSync(p); return !(st.uid === 0 || st.uid === uid) || (!st.isSymbolicLink() && (st.mode & 0o022) !== 0); };
  const chain = start => { const out = []; for (let p = start; ; p = dirname(p)) { out.push(p); if (dirname(p) === p) return out; } };
  return candidates.find(c => {
    try {
      if (!isAbsolute(c)) return false;
      const real = realpathSync(c);
      return statSync(real).isFile() && ![...new Set([...chain(c), ...chain(real)])].some(bad);
    } catch { return false; }
  }) ?? '';
}

const launcherPaths = {};
export const launcherBin = name => (launcherPaths[name] ??= trustedBinary(LAUNCHERS[name]));

// docker needs its DOCKER_* vars to find the daemon, nothing else from the caller; its PATH is fixed
export const dockerEnv = (host = process.env) => ({ PATH: LAUNCHER_PATH, ...Object.fromEntries(Object.entries(host).filter(([k]) => k.startsWith('DOCKER_'))) });

const SINGLE = ['--cwd', '--run'];
export function parseArgs(argv) {
  const o = { cwd: process.cwd(), rw: [], ro: [], env: [], ports: [], timeout: 120, check: false, cmd: [], run: '' };
  const list = { '--rw': o.rw, '--ro': o.ro, '--env': o.env, '--allow-port': o.ports };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.cmd = argv.slice(i + 1); break; }
    if (a === '--check') { o.check = true; continue; }
    if (!SINGLE.includes(a) && a !== '--timeout' && !list[a]) usage(`unknown argument ${a} (the command goes after --)`);
    if (++i >= argv.length) usage(`${a} needs a value`);
    if (a === '--timeout') o.timeout = Number(argv[i]);
    else if (SINGLE.includes(a)) o[a.slice(2)] = argv[i];
    else list[a].push(argv[i]);
  }
  return o;
}

export function validate(o) {
  checkMounts(o);
  const dir = p => { try { if (statSync(p).isDirectory()) return realpathSync(p); } catch { /* fall through */ } return usage(`not a directory: ${p}`); };
  const dirs = ds => [...new Set(ds.map(dir))];
  if (!(o.timeout > 0)) usage('--timeout must be a positive number of seconds');
  const ports = o.ports.map(p => (/^\d+$/.test(p) && +p >= 1 && +p <= 65535 ? +p : usage(`bad --allow-port ${p}`)));
  const env = Object.fromEntries(o.env.map(kv => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(kv)) usage(`bad --env ${kv} (want K=V)`);
    const k = kv.slice(0, kv.indexOf('='));
    return ENV_REFUSED.test(k) ? usage(`--env ${k} is refused: it can change what loads or runs outside the sandbox`) : [k, kv.slice(kv.indexOf('=') + 1)];
  }));
  if (!o.cmd.length) usage('no command given (put it after --)');
  return { ...o, cwd: dir(o.cwd), rw: dirs(o.rw), ro: dirs(o.ro), ports, userEnv: env };
}

// where a path really lands: realpath of its nearest existing ancestor + the part that does not exist yet (null if a symlink on the way dangles)
function realish(p) {
  const rest = [];
  let cur = resolve(p);
  for (;;) {
    try { lstatSync(cur); break; } catch { /* go up */ }
    rest.unshift(basename(cur));
    const up = dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
  try { return join(realpathSync(cur), ...rest); } catch { return null; }
}

// credential dirs under home that no sandbox mount may expose (a mount of a parent, home or / would expose them too)
const HOME_SECRETS = ['.ssh', '.aws', '.gnupg', '.config/gcloud', '.azure', '.kube', '.docker', '.claude', '.netrc', '.npmrc', '.pypirc', 'Library/Keychains', '.cache/zt-review'];
const within = (p, d) => p === d || p.startsWith(d.endsWith(sep) ? d : d + sep); // p is d or inside d
const overlap = (a, b) => within(a, b) || within(b, a);

// The only places a sandboxed command may write: below the system temp dir, by realpath. A TMPDIR the caller points at (or over) home is not believed.
export const writableRoots = (home, tmp = tmpdir()) => [...new Set([tmp, '/tmp', '/private/tmp'].map(realish).filter(r => r && !overlap(r, home)))];

const GIT_SCAN_MAX = 20000; // directories walked looking for a .git below a --rw mount
const TOO_BIG = '?';
const hasGit = p => { try { lstatSync(join(p, '.git')); return true; } catch { return false; } };

/** A .git entry (a dir, or the file a worktree has) at d or any ancestor below home, or anywhere below d: its path, '' if none, '?' if d is too big to be sure. */
export function findGit(d, { home, max = GIT_SCAN_MAX } = {}) {
  for (let p = d; p !== home; p = dirname(p)) {
    if (hasGit(p)) return join(p, '.git');
    if (dirname(p) === p) break;
  }
  const stack = [d];
  let seen = 0;
  while (stack.length) {
    const dir = stack.pop();
    if (++seen > max) return TOO_BIG;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === '.git') return join(dir, '.git');
      if (e.isDirectory() && e.name !== 'node_modules') stack.push(join(dir, e.name)); // isDirectory() is false for symlinks: never walked
    }
  }
  return '';
}

function mountCtx(o) {
  const env = process.env, uid = typeof process.getuid === 'function' ? `-${process.getuid()}` : ''; // same base as runctx.activate
  const home = realish(userInfo().homedir);
  return {
    home,
    base: realish(join(tmpdir(), `zt-review${uid}`)),
    runDir: resolveRun({ run: o.run && resolve(o.run), env }),
    markerTarget: readMarker({ env }),
    markerDir: realish(markerDir(env)),
    tmpRoots: writableRoots(home),
  };
}

/**
 * Throws a usage error for a --cwd/--ro/--rw path that must not be mounted. Pure given ctx = { home, base, runDir, markerTarget, markerDir, tmpRoots, gitScanMax? }.
 * --rw is an allow-list (strictly below a temp root, and not over a git checkout); --cwd/--ro are a deny-list (home, credentials, run evidence).
 */
export function checkMounts({ cwd, ro = [], rw = [], run = '' }, ctx = mountCtx({ run })) {
  const secrets = ['/etc/ssh', ...HOME_SECRETS.map(s => join(ctx.home, s))].map(realish).filter(Boolean);
  const evidence = [ctx.base, ctx.runDir, ctx.markerTarget, ctx.markerDir].filter(Boolean);
  const why = (d, writable) => {
    if (within(ctx.home, d)) return 'it contains your home dir (or is /)';
    const secret = secrets.find(x => overlap(d, x));
    if (secret) return `it overlaps ${secret}`;
    const ev = evidence.find(x => overlap(d, x));
    if (ev) return `it overlaps ${ev}, which holds the review's run evidence`;
    if (!writable) return '';
    if (!ctx.tmpRoots.some(r => d !== r && within(d, r))) return 'writes are allowed only under the system temp dir';
    const found = findGit(d, { home: ctx.home, max: ctx.gitScanMax });
    if (found === TOO_BIG) return 'it has too many directories to prove it holds no .git; use a smaller git archive copy';
    return found ? `a writable mount over a git checkout lets code plant hooks/config that the host later runs; use a git archive copy (${found})` : '';
  };
  for (const [flag, paths, writable] of [['--cwd', [cwd], false], ['--ro', ro, false], ['--rw', rw, true]]) {
    for (const p of paths) {
      const real = realish(p), reason = real && why(real, writable); // judged before it must exist, so the refusal is the same on every host
      if (reason) usage(`${flag} ${p} is refused: ${reason}`);
    }
  }
}

const q = s => `"${s.replace(/[\\"]/g, '\\$&')}"`;
const subpaths = ps => ps.map(p => `(subpath ${q(p)})`).join(' ');

// Deny-default profile. Paths must already be realpaths: seatbelt matches the resolved path, and /var, /tmp are symlinks into /private.
function sbpl({ cwd, rw, ro, tmp, ports }) {
  const readable = [...MACOS_READ, cwd, ...ro, ...rw, tmp];
  const ancestors = new Set(['/', ...MACOS_SYMLINKS]);
  for (const p of readable) for (let d = dirname(p); d !== '/'; d = dirname(d)) ancestors.add(d);
  return [
    '(version 1)', '(deny default)',
    `(allow file-read* (literal "/") ${subpaths(readable)})`,
    // stat() only on the parents of allowed paths, so programs can walk down to them without learning what else exists
    `(allow file-read-metadata ${[...ancestors].map(p => `(literal ${q(p)})`).join(' ')})`,
    `(allow file-write* ${subpaths([...rw, tmp])} ${MACOS_DEV_WRITE.map(p => `(literal ${q(p)})`).join(' ')})`,
    `(allow process-exec* ${subpaths(readable)})`,
    '(allow process-fork)', '(allow sysctl-read)', '(allow signal (target same-sandbox))',
    '(allow mach-lookup (global-name "com.apple.diagnosticd") (global-name "com.apple.logd") (global-name "com.apple.system.opendirectoryd.libinfo"))',
    ...ports.map(p => `(allow network-outbound (remote ip "localhost:${p}"))`),
  ].join('\n');
}

function seatbeltPlan(c) {
  const profile = join(c.base, 'profile.sb');
  // sandbox-exec itself runs unconfined: it gets only the fixed env, the caller's vars go to the program inside via env -i
  return { argv: [c.bin['sandbox-exec'], '-f', profile, c.bin.env, '-i', ...Object.entries(c.env).map(([k, v]) => `${k}=${v}`), ...c.cmd], env: c.launcherEnv, files: { [profile]: sbpl(c) } };
}

function bwrapPlan(c) {
  const sys = ['/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/etc'].filter(existsSync)
    .flatMap(d => (lstatSync(d).isSymbolicLink() ? ['--symlink', readlinkSync(d), d] : ['--ro-bind', d, d]));
  const bind = (flag, ds) => ds.flatMap(d => [flag, d, d]);
  const setenv = Object.entries(c.env).flatMap(([k, v]) => ['--setenv', k, v]);
  const argv = [c.bin.bwrap, '--clearenv', ...setenv, '--unshare-net', '--unshare-pid', '--unshare-ipc', '--die-with-parent', ...sys, '--proc', '/proc', '--dev', '/dev',
    ...bind('--ro-bind', [c.cwd, ...c.ro]), ...bind('--bind', c.rw), '--tmpfs', c.tmp, '--chdir', c.cwd, '--', ...c.cmd];
  return { argv, env: c.launcherEnv }; // bwrap itself runs unconfined: it gets only the fixed env
}

function dockerPlan(c) {
  const name = `zt-sandbox-${process.pid}-${Date.now()}`;
  const mount = (ds, mode) => ds.flatMap(d => ['-v', `${d}:${d}:${mode}`]);
  // the host PATH means nothing inside the image: keep the image's own unless the caller passes --env PATH=
  const inner = Object.entries(c.env).filter(([k]) => k !== 'PATH' || 'PATH' in c.userEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const argv = [c.bin.docker, 'run', '--rm', '--init', '--pull', 'never', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', `${process.getuid()}:${process.getgid()}`, '--pids-limit', '256', '--memory', '2g', '-w', c.cwd,
    ...mount([c.cwd, ...c.ro].filter(d => !c.rw.includes(d)), 'ro'), ...mount([...c.rw, c.tmp], 'rw'), ...inner, c.image, ...c.cmd];
  // killing the docker client does not stop the container
  const env = dockerEnv(c.hostEnv);
  return { argv, env, stop: () => spawnSync(c.bin.docker, ['kill', name], { stdio: 'ignore', env }) };
}

const BACKENDS = {
  seatbelt: { ports: true, plan: seatbeltPlan, ok: () => process.platform === 'darwin' && !!launcherBin('env') && !!launcherBin('sandbox-exec')
    && probe(launcherBin('sandbox-exec'), ['-p', '(version 1)(allow default)(deny network*)', '/usr/bin/true'], { PATH: LAUNCHER_PATH }) },
  bwrap: { plan: bwrapPlan, ok: () => process.platform === 'linux' && !!launcherBin('bwrap') && probe(launcherBin('bwrap'), ['--unshare-net', '--ro-bind', '/', '/', '/bin/true'], { PATH: LAUNCHER_PATH }) },
  docker: { plan: dockerPlan, ok: () => !!process.env.ZT_SANDBOX_IMAGE && !!launcherBin('docker') && probe(launcherBin('docker'), ['version', '--format', '{{.Server.Version}}'], dockerEnv()) },
};

// ZT_SANDBOX_FORCE: none = pretend no backend; a backend name = consider only that one; anything else matches no backend. Never skips confinement.
function detect() {
  const force = process.env.ZT_SANDBOX_FORCE;
  if (force === 'none') return null;
  return ['seatbelt', 'bwrap', 'docker'].find(n => (!force || force === n) && BACKENDS[n].ok()) ?? null;
}

// null = no ledger. The path is fixed: nothing the caller passes can redirect these lines to another file.
function ledgerTarget(o) {
  const run = resolveRun({ run: o.run && resolve(o.run), env: process.env });
  return run ? { file: join(run, 'exec.jsonl'), root: run } : null;
}

function appendLedger({ file, root }, entry) {
  try { appendSafe(root, file, `${JSON.stringify(entry)}\n`); return true; } catch (e) { process.stderr.write(`WARNING: ledger ${file} not written: ${e.message}\n`); return false; }
}

// Bounded memory: only the first and the last OUT_HALF chars of the combined output are kept.
function capture() {
  let head = '', tail = '', total = 0;
  return {
    add(s) { total += s.length; const room = OUT_HALF - head.length; head += s.slice(0, room); tail = (tail + s.slice(room)).slice(-OUT_HALF); },
    get out() { return total > 2 * OUT_HALF ? `${head}\n...\n${tail}` : head + tail; },
  };
}

function tee(src, dst, cap) {
  const dec = new StringDecoder('utf8');
  dst.on('error', () => {}); // a closed pipe on our side must not kill the run
  src.pipe(dst, { end: false });
  src.on('data', d => cap.add(dec.write(d)));
  src.on('end', () => cap.add(dec.end()));
}

// The launcher (sandbox-exec, bwrap) runs OUTSIDE the confinement, so it gets only the fixed env; the caller's --env variables reach the program inside.
export function buildEnv(userEnv, tmp, host = process.env) {
  const inner = { ...Object.fromEntries(ENV_ALLOW.filter(k => k in host).map(k => [k, host[k]])), HOME: tmp, TMPDIR: tmp };
  return { launcherEnv: { ...inner, PATH: LAUNCHER_PATH }, env: { ...inner, ...userEnv } };
}

// What would be spawned: { argv, env?, files?, stop? }. Pure: writes nothing, spawns nothing.
export const buildPlan = (backend, c) => BACKENDS[backend].plan(c);

function main() {
  try { checkToolEnv(); start(); } catch (e) { if (e instanceof Usage) die(EXIT.usage, e.message); else throw e; }
}

function start() {
  const parsed = parseArgs(process.argv.slice(2));
  const backend = detect();
  if (parsed.check) {
    if (!backend) die(EXIT.noBackend, 'none');
    return process.stdout.write(`${backend}\n`);
  }
  const o = validate(parsed);
  if (!backend) die(EXIT.noBackend, 'UNVERIFIABLE: no sandbox backend (need macOS sandbox-exec, Linux bwrap, or docker with ZT_SANDBOX_IMAGE)');
  if (o.ports.length && !BACKENDS[backend].ports) die(EXIT.noBackend, 'UNVERIFIABLE: --allow-port unsupported on this backend');

  const base = mkdtempSync(join(realpathSync(tmpdir()), 'zt-sandbox-')), tmp = join(base, 'tmp');
  mkdirSync(tmp);
  const { launcherEnv, env } = buildEnv(o.userEnv, tmp);
  const plan = buildPlan(backend, { ...o, base, tmp, env, launcherEnv, image: process.env.ZT_SANDBOX_IMAGE, hostEnv: process.env, bin: Object.fromEntries(Object.keys(LAUNCHERS).map(n => [n, launcherBin(n)])) });
  for (const [file, text] of Object.entries(plan.files ?? {})) writeFileSync(file, text);

  const ledger = ledgerTarget(o), id = `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`, t0 = Date.now(), cap = capture();
  const child = spawn(plan.argv[0], plan.argv.slice(1), { cwd: o.cwd, env: plan.env ?? env, stdio: ledger ? ['inherit', 'pipe', 'pipe'] : 'inherit', detached: true });
  if (ledger) { tee(child.stdout, process.stdout, cap); tee(child.stderr, process.stderr, cap); }
  const killGroup = sig => { try { process.kill(-child.pid, sig); } catch { /* group already gone */ } };
  const terminate = () => { killGroup('SIGTERM'); setTimeout(() => { killGroup('SIGKILL'); plan.stop?.(); }, KILL_GRACE_MS).unref(); };
  let timedOut = false, interrupted = null, finished = false;
  const timer = setTimeout(() => { timedOut = true; terminate(); }, o.timeout * 1000);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { interrupted ??= s; terminate(); });

  const finish = exit => {
    if (finished) return;
    finished = true;
    const entry = { id, ts: new Date(t0).toISOString(), cmd: o.cmd, cwd: o.cwd, exit, sec: Math.round((Date.now() - t0) / 100) / 10, out: cap.out, backend };
    const line = ledger && appendLedger(ledger, entry) ? `ZT-RUN ${id} exit=${exit}\n` : '';
    process.stdout.write('', () => process.stderr.write(line, () => process.exit(exit))); // flush the tee before exiting
  };

  child.on('error', e => {
    rmSync(base, { recursive: true, force: true });
    const msg = `cannot start ${plan.argv[0]}: ${e.message}\n`;
    process.stderr.write(msg);
    cap.add(msg);
    finish(EXIT.cannotStart);
  });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    killGroup('SIGKILL'); // stragglers of the process group never outlive the run
    if (timedOut || interrupted) plan.stop?.();
    try { rmSync(base, { recursive: true, force: true }); } catch { /* best effort: a dir the child made unremovable */ }
    const sig = interrupted ?? signal, exit = timedOut ? EXIT.timeout : sig ? 128 + constants.signals[sig] : code;
    if (!ledger) return finish(exit);
    child.once('close', () => finish(exit)); // all output read
    setTimeout(() => finish(exit), DRAIN_MS); // a grandchild that left the process group may hold the pipes open
  });
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) main();
