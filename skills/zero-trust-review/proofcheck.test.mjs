// Tests for proofcheck.mjs: a fixture git repo plus fixture exec/obs ledgers, driven through the CLI. Run: node --test proofcheck.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PC = join(dirname(fileURLToPath(import.meta.url)), 'proofcheck.mjs');
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'pc-test-')));
after(() => rmSync(ROOT, { recursive: true, force: true }));
let n = 0;
// 0700 on purpose: runctx distrusts group/world-writable dirs, and the host umask must not decide the test outcome
const fresh = name => { const d = join(ROOT, `${name}-${n++}`); mkdirSync(d, { recursive: true }); chmodSync(d, 0o700); return d; };
// runctx approves an explicit run dir only under <tmpdir>/zt-review-<uid>/ (or as the marker's own target); the CLI's TMPDIR is ROOT, so run dirs live there
const BASE = join(ROOT, `zt-review-${process.getuid()}`);
mkdirSync(BASE, { mode: 0o700 });
const inBase = name => { const d = join(BASE, `${name}-${n++}`); mkdirSync(d, { mode: 0o700 }); chmodSync(d, 0o700); return d; };
const ledger = (dir, name, text, mode = 0o600) => { const f = join(dir, name); writeFileSync(f, text); chmodSync(f, mode); return f; };

const PY = [
  'import os', '', 'def load(path):', '    with open(path) as f:', '        data = f.read()', '    return   data.strip()', '',
  'def save(path, data):', "    tmp = path + '.tmp'", "    open(tmp, 'w').write(data)", '    os.rename(tmp, path)', '', 'def main():', "    print(load('x'))",
].join('\n') + '\n';
const REPO = fresh('repo');
const git = (...a) => execFileSync('git', ['-C', REPO, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
git('init', '-q');
mkdirSync(join(REPO, 'app'));
writeFileSync(join(REPO, 'app/svc.py'), PY);
writeFileSync(join(REPO, 'win.py'), 'a = 1\r\nb = 2\r\n');
symlinkSync('/etc/passwd', join(REPO, 'link.py')); // a blob holding the target path text; must never be followed
git('add', '-A');
git('commit', '-q', '-m', 'fixture');
const HEAD = git('rev-parse', 'HEAD');

const jl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
// the shapes the two writers really produce (sandbox-run.mjs / the zt-capture hook); proofcheck ignores anything else
const xrow = o => ({ ts: '2026-01-01T00:00:00.000Z', cwd: '/w', sec: 1, backend: 'seatbelt', ...o });
const orow = o => ({ ts: '2026-01-01T00:00:00.000Z', ...o });
const withLedger = (d, out) => (ledger(d, 'exec.jsonl', jl([xrow({ id: 'run-1', cmd: ['t'], exit: 1, out })])), d);
const EXEC = [
  { id: 'run-1', exit: 1, sec: 2.3, cmd: ['pytest', '-q', 't.py'], out: 'FAILED t.py::test_x\n   assert  1 == 2\n' },
  { id: 'run-2', exit: 3, sec: 1, cmd: ['echo', 'new'], out: 'new   output' },
  { id: 'run-dup', exit: 0, sec: 1, cmd: ['echo', 'a'], out: 'genuine run' },
  { id: 'run-dup', exit: 0, sec: 1, cmd: ['echo', 'b'], out: 'forged run claiming success' },
  { id: 'run-same', exit: 0, sec: 1, cmd: ['echo', 'c'], out: 'same twice' },
  { id: 'run-same', exit: 0, sec: 1, cmd: ['echo', 'c'], out: 'same twice' },
].map(xrow);
const OBS_ROWS = [
  { id: 'o1', tool: 'mcp__grafana__query_loki_logs', out: 'level=error msg="pool exhausted"' },
  { id: 'o2', tool: 'mcp__grafana__query_loki_logs', out: 'level=warn retry=3' },
  { id: 'o3', tool: 'mcp__grafana__query_prometheus', out: 'http_requests_total 4242' },
  { id: 'o4', tool: 'mcp__tempo__trace', out: 'span checkout 812ms' },
];
const OBS = OBS_ROWS.map(orow);
const runDir = (exec = EXEC, obs = OBS) => {
  const d = inBase('run');
  if (exec) ledger(d, 'exec.jsonl', jl(exec));
  if (obs) ledger(d, 'obs.jsonl', jl(obs));
  return d;
};

const { ZT_RUN_DIR: _z, ZT_MARKER_DIR: _m, ...BASE_ENV } = process.env;
const EMPTY_MARKER = fresh('marker'); // ZT_MARKER_DIR points here so this host's real per-user marker is never consulted
const cli = (args, env = {}) => spawnSync(process.execPath, [PC, ...args], { encoding: 'utf8', env: { ...BASE_ENV, TMPDIR: ROOT, ZT_MARKER_DIR: EMPTY_MARKER, ...env } });
const pc = (clusters, { run = runDir(), ret = {}, args = [], env, out = fresh('out'), withOut = true } = {}) => {
  const retFile = join(fresh('ret'), 'ret.json');
  writeFileSync(retFile, JSON.stringify({ clusters, ...ret }));
  const r = cli(['--ret', retFile, '--repo', REPO, '--head', 'HEAD', ...(run ? ['--run', run] : []), ...(withOut ? ['--out', out] : []), ...args], env);
  const read = f => (existsSync(join(out, f)) ? readFileSync(join(out, f), 'utf8') : null);
  return { ...r, out, clusters: r.stdout ? JSON.parse(r.stdout) : null, verified: (() => { try { return JSON.parse(read('verified.json')); } catch { return null; } })(), md: read('evidence.md') };
};
const cl = o => ({ id: 'c', severity: 'high', status: 'confirmed', evidence: 'read', file: 'app/svc.py', startLine: 5, endLine: 6, title: 'T', ...o });
const memo = f => { let v; return () => (v ??= f()); };

// ---- proof modes: one CLI run per table, each row asserted on its own ----
const OK = null;
const table = (cases, opts) => {
  const res = memo(() => pc(cases.map(([name, proof]) => cl({ id: name, proof })), opts));
  for (const [name, proof, reason] of cases) {
    test(name, () => {
      const r = res();
      assert.equal(r.status, 0, r.stderr);
      const want = { ok: reason === OK, mode: proof?.mode ?? 'none', ref: proof?.ref, reason: reason ?? undefined };
      assert.deepEqual(r.clusters.find(c => c.id === name).check, JSON.parse(JSON.stringify(want)));
    });
  }
};
const read = (ref, quote) => ({ mode: 'read', ref, quote });
const DUP = 'conflicting duplicate run id', NOFILE = 'file not at HEAD', RANGE = 'lines out of range', NOQ = 'quote not found in lines';
table([
  ['read: quote inside range', read('app/svc.py:5-6', 'data = f.read()'), OK],
  ['read: whitespace is normalized on both sides', read('app/svc.py:6-6', 'return data.strip()'), OK],
  ['read: multi-line quote with indentation', read('app/svc.py:9-11', "tmp = path + '.tmp'\n    open(tmp, 'w').write(data)"), OK],
  ['read: single-line ref path:N', read('app/svc.py:14', "print(load('x'))"), OK],
  ['read: CRLF file', read('win.py:1-2', 'a = 1 b = 2'), OK],
  ['read: tolerance reaches START-2', read('app/svc.py:8-8', 'return data.strip()'), OK],
  ['read: tolerance reaches END+2', read('app/svc.py:4-4', 'return data.strip()'), OK],
  ['read: one line past START-2 fails', read('app/svc.py:9-9', 'return data.strip()'), NOQ],
  ['read: one line past END+2 fails', read('app/svc.py:3-3', 'return data.strip()'), NOQ],
  ['read: quote nowhere in file', read('app/svc.py:5-6', 'rm -rf /'), NOQ],
  ['read: empty quote never matches', read('app/svc.py:5-6', ''), NOQ],
  ['read: missing file', read('app/missing.py:1-2', 'x'), NOFILE],
  ['read: END past file', read('app/svc.py:10-99', 'x'), RANGE],
  ['read: line after the trailing newline', read('app/svc.py:15-15', 'x'), RANGE],
  ['read: START 0', read('app/svc.py:0-2', 'import os'), RANGE],
  ['read: START after END', read('app/svc.py:5-3', 'x'), RANGE],
  ['read: ../../etc/passwd with lines', read('../../etc/passwd:1-3', 'root'), NOFILE],
  ['read: ../../etc/passwd with no lines', { mode: 'read', ref: '../../etc/passwd', quote: 'root' }, NOFILE],
  ['read: absolute path', read('/etc/passwd:1-3', 'root'), NOFILE],
  ['read: dot-dot hidden mid-path', read('app/../../../etc/passwd:1-2', 'root'), NOFILE],
  ['read: committed symlink is text, not followed', read('link.py:1-1', 'root:'), NOQ],
  ['executed: pass, exit and normalized quote', { mode: 'executed', ref: 'run-1', quote: 'assert 1 == 2', exit: 1 }, OK],
  ['executed: exit omitted is fine', { mode: 'executed', ref: 'run-1', quote: 'FAILED t.py::test_x' }, OK],
  ['executed: exit mismatch', { mode: 'executed', ref: 'run-1', quote: 'FAILED', exit: 0 }, 'exit mismatch'],
  ['executed: unknown run id', { mode: 'executed', ref: 'run-9', quote: 'x', exit: 0 }, 'run id not in ledger'],
  ['executed: quote not in output', { mode: 'executed', ref: 'run-1', quote: 'PASSED', exit: 1 }, 'quote not in output'],
  ['executed: normalized quote and exit 3', { mode: 'executed', ref: 'run-2', quote: 'new output', exit: 3 }, OK],
  ['executed: a duplicate id with different content is a forgery, even for a quote the forged line holds', { mode: 'executed', ref: 'run-dup', quote: 'forged run', exit: 0 }, DUP],
  ['executed: a duplicate id with different content is rejected for the genuine line too', { mode: 'executed', ref: 'run-dup', quote: 'genuine run', exit: 0 }, DUP],
  ['executed: a byte-identical duplicate line is harmless', { mode: 'executed', ref: 'run-same', quote: 'same twice', exit: 0 }, OK],
  ['log: by id', { mode: 'log', ref: 'o1', quote: 'pool  exhausted' }, OK],
  ['log: by id, quote lives in another entry', { mode: 'log', ref: 'o1', quote: 'retry=3' }, 'quote not in output'],
  ['log: by tool name, quote in a later entry', { mode: 'log', ref: 'mcp__grafana__query_loki_logs', quote: 'retry=3' }, OK],
  ['log: by tool name, quote in no entry of that tool', { mode: 'log', ref: 'mcp__grafana__query_loki_logs', quote: 'http_requests_total' }, 'quote not in output'],
  ['log: unknown id or tool', { mode: 'log', ref: 'o99', quote: 'x' }, 'observation not in ledger'],
  ['metric: by id', { mode: 'metric', ref: 'o3', quote: 'http_requests_total 4242' }, OK],
  ['metric: by tool name', { mode: 'metric', ref: 'mcp__grafana__query_prometheus', quote: '4242' }, OK],
  ['trace: by id', { mode: 'trace', ref: 'o4', quote: 'span checkout' }, OK],
  ['trace: by tool name', { mode: 'trace', ref: 'mcp__tempo__trace', quote: '812ms' }, OK],
  ['trace: tool name, wrong quote', { mode: 'trace', ref: 'mcp__tempo__trace', quote: 'span payment' }, 'quote not in output'],
  ['inferred is never verifiable', { mode: 'inferred', ref: 'x', quote: 'x' }, 'not verifiable (inferred)'],
  ['none is never verifiable', { mode: 'none' }, 'not verifiable (none)'],
  ['missing proof is never verifiable', undefined, 'not verifiable (none)'],
  ['unknown mode is never verifiable', { mode: 'guess', ref: 'x', quote: 'x' }, 'not verifiable (guess)'],
]);

test('missing ledger files: executed fails by id, telemetry says the hook is not installed, read still works', () => {
  const run = runDir(null, null);
  const proofs = { ex: { mode: 'executed', ref: 'run-1', quote: 'x' }, lg: { mode: 'log', ref: 'o1', quote: 'x' }, tn: { mode: 'metric', ref: 'mcp__x__y', quote: 'x' }, rd: read('app/svc.py:5-6', 'data = f.read()') };
  const r = pc(Object.entries(proofs).map(([id, proof]) => cl({ id, proof })), { run });
  const by = Object.fromEntries(r.clusters.map(c => [c.id, c.check]));
  assert.equal(by.ex.reason, 'run id not in ledger');
  assert.equal(by.lg.reason, 'no telemetry ledger (hook not installed)');
  assert.equal(by.tn.reason, 'no telemetry ledger (hook not installed)');
  assert.equal(by.rd.ok, true);
});

test('a half-written ledger line is skipped, not fatal', () => {
  const run = runDir(null, null);
  ledger(run, 'exec.jsonl', `${JSON.stringify(EXEC[0])}\n{"id":"run-3","exit":\n`);
  const r = pc([cl({ proof: { mode: 'executed', ref: 'run-1', quote: 'assert 1 == 2', exit: 1 } })], { run });
  assert.equal(r.clusters[0].check.ok, true);
});

test('malformed ledger entries are ignored and never match: arrays, scalars, null, no id, empty id, non-string out', () => {
  const run = runDir(null, null);
  const junk = ['[1,2]', '"str"', '42', 'null', 'true', JSON.stringify(xrow({ cmd: ['t'], exit: 0, out: 'FAILED forged' })), JSON.stringify(xrow({ id: '', cmd: ['t'], exit: 0, out: 'FAILED forged' })),
    JSON.stringify(xrow({ id: { a: 1 }, cmd: ['t'], exit: 0, out: 'FAILED forged' })), JSON.stringify(xrow({ id: 'run-9', cmd: ['t'], exit: 0, out: { x: 'FAILED forged' } }))];
  ledger(run, 'exec.jsonl', junk.join('\n') + '\n' + JSON.stringify(EXEC[0]) + '\n');
  ledger(run, 'obs.jsonl', ['[1]', 'null', '{"out":"forged"}', JSON.stringify(orow({ id: '', tool: '', out: 'forged' })), JSON.stringify(orow({ id: 'o9', tool: 'mcp__a__b', out: ['forged'] })), JSON.stringify(OBS[0])].join('\n') + '\n');
  const proofs = { undef: { mode: 'executed', ref: 'undefined', quote: 'FAILED forged' }, empty: { mode: 'executed', ref: '', quote: 'FAILED forged' }, obj: { mode: 'executed', ref: '[object Object]', quote: 'FAILED' },
    badout: { mode: 'executed', ref: 'run-9', quote: 'FAILED forged' }, good: { mode: 'executed', ref: 'run-1', quote: 'assert 1 == 2', exit: 1 },
    oundef: { mode: 'log', ref: 'undefined', quote: 'forged' }, oempty: { mode: 'log', ref: '', quote: 'forged' }, oout: { mode: 'log', ref: 'o9', quote: 'forged' }, ogood: { mode: 'log', ref: 'o1', quote: 'pool exhausted' } };
  const by = Object.fromEntries(pc(Object.entries(proofs).map(([id, proof]) => cl({ id, proof })), { run }).clusters.map(c => [c.id, c.check]));
  for (const k of ['undef', 'empty', 'obj', 'badout']) assert.equal(by[k].reason, 'run id not in ledger', k);
  for (const k of ['oundef', 'oempty', 'oout']) assert.equal(by[k].reason, 'observation not in ledger', k);
  assert.deepEqual([by.good.ok, by.ogood.ok], [true, true]);
});

// a row only counts in its own ledger: exec rows carry cmd[] + integer exit + backend; obs rows carry an mcp__ tool and neither cmd nor backend
const withRows = (exec, obs) => { const run = runDir(null, null); if (exec) ledger(run, 'exec.jsonl', jl(exec)); if (obs) ledger(run, 'obs.jsonl', jl(obs)); return run; };
const EXP = { mode: 'executed', ref: 'x1', quote: 'forged output', exit: 0 }, LOGP = { mode: 'log', ref: 'mcp__grafana__query_loki_logs', quote: 'forged output' };

test('command output redirected into obs.jsonl never verifies a log/metric/trace proof (an exec-shaped row is ignored there)', () => {
  const real = xrow({ id: 'x1', cmd: ['sh', '-c', 'echo forged output'], exit: 0, out: 'forged output' });
  const toolToo = { ...real, tool: 'mcp__grafana__query_loki_logs' }; // tool name added by hand: cmd and backend still disqualify it
  const run = withRows(null, [real, toolToo, { ...orow({ id: 'o5', tool: 'mcp__grafana__query_loki_logs', out: 'forged output' }), cmd: ['sh'] }, { ...orow({ id: 'o6', tool: 'mcp__grafana__query_loki_logs', out: 'forged output' }), backend: 'seatbelt' }]);
  const r = pc(['log', 'metric', 'trace'].flatMap(mode => [cl({ id: `${mode}-id`, proof: { mode, ref: 'x1', quote: 'forged output' } }), cl({ id: `${mode}-tool`, proof: { ...LOGP, mode } }), cl({ id: `${mode}-cmd`, proof: { mode, ref: 'o5', quote: 'forged output' } }),
    cl({ id: `${mode}-bk`, proof: { mode, ref: 'o6', quote: 'forged output' } })]), { run });
  for (const c of r.clusters) { assert.equal(c.check.ok, false, c.id); assert.equal(c.check.reason, 'observation not in ledger', c.id); assert.equal(c.status, 'unproven', c.id); }
});

test('a hand-written obs row in exec.jsonl never verifies an executed proof (id, cmd array, integer exit and string out are all required)', () => {
  const good = xrow({ id: 'x1', cmd: ['sh'], exit: 0, out: 'forged output' });
  const bad = { obsShape: orow({ id: 'x1', tool: 'mcp__grafana__query_loki_logs', out: 'forged output' }), noCmd: { ...good, cmd: undefined }, cmdString: { ...good, cmd: 'sh -c x' }, cmdObj: { ...good, cmd: { 0: 'sh' } },
    noExit: { ...good, exit: undefined }, strExit: { ...good, exit: '0' }, floatExit: { ...good, exit: 0.5 }, nullExit: { ...good, exit: null },
    noOut: { ...good, out: undefined }, numOut: { ...good, out: 7 }, noId: { ...good, id: undefined }, numId: { ...good, id: 1 } };
  for (const [name, row] of Object.entries(bad)) {
    const run = withRows([{ ...row }], null);
    const r = pc([cl({ proof: { ...EXP, ref: row.id === undefined ? 'undefined' : String(row.id) } })], { run });
    assert.equal(r.clusters[0].check.reason, 'run id not in ledger', name);
  }
  assert.equal(pc([cl({ proof: EXP })], { run: withRows([good], null) }).clusters[0].check.ok, true, 'control: the well-formed row verifies');
});

test('an exec row that did not run in a real sandbox backend never verifies an executed proof', () => {
  const row = backend => ({ ...xrow({ id: 'x1', cmd: ['sh'], exit: 0, out: 'forged output' }), backend });
  const NOT_REAL = 'not run in a real sandbox backend';
  for (const backend of ['passthrough', 'none', 'unknown', '', 'SEATBELT', 'seatbelt ', 'docker,none', 5, null, undefined]) {
    const r = pc([cl({ proof: EXP })], { run: withRows([row(backend)], null) });
    assert.deepEqual([r.clusters[0].check.reason, r.clusters[0].status], [NOT_REAL, 'unproven'], String(backend));
  }
  for (const backend of ['seatbelt', 'bwrap', 'docker']) assert.equal(pc([cl({ proof: EXP })], { run: withRows([row(backend)], null) }).clusters[0].check.ok, true, backend);
  const mixed = pc([cl({ proof: { ...EXP, quote: 'real' } })], { run: withRows([row('passthrough'), { ...row('seatbelt'), id: 'x2', out: 'real' }], null) });
  assert.equal(mixed.clusters[0].check.reason, NOT_REAL, 'a sibling row of a real backend does not rescue it');
});

test('obs rows need a string id (or number), an mcp__ tool and a string out; anything else is ignored', () => {
  const good = orow({ id: 'o1', tool: 'mcp__grafana__query_loki_logs', out: 'forged output' });
  const bad = { noTool: { ...good, tool: undefined }, bashTool: { ...good, tool: 'Bash' }, bareTool: { ...good, tool: 'query_loki_logs' }, noMcpPrefix: { ...good, tool: 'x_mcp__a' }, noId: { ...good, id: undefined }, noOut: { ...good, out: undefined }, objOut: { ...good, out: {} } };
  for (const [name, row] of Object.entries(bad)) {
    const run = withRows(null, [row]);
    const r = pc([cl({ id: 'id', proof: { mode: 'log', ref: 'o1', quote: 'forged output' } }), cl({ id: 'tool', proof: { ...LOGP, ref: row.tool ?? 'mcp__grafana__query_loki_logs' } })], { run });
    for (const c of r.clusters) assert.equal(c.check.reason, 'observation not in ledger', `${name} ${c.id}`);
  }
  assert.equal(pc([cl({ proof: { mode: 'log', ref: 'o1', quote: 'forged output' } })], { run: withRows(null, [good]) }).clusters[0].check.ok, true, 'control');
});

test('a wrong-shaped row never counts as a duplicate id either: a forged twin of a real run cannot invalidate it, nor stand in for it', () => {
  const real = xrow({ id: 'x1', cmd: ['sh'], exit: 0, out: 'genuine output' });
  const twin = orow({ id: 'x1', tool: 'mcp__a__b', out: 'forged output' });
  const run = withRows([real, twin], null);
  const r = pc([cl({ id: 'real', proof: { ...EXP, quote: 'genuine output' } }), cl({ id: 'forged', proof: EXP })], { run });
  assert.deepEqual([r.clusters[0].check.ok, r.clusters[1].check.reason], [true, 'quote not in output']);
});

test('evidence.md what-actually-ran and obs count only list rows of the right shape', () => {
  const run = withRows([xrow({ id: 'x1', cmd: ['sh', '-c', 'real'], exit: 0, out: '' }), orow({ id: 'o1', tool: 'mcp__a__b', out: '' })], [orow({ id: 'o2', tool: 'mcp__a__b', out: '' }), xrow({ id: 'x2', cmd: ['sh'], exit: 0, out: '' })]);
  const { md } = pc([], { run });
  assert.match(md, /- x1 exit=0/);
  assert.doesNotMatch(md, /- o1 /);
  assert.match(md, /obs entries: 1/);
});

// ---- ledger trust: a forged or planted ledger must never let a guess count as executed ----
const LEDGER_PROOFS = [cl({ id: 'ex', proof: { mode: 'executed', ref: 'run-1', quote: 'FAILED', exit: 1 } }), cl({ id: 'lg', proof: { mode: 'log', ref: 'o1', quote: 'pool exhausted' } }),
  cl({ id: 'tn', proof: { mode: 'metric', ref: 'mcp__grafana__query_prometheus', quote: '4242' } }), cl({ id: 'rd', proof: read('app/svc.py:5-6', 'data = f.read()') })];
const NOT_TRUSTED = 'ledger not trusted';
const reasons = r => Object.fromEntries(r.clusters.map(c => [c.id, c.check.reason ?? 'OK']));

test('symlinked ledger files are not trusted, even when the target is a perfectly good ledger', () => {
  const elsewhere = fresh('elsewhere');
  const [exec, obs] = [ledger(elsewhere, 'exec.jsonl', jl(EXEC)), ledger(elsewhere, 'obs.jsonl', jl(OBS))];
  const run = runDir(null, null);
  symlinkSync(exec, join(run, 'exec.jsonl'));
  assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run })), { ex: NOT_TRUSTED, lg: 'no telemetry ledger (hook not installed)', tn: 'no telemetry ledger (hook not installed)', rd: 'OK' });
  symlinkSync(obs, join(run, 'obs.jsonl'));
  const r = pc(LEDGER_PROOFS, { run });
  assert.deepEqual(reasons(r), { ex: NOT_TRUSTED, lg: NOT_TRUSTED, tn: NOT_TRUSTED, rd: 'OK' });
  assert.match(r.md, /not trusted/);
});

test('a dangling-symlink or directory ledger path is not trusted either', () => {
  const run = runDir(null, null);
  symlinkSync(join(run, 'nowhere'), join(run, 'exec.jsonl'));
  mkdirSync(join(run, 'obs.jsonl'));
  assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run })), { ex: NOT_TRUSTED, lg: NOT_TRUSTED, tn: NOT_TRUSTED, rd: 'OK' });
});

test('group- or world-writable ledger files are not trusted, one file at a time', () => {
  for (const mode of [0o666, 0o664, 0o620, 0o602]) {
    const run = runDir();
    chmodSync(join(run, 'exec.jsonl'), mode);
    assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run })), { ex: NOT_TRUSTED, lg: 'OK', tn: 'OK', rd: 'OK' }, `exec ${mode.toString(8)}`);
    chmodSync(join(run, 'exec.jsonl'), 0o600);
    chmodSync(join(run, 'obs.jsonl'), mode);
    assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run })), { ex: 'OK', lg: NOT_TRUSTED, tn: NOT_TRUSTED, rd: 'OK' }, `obs ${mode.toString(8)}`);
  }
});

test('read-only ledgers (0400, 0444, 0640) are trusted: only writability by others matters', () => {
  for (const mode of [0o400, 0o444, 0o640]) {
    const run = runDir();
    chmodSync(join(run, 'exec.jsonl'), mode);
    chmodSync(join(run, 'obs.jsonl'), mode);
    assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run })), { ex: 'OK', lg: 'OK', tn: 'OK', rd: 'OK' }, mode.toString(8));
  }
});

test('evidence.md never lists the runs of a ledger that is not trusted', () => {
  const run = runDir();
  chmodSync(join(run, 'exec.jsonl'), 0o666);
  const { md } = pc(LEDGER_PROOFS, { run });
  assert.match(md.split('## What actually ran')[1], /not trusted/);
  assert.doesNotMatch(md, /pytest -q t\.py/);
});

test('an untrusted run dir (symlink, world-writable, group-writable) verifies no ledger proof, but read proofs still work', () => {
  const good = runDir(), loose = runDir(), grp = runDir(), link = join(BASE, 'link');
  chmodSync(loose, 0o777);
  chmodSync(grp, 0o770);
  symlinkSync(good, link);
  for (const [name, run] of [['world-writable', loose], ['group-writable', grp], ['symlink', link]]) {
    assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run })), { ex: NOT_TRUSTED, lg: NOT_TRUSTED, tn: NOT_TRUSTED, rd: 'OK' }, name);
  }
  assert.deepEqual(reasons(pc(LEDGER_PROOFS, { run: good })), { ex: 'OK', lg: 'OK', tn: 'OK', rd: 'OK' }, 'control: the same ledgers in a safe dir verify');
});

test('a relative --run path is not trusted (runctx wants an absolute run dir)', () => {
  const run = runDir(), rel = relative(process.cwd(), run);
  assert.ok(!isAbsolute(rel));
  assert.equal(reasons(pc(LEDGER_PROOFS, { run: rel })).ex, NOT_TRUSTED);
});

test('a ledger swapped for a symlink inside a trusted run dir is refused (the open does not follow links)', () => {
  const run = runDir(), real = ledger(fresh('elsewhere'), 'exec.jsonl', jl(EXEC));
  renameSync(join(run, 'exec.jsonl'), join(run, 'exec.moved'));
  symlinkSync(real, join(run, 'exec.jsonl'));
  assert.equal(reasons(pc(LEDGER_PROOFS, { run })).ex, NOT_TRUSTED);
});

test('read comes from HEAD, not the working tree', () => {
  const stray = join(REPO, 'stray.py');
  writeFileSync(stray, 'x = 1\n');
  try {
    const r = pc([cl({ proof: read('stray.py:1-1', 'x = 1') })]);
    assert.equal(r.clusters[0].check.reason, NOFILE);
  } finally { rmSync(stray); }
});

// ---- cluster adjustment ----
test('low cluster: own quote verified as a read proof, tolerance +-2, no agent needed', () => {
  const low = o => cl({ severity: 'low', status: 'unverified', evidence: 'none', quote: 'data = f.read()', ...o });
  const r = pc([low({ id: 'ok' }), low({ id: 'ws', quote: 'return data.strip()', startLine: 6, endLine: 6 }), low({ id: 'tol', startLine: 7, endLine: 7 }), low({ id: 'far', startLine: 10, endLine: 10 }),
    low({ id: 'noq', quote: undefined }), low({ id: 'nofile', file: 'nope.py' })]);
  const by = Object.fromEntries(r.clusters.map(c => [c.id, c]));
  for (const id of ['ok', 'ws', 'tol']) assert.deepEqual([by[id].status, by[id].evidence, by[id].was, by[id].check.ok, by[id].check.mode], ['confirmed', 'read', 'unverified', true, 'read']);
  assert.deepEqual([by.far.status, by.far.was, by.far.check.reason], ['unproven', 'unverified', NOQ]);
  assert.deepEqual([by.noq.status, by.noq.check.reason], ['unproven', NOQ]);
  assert.deepEqual([by.nofile.status, by.nofile.check.reason], ['unproven', NOFILE]);
  assert.equal(by.ok.check.ref, 'app/svc.py:5-6');
});

test('low cluster that agents refuted or disputed stays as it was', () => {
  const r = pc(['refuted', 'out-of-scope', 'disputed', 'unverifiable'].map(status => cl({ id: status, severity: 'low', status, quote: 'data = f.read()' })));
  assert.deepEqual(r.clusters.map(c => c.status), ['refuted', 'out-of-scope', 'disputed', 'unverifiable']);
});

test('confirmed medium+ with a verifying proof stays confirmed and takes the proof mode as evidence', () => {
  const r = pc([cl({ id: 'a', severity: 'critical', evidence: 'executed', proof: { mode: 'executed', ref: 'run-1', quote: 'FAILED', exit: 1 } }),
    cl({ id: 'b', severity: 'medium', status: 'confirmed-by-trace', evidence: 'trace', proof: read('app/svc.py:5-6', 'data = f.read()') })]);
  assert.deepEqual(r.clusters.map(c => [c.status, c.evidence, 'was' in c]), [['confirmed', 'executed', false], ['confirmed', 'read', true]]);
  assert.equal(r.clusters[1].was, 'confirmed-by-trace');
});

test('confirmed high with an inferred proof is downgraded to unproven and keeps the original status in was', () => {
  const r = pc([cl({ proof: { mode: 'inferred', ref: 'x', quote: 'x' } })]);
  const [c] = r.clusters;
  assert.deepEqual([c.status, c.evidence, c.was, c.check.ok], ['unproven', 'inferred', 'confirmed', false]);
  assert.deepEqual(r.verified.clusters[0], { id: 'c', severity: 'high', was: 'confirmed', status: 'unproven', evidence: 'inferred', check: c.check });
});

test('confirmed medium whose proof fails to verify is downgraded', () => {
  const [c] = pc([cl({ severity: 'medium', proof: read('app/svc.py:5-6', 'something invented') })]).clusters;
  assert.deepEqual([c.status, c.evidence, c.check.reason], ['unproven', 'inferred', NOQ]);
});

test('never upgrades, and leaves non-confirmed statuses alone while still recording the check', () => {
  const good = read('app/svc.py:5-6', 'data = f.read()');
  const statuses = ['refuted', 'out-of-scope', 'disputed', 'unverifiable', 'unverified', 'unverified-nit'];
  const r = pc([...statuses.map(status => cl({ id: status, status, evidence: 'none' })), cl({ id: 'nit', severity: 'nit', status: 'unverified-nit', proof: good }), cl({ id: 'u', severity: 'medium', status: 'unverified', evidence: 'none', proof: good })]);
  r.clusters.forEach((c, i) => {
    assert.equal(c.status, [...statuses, 'unverified-nit', 'unverified'][i]);
    assert.equal(c.evidence, i < statuses.length ? 'none' : c.evidence);
    assert.equal('was' in c, false);
    assert.equal(typeof c.check.ok, 'boolean');
  });
  assert.equal(r.clusters[6].check.ok, true);
  assert.equal(r.clusters[7].check.ok, true);
});

test('stdout is the input cluster list with only status/evidence/was/check touched', () => {
  const input = cl({ id: 'k', verdicts: [{ by: 'a', real: 'yes' }], hazard: 'h', quote: 'q', proof: read('app/svc.py:5-6', 'data = f.read()'), extra: { deep: [1] } });
  const [c] = pc([input]).clusters;
  assert.deepEqual({ ...c, check: undefined }, { ...input, check: undefined });
  assert.deepEqual(c.check, { ok: true, mode: 'read', ref: 'app/svc.py:5-6' });
});

test('verified.json: counts by final status, per-cluster record, no clock', () => {
  const good = read('app/svc.py:5-6', 'data = f.read()');
  const r = pc([cl({ id: 'a', proof: good }), cl({ id: 'b', proof: good }), cl({ id: 'c' }), cl({ id: 'd', status: 'refuted' })]);
  assert.deepEqual(r.verified.counts, { confirmed: 2, unproven: 1, refuted: 1 });
  assert.equal('checkedAt' in r.verified, false);
  assert.deepEqual(r.verified.clusters.map(c => [c.id, c.was, c.status]), [['a', 'confirmed', 'confirmed'], ['b', 'confirmed', 'confirmed'], ['c', 'confirmed', 'unproven'], ['d', 'refuted', 'refuted']]);
  assert.deepEqual(Object.keys(r.verified.clusters[0]), ['id', 'severity', 'was', 'status', 'evidence', 'check']);
});

// ---- evidence.md ----
test('evidence.md: header, table, noted-for-review, what-actually-ran', () => {
  const good = read('app/svc.py:5-6', 'data = f.read()');
  const r = pc([cl({ id: 'good', proof: good }), cl({ id: 'bad', title: 'Pool leak on retry', proof: read('app/svc.py:5-6', 'invented') }), cl({ id: 'inf', title: 'Guessed race', proof: { mode: 'inferred', ref: 'x', quote: 'x' } }), cl({ id: 'pipe', status: 'refuted', proof: { mode: 'log', ref: 'a|b', quote: 'x' } })],
    { ret: { unverified: ['u1 medium unverified: maybe'], notReviewed: ['src/big.py (too large)'], questions: ['Is the retry idempotent?'] } });
  const { md } = r;
  assert.ok(md.includes(HEAD), 'full head sha in the header');
  assert.match(md, /confirmed 1/);
  assert.match(md, /unproven 2/);
  assert.match(md, /\| cluster \| severity \| status \| proof mode \| ref \| check \|/);
  assert.match(md, /\| good \| high \| confirmed \| read \| app\/svc\.py:5-6 \| OK \|/);
  assert.match(md, new RegExp(`\\| bad \\| high \\| unproven \\| read \\| app/svc\\.py:5-6 \\| FAIL: ${NOQ} \\|`));
  assert.match(md, /a\\\|b/, 'pipes in cells are escaped');
  const noted = md.split('## Noted for review (not verified, do not treat as fact)')[1].split('## What actually ran')[0];
  assert.match(noted, /Pool leak on retry/);
  assert.match(noted, /Guessed race/);
  assert.match(noted, /not verifiable \(inferred\)/);
  assert.match(noted, /u1 medium unverified: maybe/);
  assert.match(noted, /src\/big\.py \(too large\)/);
  assert.match(noted, /Is the retry idempotent\?/);
  assert.doesNotMatch(noted, /\bgood\b/);
  assert.match(md, /## What actually ran\n/);
  assert.match(md, /run-1 exit=1 sec=2\.3 pytest -q t\.py/);
  assert.match(md, /obs entries: 4/);
  assert.ok(Buffer.byteLength(md) < 6144);
});

test('evidence.md lists: first 20 items, each cut to 160 chars', () => {
  const list = k => Array.from({ length: 25 }, (_, i) => `${k}${i} item`);
  const r = pc([cl({ proof: { mode: 'inferred' } })], { ret: { unverified: list('u'), notReviewed: list('n'), questions: [...list('q').slice(0, 24), `q24 ${'x'.repeat(400)}`] } });
  for (const k of ['u', 'n', 'q']) assert.ok(r.md.includes(`${k}19 item`) && !r.md.includes(`${k}20 item`), `${k}: first 20 only`);
  const cut = pc([cl({ proof: { mode: 'inferred' } })], { ret: { questions: [`Q ${'x'.repeat(400)}`] } }).md;
  assert.ok(cut.includes('Q ' + 'x'.repeat(158)) && !cut.includes('x'.repeat(159)), 'cut to exactly 160 chars');
});

test('evidence.md what-actually-ran: up to 40 exec lines, cmd cut to 100 chars', () => {
  const exec = Array.from({ length: 45 }, (_, i) => xrow({ id: `r${i}`, exit: 0, sec: 0.1, cmd: i ? ['sh', '-c', 'x'] : ['sh', '-c', 'x'.repeat(400)], out: '' }));
  const { md } = pc([], { run: runDir(exec, []) });
  const ran = md.split('## What actually ran')[1].split('\n').filter(l => /^- r\d+ /.test(l));
  assert.equal(ran.length, 40);
  assert.ok(ran[0].includes('sh -c ' + 'x'.repeat(94)) && !ran[0].includes('x'.repeat(95)), 'cmd cut to 100 chars');
  assert.match(ran[1], /^- r1 exit=0 sec=0\.1 sh -c x$/);
  assert.match(md, /obs entries: 0/);
});

test('evidence.md stays under ~6 KB even when every list is at its worst', () => {
  const long = 'x'.repeat(400), list = k => Array.from({ length: 60 }, (_, i) => `${k}${i} ${long}`);
  const exec = Array.from({ length: 60 }, (_, i) => xrow({ id: `run-${i}`, exit: 1, sec: 12.5, cmd: ['sh', '-c', long], out: '' }));
  const r = pc(Array.from({ length: 120 }, (_, i) => cl({ id: `c${i}`, title: long, proof: { mode: 'read', ref: `${long}:1-2`, quote: 'x' } })),
    { run: runDir(exec, []), ret: { unverified: list('u'), notReviewed: list('n'), questions: list('q') } });
  assert.ok(Buffer.byteLength(r.md) <= 6144, `size ${Buffer.byteLength(r.md)}`);
  for (const h of ['## Noted for review', '## What actually ran', 'obs entries: 0', '+']) assert.ok(r.md.includes(h), h);
  assert.equal(r.clusters.length, 120, 'stdout still carries every cluster');
  assert.equal(r.verified.clusters.length, 120, 'verified.json is never truncated');
});

test('evidence.md with no ledgers at all says so', () => {
  const r = pc([], { run: runDir(null, null) });
  assert.match(r.md, /No runs recorded/);
  assert.match(r.md, /obs entries: 0/);
});

// ---- read-only repo ----
test('the repo is never modified: git status clean, HEAD unchanged, no new files in .git', () => {
  const snap = () => ({ status: git('status', '--porcelain'), head: git('rev-parse', 'HEAD'), refs: git('for-each-ref'), files: execFileSync('find', [join(REPO, '.git'), '-type', 'f', '-not', '-name', 'index'], { encoding: 'utf8' }).split('\n').sort().join('\n') });
  const before = snap();
  assert.equal(before.status, '');
  pc([cl({ proof: read('app/svc.py:5-6', 'data = f.read()') }), cl({ id: 'e', proof: read('../../etc/passwd:1-3', 'root') })]);
  assert.deepEqual(snap(), before);
});

// ---- CLI plumbing ----
test('usage errors exit 2', () => {
  const ret = join(fresh('ret'), 'ret.json');
  writeFileSync(ret, '{"clusters":[]}');
  const bad = join(fresh('ret'), 'bad.json');
  writeFileSync(bad, '{nope');
  const out = fresh('out');
  const ok = ['--ret', ret, '--repo', REPO, '--head', 'HEAD', '--run', fresh('run'), '--out', out];
  const swap = (flag, val) => ok.map((a, i) => (ok[i - 1] === flag ? val : a));
  assert.equal(cli([]).status, 2);
  assert.equal(cli(ok.slice(2)).status, 2, 'no --ret');
  assert.equal(cli(swap('--ret', join(out, 'nope.json'))).status, 2);
  assert.equal(cli(swap('--ret', bad)).status, 2);
  assert.equal(cli(swap('--head', 'no-such-rev')).status, 2);
  assert.equal(cli(swap('--head', '--output=x')).status, 2);
  assert.equal(cli(swap('--repo', join(out, 'not-a-repo'))).status, 2);
  assert.equal(cli(ok).status, 0);
});

test('run dir: --run beats ZT_RUN_DIR beats the per-user marker (first line, ZT_MARKER_DIR); --out defaults to the run dir', () => {
  const proof = { mode: 'executed', ref: 'run-1', quote: 'FAILED', exit: 1 };
  const [flagDir, envDir, activeDir] = ['flag', 'env', 'active'].map(k => withLedger(inBase(k), `FAILED ${k}`));
  const marker = fresh('marker');
  ledger(marker, '.active', `${activeDir}\n${envDir}\n`);
  const q = id => ({ ...proof, quote: `FAILED ${id}` });
  const go = (id, o) => pc([cl({ proof: q(id) })], { withOut: false, ...o });
  assert.equal(go('flag', { run: flagDir, env: { ZT_RUN_DIR: envDir, ZT_MARKER_DIR: marker } }).clusters[0].check.ok, true);
  assert.equal(go('env', { run: null, env: { ZT_RUN_DIR: envDir, ZT_MARKER_DIR: marker } }).clusters[0].check.ok, true);
  assert.equal(go('active', { run: null, env: { ZT_MARKER_DIR: marker } }).clusters[0].check.ok, true);
  assert.ok(existsSync(join(activeDir, 'verified.json')) && existsSync(join(activeDir, 'evidence.md')), 'default out is the run dir');
  assert.ok(existsSync(join(envDir, 'verified.json')));
  assert.ok(existsSync(join(flagDir, 'verified.json')));
});

test('an explicit --run or ZT_RUN_DIR outside the per-user base is not used unless it is the marker target (an agent cannot aim the ledgers anywhere)', () => {
  const outside = withLedger(fresh('outside'), 'FAILED outside'), q = cl({ proof: { mode: 'executed', ref: 'run-1', quote: 'FAILED outside', exit: 1 } });
  assert.equal(pc([q], { run: outside }).clusters[0].check.reason, NOT_TRUSTED, '--run');
  assert.equal(pc([q], { run: null, env: { ZT_RUN_DIR: outside } }).clusters[0].check.reason, NOT_TRUSTED, 'ZT_RUN_DIR');
  const marker = fresh('marker');
  ledger(marker, '.active', `${outside}\n`);
  assert.equal(pc([q], { run: outside, env: { ZT_MARKER_DIR: marker } }).clusters[0].check.ok, true, 'the marker target is approved');
});

test('the old shared <tmpdir>/zt-review/.active is no longer consulted; a planted, loose or symlinked marker is ignored', () => {
  const planted = withLedger(fresh('planted'), 'FAILED planted'), tmp = fresh('tmp'), q = cl({ proof: { mode: 'executed', ref: 'run-1', quote: 'FAILED planted', exit: 1 } });
  mkdirSync(join(tmp, 'zt-review'), { mode: 0o700 });
  ledger(join(tmp, 'zt-review'), '.active', `${planted}\n`);
  assert.equal(pc([q], { run: null, env: { TMPDIR: tmp, ZT_MARKER_DIR: EMPTY_MARKER, XDG_RUNTIME_DIR: '', HOME: fresh('home') } }).clusters[0].check.reason, NOT_TRUSTED);  // EMPTY_MARKER, not '': '' would fall back to this host's real marker
  const loose = fresh('marker');
  ledger(loose, '.active', `${planted}\n`);
  chmodSync(loose, 0o777); // a marker dir others can write to
  assert.equal(pc([q], { run: null, env: { ZT_MARKER_DIR: loose } }).clusters[0].check.reason, NOT_TRUSTED);
  const looseFile = fresh('marker');
  ledger(looseFile, '.active', `${planted}\n`, 0o666); // a marker file others can write to
  assert.equal(pc([q], { run: null, env: { ZT_MARKER_DIR: looseFile } }).clusters[0].check.reason, NOT_TRUSTED);
  const linked = fresh('marker');
  symlinkSync(join(planted, 'exec.jsonl'), join(linked, '.active'));
  assert.equal(pc([q], { run: null, env: { ZT_MARKER_DIR: linked } }).clusters[0].check.reason, NOT_TRUSTED);
  const ok = fresh('marker');
  ledger(ok, '.active', `${planted}\n`);
  assert.equal(pc([q], { run: null, env: { ZT_MARKER_DIR: ok } }).clusters[0].check.ok, true, 'control: a clean marker works');
});

test('no run dir and no --out: usage error; no run dir but --out: every ledger proof reads as not trusted', () => {
  assert.equal(pc([cl()], { run: null, withOut: false }).status, 2);
  const r = pc(LEDGER_PROOFS, { run: null });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(reasons(r), { ex: NOT_TRUSTED, lg: NOT_TRUSTED, tn: NOT_TRUSTED, rd: 'OK' });
});

test('outputs go through runctx.writeSafe: a pre-planted symlink at verified.json or evidence.md is refused and its target untouched', () => {
  for (const leaf of ['verified.json', 'evidence.md']) {
    const out = fresh('out'), target = ledger(fresh('victim'), 'secret.txt', 'precious');
    symlinkSync(target, join(out, leaf));
    const r = pc([cl()], { out });
    assert.equal(r.status, 2, leaf);
    assert.match(r.stderr, /proofcheck:/);
    assert.equal(readFileSync(target, 'utf8'), 'precious', `${leaf} target untouched`);
    assert.equal(r.stdout, '', 'no results printed for outputs that were not written');
  }
});

test('a world- or group-writable --out dir is refused and nothing is written there; a symlinked --out dir too', () => {
  const real = fresh('out');
  for (const mode of [0o777, 0o770, 0o757]) {
    const out = fresh('out');
    chmodSync(out, mode);
    const r = pc([cl()], { out });
    assert.equal(r.status, 2, mode.toString(8));
    assert.match(r.stderr, /unsafe/i);
    assert.deepEqual(readdirSync(out), []);
  }
  const link = join(fresh('linkdir'), 'out');
  symlinkSync(real, link);
  const r = pc([cl()], { out: link });
  assert.equal(r.status, 2);
  assert.deepEqual(readdirSync(real), []);
});

test('outputs are 0600 and a missing --out is created 0700', () => {
  const out = join(fresh('out'), 'new');
  const r = pc([cl()], { out });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(statSync(out).mode & 0o777, 0o700);
  for (const f of ['verified.json', 'evidence.md']) assert.equal(statSync(join(out, f)).mode & 0o777, 0o600, f);
});

test('rerun replaces the previous outputs in place', () => {
  const out = fresh('out');
  pc([cl({ id: 'first' })], { out });
  const r = pc([cl({ id: 'second' })], { out });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.verified.clusters.map(c => c.id), ['second']);
  assert.doesNotMatch(r.md, /first/);
});

test('--out is created when missing and may differ from the run dir', () => {
  const run = runDir(), out = join(fresh('out'), 'deep', 'er');
  const r = pc([cl()], { run, out });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(out, 'verified.json')));
  assert.ok(!existsSync(join(run, 'verified.json')));
});

test('a return without clusters is fine', () => {
  const r = pc(undefined, { ret: {} });
  assert.deepEqual([r.status, r.clusters, r.verified.counts], [0, [], {}]);
});
