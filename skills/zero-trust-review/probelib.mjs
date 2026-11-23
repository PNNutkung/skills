// Shared plumbing for the real-execution probes (testprobe.mjs, mutate.mjs): the options every probe takes, read-only git access to the change, a symlink-safe
// scratch copy of a tree, and THE way a command runs here: through the sandbox runner (exit 86 = no sandbox, 124 = timeout). The repo under review is only read.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { positiveInt } from './flags.mjs';

export const NO_SANDBOX = 86, TIMEOUT = 124;
const TAIL = 200, KILL_GRACE_SEC = 10;
export const TEST = /(^|\/)(tests?|__tests__|specs?|e2e|cypress|playwright)\/|(^|\/)(test_|conftest)[^/]*$|[_.](test|spec)\.\w+$/i; // same as triage.py
export const DOC = /\.(md|json|ya?ml|toml|ini|cfg)$/i;
export const isSource = p => !TEST.test(p) && !DOC.test(p) && !basename(p).toLowerCase().includes('config');
export const shq = s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`); // file names come from the branch under review

export const intOption = (values, name, min) => {
  const n = Number(values[name]);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} must be an integer >= ${min}`);
  return n;
};

// A repo-relative path, normalized; throws on anything that could leave the repo.
export const rel = p => { const n = normalize(p).replace(/\/+$/, ''); if (n === '.' || isAbsolute(n) || n.split('/').includes('..')) throw new Error(`path must stay inside the repo: ${p}`); return n; };

// The options every probe takes, validated. `extra` adds the probe's own parseArgs definitions; their raw values come back in `values`. `optional` names common options this probe may omit (e.g. base).
// `args` and `cwd` (ADR 0003) let an in-process caller pass its own argv and working directory; left out, they are process.argv and process.cwd() as before
export function parseProbeArgs(extra = {}, { optional = [], args, cwd } = {}) {
  const str = { type: 'string' }, many = { type: 'string', multiple: true, default: [] }, abs = p => (cwd === undefined ? resolve(p) : resolve(cwd, p));
  const { values: v } = parseArgs({ ...(args === undefined ? {} : { args }), options: { repo: str, base: str, head: str, scratch: str, cmd: str, tests: str, runner: str, link: many, ro: many, env: many,
    jobs: { ...str, default: '4' }, timeout: { ...str, default: '120' }, ...extra } });
  for (const k of ['repo', 'base', 'head', 'scratch', 'cmd']) if (!v[k] && !optional.includes(k)) throw new Error(`--${k} is required`);
  if (!v.cmd.includes('{file}')) throw new Error('--cmd must contain {file}');
  for (const e of v.env) if (!/^[A-Za-z_]\w*=/.test(e)) throw new Error(`--env wants K=V, got ${e}`);
  const runner = abs(v.runner ?? join(dirname(fileURLToPath(import.meta.url)), 'sandbox-run.mjs'));
  if (!existsSync(runner)) throw new Error(`runner not found: ${runner}`);
  return { values: v, repo: abs(v.repo), base: v.base, head: v.head, scratch: abs(v.scratch), cmd: v.cmd, runner, env: v.env, link: v.link.map(rel),
    extraRo: v.ro.map(p => abs(p)), tests: v.tests?.split(',').filter(Boolean).map(rel), jobs: intOption(v, 'jobs', 1), timeout: intOption(v, 'timeout', 1) };
}

// An editable install (pip -e) imports from absolute directories listed in site-packages/*.pth. The sandbox reads only what it is granted, so grant
// those directories read-only, but only when they sit inside the repo under review: a .pth line that points anywhere else is ignored.
export function editableRoots(linked, repo) {
  const root = realpathSync(repo) + sep, found = new Set();
  for (const d of linked) {
    let libs = [];
    try { libs = readdirSync(join(d, 'lib')).filter(n => /^python3/.test(n)); } catch { continue; }
    for (const py of libs) {
      const sp = join(d, 'lib', py, 'site-packages');
      let pth = [];
      try { pth = readdirSync(sp).filter(f => f.endsWith('.pth')); } catch { continue; }
      for (const f of pth) {
        for (const line of readFileSync(join(sp, f), 'utf8').split('\n')) {
          const p = line.trim();
          if (!isAbsolute(p)) continue;
          try { const real = realpathSync(p); if (real.startsWith(root) && statSync(real).isDirectory() && !linked.includes(real)) found.add(real); } catch { /* missing path */ }
        }
      }
    }
  }
  return [...found].sort();
}

export const gitOut = (repo, args) => {
  try { return execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { throw new Error(`git ${args[0]}: ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
};

// old-side mode/blob of everything changed since the merge base, so BASE content needs no merge-base lookup of its own
export function changes(repo, base, head) {
  const t = gitOut(repo, ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', `${base}...${head}`, '--']).toString().split('\0');
  const out = [];
  for (let i = 0; i + 1 < t.length; i += 2) {
    const [mode, , sha, , status] = t[i].slice(1).split(' ');
    out.push({ path: t[i + 1], mode, sha, status: status[0] });
  }
  return out;
}

const exited = p => new Promise(r => { p.on('error', e => r(e.message)); p.on('close', r); });
export async function extract(repo, rev, dir) {
  const g = spawn('git', ['-C', repo, 'archive', rev], { stdio: ['ignore', 'pipe', 'pipe'] });
  const x = spawn('tar', ['-x', '-C', dir], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  for (const p of [g, x]) p.stderr.on('data', d => (err += d));
  x.stdin.on('error', () => {}); // tar died early; its exit code says so
  g.stdout.pipe(x.stdin);
  const codes = await Promise.all([exited(g), exited(x)]);
  if (codes.some(Boolean)) throw new Error(`archive ${rev}: ${err.trim().split('\n')[0] || codes.join()}`);
}

// Creates dirs one component at a time and refuses symlinks: a HEAD tree can swap a dir for a symlink to steer our writes out of the copy.
export function ensureDir(root, rel) {
  let p = root;
  for (const c of rel.split('/').filter(c => c && c !== '.')) {
    p = join(p, c);
    const st = lstatSync(p, { throwIfNoEntry: false });
    if (!st) mkdirSync(p);
    else if (!st.isDirectory()) throw new Error(`refusing to write through ${p}`);
  }
}
export const clear = (root, path) => { ensureDir(root, dirname(path)); rmSync(join(root, path), { recursive: true, force: true }); };

// deletes first: an A entry may be the symlink/file a restored directory has to replace
export function restore(repo, copy, srcChanges) {
  for (const c of srcChanges) if (c.status === 'A') clear(copy, c.path);
  for (const c of srcChanges) {
    if (c.status === 'A' || c.mode === '160000') continue; // 160000 = submodule, no blob
    clear(copy, c.path);
    const blob = gitOut(repo, ['cat-file', 'blob', c.sha]), dest = join(copy, c.path);
    if (c.mode === '120000') symlinkSync(blob.toString(), dest);
    else { writeFileSync(dest, blob); chmodSync(dest, c.mode === '100755' ? 0o755 : 0o644); }
  }
}

// Runs `command` (a shell line) in `dir` through the sandbox runner. -> { exit, sec, tail, run } where run = the id of the runner's ledger entry (ZT-RUN <id>)
// o.slots (a limiter) caps how many commands run at once. o.signal (an AbortSignal) stops the command: SIGTERM makes the runner kill the command's process group;
// a stopped or never-started command comes back with aborted: true and decides nothing.
// o.procEnv / o.procCwd: the runner process's own environment and cwd (an in-process caller's injected ones; unset: this process's).
export function runIn(o, dir, command) {
  return o.slots ? o.slots(() => spawnRun(o, dir, command)) : spawnRun(o, dir, command);
}

function spawnRun(o, dir, command) {
  if (o.signal?.aborted) return Promise.resolve({ ...NOT_STARTED });
  const t0 = performance.now(), keep = o.tail ?? TAIL; // o.tail: trailing output chars the caller needs (the RED classifier reads more than the review probes)
  const env = o.env.some(e => e.startsWith('PYTHONPATH=')) ? o.env : [...o.env, `PYTHONPATH=${dir}`]; // editable installs would import the original tree
  const argv = [o.runner, '--cwd', dir, '--rw', dir, '--timeout', String(o.timeout), ...o.ro.flatMap(p => ['--ro', p]), ...env.flatMap(e => ['--env', e]),
    '--', 'sh', '-c', command];
  return new Promise(done => {
    // the runner enforces --timeout itself (124); this is only a backstop against a hung runner
    const p = spawn(...runnerCommand(argv), { ...(o.procEnv ? { env: o.procEnv } : {}), ...(o.procCwd ? { cwd: o.procCwd } : {}), stdio: ['ignore', 'pipe', 'pipe'], timeout: (o.timeout + KILL_GRACE_SEC) * 1000, killSignal: 'SIGKILL' });
    let tail = '', aborted = false, backstop;
    const stop = () => {
      aborted = true;
      p.kill('SIGTERM');
      backstop = setTimeout(() => { p.kill('SIGKILL'); p.stdout.destroy(); p.stderr.destroy(); }, KILL_GRACE_SEC * 1000);
      backstop.unref();
    };
    o.signal?.addEventListener('abort', stop, { once: true });
    for (const s of [p.stdout, p.stderr]) { s.setEncoding('utf8'); s.on('data', d => (tail = (tail + d).slice(-keep * 4))); }
    const end = exit => {
      o.signal?.removeEventListener('abort', stop);
      clearTimeout(backstop);
      done({ exit, sec: Math.round((performance.now() - t0) / 100) / 10, tail: tail.trim().slice(-keep), run: /ZT-RUN (\S+) exit=/.exec(tail)?.[1], ...(aborted && { aborted }) });
    };
    p.on('error', e => { tail = e.message; end(1); });
    p.on('close', code => end(code ?? TIMEOUT));
  });
}
const NOT_STARTED = { exit: null, sec: 0, tail: '', run: undefined, aborted: true };

// At most `max` calls of run(fn) at once, the rest wait in order; null when there is no limit. A finished call hands its slot straight to the next waiter.
export function limiter(max) {
  if (max === null) return null;
  let active = 0;
  const waiting = [];
  return async fn => {
    if (active < max) active++;
    else await new Promise(r => waiting.push(r));
    try { return await fn(); } finally { if (waiting.length) waiting.shift()(); else active--; }
  };
}
export const TEST_PROCESS_MAX_FLAG = 'ZT_TEST_PROCESS_MAX';
export const testProcessSlots = env => limiter(positiveInt(env, TEST_PROCESS_MAX_FLAG));

// The head run file (testprobe.mjs --head-out, mutate.mjs --baseline-from): the unmutated HEAD run of each test file, keyed to everything that decides its result.
// A file that does not match exactly is never trusted: the caller runs its own baseline.
export const HEAD_RUN_SCHEMA = 1, HEAD_RUN_KIND = 'zt-head-run';
const EXIT_MAX = 255;
export const HEAD_RUN_REFUSED = {
  missing: 'no head run file', unreadable: 'the head run file cannot be read', notJson: 'the head run file is not JSON', schema: 'the head run file has another schema',
  identity: 'the head run is from another tree, command or environment', tests: 'the head run does not cover every test file',
};

export const runIdentity = o => ({ tree: gitOut(o.repo, ['rev-parse', '--verify', `${o.head}^{tree}`]).toString().trim(), cmd: o.cmd, env: [...o.env], link: [...o.link],
  ro: [...o.extraRo], timeout: o.timeout, runner: o.runner });

export const headRunDoc = (identity, results) => ({ schema: HEAD_RUN_SCHEMA, kind: HEAD_RUN_KIND, identity,
  tests: results.map(({ file, exit, sec }) => ({ file, pass: exit === 0, exit, sec })) });

export function writeHeadRun(path, doc) {
  const part = `${path}.part`;
  writeFileSync(part, `${JSON.stringify(doc)}\n`);
  renameSync(part, path);
}

const isObject = x => typeof x === 'object' && x !== null && !Array.isArray(x);
const wellFormed = r => isObject(r) && typeof r.file === 'string' && Number.isInteger(r.exit) && r.exit >= 0 && r.exit <= EXIT_MAX && r.pass === (r.exit === 0)
  && typeof r.sec === 'number' && Number.isFinite(r.sec) && r.sec >= 0;

// -> { exits } (one per file, in order) or { reason }: the head run in `text` (undefined = no file), only if it is exactly this identity and covers every file
export function baselineFrom(text, identity, files) {
  if (text === undefined) return { reason: HEAD_RUN_REFUSED.missing };
  let doc;
  try { doc = JSON.parse(text); } catch { return { reason: HEAD_RUN_REFUSED.notJson }; }
  if (!isObject(doc) || doc.schema !== HEAD_RUN_SCHEMA || doc.kind !== HEAD_RUN_KIND) return { reason: HEAD_RUN_REFUSED.schema };
  if (!isDeepStrictEqual(doc.identity, identity)) return { reason: HEAD_RUN_REFUSED.identity };
  if (!Array.isArray(doc.tests) || !doc.tests.every(wellFormed) || new Set(doc.tests.map(r => r.file)).size !== doc.tests.length) return { reason: HEAD_RUN_REFUSED.tests };
  const byFile = new Map(doc.tests.map(r => [r.file, r.exit]));
  if (!files.every(f => byFile.has(f))) return { reason: HEAD_RUN_REFUSED.tests };
  return { exits: files.map(f => byFile.get(f)) };
}

export function readBaseline(path, identity, files) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { return { reason: e.code === 'ENOENT' ? HEAD_RUN_REFUSED.missing : HEAD_RUN_REFUSED.unreadable }; }
  return baselineFrom(text, identity, files);
}

export async function pool(items, n, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

// ADR 0003: a node file runs under this node; any other runner (a test's sh stub) runs directly and needs its exec bit
const NODE_FILE = /\.(mjs|js|cjs)$/i;
const runnerCommand = argv => (NODE_FILE.test(argv[0]) ? [process.execPath, argv] : [argv[0], argv.slice(1)]);

export function backendOf(runner, env) { // env: the runner's own environment (undefined: this process's)
  const r = spawnSync(...runnerCommand([runner, '--check']), { ...(env ? { env } : {}), encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].slice(0, 40) || 'sandbox' : 'none';
}
