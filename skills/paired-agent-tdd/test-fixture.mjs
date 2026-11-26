// Shared fixture of the tdd.*.test.mjs files: fixture git repos plus sh stub runners, so no real sandbox is needed, and tdd.mjs runs IN-PROCESS (main(argv, { env, cwd })).
// tdd.cli.test.mjs is the one file that starts the real CLI (spawned tests, parity, fuzz); every other call goes through fx.tdd -> main.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEED_ENV, SPEED_OFF_ENV } from './speed.mjs';
import { main } from './tdd.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const TDD = join(HERE, 'tdd.mjs');
Object.assign(process.env, SPEED_OFF_ENV); // the tests above the speed section test the v2.0.0 pipeline; the speed section sets its flags per command
export const hasPython = spawnSync('python3', ['--version']).status === 0;

// Honors the runner flags, then runs the command after `--` in --cwd with the --env pairs. Each command line goes to calls.log next to the script; config.json {"exit": N}
// fakes N (86/124/127) for every run. A sh script, run directly (probelib runs a runner that is not a node file itself): no node start per test command.
export const STUB = `#!/bin/sh
d=$(dirname "$0")
if [ "$1" = --check ]; then echo stub; exit 0; fi
n=$#; cwd=.; cmd=0; log=
while [ "$n" -gt 0 ]; do
  a=$1; shift; n=$((n - 1))
  if [ "$cmd" = 1 ]; then set -- "$@" "$a"; log="$log\${log:+ }$a"; continue; fi
  case $a in
    --) cmd=1 ;;
    --cwd) cwd=$1; shift; n=$((n - 1)) ;;
    --env) set -- "$@" "$1"; shift; n=$((n - 1)) ;;
    *) shift; n=$((n - 1)) ;;
  esac
done
printf '%s\\n' "$log" >> "$d/calls.log"
fake=$(sed -n 's/.*"exit": *\\([0-9][0-9]*\\).*/\\1/p' "$d/config.json")
if [ -n "$fake" ] && [ "$fake" != 0 ]; then exit "$fake"; fi
cd "$cwd" || exit 1
exec env "$@"
`;
export const writeRunner = (file, text) => { writeFileSync(file, text); chmodSync(file, 0o755); return file; };

// maintenance.auto=false: a commit starts no `git maintenance run --auto` process
export const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', ...a], { encoding: 'utf8' }).trim();
export const put = (repo, files) => {
  for (const [p, c] of Object.entries(files)) {
    const f = join(repo, p);
    if (c === null) rmSync(f, { force: true });
    else { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, c); }
  }
};

export const PLAN = repo => ({
  repo, cmd: 'sh {file}', mutation: { max: 8, budget: 30 },
  dod: [{ id: 'AC1', text: 'alpha says new', source: 'assumed', kinds: ['happy'] }, { id: 'AC2', text: 'beta says beta', source: 'assumed', kinds: ['happy'] }],
  groups: [{ id: 'a', tests: ['tests/test_alpha.sh'], src: ['src/alpha.txt'], dod: ['AC1'], after: [] }, { id: 'b', tests: ['tests/test_beta.sh'], src: ['src/beta.txt'], dod: ['AC2'], after: ['a'] }],
});

/** the env a command of this fixture runs with: TMPDIR=tmp (the per-user zt-review base lives in the fixture), the fixture's marker dir, then the test's own */
export const envOf = (fx, env = {}) => ({ ...process.env, TMPDIR: fx.tmp, ZT_MARKER_DIR: join(fx.dir, 'marker'), ...env });
/** the argv of a fixture command: the run folder (once planned) and the stub runner come first, as the tests always gave them */
export const argvOf = (fx, cmd, args = []) => [cmd, ...(fx.run && cmd !== 'plan' ? ['--run', fx.run] : []), '--runner', fx.runner, ...args];
/** the real CLI, spawned: only tdd.cli.test.mjs and the few tests that need a fresh process (ZT_DIR is read when tdd.mjs loads) */
export const spawnTdd = (argv, env, cwd) => { const r = spawnSync(process.execPath, [TDD, ...argv], { encoding: 'utf8', env, ...(cwd ? { cwd } : {}) }); return { status: r.status, out: r.stdout, err: r.stderr }; };

// The base repo of each set of files is built once a process and copied into each fixture (ADR 0008): git init, add and commit cost about 40 ms CPU a repo,
// a copy a few. Each test still gets its own repo.
const templates = new Map();
let templateRoot;
function baseRepo(files) {
  const key = JSON.stringify(files);
  if (!templates.has(key)) {
    if (!templateRoot) {
      templateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'pat-tpl-')));
      process.on('exit', () => rmSync(templateRoot, { recursive: true, force: true }));
    }
    const repo = join(templateRoot, String(templates.size));
    mkdirSync(repo);
    git(repo, 'init', '-q');
    put(repo, files);
    git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
    templates.set(key, { repo, head: git(repo, 'rev-parse', 'HEAD') });
  }
  return templates.get(key);
}

// base: src/alpha.txt=old, tests/existing_alpha.sh (needs a file src/alpha.txt). Nothing in the user's repo is ever committed by the gates.
export function fixture(t, { files = {}, plan = {}, fake = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo'), stub = join(dir, 'stub'), tmp = join(dir, 'tmp');
  for (const d of [stub, tmp]) mkdirSync(d); // TMPDIR=tmp: the per-user zt-review base (the only place the ledger tools approve a run folder) lives in the fixture
  const base = baseRepo({ 'src/alpha.txt': 'old\n', 'tests/existing_alpha.sh': 'test -f src/alpha.txt\n', ...files });
  cpSync(base.repo, repo, { recursive: true });
  writeRunner(join(stub, 'stub-runner'), STUB);
  writeFileSync(join(stub, 'config.json'), JSON.stringify(fake));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...PLAN(repo), ...(typeof plan === 'function' ? plan(repo) : plan) }));
  const fx = { dir, repo, tmp, runner: join(stub, 'stub-runner'), stub, head: base.head, run: undefined };
  fx.tdd = async (cmd, args = [], env = {}) => {
    const r = await main(argvOf(fx, cmd, args), { env: envOf(fx, env) });
    return { status: r.code, out: r.stdout, err: r.stderr };
  };
  fx.cli = (cmd, args = [], env = {}) => spawnTdd(argvOf(fx, cmd, args), envOf(fx, env)); // the same command through the real CLI
  fx.plan = async (extra = []) => {
    const r = await fx.tdd('plan', ['--plan', join(dir, 'plan.json'), ...extra]);
    if (r.status === 0) fx.run = JSON.parse(r.out.trim().split('\n').pop()).runDir;
    return r;
  };
  fx.gate = name => JSON.parse(readFileSync(join(fx.run, 'gates', name), 'utf8'));
  return fx;
}
export const planned = async (t, opts) => { const fx = fixture(t, opts); const r = await fx.plan(opts?.flags ?? []); assert.equal(r.status, 0, r.err); return fx; };
export const TEST_ALPHA = '# test_ac1_happy\ngrep -q new src/alpha.txt\n';
export const TEST_BETA = '# test_ac2_happy\ngrep -q new src/alpha.txt && grep -q beta src/beta.txt\n';

export const ROW_A = 'AC1:happy:test_ac1_happy:tests/test_alpha.sh';
export const dod = (fx, stage, rows = [ROW_A], group = 'a') => fx.tdd('dod', ['--group', group, '--stage', stage, ...rows.flatMap(r => ['--row', r])]);

export const resumeOf = async (fx, args = []) => { const r = await fx.tdd('resume', args); assert.equal(r.status, 0, r.err); return r; };
export const continueOf = fx => JSON.parse(readFileSync(join(fx.run, 'continue.json'), 'utf8')).groups;
export const ROW = { dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' };

export const PY_TEST = 'cd "$(dirname "$0")/.." && python3 -c "from src.calc import sign; assert sign(5) == 1"\n';

export const RET = (matrix, extra = {}) => ({
  groups: { a: { state: 'done', red: { verdict: 'PASS' }, green: { verdict: 'PASS' }, matrix: [{ dod: 'AC1', kind: 'happy', test: 'test_ac1_happy', file: 'tests/test_alpha.sh' }] },
    b: { state: 'done', red: { verdict: 'PASS' }, green: { verdict: 'PASS' }, matrix }, ...extra }, clusters: [],
});
export const BETA_ROW = [{ dod: 'AC2', kind: 'happy', test: 'test_ac2_happy', file: 'tests/test_beta.sh' }];

export async function built(t) {
  const fx = await planned(t);
  put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA, 'tests/test_beta.sh': TEST_BETA });
  await fx.tdd('red', ['--group', 'a']); await fx.tdd('red', ['--group', 'b']);
  put(fx.repo, { 'src/alpha.txt': 'new\n' });
  await fx.tdd('green', ['--group', 'a']);
  put(fx.repo, { 'src/beta.txt': 'beta\n' });
  await fx.tdd('green', ['--group', 'b']);
  return fx;
}
export const verify = async (fx, ret) => { const f = join(fx.dir, 'ret.json'); writeFileSync(f, JSON.stringify(ret)); const r = await fx.tdd('verify', ['--ret', f]); assert.equal(r.status, 0, r.err); return JSON.parse(r.out.trim().split('\n').pop()); };

// ---------------------------------------------------------------- fast mode (plan.mode "fast"): opt-in, the default plan must not change
export const FAST = { plan: { mode: 'fast' } };

// the Workflow's own dry run (mode "plan", as the lead runs it) over the args a plan printed: no agent, no model
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
export const dryRun = args => new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''))(async () => null, ts => Promise.all(ts.map(f => f())), async () => [], () => {}, () => {}, { ...args, mode: 'plan' }, {});

// ---------------------------------------------------------------- speed flags (ADR 0001): plan reads them once; the gates read plan.speed and their own options
export const ON_ENV = Object.fromEntries(Object.values(SPEED_ENV).map(k => [k, '']));
export const testRuns = fx => { try { return readFileSync(join(fx.stub, 'calls.log'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
export const plannedWith = async (t, env, opts) => { const fx = fixture(t, opts), r = await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], env); assert.equal(r.status, 0, r.err); fx.run = JSON.parse(r.out.trim().split('\n').pop()).runDir; return { fx, args: JSON.parse(r.out.trim().split('\n').pop()), err: r.err }; };
export const plan_ = fx => JSON.parse(readFileSync(join(fx.run, 'plan.json'), 'utf8'));
export const redThenCode = async fx => { put(fx.repo, { 'tests/test_alpha.sh': TEST_ALPHA }); await fx.tdd('red', ['--group', 'a']); put(fx.repo, { 'src/alpha.txt': 'new\n' }); };

// ---------------------------------------------------------------- review fixes (PR #22): zero-trust-review flags at the gates, the process cap per gate, cross-group regressions at verify
export const ZT_OFF_ENV = { ZT_MUTATION_BASELINE_REUSE_ENABLED: 'false', ZT_MUTATION_BUDGET_STRICT_ENABLED: 'false', ZT_TEST_PROCESS_MAX: '' };
export const ALL_OFF_ENV = { ...SPEED_OFF_ENV, ...ZT_OFF_ENV };
export const BAD_ZT = [['ZT_MUTATION_BUDGET_STRICT_ENABLED', 'yes', /ZT_MUTATION_BUDGET_STRICT_ENABLED=yes is not valid: use true or false/],
  ['ZT_MUTATION_BASELINE_REUSE_ENABLED', '1', /ZT_MUTATION_BASELINE_REUSE_ENABLED=1 is not valid: use true or false/],
  ['ZT_TEST_PROCESS_MAX', '0', /ZT_TEST_PROCESS_MAX=0 is not valid: use a whole number above 0, or unlimited/]];

// a copy of zero-trust-review whose mutation probe crashes (exit 2, no JSON): what an invalid flag did to it before the gates validated the flags themselves
export function crashingZt(fx) {
  const zt = join(fx.dir, 'zt');
  execFileSync('cp', ['-R', join(HERE, '..', 'zero-trust-review'), zt]);
  writeFileSync(join(zt, 'mutate.mjs'), "console.error('mutate: boom'); process.exit(2);\n");
  return zt;
}

// Like the real runner: each command leaves a marker in live/ while it lasts and logs how many it saw (peak.log), next to the runner file, shared by every process of a gate.
// A sh script like STUB: the marker is the shell's pid, removed when the command ends (SIGTERM kills the command).
export const PEAK_STUB = `#!/bin/sh
d=$(dirname "$0")
if [ "$1" = --check ]; then echo stub; exit 0; fi
n=$#; cwd=.; cmd=0
while [ "$n" -gt 0 ]; do
  a=$1; shift; n=$((n - 1))
  if [ "$cmd" = 1 ]; then set -- "$@" "$a"; continue; fi
  case $a in
    --) cmd=1 ;;
    --cwd) cwd=$1; shift; n=$((n - 1)) ;;
    --env) set -- "$@" "$1"; shift; n=$((n - 1)) ;;
    *) shift; n=$((n - 1)) ;;
  esac
done
mkdir -p "$d/live"
me="$d/live/$$"
: > "$me"
ls "$d/live" | wc -l >> "$d/peak.log"
cd "$cwd" || { rm -f "$me"; exit 1; }
env "$@" &
pid=$!
trap 'kill -KILL $pid 2>/dev/null' TERM
wait $pid
code=$?
rm -f "$me"
echo "ZT-RUN stub exit=$code" >&2
exit $code
`;
export const peakRunner = fx => {
  const d = mkdtempSync(join(fx.dir, 'peak-')), runner = writeRunner(join(d, 'peak-runner'), PEAK_STUB);
  fx.runner = runner;
  return { reset: () => rmSync(join(d, 'peak.log'), { force: true }), peak: () => { try { return Math.max(0, ...readFileSync(join(d, 'peak.log'), 'utf8').split('\n').filter(Boolean).map(Number)); } catch { return 0; } } };
};
export const CALC = repo => ({ cover: 'sleep 0.2; : > {out}', dod: [{ id: 'AC1', text: 'f gives 2 and g gives 3', source: 'assumed', kinds: ['happy'] }],
  groups: [{ id: 'a', tests: ['tests/test_calc.sh', 'tests/test_calc2.sh'], src: ['src/calc.mjs'], dod: ['AC1'], after: [] }] });
export const calcTest = (name, fn, want) => `# ${name}\nsleep 0.2\n${process.execPath} -e "import('./src/calc.mjs').then(m => process.exit(m.${fn}() === ${want} ? 0 : 1))"\n`;
