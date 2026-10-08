// Tests for note.mjs, the sanctioned note writer for review agents. Run: node --test note.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activate } from './runctx.mjs';
import { checkToolEnv } from './note.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOTE = join(HERE, 'note.mjs');
// runctx.mjs trusts a run dir only if it is ours, closed to other users and (for --run / ZT_RUN_DIR) under <tmpdir>/zt-review-<uid>/ or the marker's
// target. So: a private TMPDIR, run dirs made by runctx.activate under it, and a marker dir that does not exist unless a test makes one.
const ISO = mkdtempSync(join(tmpdir(), 'zt-note-iso-'));
process.env.TMPDIR = ISO;
process.env.ZT_MARKER_DIR = join(ISO, 'no-marker');
// vars the tool refuses to start with (see checkToolEnv): stripped here so a host that sets one cannot fail the whole suite
const POISON = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'BASH_ENV', 'ENV', 'PERL5OPT', 'RUBYOPT', 'PYTHONSTARTUP', 'PYTHONHOME'];
const { ZT_RUN_DIR: _r, ...CLEAN_ENV } = Object.fromEntries(Object.entries(process.env).filter(([k]) => !POISON.includes(k)));
const UID = process.getuid();
const BASE = join(ISO, `zt-review-${UID}`);
const note = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [NOTE, ...args], { encoding: 'utf8', env: { ...CLEAN_ENV, ...env }, cwd });
const mk = () => mkdtempSync(join(ISO, 'd-'));
let runs = 0; // each run dir is made the way production makes it; its marker goes to a scratch dir the CLI under test never reads
const mkRun = () => activate(`r-${process.pid}-${runs++}`, { tmp: ISO, env: { ZT_MARKER_DIR: join(ISO, 'scratch-marker') } });
after(() => rmSync(ISO, { recursive: true, force: true }));

const lines = s => s.split('\n').filter(Boolean);
const jsonl = f => lines(readFileSync(f, 'utf8')).map(l => JSON.parse(l));
const ls = d => readdirSync(d).sort();
const isIso = t => typeof t === 'string' && new Date(t).toISOString() === t && Math.abs(Date.now() - Date.parse(t)) < 60e3;
const num = (prefix, n) => Array.from({ length: n }, (_, i) => JSON.stringify({ u: 'x', text: `${prefix}${i}` })).join('\n') + '\n';
const mode = f => statSync(f).mode & 0o777;
// every path under dir (symlinks not followed) with its content: a before/after fingerprint
const snap = (dir, out = {}) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), st = lstatSync(p);
    out[p] = st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : readFileSync(p, 'utf8');
    if (st.isDirectory()) snap(p, out);
  }
  return out;
};
// a per-user marker dir (0700) holding .active (0600) that names runDir
const withMarker = (runDir, ageH = 0, { dirMode = 0o700, fileMode = 0o600 } = {}) => {
  const md = join(mk(), 'marker'), f = join(md, '.active');
  mkdirSync(md, { mode: 0o700 });
  writeFileSync(f, `${runDir}\nignored\n`, { mode: 0o600 });
  chmodSync(f, fileMode);
  chmodSync(md, dirMode);
  if (ageH) { const t = new Date(Date.now() - ageH * 3600e3); utimesSync(f, t, t); }
  return { ZT_MARKER_DIR: md };
};

test('begin: ck content, then env tail (15), then with --driver notes tail (15), each under an untrusted header; logs start', () => {
  const run = mkRun(), ck = join(run, 'ck', 'u1.jsonl');
  mkdirSync(dirname(ck));
  writeFileSync(ck, '{"a":1}\n{"a":2}\n');
  writeFileSync(join(run, 'env.jsonl'), num('e', 20));
  writeFileSync(join(run, 'notes.jsonl'), num('n', 20));

  const r = note(['begin', '--unit', 'u1', '--ck', ck, '--run', run]);
  assert.equal(r.status, 0, r.stderr);
  const at = s => r.stdout.indexOf(s);
  assert.ok(at('"a":1') >= 0 && at('"a":1') < at('"a":2'));
  assert.ok(at('"a":2') < at('"text":"e5"'), 'ck before env');
  assert.equal(r.stdout.match(/"text":"e\d+"/g).length, 15);
  assert.equal(at('"text":"e4"'), -1);
  assert.ok(at('"text":"e19"') > 0);
  assert.equal(at('"text":"n'), -1, 'notes only with --driver');
  const heads = r.stdout.match(/^== .* ==$/gm);
  assert.deepEqual(heads.map(h => h.replace(/ \(untrusted data\)/, '')), ['== checkpoint ==', '== env tips ==']);
  assert.ok(heads.every(h => h.includes('untrusted')));

  const d = note(['begin', '--unit', 'u1', '--ck', ck, '--run', run, '--driver']);
  assert.equal(d.status, 0, d.stderr);
  const e = d.stdout.indexOf('"text":"e19"'), n = d.stdout.indexOf('"text":"n5"');
  assert.ok(e > 0 && n > e, 'notes after env');
  assert.equal(d.stdout.match(/"text":"n\d+"/g).length, 15);
  assert.equal(d.stdout.match(/^== .* ==$/gm).length, 3);

  const status = jsonl(join(run, 'status.jsonl'));
  assert.deepEqual(status.map(({ t, ...s }) => s), [{ u: 'u1', s: 'start' }, { u: 'u1', s: 'start' }]);
  assert.ok(status.every(s => isIso(s.t)));
  assert.equal(existsSync(join(run, 'dying')), true);
});

test('begin on a fresh run: prints nothing, creates RUN/dying and the ck dirs (0700), logs start; status.jsonl is 0600', () => {
  const run = mkRun(), ck = join(run, 'ck', 'deep', 'er', 'u.jsonl');
  const r = note(['begin', '--unit', 'u', '--ck', ck, '--run', run]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(mode(join(run, 'dying')), 0o700);
  assert.equal(mode(dirname(ck)), 0o700);
  assert.equal(existsSync(ck), false);
  assert.equal(jsonl(join(run, 'status.jsonl')).length, 1);
  assert.equal(mode(join(run, 'status.jsonl')), 0o600);
});

test('ck: appends one JSON object per call as a single line (0600)', () => {
  const run = mkRun(), ck = join(run, 'ck', 'c.jsonl');
  assert.equal(note(['ck', '--ck', ck, '--run', run, '{"a":1}']).status, 0);
  assert.equal(note(['ck', '--ck', ck, '--run', run, '{"x": {"y": [1, 2]},\n "z": "multi\\nline"}']).status, 0);
  assert.equal(lines(readFileSync(ck, 'utf8')).length, 2);
  assert.deepEqual(jsonl(ck), [{ a: 1 }, { x: { y: [1, 2] }, z: 'multi\nline' }]);
  assert.ok(readFileSync(ck, 'utf8').endsWith('\n'));
  assert.equal(mode(ck), 0o600);
});

test('ck: rejects non-objects, malformed JSON and over 4000 chars; writes nothing', () => {
  const run = mkRun(), ck = join(run, 'ck', 'c.jsonl');
  for (const bad of ['not json', '[1]', 'null', '1', '"s"', '{"a":', '']) {
    const r = note(['ck', '--ck', ck, '--run', run, bad]);
    assert.equal(r.status, 2, JSON.stringify(bad));
    assert.match(r.stderr, /JSON object/i);
  }
  const pad = n => `{"p":"${'x'.repeat(n - 8)}"}`;
  assert.equal(pad(4001).length, 4001);
  assert.equal(note(['ck', '--ck', ck, '--run', run, pad(4001)]).status, 2);
  assert.deepEqual(ls(run), []);
  assert.equal(note(['ck', '--ck', ck, '--run', run, pad(4000)]).status, 0);
  assert.equal(jsonl(ck).length, 1);
});

test('env and notes: {u,text} lines; text over 200 chars is cut to 200 ending "..."; 4th line per unit exits 4; units and files are independent', () => {
  const run = mkRun();
  for (const [cmd, file] of [['env', 'env.jsonl'], ['notes', 'notes.jsonl']]) {
    const f = join(run, file), go = (u, text) => note([cmd, '--unit', u, '--run', run, text]);
    assert.equal(go('u1', 'tip one').status, 0);
    assert.equal(go('u1', 'x'.repeat(250)).status, 0);
    assert.equal(go('u1', 'y'.repeat(200)).status, 0);
    assert.deepEqual(jsonl(f)[0], { u: 'u1', text: 'tip one' });
    assert.deepEqual(Object.keys(jsonl(f)[0]), ['u', 'text']);
    assert.equal(jsonl(f)[1].text, `${'x'.repeat(197)}...`);
    assert.equal(jsonl(f)[2].text, 'y'.repeat(200));
    const over = go('u1', 'fourth');
    assert.equal(over.status, 4, cmd);
    assert.match(over.stderr, /limit/i);
    assert.equal(jsonl(f).length, 3);
    assert.equal(go('u2', 'other unit').status, 0);
    assert.equal(jsonl(f).length, 4);
    assert.equal(mode(f), 0o600);
  }
  assert.equal(jsonl(join(run, 'env.jsonl')).filter(x => x.u === 'u1').length, 3, 'env and notes limits do not share a counter');
});

test('done: appends {u, s:"done", t} to status.jsonl; the tool adds the ISO timestamp', () => {
  const run = mkRun();
  assert.equal(note(['done', '--unit', 'u1', '--run', run]).status, 0);
  const [row] = jsonl(join(run, 'status.jsonl'));
  assert.deepEqual(Object.keys(row), ['u', 's', 't']);
  assert.equal(row.s, 'done');
  assert.ok(isIso(row.t));
});

test('dying: writes dying/ID.md (ID sanitized, 0600), logs dying, truncates past 1500 chars, overwrites an earlier note', () => {
  const run = mkRun();
  const md = '# stuck\n- tried `x`\n- next: y';
  assert.equal(note(['dying', '--unit', 'a:b.c', '--run', run, md]).status, 0);
  assert.equal(readFileSync(join(run, 'dying', 'a_b.c.md'), 'utf8'), md);
  assert.equal(mode(join(run, 'dying', 'a_b.c.md')), 0o600);
  assert.deepEqual(jsonl(join(run, 'status.jsonl')).map(({ t, ...s }) => s), [{ u: 'a:b.c', s: 'dying' }]);
  assert.equal(note(['dying', '--unit', 'a:b.c', '--run', run, 'second']).status, 0);
  assert.equal(readFileSync(join(run, 'dying', 'a_b.c.md'), 'utf8'), 'second');
  assert.equal(note(['dying', '--unit', 'big', '--run', run, 'z'.repeat(5000)]).status, 0);
  const big = readFileSync(join(run, 'dying', 'big.md'), 'utf8');
  assert.equal(big.length, 1500);
  assert.ok(big.endsWith('...'));
  assert.deepEqual(ls(join(run, 'dying')), ['a_b.c.md', 'big.md']);
});

test('unit IDs are [A-Za-z0-9._:-]{1,80}; anything else exits 2 and writes nothing', () => {
  const run = mkRun();
  for (const bad of ['', 'a b', '../x', 'a/b', 'a;b', 'a$(x)', 'a\nb', 'é', 'x'.repeat(81)]) {
    for (const cmd of [['env', '--unit', bad, 'hi'], ['notes', '--unit', bad, 'hi'], ['done', '--unit', bad], ['dying', '--unit', bad, 'hi'], ['begin', '--unit', bad, '--ck', join(run, 'ck', 'c.jsonl')]]) {
      const r = note([...cmd, '--run', run]);
      assert.equal(r.status, 2, JSON.stringify([bad, cmd[0]]));
    }
  }
  assert.deepEqual(ls(run), []);
  for (const ok of ['A-1_b.c:d', 'x'.repeat(80), '.', '..']) assert.equal(note(['done', '--unit', ok, '--run', run]).status, 0, ok);
});

test('usage errors exit 2: no/unknown subcommand, missing --unit/--ck/--name/value', () => {
  const run = mkRun();
  for (const args of [[], ['bogus'], ['constructor'], ['env', 'hi'], ['env', '--unit', 'u'], ['done'], ['begin', '--unit', 'u'], ['ck', '{"a":1}'], ['ck', '--ck', join(run, 'ck', 'c')], ['env', '--unit'], ['activate'], ['done', '--unit', 'u', 'extra']]) {
    assert.equal(note([...args, '--run', run]).status, 2, JSON.stringify(args));
  }
  assert.deepEqual(ls(run), []);
});

// ck allow-list: only RUN/ck/**.jsonl. Everything else a prompt-injected agent might aim at must exit 3 and change nothing.
function fixtures() {
  const run = mkRun(), outside = mk();
  writeFileSync(join(outside, 'secret'), 'SECRET-CONTENT\n');
  mkdirSync(join(outside, 'sub'));
  for (const f of ['exec.jsonl', 'obs.jsonl', 'status.jsonl', 'hook-errors.log']) writeFileSync(join(run, f), `ORIGINAL ${f}\n`);
  mkdirSync(join(run, 'ck'));
  symlinkSync(outside, join(run, 'dirlink'));
  symlinkSync(outside, join(run, 'ck', 'dirlink'));
  symlinkSync(join(outside, 'sub', 'dangling'), join(run, 'ck', 'dangling.jsonl'));
  symlinkSync(join(outside, 'secret'), join(run, 'ck', 'filelink.jsonl'));
  symlinkSync(join(run, 'exec.jsonl'), join(run, 'ck', 'toexec.jsonl')); // inside the run, but not in ck/
  const cases = {
    'obs.jsonl': join(run, 'obs.jsonl'),
    'exec.jsonl': join(run, 'exec.jsonl'),
    'hook-errors.log': join(run, 'hook-errors.log'),
    'status.jsonl': join(run, 'status.jsonl'),
    'env.jsonl': join(run, 'env.jsonl'),
    'notes.jsonl': join(run, 'notes.jsonl'),
    'a .jsonl directly in the run dir': join(run, 'c.jsonl'),
    'dying/u.md': join(run, 'dying', 'u.md'),
    'ck/../exec.jsonl': `${run}/ck/../exec.jsonl`,
    'not .jsonl: ck/notes.txt': join(run, 'ck', 'notes.txt'),
    'not .jsonl: ck/x.jsonl.txt': join(run, 'ck', 'x.jsonl.txt'),
    'not .jsonl: ck/log': join(run, 'ck', 'log'),
    'the ck dir itself': join(run, 'ck'),
    'ck symlink to exec.jsonl': join(run, 'ck', 'toexec.jsonl'),
    'ck dir symlink out': join(run, 'ck', 'dirlink', 'c.jsonl'),
    'ck dir symlink out, missing parents': join(run, 'ck', 'dirlink', 'new', 'c.jsonl'),
    'ck dangling file symlink out': join(run, 'ck', 'dangling.jsonl'),
    'ck file symlink to existing outside file': join(run, 'ck', 'filelink.jsonl'),
    'run dir symlink out': join(run, 'dirlink', 'ck', 'c.jsonl'),
    'dotdot to a sibling dir': `${run}/../${outside.split('/').pop()}/c.jsonl`,
    'dotdot far up': `${run}/../../../../../../../../tmp/zt-note-escape.jsonl`,
    'absolute elsewhere': join(outside, 'c.jsonl'),
    'absolute, missing parents': join(outside, 'a', 'b', 'c.jsonl'),
    'the run dir itself': run,
  };
  return { run, outside, cases };
}

test('--ck allow-list (ck and begin): anything but RUN/ck/**.jsonl exits 3; nothing written, created, followed or read', () => {
  const { run, outside, cases } = fixtures();
  const before = [snap(run), snap(outside)];
  for (const [name, path] of Object.entries(cases)) {
    const c = note(['ck', '--ck', path, '--run', run, '{"u":"x","s":"done"}']);
    assert.equal(c.status, 3, `ck: ${name}: ${c.stderr}`);
    const b = note(['begin', '--unit', 'u', '--ck', path, '--run', run, '--driver']);
    assert.equal(b.status, 3, `begin: ${name}: ${b.stderr}`);
    assert.doesNotMatch(b.stdout + b.stderr, /SECRET-CONTENT|ORIGINAL/, name);
  }
  assert.deepEqual([snap(run), snap(outside)], before);
  assert.equal(existsSync('/tmp/zt-note-escape.jsonl'), false);
});

test('--ck inside RUN/ck/ with .jsonl works, nested dirs included', () => {
  const run = mkRun();
  for (const p of ['a.jsonl', 'sub/b.jsonl', 'sub/deeper/c.jsonl']) assert.equal(note(['ck', '--ck', join(run, 'ck', p), '--run', run, '{"a":1}']).status, 0, p);
  assert.deepEqual(ls(join(run, 'ck')), ['a.jsonl', 'sub']);
});

test('a relative --ck resolves against the cwd: ck/x.jsonl is fine, ../ out of the run and a path outside ck/ are exit 3', () => {
  const run = mkRun();
  assert.equal(note(['ck', '--ck', 'ck/rel.jsonl', '--run', run, '{"a":1}'], { cwd: run }).status, 0);
  assert.equal(jsonl(join(run, 'ck', 'rel.jsonl')).length, 1);
  assert.equal(note(['ck', '--ck', '../ck.jsonl', '--run', run, '{"a":1}'], { cwd: run }).status, 3);
  assert.equal(note(['ck', '--ck', 'rel.jsonl', '--run', run, '{"a":1}'], { cwd: run }).status, 3);
  assert.equal(existsSync(join(dirname(run), 'ck.jsonl')), false);
  assert.deepEqual(ls(run), ['ck']);
});

test("the tool's own files must be real files: a symlink planted at status/env/notes/dying, even one aimed inside the run, exits 3 and is never followed", () => {
  const run = mkRun(), outside = mk(), victim = join(outside, 'victim');
  writeFileSync(victim, 'untouched\n');
  writeFileSync(join(run, 'exec.jsonl'), 'EXEC\n');
  symlinkSync(victim, join(run, 'status.jsonl'));
  symlinkSync(join(run, 'exec.jsonl'), join(run, 'env.jsonl'));
  symlinkSync(victim, join(run, 'notes.jsonl'));
  symlinkSync(outside, join(run, 'dying'));
  for (const args of [['done', '--unit', 'u'], ['env', '--unit', 'u', 'hi'], ['notes', '--unit', 'u', 'hi'], ['dying', '--unit', 'u', 'hi'], ['begin', '--unit', 'u', '--ck', join(run, 'ck', 'c.jsonl')]]) {
    assert.equal(note([...args, '--run', run]).status, 3, args[0]);
  }
  assert.equal(readFileSync(victim, 'utf8'), 'untouched\n');
  assert.equal(readFileSync(join(run, 'exec.jsonl'), 'utf8'), 'EXEC\n');
  assert.deepEqual(ls(outside), ['victim']);
});

test('a symlinked run dir is not trusted: exit 3, nothing written through it', () => {
  const real = mkRun(), link = join(BASE, `link-${process.pid}`);
  symlinkSync(real, link);
  for (const args of [['ck', '--ck', join(link, 'ck', 'c.jsonl'), '{"a":1}'], ['done', '--unit', 'u'], ['env', '--unit', 'u', 'hi']]) {
    assert.equal(note([...args, '--run', link]).status, 3, args[0]);
  }
  assert.deepEqual(ls(real), []);
});

test('run dir resolution: --run beats ZT_RUN_DIR beats a fresh marker; an unapproved --run (any other dir we own) is skipped; stale/open marker or none exits 3', () => {
  const [viaFlag, viaEnv] = [mkRun(), mkRun()], viaMarker = mk(), other = mk();
  const marker = withMarker(viaMarker), go = (extra, env) => note(['env', '--unit', 'u', ...extra, 'tip'], { env: { ...marker, ...env } });
  assert.equal(go(['--run', viaFlag], { ZT_RUN_DIR: viaEnv }).status, 0);
  assert.equal(go([], { ZT_RUN_DIR: viaEnv }).status, 0);
  assert.equal(go([], {}).status, 0);
  assert.equal(go(['--run', viaMarker], {}).status, 0); // outside the base, but it IS the marker's own target
  assert.deepEqual([viaFlag, viaEnv, viaMarker].map(d => jsonl(join(d, 'env.jsonl')).length), [1, 1, 2]);

  // skipped, not used: with a marker the write lands in the marker's run, without one it fails
  assert.equal(go(['--run', other], { ZT_RUN_DIR: other }).status, 0);
  assert.equal(jsonl(join(viaMarker, 'env.jsonl')).length, 3);
  assert.deepEqual(ls(other), []);
  const bare = note(['env', '--unit', 'u', '--run', other, 'tip']);
  assert.equal(bare.status, 3);
  assert.match(bare.stderr, /run dir/i);
  assert.deepEqual(ls(other), []);

  for (const env of [withMarker(viaMarker, 13), withMarker(viaMarker, 0, { fileMode: 0o666 }), withMarker(viaMarker, 0, { dirMode: 0o777 }), {}]) {
    const r = note(['done', '--unit', 'u'], { env });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /run dir/i);
  }
});

test('a world-writable run dir is never used, even under the base', () => {
  const run = mkRun();
  chmodSync(run, 0o777);
  assert.equal(note(['done', '--unit', 'u', '--run', run]).status, 3);
  assert.deepEqual(ls(run), []);
});

test('input is data: shell syntax in text, ids and paths is stored or rejected, never executed', () => {
  const run = mkRun(), text = '$(touch PWNED) `touch PWNED`; touch PWNED && echo $HOME \\n "q"';
  assert.equal(note(['env', '--unit', 'u', '--run', run, text], { cwd: run }).status, 0);
  assert.equal(jsonl(join(run, 'env.jsonl'))[0].text, text);
  assert.equal(note(['dying', '--unit', 'u', '--run', run, text], { cwd: run }).status, 0);
  assert.equal(readFileSync(join(run, 'dying', 'u.md'), 'utf8'), text);
  assert.equal(note(['ck', '--ck', join(run, 'ck', '$(touch PWNED).jsonl'), '--run', run, '{"a":"$(touch PWNED)"}'], { cwd: run }).status, 0);
  assert.equal(existsSync(join(run, 'PWNED')), false);
  assert.equal(existsSync(join(run, 'ck', '$(touch PWNED).jsonl')), true);
});

// --- activate / deactivate ---
const act = (name, tmp, md, extra = [], env = {}) => note(['activate', '--name', name, ...extra], { env: { TMPDIR: tmp, ZT_MARKER_DIR: md, ...env } });

test('activate: creates <tmp>/zt-review-<uid>/NAME (0700) and the 0600 marker, prints the run dir; later commands find it with no --run; deactivate removes the marker', () => {
  const tmp = mk(), md = join(mk(), 'marker'), env = { TMPDIR: tmp, ZT_MARKER_DIR: md };
  const r = act('n1', tmp, md);
  assert.equal(r.status, 0, r.stderr);
  const dir = join(realpathSync(tmp), `zt-review-${UID}`, 'n1');
  assert.equal(r.stdout, `${dir}\n`);
  assert.equal(mode(dir), 0o700);
  assert.equal(mode(md), 0o700);
  assert.equal(readFileSync(join(md, '.active'), 'utf8'), `${dir}\n`);
  assert.equal(mode(join(md, '.active')), 0o600);
  assert.equal(readFileSync(join(dir, '.skilldir'), 'utf8'), `${realpathSync(HERE)}\n`, 'the dir that holds note.mjs, one line');
  assert.equal(mode(join(dir, '.skilldir')), 0o600);
  assert.equal(note(['env', '--unit', 'u', 'tip'], { env }).status, 0);
  assert.equal(jsonl(join(dir, 'env.jsonl')).length, 1);
  assert.equal(act('n1', tmp, md).stdout, `${dir}\n`, 'idempotent for the same name');

  assert.equal(note(['deactivate', '--run', dir], { env }).status, 0);
  assert.equal(existsSync(join(md, '.active')), false);
  assert.equal(readFileSync(join(dir, '.skilldir'), 'utf8'), `${realpathSync(HERE)}\n`, 'deactivate leaves .skilldir');
  assert.equal(note(['env', '--unit', 'u', 'tip'], { env }).status, 3);
});

test('activate refuses a .skilldir that is a planted symlink: nothing written through it, no marker left behind', () => {
  const tmp = mk(), md = join(mk(), 'marker'), victim = join(mk(), 'victim');
  writeFileSync(victim, 'untouched\n');
  const dir = join(realpathSync(tmp), `zt-review-${UID}`, 'n');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
  symlinkSync(victim, join(dir, '.skilldir'));
  const r = act('n', tmp, md);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /refused/);
  assert.equal(readFileSync(victim, 'utf8'), 'untouched\n');
  assert.equal(existsSync(join(md, '.active')), false);
});

test('activate has no --tmp or other way to choose the base: the run dir is always under os.tmpdir()', () => {
  const [tmp, other, md] = [mk(), mk(), join(mk(), 'marker')];
  const r = act('n', tmp, md, ['--tmp', other], { ZT_TESTS_ONLY: '1' });
  assert.equal(r.status, 2);
  assert.deepEqual(ls(other), []);
  assert.equal(act('n', tmp, md).stdout, `${join(realpathSync(tmp), `zt-review-${UID}`, 'n')}\n`);
});

test('activate rejects bad names (exit 2, nothing created) and refuses unsafe places (exit 3)', () => {
  const tmp = mk(), md = join(mk(), 'marker');
  for (const bad of ['../x', 'a b', 'a/b', '', '.', '..', 'x'.repeat(121), '$(x)']) assert.equal(act(bad, tmp, md).status, 2, JSON.stringify(bad));
  assert.deepEqual(ls(tmp), []);
  assert.equal(existsSync(md), false);

  const open = mk(); // base dir open to other users
  mkdirSync(join(open, `zt-review-${UID}`));
  chmodSync(join(open, `zt-review-${UID}`), 0o777);
  const r = act('n', open, md);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /refused/);

  const linked = mk(), target = mk(); // base dir that is a symlink
  symlinkSync(target, join(linked, `zt-review-${UID}`));
  assert.equal(act('n', linked, md).status, 3);
  assert.deepEqual(ls(target), []);

  const t2 = mk(), outside = mk(); // run name pre-planted as a symlink
  mkdirSync(join(t2, `zt-review-${UID}`), { mode: 0o700 });
  symlinkSync(outside, join(t2, `zt-review-${UID}`, 'n'));
  assert.equal(act('n', t2, md).status, 3);
  assert.deepEqual(ls(outside), []);
  assert.equal(existsSync(md), false, 'no marker for a refused run');

  const t3 = mk(), openMd = mk(); // marker dir open to other users
  chmodSync(openMd, 0o777);
  assert.equal(act('n', t3, openMd).status, 3);
  assert.equal(existsSync(join(openMd, '.active')), false);
});

test('activate replaces a planted marker symlink without writing through it', () => {
  const tmp = mk(), md = mk(), victim = join(mk(), 'victim');
  writeFileSync(victim, 'untouched\n');
  symlinkSync(victim, join(md, '.active'));
  assert.equal(act('n', tmp, md).status, 0);
  assert.equal(readFileSync(victim, 'utf8'), 'untouched\n');
  assert.equal(lstatSync(join(md, '.active')).isSymbolicLink(), false);
});

test('deactivate removes the marker only if it still points at that run; an unsafe or missing --run exits 3', () => {
  const tmp = mk(), md = join(mk(), 'marker'), env = { TMPDIR: tmp, ZT_MARKER_DIR: md };
  const n1 = act('n1', tmp, md).stdout.trim(), n2 = act('n2', tmp, md).stdout.trim(); // marker now names n2
  assert.equal(note(['deactivate', '--run', n1], { env }).status, 0);
  assert.equal(readFileSync(join(md, '.active'), 'utf8'), `${n2}\n`);
  assert.equal(note(['deactivate', '--run', join(tmp, 'nope')], { env }).status, 3);
  assert.equal(existsSync(join(md, '.active')), true);
  assert.equal(note(['deactivate', '--run', n2], { env }).status, 0);
  assert.equal(existsSync(join(md, '.active')), false);
  assert.equal(note(['deactivate'], { env }).status, 3, 'nothing active, nothing named');
});

// values the dynamic loader / node accept at startup, so the process reaches our check (an invalid LD_PRELOAD or NODE_OPTIONS kills it before any JS runs)
const SAFE = k => ({ NODE_OPTIONS: '--no-warnings', DYLD_INSERT_LIBRARIES: '', LD_PRELOAD: '', LD_AUDIT: '' })[k] ?? '1';
// --- the tool's own environment: a prompt-injected agent can export these in its shell before calling it ---
const msgOf = fn => { try { fn(); } catch (e) { return e.message; } return null; };

test('checkToolEnv names every poisoned variable that is set; a clean env passes', () => {
  assert.equal(msgOf(() => checkToolEnv({ PATH: '/usr/bin', FOO: 'x', LD_PRELOADED: 'x', NODE_OPTION: 'x' })), null);
  assert.equal(msgOf(() => checkToolEnv({})), null);
  const msg = msgOf(() => checkToolEnv({ LD_PRELOAD: '/x.so', NODE_OPTIONS: '--require /x', PATH: 'p' }));
  assert.match(msg, /LD_PRELOAD/);
  assert.match(msg, /NODE_OPTIONS/);
  assert.doesNotMatch(msg, /PATH/);
  assert.match(msgOf(() => checkToolEnv({ ENV: '' })) ?? '', /ENV/, 'set but empty still counts');
  for (const k of POISON) assert.match(msgOf(() => checkToolEnv({ [k]: '1' })) ?? 'passed', new RegExp(k), k);
});

test("each poisoned variable in the tool's own env: exit 64 before anything, nothing written, for every subcommand; a clean env is normal", () => {
  const run = mkRun(), ck = join(run, 'ck', 'c.jsonl');
  const cmds = [['begin', '--unit', 'u', '--ck', ck], ['ck', '--ck', ck, '{"a":1}'], ['env', '--unit', 'u', 'hi'], ['notes', '--unit', 'u', 'hi'], ['done', '--unit', 'u'], ['dying', '--unit', 'u', 'hi'], ['deactivate'], ['bogus'], []];
  for (const k of POISON) {
    for (const args of cmds) {
      const r = note([...args, '--run', run], { env: { [k]: SAFE(k) } });
      assert.equal(r.status, 64, `${k} ${args[0]}: ${r.stderr}`);
      assert.match(r.stderr, new RegExp(k));
      assert.equal(r.stdout, '', k);
    }
    const a = act('n', mk(), join(mk(), 'marker'), [], { [k]: SAFE(k) });
    assert.equal(a.status, 64, `${k} activate`);
    assert.equal(a.stdout, '', k);
  }
  assert.deepEqual(ls(run), []);
  assert.equal(note(['done', '--unit', 'u', '--run', run]).status, 0);
});
