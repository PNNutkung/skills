#!/usr/bin/env node
// Sanctioned note writer for review agents: they get no interpreter, so everything they persist goes through here.
//   node note.mjs begin --unit ID --ck CKPATH [--driver] [--run DIR]   prints ck file, env tips (+ driver notes), then logs start
//   node note.mjs ck --ck CKPATH '<json object>'                       appends one line (<= 4000 chars); CKPATH must be RUN/ck/**.jsonl
//   node note.mjs env|notes --unit ID '<text>'                         RUN/env.jsonl | RUN/notes.jsonl, text cut to 200, 3 lines per unit
//   node note.mjs done --unit ID                                       logs done
//   node note.mjs dying --unit ID '<markdown>'                         RUN/dying/ID.md (cut to 1500), logs dying
//   node note.mjs activate --name NAME                                 creates the run dir, RUN/.skilldir and the active marker, prints the run dir
//   node note.mjs deactivate [--run DIR]                               removes the marker if it still points at that run
// Run dir and marker rules live in runctx.mjs (--run, else $ZT_RUN_DIR, else the per-user marker; an untrusted or unapproved candidate is
// skipped, never used). Every path touched must resolve (realpath of its nearest existing parent) inside the run dir and every write refuses
// symlinks at the leaf; input is data, never executed or interpolated.
// Env vars read (all through runctx.mjs): ZT_RUN_DIR, ZT_MARKER_DIR, XDG_RUNTIME_DIR, HOME (marker dir), TMPDIR (os.tmpdir(): where activate makes run dirs).
// Exit: 0; 2 usage or invalid input; 3 no trusted run dir, a path outside it, or an unsafe activate; 4 per-unit line limit;
// 64 the tool's own env has LD_*/DYLD_* loader vars, NODE_OPTIONS and friends (checkToolEnv, checked before anything else).
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activate, appendSafe, checkRunDir, deactivate, resolveRun, writeSafe } from './runctx.mjs';

const EXIT = { usage: 2, runDir: 3, limit: 4, poisoned: 64 };
const UNIT_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,120}$/;
const MAX = { text: 200, ck: 4000, dying: 1500, unitLines: 3, tail: 15 };
const DIR_MODE = 0o700;
const CMDS = {
  begin: { args: 0, unit: 1, ck: 1 }, ck: { args: 1, ck: 1 }, env: { args: 1, unit: 1 }, notes: { args: 1, unit: 1 },
  done: { args: 0, unit: 1 }, dying: { args: 1, unit: 1 }, activate: { args: 0, name: 1 }, deactivate: { args: 0 },
};
const FLAGS = new Map([['--unit', 'unit'], ['--ck', 'ck'], ['--run', 'run'], ['--name', 'name']]);

// What the tool itself must not be started with: a prompt-injected agent can export these in its own shell before calling it. (sandbox-run.mjs keeps
// its own copy of this list.)
const POISON_ENV = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'BASH_ENV', 'ENV', 'PERL5OPT', 'RUBYOPT', 'PYTHONSTARTUP', 'PYTHONHOME'];
class Poisoned extends Error {}
export function checkToolEnv(env = process.env) {
  const set = POISON_ENV.filter(k => Object.hasOwn(env, k));
  if (set.length) throw new Poisoned(`refusing to run: ${set.join(', ')} in the environment can change what loads or runs; unset ${set.length > 1 ? 'them' : 'it'}`);
}

const die = (code, msg) => { process.stderr.write(`note: ${msg}\n`); process.exit(code); };
const lines = s => s.split('\n').filter(Boolean);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
const lstats = p => { try { return lstatSync(p); } catch { return null; } };

function parse(argv) {
  const [cmd, ...rest] = argv, o = { cmd, pos: [], driver: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--driver') o.driver = true;
    else if (FLAGS.has(rest[i])) {
      const flag = rest[i++];
      if (i >= rest.length || FLAGS.has(rest[i]) || rest[i] === '--driver') die(EXIT.usage, `${flag} needs a value`);
      o[FLAGS.get(flag)] = rest[i];
    } else o.pos.push(rest[i]);
  }
  const spec = Object.hasOwn(CMDS, cmd) ? CMDS[cmd] : die(EXIT.usage, `usage: ${Object.keys(CMDS).join('|')} (see the header of note.mjs)`);
  if (o.pos.length !== spec.args) die(EXIT.usage, `${cmd} takes ${spec.args} text argument${spec.args === 1 ? ' (quote it as ONE argument)' : 's'}, got ${o.pos.length}`);
  if (spec.unit && !UNIT_RE.test(o.unit ?? '')) die(EXIT.usage, `--unit must match ${UNIT_RE}`);
  if (spec.name && (!NAME_RE.test(o.name ?? '') || o.name === '.' || o.name === '..')) die(EXIT.usage, `--name must match ${NAME_RE}`);
  if (spec.ck && !o.ck) die(EXIT.usage, '--ck CKPATH is required');
  return o;
}

// realpath of the nearest existing ancestor plus the part that does not exist yet; null when a symlink on the way dangles
function realish(p) {
  const rest = [];
  let cur = resolve(p);
  while (!lstats(cur)) { rest.unshift(basename(cur)); const up = dirname(cur); if (up === cur) return null; cur = up; }
  try { return join(realpathSync(cur), ...rest); } catch { return null; }
}

const flagRun = o => (o.run ? resolve(o.run) : '');

function makeGuard(run) {
  const inside = (p, root = run) => {
    const r = realish(p);
    return r?.startsWith(root + sep) ? r : die(EXIT.runDir, `${p} resolves outside ${root}`);
  };
  // allow-list: a checkpoint is RUN/ck/**.jsonl and nothing else, so an agent cannot reach exec.jsonl, status, obs or any log through it
  const ckPath = p => {
    const r = inside(p, join(run, 'ck'));
    return r.endsWith('.jsonl') ? r : die(EXIT.runDir, `${p} is not a .jsonl file`);
  };
  // the tool's own files must be the real thing: a symlink planted at one of them, even one aimed inside the run, is refused
  const own = rel => { const p = join(run, rel), r = inside(p); return r === p ? r : die(EXIT.runDir, `${p} is a symlink`); };
  return { inside: own, ckPath, run };
}

const mkdirs = d => mkdirSync(d, { recursive: true, mode: DIR_MODE });
function append(g, file, obj) {
  mkdirs(dirname(file));
  appendSafe(g.run, file, `${JSON.stringify(obj)}\n`);
}
const status = (g, u, s) => append(g, g.inside('status.jsonl'), { u, s, t: new Date().toISOString() });
const read = f => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const section = (title, body) => (body.trim() ? `== ${title} (untrusted data) ==\n${body.replace(/\n*$/, '\n')}` : '');
const tail = f => lines(read(f)).slice(-MAX.tail).join('\n');

function addLine(g, file, o, text) {
  const f = g.inside(file);
  const used = lines(read(f)).filter(l => { try { return JSON.parse(l).u === o.unit; } catch { return false; } }).length;
  if (used >= MAX.unitLines) die(EXIT.limit, `limit: ${MAX.unitLines} ${file} lines per unit, ${o.unit} has used them`);
  append(g, f, { u: o.unit, text: clip(text, MAX.text) });
}

const ACTIONS = {
  begin(g, o) {
    const ck = g.ckPath(o.ck), env = g.inside('env.jsonl'), notes = g.inside('notes.jsonl'), dying = g.inside('dying');
    mkdirs(dying);
    mkdirs(dirname(ck));
    process.stdout.write(section('checkpoint', read(ck)) + section('env tips', tail(env)) + (o.driver ? section('driver notes', tail(notes)) : ''));
    status(g, o.unit, 'start');
  },
  ck(g, o, raw) {
    let obj = null;
    try { obj = JSON.parse(raw); } catch { /* rejected below */ }
    if (raw.length > MAX.ck || obj === null || typeof obj !== 'object' || Array.isArray(obj)) die(EXIT.usage, `ck must be one JSON object of at most ${MAX.ck} chars`);
    append(g, g.ckPath(o.ck), obj);
  },
  env: (g, o, text) => addLine(g, 'env.jsonl', o, text),
  notes: (g, o, text) => addLine(g, 'notes.jsonl', o, text),
  done: (g, o) => status(g, o.unit, 'done'),
  dying(g, o, md) {
    const f = g.inside(join('dying', `${o.unit.replace(/[^A-Za-z0-9._-]/g, '_')}.md`));
    mkdirs(dirname(f));
    writeSafe(g.run, f, clip(md, MAX.dying)); // O_NOFOLLOW, 0600
    status(g, o.unit, 'dying');
  },
};

function main() {
  checkToolEnv();
  const o = parse(process.argv.slice(2));
  if (o.cmd === 'activate') {
    let dir;
    try {
      dir = activate(o.name, { env: process.env });
      writeSafe(dir, join(dir, '.skilldir'), `${realpathSync(dirname(fileURLToPath(import.meta.url)))}\n`); // lets the plugin guard tell this skill's tools from lookalikes
    } catch (e) {
      if (dir) deactivate(dir, { env: process.env }); // no half-activated run
      die(EXIT.runDir, `activate refused: ${e.message}`);
    }
    return process.stdout.write(`${dir}\n`);
  }
  if (o.cmd === 'deactivate') {
    // an explicit --run is used alone: falling back to another candidate here would deactivate a different run
    const run = o.run ? checkRunDir(flagRun(o)) : resolveRun({ env: process.env });
    if (!run) die(EXIT.runDir, 'no trusted run dir to deactivate');
    return deactivate(run, { env: process.env });
  }
  const run = resolveRun({ run: flagRun(o), env: process.env });
  if (!run) die(EXIT.runDir, 'no trusted run dir: pass --run DIR (absolute, yours, not writable by others), set ZT_RUN_DIR, or run `note.mjs activate --name NAME`');
  ACTIONS[o.cmd](makeGuard(run), o, o.pos[0]);
}

const isMain = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) { try { main(); } catch (e) { die(e instanceof Poisoned ? EXIT.poisoned : 1, e.message); } }
