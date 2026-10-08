// Shared plumbing for the real-execution probes (testprobe.mjs, mutate.mjs): the options every probe takes, read-only git access to the change, a symlink-safe
// scratch copy of a tree, and THE way a command runs here: through the sandbox runner (exit 86 = no sandbox, 124 = timeout). The repo under review is only read.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

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

// The options every probe takes, validated. `extra` adds the probe's own parseArgs definitions; their raw values come back in `values`.
export function parseProbeArgs(extra = {}) {
  const str = { type: 'string' }, many = { type: 'string', multiple: true, default: [] };
  const { values: v } = parseArgs({ options: { repo: str, base: str, head: str, scratch: str, cmd: str, tests: str, runner: str, link: many, ro: many, env: many,
    jobs: { ...str, default: '4' }, timeout: { ...str, default: '120' }, ...extra } });
  for (const k of ['repo', 'base', 'head', 'scratch', 'cmd']) if (!v[k]) throw new Error(`--${k} is required`);
  if (!v.cmd.includes('{file}')) throw new Error('--cmd must contain {file}');
  const rel = p => { const n = normalize(p).replace(/\/+$/, ''); if (n === '.' || isAbsolute(n) || n.split('/').includes('..')) throw new Error(`path must stay inside the repo: ${p}`); return n; };
  for (const e of v.env) if (!/^[A-Za-z_]\w*=/.test(e)) throw new Error(`--env wants K=V, got ${e}`);
  const runner = resolve(v.runner ?? join(dirname(fileURLToPath(import.meta.url)), 'sandbox-run.mjs'));
  if (!existsSync(runner)) throw new Error(`runner not found: ${runner}`);
  return { values: v, repo: resolve(v.repo), base: v.base, head: v.head, scratch: resolve(v.scratch), cmd: v.cmd, runner, env: v.env, link: v.link.map(rel),
    extraRo: v.ro.map(p => resolve(p)), tests: v.tests?.split(',').filter(Boolean).map(rel), jobs: intOption(v, 'jobs', 1), timeout: intOption(v, 'timeout', 1) };
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
export function runIn(o, dir, command) {
  const t0 = performance.now();
  const env = o.env.some(e => e.startsWith('PYTHONPATH=')) ? o.env : [...o.env, `PYTHONPATH=${dir}`]; // editable installs would import the original tree
  const argv = [o.runner, '--cwd', dir, '--rw', dir, '--timeout', String(o.timeout), ...o.ro.flatMap(p => ['--ro', p]), ...env.flatMap(e => ['--env', e]),
    '--', 'sh', '-c', command];
  return new Promise(done => {
    // the runner enforces --timeout itself (124); this is only a backstop against a hung runner
    const p = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], timeout: (o.timeout + KILL_GRACE_SEC) * 1000, killSignal: 'SIGKILL' });
    let tail = '';
    for (const s of [p.stdout, p.stderr]) { s.setEncoding('utf8'); s.on('data', d => (tail = (tail + d).slice(-TAIL * 4))); }
    const end = exit => done({ exit, sec: Math.round((performance.now() - t0) / 100) / 10, tail: tail.trim().slice(-TAIL), run: /ZT-RUN (\S+) exit=/.exec(tail)?.[1] });
    p.on('error', e => { tail = e.message; end(1); });
    p.on('close', code => end(code ?? TIMEOUT));
  });
}

export async function pool(items, n, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

export function backendOf(runner) {
  const r = spawnSync(process.execPath, [runner, '--check'], { encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].slice(0, 40) || 'sandbox' : 'none';
}
