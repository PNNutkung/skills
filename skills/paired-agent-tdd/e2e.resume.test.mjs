// End to end for "continue after a failure": the REAL workflow.js and the REAL gates in a fixture repo, scripted agents, the direct runner (E2E_REAL=1: the real sandbox). Run 1 has no repair budget and
// a lazy GREEN pass, so its group is PAUSED. `tdd.mjs resume` writes RUN/continue.json from the gate files alone (no agent, no token). Run 2 gets that file as args.resume and
// spends only what is left: one repair, one check, the review. Run: node e2e.resume.test.mjs
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TDD = join(HERE, 'tdd.mjs');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-resume-')));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const repo = join(dir, 'repo'), tmp = join(dir, 'tmp');
for (const d of [repo, tmp]) mkdirSync(d);
process.env.TMPDIR = tmp;
process.env.ZT_MARKER_DIR = join(dir, 'marker');
const REAL = process.env.E2E_REAL === '1'; // opt-in: the zero-trust-review sandbox and this node binary instead of the direct runner (the default of a plan)
const NODE = realpathSync(process.execPath);
const RUNNER = REAL ? join(HERE, '..', 'zero-trust-review', 'sandbox-run.mjs') : join(HERE, 'direct-run.mjs');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
git('init', '-q');
put('package.json', '{"type":"module"}\n');
put('tests/test_base.mjs', "import { test } from 'node:test';\ntest('the base still passes', () => {});\n"); // plan's preflight runs it through the sandbox first
git('add', '-A'); git('commit', '-qm', 'base');

writeFileSync(join(dir, 'plan.json'), JSON.stringify({
  repo, cmd: `${REAL ? NODE : 'node'} --test {file}`, ...(REAL ? { ro: [dirname(dirname(NODE))] } : {}), mutation: { off: true }, maxRepairs: 0,
  dod: [{ id: 'AC1', text: 'double(n) returns n * 2 and throws TypeError for a non-number', source: 'assumed' }],
  groups: [{ id: 'a', goal: 'double', tests: ['tests/test_double.mjs'], src: ['src/double.mjs'], dod: ['AC1'], after: [] }],
}));
const planned = spawnSync(process.execPath, [TDD, 'plan', '--plan', join(dir, 'plan.json'), '--runner', RUNNER], { encoding: 'utf8' });
assert.equal(planned.status, 0, planned.stderr);
assert.match(planned.stderr, /PREFLIGHT ok=true verdict=ok: tests\/test_base\.mjs passed in the sandbox/, 'a test that passes at the base proved the sandbox and the command before any agent');
const ARGS = JSON.parse(planned.stdout.trim().split('\n').pop()), run = ARGS.runDir;
assert.equal(ARGS.preflight, 'ok');

const TESTS = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { double } from '../src/double.mjs';
test('test_ac1_happy_two', () => assert.equal(double(2), 4));
test('test_ac1_fail_not_a_number', () => assert.throws(() => double('x'), TypeError));
test('test_ac1_edge_zero', () => assert.equal(double(0), 0));
`;
const LAZY = 'export const double = n => n * 2;\n'; // forgets the TypeError
const GOOD = "export function double(n) {\n  if (typeof n !== 'number') throw new TypeError('n must be a number');\n  return n * 2;\n}\n";
const ROWS = [['happy', 'test_ac1_happy_two'], ['fail', 'test_ac1_fail_not_a_number'], ['edge', 'test_ac1_edge_zero']].map(([kind, test]) => ({ dod: 'AC1', kind, test, file: 'tests/test_double.mjs' }));

const tdd = (cmd, args) => spawnSync(process.execPath, [TDD, cmd, '--run', run, '--runner', RUNNER, ...args], { encoding: 'utf8' });
function gate(prompt) {
  const m = /node (\S+\/tdd\.mjs) (red|green|final) --run ([^\s`]+)(?: --group (\w+))?( --retest)?( --again)?/.exec(prompt);
  assert.ok(m, 'the prompt names no gate command');
  const out = tdd(m[2], [...(m[4] ? ['--group', m[4]] : []), ...(m[5] ? ['--retest'] : []), ...(m[6] ? ['--again'] : [])]);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const sh = cmd => { const out = spawnSync('sh', ['-c', cmd], { encoding: 'utf8' }); assert.equal(out.status, 0, out.stderr); return out.stdout; };
const dods = prompt => [...prompt.matchAll(/`(node \S+\/tdd\.mjs dod [^`(]+)`/g)].map(m => sh(m[1]));
const ok = out => /ok=true/.test(out);
const verdict = (out, dd = []) => (ok(out) && dd.every(ok) ? { verdict: 'PASS', defects: [], gateOk: true } : { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'impl', what: [out, ...dd].join('\n').slice(0, 300) }] });

function launch(args, script) {
  const labels = [];
  const agent = async (prompt, o) => {
    labels.push(o.label);
    if (/^(red|green)-navigator:/.test(o.label)) { const out = gate(prompt); return verdict(out, dods(prompt)); }
    const f = script[o.label];
    assert.ok(f, `no script for ${o.label}`);
    return f(prompt);
  };
  return wf(agent, parallel, async () => [], () => {}, () => {}, args, {}).then(out => ({ out, labels }));
}

// ---- run 1: no repair budget, a lazy GREEN driver -> the group is paused, nothing is retried ----
const run1 = await launch({ ...ARGS, maxRepairs: 0 }, {
  'red-driver:a': () => { put('tests/test_double.mjs', TESTS); return { matrix: ROWS, files: ['tests/test_double.mjs'], reuse: 'none' }; },
  'green-driver:a': () => { put('src/double.mjs', LAZY); return { files: ['src/double.mjs'], reuse: 'none', cleanup: 'none' }; },
});
assert.deepEqual(run1.labels, ['red-driver:a', 'red-navigator:a', 'green-driver:a', 'green-navigator:a']);
assert.equal(run1.out.groups.a.state, 'paused', JSON.stringify(run1.out.groups.a.reason));
assert.match(run1.out.groups.a.reason, /repair budget \(0\) is spent[\s\S]*tdd\.mjs resume \(it sets the next budget: --max-repairs N\)/);
assert.match(run1.out.postmortemMd, /Continue without re-reading anything/);
const retFile = join(dir, 'return.json');
writeFileSync(retFile, JSON.stringify(run1.out));

// ---- the lead: one plain-code command, no agent ----
const res = tdd('resume', ['--ret', retFile]);
assert.equal(res.status, 0, res.stderr);
assert.match(res.stdout, /1 of 1 group\(s\) need work/);
assert.match(res.stdout, /next run: repair budget 2 \(2 for each of the 1 group\(s\) that still work\)/, 'the lead sees what the next run may spend, before it starts');
const cont = JSON.parse(readFileSync(join(run, 'continue.json'), 'utf8'));
assert.equal(cont.base, ARGS.base);
assert.equal(cont.maxRepairs, 2, 'continuing is decided HERE: the plan\'s own maxRepairs (0, in ARGS) no longer pauses the new run at once');
assert.equal(cont.groups.a.next, 'green-fix', 'the GREEN gate is fresh and not ok: the group continues with a repair, not from scratch');
assert.deepEqual(cont.groups.a.matrix.map(r => r.test), ROWS.map(r => r.test), 'the matrix came back from the saved state, written by the dod command of the navigator');
assert.ok(cont.groups.a.defects.some(d => /tests\/test_double\.mjs is fails-on-head[\s\S]*does not pass with the group's code/.test(d.what)), 'the defect is read off the gate file, next to what the navigator said');

// ---- run 2: args.resume = continue.json: RED, the first driver and the first check are skipped ----
const run2 = await launch({ ...ARGS, resume: cont }, { // ARGS still carries the plan's maxRepairs: 0; continue.json decides the budget of this run
  'green-driver:a:rework': prompt => { put('src/double.mjs', GOOD); const out = gate(prompt); return { files: ['src/double.mjs'], reuse: 'none', cleanup: 'none', gateOk: ok(out), gateRuns: 1 }; },
  reviewer: prompt => { gate(prompt); return { findings: [] }; },
});
assert.deepEqual(run2.labels, ['green-driver:a:rework', 'green-navigator:a:recheck', 'reviewer'], 'only what was left: one repair, one check, the review');
assert.deepEqual([run2.out.groups.a.state, run2.out.groups.a.red.carried, run2.out.groups.a.green.reworks], ['done', true, 1]);
assert.deepEqual(run2.out.notDone, []);
writeFileSync(retFile, JSON.stringify(run2.out));

// ---- the lead's audit of the combined result ----
const v = tdd('verify', ['--ret', retFile]);
assert.equal(v.status, 0, v.stderr);
const audit = JSON.parse(v.stdout.trim().split('\n').pop());
assert.deepEqual([audit.dod.covered, audit.dod.total, audit.dod.gaps, audit.final, audit.overridden, audit.notDone], [3, 3, [], true, [], []], 'the carried RED and the repaired GREEN still close the DoD');
// and once it is all done, a second resume carries the group over with nothing left to spend
tdd('resume', ['--ret', retFile]);
assert.equal(JSON.parse(readFileSync(join(run, 'continue.json'), 'utf8')).groups.a.next, 'done');
assert.equal(git('rev-list', '--count', 'HEAD'), '1', 'no commit was made on the user\'s branch');
console.log(`ok - paired-agent-tdd resume end to end${REAL ? ' (REAL sandbox)' : ''}: run 1 paused (budget 0) -> tdd.mjs resume (no agent, sets the next budget) -> run 2 spent 3 agents (repair, check, review) and closed the DoD 3/3`);
