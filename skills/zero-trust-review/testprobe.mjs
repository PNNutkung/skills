#!/usr/bin/env node
// Real-execution probe for zero-trust-review: runs the CHANGED test files for real so a review states facts, not guesses.
//   (a) pass-after: each file on the HEAD tree; (b) fail-before: the same HEAD file on a tree whose changed non-test source is restored
//   to BASE (still passing there = verdict no-signal); (c) flake: N extra concurrent HEAD runs (differing exit codes = nondeterministic).
// Every test command is untrusted code and runs ONLY through the sandbox runner (exit 86 = no sandbox, 124 = timeout). REPO is only read.
//   node testprobe.mjs --repo DIR --base REV --head REV --scratch DIR --cmd 'pytest -q {file}' [--tests a,b] [--flake 3] [--jobs 4]
//     [--timeout 120] [--link NAME]... [--ro DIR]... [--env K=V]... [--runner PATH]   (--ro: extra read-only dirs, e.g. the interpreter install behind a venv)
// Prints one JSON object and exits 0 (results are data); usage errors exit 2.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const NO_SANDBOX = 86, TIMEOUT = 124, TAIL = 200, MAX_LINES = 6, KILL_GRACE_SEC = 10;
const TEST = /(^|\/)(tests?|__tests__|specs?|e2e|cypress|playwright)\/|(^|\/)(test_|conftest)[^/]*$|[_.](test|spec)\.\w+$/i; // same as triage.py
const DOC = /\.(md|json|ya?ml|toml|ini|cfg)$/i;
const isSource = p => !TEST.test(p) && !DOC.test(p) && !basename(p).toLowerCase().includes('config');
const shq = s => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`); // file names come from the branch under review

function parse() {
  const str = { type: 'string' }, many = { type: 'string', multiple: true, default: [] };
  const { values: v } = parseArgs({ options: { repo: str, base: str, head: str, scratch: str, cmd: str, tests: str, runner: str, link: many, ro: many, env: many,
    flake: { ...str, default: '3' }, jobs: { ...str, default: '4' }, timeout: { ...str, default: '120' } } });
  for (const k of ['repo', 'base', 'head', 'scratch', 'cmd']) if (!v[k]) throw new Error(`--${k} is required`);
  if (!v.cmd.includes('{file}')) throw new Error('--cmd must contain {file}');
  const int = (k, min) => { const n = Number(v[k]); if (!Number.isInteger(n) || n < min) throw new Error(`--${k} must be an integer >= ${min}`); return n; };
  const rel = p => { const n = normalize(p).replace(/\/+$/, ''); if (n === '.' || isAbsolute(n) || n.split('/').includes('..')) throw new Error(`path must stay inside the repo: ${p}`); return n; };
  for (const e of v.env) if (!/^[A-Za-z_]\w*=/.test(e)) throw new Error(`--env wants K=V, got ${e}`);
  const runner = resolve(v.runner ?? join(dirname(fileURLToPath(import.meta.url)), 'sandbox-run.mjs'));
  if (!existsSync(runner)) throw new Error(`runner not found: ${runner}`);
  const repo = resolve(v.repo);
  return { repo, base: v.base, head: v.head, scratch: resolve(v.scratch), cmd: v.cmd, runner, env: v.env, link: v.link.map(rel), extraRo: v.ro.map(p => resolve(p)),
    tests: v.tests?.split(',').filter(Boolean).map(rel), flake: int('flake', 0), jobs: int('jobs', 1), timeout: int('timeout', 1) };
}

// An editable install (pip -e) imports from absolute directories listed in site-packages/*.pth. The sandbox reads only what it is granted, so grant
// those directories read-only, but only when they sit inside the repo under review: a .pth line that points anywhere else is ignored.
function editableRoots(linked, repo) {
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

const gitOut = (repo, args) => {
  try { return execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { throw new Error(`git ${args[0]}: ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
};

// old-side mode/blob of everything changed since the merge base, so BASE content needs no merge-base lookup of its own
function changes(repo, base, head) {
  const t = gitOut(repo, ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', `${base}...${head}`, '--']).toString().split('\0');
  const out = [];
  for (let i = 0; i + 1 < t.length; i += 2) {
    const [mode, , sha, , status] = t[i].slice(1).split(' ');
    out.push({ path: t[i + 1], mode, sha, status: status[0] });
  }
  return out;
}

const exited = p => new Promise(r => { p.on('error', e => r(e.message)); p.on('close', r); });
async function extract(repo, rev, dir) {
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
function ensureDir(root, rel) {
  let p = root;
  for (const c of rel.split('/').filter(c => c && c !== '.')) {
    p = join(p, c);
    const st = lstatSync(p, { throwIfNoEntry: false });
    if (!st) mkdirSync(p);
    else if (!st.isDirectory()) throw new Error(`refusing to write through ${p}`);
  }
}
const clear = (root, path) => { ensureDir(root, dirname(path)); rmSync(join(root, path), { recursive: true, force: true }); };

// deletes first: an A entry may be the symlink/file a restored directory has to replace
function restore(repo, copy, srcChanges) {
  for (const c of srcChanges) if (c.status === 'A') clear(copy, c.path);
  for (const c of srcChanges) {
    if (c.status === 'A' || c.mode === '160000') continue; // 160000 = submodule, no blob
    clear(copy, c.path);
    const blob = gitOut(repo, ['cat-file', 'blob', c.sha]), dest = join(copy, c.path);
    if (c.mode === '120000') symlinkSync(blob.toString(), dest);
    else { writeFileSync(dest, blob); chmodSync(dest, c.mode === '100755' ? 0o755 : 0o644); }
  }
}

function run(o, copy, file) {
  const t0 = performance.now();
  const env = o.env.some(e => e.startsWith('PYTHONPATH=')) ? o.env : [...o.env, `PYTHONPATH=${copy}`]; // editable installs would import the original tree
  const argv = [o.runner, '--cwd', copy, '--rw', copy, '--timeout', String(o.timeout), ...o.ro.flatMap(p => ['--ro', p]), ...env.flatMap(e => ['--env', e]),
    '--', 'sh', '-c', o.cmd.replaceAll('{file}', () => shq(file))];
  return new Promise(done => {
    // the runner enforces --timeout itself (124); this is only a backstop against a hung runner
    const p = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], timeout: (o.timeout + KILL_GRACE_SEC) * 1000, killSignal: 'SIGKILL' });
    let tail = '';
    for (const s of [p.stdout, p.stderr]) { s.setEncoding('utf8'); s.on('data', d => (tail = (tail + d).slice(-TAIL * 4))); }
    const end = exit => done({ exit, sec: Math.round((performance.now() - t0) / 100) / 10, tail: tail.trim().slice(-TAIL) });
    p.on('error', e => { tail = e.message; end(1); });
    p.on('close', code => end(code ?? TIMEOUT));
  });
}

function judge(h, b, noSource) {
  if (h === NO_SANDBOX || b === NO_SANDBOX) return ['unverifiable', 'no sandbox'];
  if (h === TIMEOUT) return ['unverifiable', 'timeout'];
  if (h !== 0) return ['fails-on-head'];
  if (b === TIMEOUT) return ['unverifiable', 'timeout'];
  if (b !== 0) return ['exercises-change'];
  return ['no-signal', noSource ? 'no changed source files' : undefined];
}

async function probeOne(o, dirs, file) {
  const [head, base, ...flakes] = await Promise.all([run(o, dirs.head, file), run(o, dirs.base, file), ...Array.from({ length: o.flake }, () => run(o, dirs.head, file))]);
  const [verdict, reason] = judge(head.exit, base.exit, o.noSource), exits = flakes.map(r => r.exit);
  const slim = ({ exit, sec }) => ({ exit, sec });
  return { file, head: slim(head), base: slim(base), verdict, ...(reason && { reason }), ...(verdict === 'fails-on-head' && { tail: head.tail }),
    flake: { runs: o.flake, exits, nondeterministic: new Set([head.exit, ...exits]).size > 1 } };
}

async function pool(items, n, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

function summarize(tests) {
  if (!tests.length) return 'no changed test files';
  const n = {};
  for (const t of tests) n[t.verdict] = (n[t.verdict] ?? 0) + 1;
  const lines = [`${tests.length} test file(s): ${Object.entries(n).map(([k, c]) => `${c} ${k}`).join(', ')}`];
  if (tests.some(t => t.reason === 'no sandbox')) lines.push('no sandbox available: tests were not run');
  for (const t of tests) {
    const flaky = t.flake.nondeterministic;
    if (t.reason === 'no sandbox' || (t.verdict === 'exercises-change' && !flaky)) continue;
    lines.push(`${t.file}: ${t.verdict}${t.reason ? ` (${t.reason})` : ''}${flaky ? `, nondeterministic (exits ${t.flake.exits})` : ''}`);
  }
  return (lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), `+${lines.length - MAX_LINES + 1} more`] : lines).join('\n');
}

function backendOf(runner) {
  const r = spawnSync(process.execPath, [runner, '--check'], { encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].slice(0, 40) || 'sandbox' : 'none';
}

async function main() {
  const o = parse();
  const changed = changes(o.repo, o.base, o.head), sources = changed.filter(c => isSource(c.path));
  const files = o.tests ?? changed.filter(c => c.status !== 'D' && TEST.test(c.path) && !DOC.test(c.path)).map(c => c.path);
  let backend = backendOf(o.runner), tests = [];
  if (files.length) {
    mkdirSync(o.scratch, { recursive: true });
    const scratch = realpathSync(o.scratch);
    const dirs = { head: mkdtempSync(join(scratch, 'head-')), base: mkdtempSync(join(scratch, 'base-')) };
    const linked = o.link.map(name => realpathSync(join(o.repo, name)));
    o.ro = [...linked, ...editableRoots(linked, o.repo), ...o.extraRo];  // linked dirs first: the symlink loop below indexes them
    await Promise.all([extract(o.repo, o.head, dirs.head), extract(o.repo, o.head, dirs.base)]);
    restore(o.repo, dirs.base, sources);
    o.link.forEach((name, i) => { for (const d of Object.values(dirs)) { clear(d, name); symlinkSync(o.ro[i], join(d, name)); } });
    o.noSource = !sources.length;
    tests = await pool(files, o.jobs, f => probeOne(o, dirs, f));
  }
  if (tests.some(t => t.head.exit === NO_SANDBOX || t.base.exit === NO_SANDBOX)) backend = 'none';
  process.stdout.write(JSON.stringify({ backend, tests, summary: summarize(tests) }) + '\n');
}

main().catch(e => { console.error(`testprobe: ${e.message}`); process.exit(2); });
