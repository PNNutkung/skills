// The tdd.mjs CLI itself (ADR 0003): the few tests that still spawn it, a parity test and a fuzz test that run every command both ways (spawned and in-process main()),
// and the checks that an in-process call leaves no global state behind. Run: node --test tdd.cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExitError, main } from './tdd.mjs';
import { BETA_ROW, RET, TDD, TEST_ALPHA, TEST_BETA, argvOf, envOf, fixture, put, spawnTdd } from './test-fixture.mjs';

const lastJson = out => JSON.parse(out.trim().split('\n').pop());

// ---------------------------------------------------------------- spawned: the real CLI, exit codes and the paths that need a fresh process
test('cli: should exit 0 and print the Workflow args as the last stdout line when plan succeeds', t => {
  const fx = fixture(t);
  const r = fx.cli('plan', ['--plan', join(fx.dir, 'plan.json')]);
  assert.equal(r.status, 0, r.err);
  assert.equal(lastJson(r.out).base, fx.head);
  assert.match(r.err, /^PREFLIGHT ok=true verdict=ok[\s\S]*\nplan ok: 2 group\(s\)/);
});

test('cli: should exit 2 naming ZT_DIR when the zero-trust-review skill is not where ZT_DIR points', t => {
  const fx = fixture(t);
  const r = spawnTdd(['plan'], { ...process.env, ZT_DIR: join(fx.dir, 'nowhere') });
  assert.deepEqual([r.status, r.out], [2, '']);
  assert.match(r.err, /^tdd: the zero-trust-review skill is not at \S+nowhere \(set ZT_DIR\)/);
});

test('cli: should exit 2 with the usage line when the subcommand is unknown or missing', t => {
  const fx = fixture(t);
  for (const argv of [['bogus'], []]) {
    const r = spawnTdd(argv, envOf(fx));
    assert.deepEqual([r.status, r.out, r.err], [2, '', 'tdd: usage: tdd.mjs plan|preflight|red|green|dod|final|verify|resume|snap (see the header of tdd.mjs)\n'], JSON.stringify(argv));
  }
});

test('cli: should exit 1 with the parseArgs message when a flag is unknown or a value is missing (strict mode)', t => {
  const fx = fixture(t);
  const unknown = spawnTdd(['red', '--bogus'], envOf(fx));
  assert.equal(unknown.status, 1);
  assert.match(unknown.err, /^tdd: Unknown option '--bogus'/);
  const missing = spawnTdd(['red', '--group'], envOf(fx));
  assert.equal(missing.status, 1);
  assert.match(missing.err, /^tdd: Option '--group <value>' argument missing/);
});

test('cli: should exit 2 naming the fix when a flag in the environment is not valid', t => {
  const fx = fixture(t);
  for (const [env, re] of [[{ PTDD_AGENT_MAX: '0' }, /^tdd: PTDD_AGENT_MAX=0 is not valid/], [{ ZT_TEST_PROCESS_MAX: '0' }, /^tdd: ZT_TEST_PROCESS_MAX=0 is not valid/]]) {
    const r = fx.cli('plan', ['--plan', join(fx.dir, 'plan.json')], env);
    assert.deepEqual([r.status, r.out], [2, ''], JSON.stringify(env));
    assert.match(r.err, re);
  }
});

test('cli: should exit 3 when --run is not a run folder plan created', t => {
  const fx = fixture(t);
  const r = spawnTdd(['resume', '--run', fx.dir], envOf(fx));
  assert.equal(r.status, 3);
  assert.match(r.err, /^tdd: --run must be the run folder `tdd\.mjs plan` created/);
});

test('cli: should run nothing when tdd.mjs is imported instead of run', t => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(TDD)}); console.log('imported');`], { encoding: 'utf8', env: { ...process.env, ZT_MARKER_DIR: '/nonexistent' } });
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, 'imported\n', '']);
});

test('should leave MUTATION_DIR unchanged when the mutation skill sits beside ZT_DIR or MUTATION_DIR is already set (cli)', t => {
  const fx = fixture(t);
  const zt = join(fx.dir, 'zt-copy'); // a zero-trust-review elsewhere, with no mutation skill beside it
  mkdirSync(zt);
  const realZt = join(TDD, '..', '..', 'zero-trust-review');
  for (const f of readdirSync(realZt)) if (f.endsWith('.mjs')) symlinkSync(join(realZt, f), join(zt, f));
  const own = join(fx.dir, 'own-mutation'); // the caller's own spelling of a mutation skill
  symlinkSync(join(TDD, '..', '..', 'mutation'), own);
  const seen = more => {
    const env = { ...process.env, ZT_MARKER_DIR: '/nonexistent', ...more };
    for (const k of Object.keys(more)) if (more[k] === undefined) delete env[k];
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(TDD)}); console.log(process.env.MUTATION_DIR ?? 'unset');`], { encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  assert.equal(seen({ MUTATION_DIR: undefined, ZT_DIR: undefined }), 'unset', 'the default layout needs no MUTATION_DIR');
  assert.equal(seen({ MUTATION_DIR: own, ZT_DIR: zt }), own, 'a MUTATION_DIR the caller set is kept');
  assert.equal(seen({ MUTATION_DIR: undefined, ZT_DIR: zt }), join(TDD, '..', '..', 'mutation'), 'a ZT_DIR elsewhere is pointed at the mutation skill beside tdd.mjs');
});

test('cli: should run as the CLI when started through a symlink to tdd.mjs', t => {
  const fx = fixture(t);
  const link = join(fx.dir, 'tdd-link.mjs');
  symlinkSync(TDD, link);
  const r = spawnSync(process.execPath, [link, 'bogus'], { encoding: 'utf8', env: envOf(fx) });
  assert.deepEqual([r.status, r.stderr], [2, 'tdd: usage: tdd.mjs plan|preflight|red|green|dod|final|verify|resume|snap (see the header of tdd.mjs)\n']);
});

// ---------------------------------------------------------------- parity and fuzz: the same argv, the same fixture state, both ways
const FIXED_DATES = { GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' }; // snapshots are commits: a fixed date makes their shas the same both ways
/** what may differ between two runs of one command: timings, pids, the run folder and scratch names made from pid and time */
const normalize = (text, fx) => text
  .replace(/pat-[0-9a-f]{8}-[0-9a-z]+/g, 'pat-BASE-TIME')
  .replace(/pat-\d+-[0-9a-z]+/g, 'pat-PID-TIME')
  .replace(/\b\d+(\.\d+)?s\b/g, 'Ns')
  .replace(/"sec":[\d.]+/g, '"sec":N')
  .replaceAll(fx.dir, 'FX');
async function bothWays(fx, argv, env = {}) {
  const full = envOf(fx, { ...FIXED_DATES, ...env });
  const spawned = spawnTdd(argv, full);
  const inproc = await main(argv, { env: full });
  const a = { code: spawned.status, stdout: normalize(spawned.out, fx), stderr: normalize(spawned.err, fx) };
  const b = { code: inproc.code, stdout: normalize(inproc.stdout, fx), stderr: normalize(inproc.stderr, fx) };
  assert.deepEqual(b, a, `in-process differs from the CLI for ${JSON.stringify(argv)}`);
  return a;
}

test('parity: should give byte-identical stdout, stderr and exit code spawned and in-process when every subcommand runs on the same fixture state', async t => {
  const fx = fixture(t);
  const plan = await bothWays(fx, argvOf(fx, 'plan', ['--plan', join(fx.dir, 'plan.json')]));
  assert.equal(plan.code, 0, plan.stderr);
  fx.run = lastJson(spawnTdd(argvOf(fx, 'plan', ['--plan', join(fx.dir, 'plan.json')]), envOf(fx, FIXED_DATES)).out).runDir;
  const codes = [];
  const run = async (cmd, args = [], env = {}) => { const r = await bothWays(fx, argvOf(fx, cmd, args), env); codes.push(r.code); return r; };
  await run('preflight');
  await run('red'); // no --group: exit 2
  await run('resume');
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  await run('red', ['--group', 'a']);
  await run('red', ['--group', 'zzz']); // unknown group: exit 2
  await run('dod', ['--group', 'a', '--stage', 'red', '--row', 'AC1:happy:test_ac1_happy:tests/test_alpha.sh']);
  await run('dod', ['--group', 'a', '--stage', 'blue']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await run('green', ['--group', 'a']);
  await run('red', ['--group', 'b']);
  put(fx.repo, { 'src/beta.txt': 'beta\n' });
  await run('green', ['--group', 'b', '--quick']);
  await run('green', ['--group', 'b']);
  await run('dod', ['--group', 'b', '--stage', 'green', '--row', 'AC2:happy:test_ac2_happy:tests/test_beta.sh']);
  await run('final');
  await run('final', ['--again']);
  const ret = join(fx.dir, 'ret.json');
  writeFileSync(ret, JSON.stringify({ ...RET(BETA_ROW), clusters: [{ id: 'C-1', status: 'confirmed', severity: 'low', file: 'src/alpha.txt', startLine: 1, endLine: 1, title: 'x', quote: 'new' }] }));
  await run('verify', ['--ret', ret]);
  await run('verify'); // no --ret: exit 2
  await run('resume', ['--ret', ret]);
  await run('resume', ['--group', 'b', '--max-repairs', '3']);
  await run('resume', ['--hint', 'a=']);
  await run('snap', ['--on', 'HEAD', '--files', 'src/alpha.txt']);
  await run('snap');
  await run('red', ['--group', 'a'], { ZT_TEST_PROCESS_MAX: 'x' }); // a flag that is not valid at gate time
  assert.deepEqual(codes, [0, 2, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 2], 'the success and the error paths of every command');
  assert.ok(existsSync(join(fx.run, 'gates', 'verify.json')), 'the commands did their work');
});

/** mulberry32: a small seeded generator, so the fuzz cases are the same on every run */
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const CMDS = ['plan', 'preflight', 'dod', 'resume', 'snap', 'verify', 'red', 'bogus', '', '--run', '-h'];
const FLAGS = ['--group', '--stage', '--row', '--ret', '--on', '--files', '--max-repairs', '--hint', '--retry', '--escalate', '--plan', '--bogus', '--quick', '--again', '-x', '--', '--run'];
const VALUES = ['a', 'b', 'zzz', '', 'red', 'green', '0', '41', '-1', 'a=', 'a=hint', 'HEAD', 'src/alpha.txt,', 'AC1:happy:test_ac1_happy:tests/test_alpha.sh', 'nonsense', '../../etc', 'café', ' spaced '];
function fuzzArgv(next, run) {
  const pick = list => list[Math.floor(next() * list.length)];
  const argv = [pick(CMDS)];
  if (next() < 0.7) argv.push('--run', next() < 0.85 ? run : pick(VALUES));
  for (let n = Math.floor(next() * 4); n > 0; n--) {
    const f = pick(FLAGS), r = next();
    if (r < 0.15) argv.push(f);
    else if (r < 0.3) argv.push(`${f}=${pick(VALUES)}`);
    else argv.push(f, pick(VALUES));
  }
  return argv;
}

test('fuzz: should give the same result spawned and in-process when the argv is random (unknown flags, missing values, odd values, unknown subcommands)', async t => {
  const fx = fixture(t);
  fx.run = lastJson(fx.cli('plan', ['--plan', join(fx.dir, 'plan.json'), '--skip-preflight']).out).runDir;
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  const next = rng(19), seen = new Set();
  for (let i = 0; i < 30; i++) {
    const argv = [...fuzzArgv(next, fx.run), '--runner', fx.runner];
    const r = await bothWays(fx, argv);
    seen.add(r.code);
  }
  assert.ok(seen.has(0) && seen.has(1) && seen.has(2), `the cases reach success, parse errors and usage errors: ${[...seen]}`);
});

// ---------------------------------------------------------------- NoLeak: an in-process call leaves no global state behind
const globals = () => ({ env: JSON.stringify(process.env), cwd: process.cwd(), exitCode: process.exitCode, argv: JSON.stringify(process.argv) });

test('main: should leave process.env, process.cwd(), process.argv and process.exitCode as they were when a command succeeds, fails or runs tests', async t => {
  const fx = fixture(t);
  const before = globals();
  assert.equal(process.env.ZT_RUN_DIR, undefined);
  const plan = await fx.plan();
  assert.equal(plan.status, 0, plan.err);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA });
  assert.equal((await fx.tdd('red', ['--group', 'a'])).status, 0);
  assert.equal((await fx.tdd('red', [])).status, 2);
  assert.equal((await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], { PTDD_AGENT_MAX: 'x' })).status, 2);
  assert.equal((await main(['red', '--bogus'], { env: envOf(fx) })).code, 1);
  assert.deepEqual(globals(), before, 'ZT_RUN_DIR, TMPDIR, ZT_MARKER_DIR and the flags were only ever in the injected env');
});

test('main: should never call process.exit and return the exit code and the tdd: line when a command fails', async t => {
  const fx = fixture(t);
  const exit = process.exit;
  process.exit = code => { throw new Error(`process.exit(${code}) called`); };
  try {
    const usage = await main(['bogus'], { env: envOf(fx) });
    assert.deepEqual([usage.code, usage.stdout, usage.stderr], [2, '', 'tdd: usage: tdd.mjs plan|preflight|red|green|dod|final|verify|resume|snap (see the header of tdd.mjs)\n']);
    const untrusted = await main(['resume', '--run', fx.dir], { env: envOf(fx) });
    assert.equal(untrusted.code, 3);
    assert.deepEqual(untrusted.chunks, [[2, untrusted.stderr]], 'the output in write order, for the CLI to replay');
  } finally { process.exit = exit; }
  assert.equal(new ExitError(3, 'x').code, 3);
});

test('main: should not carry state from one call into the next when called twice, or twice at once', async t => {
  const fx = fixture(t);
  assert.equal((await fx.plan()).status, 0);
  const env = envOf(fx, FIXED_DATES), snap = argvOf(fx, 'snap', ['--files', 'src/alpha.txt']);
  const [a, b] = await Promise.all([main(snap, { env }), main(snap, { env })]);
  const c = await main(snap, { env });
  assert.deepEqual([b.stdout, c.stdout, a.code], [a.stdout, a.stdout, 0], 'the snapshot counter and the run folder belong to one call');
  assert.equal(env.ZT_RUN_DIR, undefined, 'the injected env object is copied, never written');
  const other = fixture(t);
  const r = await main(['resume', '--run', other.dir], { env: envOf(other) });
  assert.equal(r.code, 3, 'the run folder of an earlier call does not stand in for a bad --run');
});

test('main: should resolve relative paths against the injected cwd when it is not the process cwd', async t => {
  const fx = fixture(t);
  const r = await main(['plan', '--plan', 'plan.json', '--runner', 'stub/stub-runner'], { env: envOf(fx), cwd: fx.dir });
  assert.equal(r.code, 0, r.stderr);
  const args = lastJson(r.stdout);
  assert.equal(JSON.parse(readFileSync(join(args.runDir, 'plan.json'), 'utf8')).repo, fx.repo);
  const miss = await main(['plan', '--plan', 'plan.json'], { env: envOf(fx), cwd: join(fx.dir, 'repo') });
  assert.equal(miss.code, 2, 'the same relative path from another cwd is another file');
});

// cwd: linked (rules/checks/inproc-cwd.mjs, rules/paths.md): a started process sees its cwd as a real path (macOS /var -> /private/var), so main must too
test('main: should give the same result as the CLI started there when the injected cwd is a linked folder', async t => {
  const fx = fixture(t);
  const linked = join(fx.tmp, 'linked');
  symlinkSync(fx.dir, linked);
  const env = envOf(fx, FIXED_DATES), seen = text => normalize(text, fx).replaceAll(linked, 'LINK');
  for (const argv of [['plan', '--plan', 'plan.json', '--runner', 'stub/stub-runner'], ['plan', '--plan', 'missing.json'], ['resume', '--run', 'tmp', '--runner', 'stub/stub-runner']]) {
    const spawned = spawnTdd(argv, env, linked), inproc = await main(argv, { env, cwd: linked });
    assert.deepEqual({ code: inproc.code, stdout: seen(inproc.stdout), stderr: seen(inproc.stderr) },
      { code: spawned.status, stdout: seen(spawned.out), stderr: seen(spawned.err) }, JSON.stringify(argv));
  }
});

test('main: should give the test runner RUN as ZT_RUN_DIR in its own env when a command runs tests in-process', async t => {
  const fx = fixture(t);
  mkdirSync(join(fx.dir, 'marker'), { recursive: true });
  const r = await main(['plan', '--plan', join(fx.dir, 'plan.json')], { env: envOf(fx) }); // no --runner: direct-run.mjs, which writes the ledger of RUN/exec.jsonl
  assert.equal(r.code, 0, r.stderr);
  const run = lastJson(r.stdout).runDir;
  assert.match(readFileSync(join(run, 'exec.jsonl'), 'utf8'), /existing_alpha/, 'the preflight command is in the ledger of this run');
  assert.equal(process.env.ZT_RUN_DIR, undefined);
});
