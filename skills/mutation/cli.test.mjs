// e2e tests for cli.mjs (ADR 0011 Interface): started as a child process on the calc fixture repo. It prints the Result as JSON and exits 0 (a result is data,
// even a failing one); a usage error exits 2. --scratch is optional: without it the CLI uses a temp dir of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UsageError } from './engine.mjs';
import { optionsOf } from './cli.mjs';
import { DIRECT_RUNNER, KILLED_LINE, MUTATION_DIR, NODE_CMD, SURVIVOR_LINE, calcRepo } from './fixtures/repo.mjs';

const CLI = join(MUTATION_DIR, 'cli.mjs');
function cli(argv) {
  return new Promise((done, fail) => {
    const p = spawn(process.execPath, [CLI, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.setEncoding('utf8').on('data', d => { stdout += d; });
    p.stderr.setEncoding('utf8').on('data', d => { stderr += d; });
    p.on('error', fail);
    p.on('close', code => done({ code, stdout, stderr }));
  });
}
const json = s => { try { return JSON.parse(s); } catch { return null; } };
const base = fx => ['--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--cmd', NODE_CMD, '--runner', DIRECT_RUNNER];

test('should print the Result as JSON and exit 0 when survivors fail the score (Module happy)', async t => {
  const fx = calcRepo(t);
  const r = await cli(base(fx));
  assert.equal(r.code, 0, r.stderr);
  const out = json(r.stdout);
  assert.ok(out, `stdout is one JSON document: ${r.stdout.slice(0, 200)}`);
  assert.ok(out.mutants.filter(m => m.line === KILLED_LINE).every(m => m.result === 'killed'));
  assert.ok(out.mutants.filter(m => m.line === SURVIVOR_LINE).every(m => m.result === 'survived'));
  assert.equal(out.pass, false);
  assert.equal(typeof out.score.value, 'number');
  assert.deepEqual(out.tests.run, ['test/calc.test.mjs']);
  // progress goes to stderr, one line per mutant, so stdout stays one JSON document
  const lines = r.stderr.trim().split('\n');
  assert.equal(lines.length, out.mutants.length, r.stderr);
  assert.match(lines.at(-1), new RegExp(`^mutation: ${out.mutants.length}/${out.mutants.length} (killed|survived) src/calc\\.mjs:\\d+$`));

  // --score-min, --equivalent, --reuse and --max reach the engine
  const eq = join(fx.dir, 'eq.json'), prev = join(fx.dir, 'prev.json');
  writeFileSync(prev, r.stdout);
  writeFileSync(eq, JSON.stringify({ schema: 1, marks: out.mutants.filter(m => m.result === 'survived')
    .map(m => ({ id: m.id, file: m.file, line: m.line, reason: 'untested helper judged equivalent here', judge: 'judge' })) }));
  const r2 = await cli([...base(fx), '--equivalent', eq, '--reuse', prev, '--score-min', '100', '--max', 'unlimited']);
  assert.equal(r2.code, 0, r2.stderr);
  const out2 = json(r2.stdout);
  assert.equal(out2.pass, true);
  assert.equal(out2.score.value, 100);
  assert.ok(out2.mutants.filter(m => m.result === 'killed').every(m => m.reused === true));
});

test('should exit 2 and print no Result when an option is not valid (Module fail)', async t => {
  const fx = calcRepo(t);
  for (const bad of [['--cmd', 'node x.mjs'], ['--score-min', '101'], ['--max', 'zero'], ['--bogus', '1']]) {
    const argv = [...base(fx)];
    const i = argv.indexOf(bad[0]);
    if (i >= 0) argv[i + 1] = bad[1]; else argv.push(...bad);
    const r = await cli(argv);
    assert.equal(r.code, 2, `${bad.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stderr.trim(), 'the usage error is on stderr');
    assert.equal(json(r.stdout), null);
  }
});

test('should print a Result with a reason and exit 0 when the change has nothing to mutate (Module edge)', async t => {
  const fx = calcRepo(t);
  const r = await cli([...base(fx).map(a => (a === fx.base ? fx.head : a))]);
  assert.equal(r.code, 0, r.stderr);
  const out = json(r.stdout);
  assert.equal(typeof out.reason, 'string');
  assert.equal(out.pass, false);
  assert.deepEqual(out.mutants, []);
});

test('should map every flag to its runMutation option when optionsOf reads a full argv (Module happy)', () => {
  const cwd = '/work';
  const o = optionsOf(['--repo', 'r', '--base', 'B', '--head', 'H', '--cmd', 'node {file}', '--runner', 'run.mjs', '--tests', 'a.test.mjs,,b.test.mjs', '--files', 'a.mjs:1-2',
    '--max', '5', '--budget', '2.5', '--jobs', '3', '--timeout', '7', '--score-min', '90', '--select', 'all', '--equivalent', 'eq.json', '--reuse', 'one.json', '--reuse', 'two.json',
    '--kill-exits', '1,2', '--link', 'venv', '--link', 'node_modules', '--ro', 'ro1', '--ro', 'ro2', '--env', 'A=1', '--env', 'B=2', '--scratch', 'tmp'], cwd);
  assert.deepEqual(o, { repo: resolve(cwd, 'r'), base: 'B', head: 'H', cmd: 'node {file}', runner: resolve(cwd, 'run.mjs'), files: 'a.mjs:1-2', tests: ['a.test.mjs', 'b.test.mjs'],
    max: 5, budget: 2.5, jobs: 3, timeout: 7, scoreMin: 90, select: 'all', equivalent: resolve(cwd, 'eq.json'), reuse: [resolve(cwd, 'one.json'), resolve(cwd, 'two.json')],
    killExits: [1, 2], link: ['venv', 'node_modules'], ro: [resolve(cwd, 'ro1'), resolve(cwd, 'ro2')], env: ['A=1', 'B=2'], scratch: resolve(cwd, 'tmp') });
  const words = optionsOf(['--repo', 'r', '--cmd', 'c {file}', '--runner', 'x', '--max', 'unlimited', '--budget', 'none', '--jobs', '1e3'], cwd);
  assert.deepEqual([words.max, words.budget, words.jobs, words.timeout, words.equivalent, words.reuse, words.link], ['unlimited', 'none', '1e3', undefined, undefined, [], []]);
});

test('should throw a UsageError when optionsOf gets a positional, an unknown flag or no --repo, --cmd or --runner (Module fail)', () => {
  const need = ['--repo', 'r', '--cmd', 'c {file}', '--runner', 'x'];
  for (const argv of [[...need, 'stray'], [...need, '--bogus', '1'], [...need, '--bogus'], need.slice(2), [...need.slice(0, 2), ...need.slice(4)], need.slice(0, 4)]) {
    assert.throws(() => optionsOf(argv), UsageError, JSON.stringify(argv));
  }
  assert.throws(() => optionsOf(need.slice(2)), /^UsageError: --repo is required$/);
});

test('should run nothing and print nothing when cli.mjs is imported instead of run (Module edge)', async () => {
  const r = await new Promise((done, fail) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CLI)}); console.log('imported');`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.setEncoding('utf8').on('data', d => { stdout += d; });
    p.stderr.setEncoding('utf8').on('data', d => { stderr += d; });
    p.on('error', fail);
    p.on('close', code => done({ code, stdout, stderr }));
  });
  assert.deepEqual([r.code, r.stdout, r.stderr], [0, 'imported\n', '']);
});
