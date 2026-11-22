// The real qa-sweep chain on a fixture repo, nothing stubbed: run.mjs start, mutate.mjs --files through direct-run.mjs with ZT_RUN_DIR (a survivor),
// a new test and its passing run, run.mjs snap, a second mutate.mjs on the snap (the kill), then findings.mjs --tiers-py. Run: node --test e2e.test.mjs
// flags: defaults. No QA_* flag is set, so QA_ADR_AUTO_FIND_ENABLED runs at its default; see rules/flag-defaults-e2e.md.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZT = process.env.ZT_DIR ?? join(HERE, '..', 'zero-trust-review');
const DIRECT = join(HERE, '..', 'paired-agent-tdd', 'direct-run.mjs');
const TIERS_PY = join(HERE, '..', '..', 'hooks', 'pr-test-tiers', 'pr-test-tiers.py');
const skip = spawnSync('python3', ['--version']).status !== 0 && 'python3 not available';
const mk = p => mkdtempSync(join(tmpdir(), p));

const CALC = 'def classify(n):\n    if n >= 10:\n        return "big"\n    return "small"\n\n\ndef half(n):\n    return n / 2\n';
const SPEC = '# Calc\n\nhalf(n) returns n divided by 2.\n';
// pins classify and says nothing about half: half's mutants survive
const TEST_CALC = 'from src.calc import classify\nassert classify(10) == "big"\nassert classify(9) == "small"\n';
const TEST_HALF = 'from src.calc import half\nassert half(3) == 1.5\nprint("test_half ok")\n';

function fixtureRepo() {
  const repo = mk('qa-e2e-repo-');
  for (const [p, c] of Object.entries({ 'src/calc.py': CALC, 'docs/spec.md': SPEC, 'tests/unit/test_calc.py': TEST_CALC })) {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    writeFileSync(join(repo, p), c);
  }
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'base']]) execFileSync('git', ['-C', repo, ...a]);
  return repo;
}

test('the chain proves a test gap and the test that closes it, and findings.mjs verifies both', { skip }, () => {
  const repo = fixtureRepo();
  // every marker and run folder in temp dirs: nothing reads or writes ~/.cache
  const env = { ...process.env, TMPDIR: mk('qa-e2e-tmp-'), QA_MARKER_DIR: mk('qa-e2e-mark-'), ZT_MARKER_DIR: mk('qa-e2e-zt-'), CLAUDE_CODE_SESSION_ID: 'qa-e2e' };
  const node = (args, extra = {}) => {
    const r = spawnSync(process.execPath, args, { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stderr}`);
    return r;
  };
  const { run } = JSON.parse(node([join(HERE, 'run.mjs'), 'start', '--repo', repo]).stdout);
  const mutate = (head, tests) => JSON.parse(node([join(ZT, 'mutate.mjs'), '--repo', repo, '--head', head, '--files', 'src/calc.py:8-8', '--tests', tests,
    '--scratch', mk('qa-e2e-scratch-'), '--cmd', 'python3 {file}', '--runner', DIRECT, '--kill-exits', '1'], { ZT_RUN_DIR: run }).stdout);

  const first = mutate('HEAD', 'tests/unit/test_calc.py');
  const survived = first.mutants.find(m => m.result === 'survived');
  assert.ok(survived, first.summary);

  writeFileSync(join(repo, 'tests/unit/test_half.py'), TEST_HALF);
  const pass = node([DIRECT, '--env', `PYTHONPATH=${repo}`, '--', 'python3', 'tests/unit/test_half.py'], { ZT_RUN_DIR: run });
  const passId = /ZT-RUN (\S+) exit=0/.exec(pass.stderr)?.[1];
  assert.ok(passId, pass.stderr);

  const { snap } = JSON.parse(node([join(HERE, 'run.mjs'), 'snap', '--files', 'tests/unit/test_half.py']).stdout);
  const kill = mutate(snap, 'tests/unit/test_half.py').mutants.find(m => m.id === survived.id);
  assert.equal(kill?.result, 'killed', JSON.stringify(kill));

  const findings = join(run, 'findings.json');
  writeFileSync(findings, JSON.stringify({
    requirements: [{ id: 'R1', text: 'half(n) returns n divided by 2', source: { kind: 'spec', ref: 'docs/spec.md:3', quote: 'half(n) returns n divided by 2.' } }],
    findings: [{ id: 'G1', kind: 'test-gap', tier: 'unit', requirement: 'R1', title: 'no test checks half',
      proofs: [{ mode: 'executed', ref: survived.run, exit: 0, quote: survived.quote }] }],
    tests_written: [{ path: 'tests/unit/test_half.py', finding: 'G1',
      proofs: [{ mode: 'executed', ref: passId, exit: 0, quote: 'test_half ok' }, { mode: 'executed', ref: kill.run, exit: kill.exit, quote: kill.quote }] }],
  }));
  const out = JSON.parse(node([join(HERE, 'findings.mjs'), '--run', run, '--repo', repo, '--head', 'HEAD', '--findings', findings, '--tiers-py', TIERS_PY]).stdout);
  const report = readFileSync(out.report, 'utf8');
  assert.deepEqual([out.verified, out.unverified], [3, 0], report);
  assert.match(report, /## Test gaps\n\n- \*\*G1\*\*/);
  assert.match(report, /## Tests written\n\n- \*\*tests\/unit\/test\\_half\.py\*\*/);
  assert.match(report, /## Inventory\n\n\| module \|/);
  assert.equal(JSON.parse(node([join(HERE, 'run.mjs'), 'end']).stdout).ended, run);
});
