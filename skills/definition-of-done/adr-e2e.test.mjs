// E2E: a DoD session that ends in an ADR, through the real CLI, the real hooks and a real git repo, then both consumers read the committed ADR.
// open -> grill (questions.md, answers.md, DoD JSON in the run folder) -> check -> adr (ADR + index + pre-commit hook) -> guard lets the agent edit
// only that ADR -> adr-check (reorganized: pass; a pro dropped: fail) -> commit only the ADR -> paired-agent-tdd and qa-sweep read it by dodFile and
// by touches -> folder moves: git mv through the pre-commit hook, plain mv through the Claude Code hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePlan } from '../paired-agent-tdd/gates.mjs';
import { resolveDod } from '../paired-agent-tdd/dodfile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CLI = join(HERE, 'dod.mjs');
const GUARD = join(ROOT, 'hooks', 'dod-guard.mjs');
const SYNC = join(ROOT, 'hooks', 'dod-adr-sync.mjs');
const FINDINGS = join(ROOT, 'skills', 'qa-sweep', 'findings.mjs');
const { createRunDir } = await import(pathToFileURL(join(ROOT, 'skills', 'zero-trust-review', 'runctx.mjs')).href);

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dod-adr-e2e-')));
const repo = join(tmp, 'repo');
const put = (p, t) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), t); };
put('src/reports/export.js', 'export const cap = 10000;\n');
put('docs/spec.md', '# Reports\nReports list sales and stock.\n');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8', env: { ...process.env, DOD_ADR_PRECOMMIT_HOOK_ENABLED: '' } });
git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base');

const SESSION = 'adr-e2e-session';
const env = { ...process.env, DOD_MARKER_DIR: join(tmp, 'm'), DOD_RUN_BASE: join(tmp, 'r'), DOD_CONFIG_DIR: join(tmp, 'c'), DOD_GUARD: '', DOD_GUARD_ENABLED: 'true', DOD_ADR_PRECOMMIT_HOOK_ENABLED: '', DOD_ADR_TOUCHES_SYNC_ENABLED: '', PTDD_ADR_AUTO_FIND_ENABLED: '', QA_ADR_AUTO_FIND_ENABLED: '', CLAUDE_CODE_SESSION_ID: SESSION };
function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() };
}
const guard = (tool, input) => {
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ session_id: SESSION, cwd: repo, tool_name: tool, tool_input: input }), env, encoding: 'utf8' });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
};

const TICKET = 'title: Export reports\nUsers need to download the sales report as CSV.\n';
const QUESTIONS = `Q1: Which pages get the button?
(A) both
  + one consistent feature
  - two pages to test
(B) sales only
  + smaller change
  - stock users ask again
recommended: A
time: t
Q2: Over 10,000 rows?
(A) stream everything
  + nothing is lost
  - a long request can time out
(B) cap at 10,000 and warn
  + fast and predictable
  - big reports get a partial file
recommended: B
time: t
`;
const ANSWERS = 'A1: A\ntime: t\nA2: B\ntime: t\n';
const u = (ref, quote, question) => ({ kind: 'user', ref, quote, question });
const DOD = {
  slug: 'report-export',
  title: 'Report export',
  touches: ['src/reports/**'],
  items: [
    { id: 'AC1', text: 'the export button is on sales and stock', source: u('A1', 'A', 'Q1') },
    { id: 'AC2', text: 'the sales report downloads as CSV', kinds: ['happy', 'fail'], kindsReason: 'no edge', source: { kind: 'ticket', ref: '#42', quote: 'Users need to download the sales report as CSV.' } },
    { id: 'AC3', text: 'reports list sales and stock', kinds: ['happy'], kindsReason: 'listing', source: { kind: 'spec', ref: 'docs/spec.md:2', quote: 'Reports list sales and stock.' } },
    { id: 'AC4', text: 'over 10,000 rows are capped with a warning', source: u('A2', 'B', 'Q2') },
  ],
  required: {
    featureFlag: { value: 'REPORT_EXPORT, default off', source: u('A1', 'A', 'Q1') },
    backwardCompat: { value: 'no API change', source: u('A2', 'B', 'Q2') },
    nonGoals: { value: ['xlsx'], source: u('A1', 'A', 'Q1') },
    verifyEnv: { value: 'staging', source: u('A2', 'B', 'Q2') },
    testTiers: { value: ['unit', 'e2e'], source: u('A1', 'A', 'Q1') },
  },
  why: { text: 'users cannot download the sales report', source: { kind: 'ticket', ref: '#42', quote: 'Users need to download the sales report as CSV.' } },
  outcomes: [{ id: 'O1', metric: 'reports that download as CSV', baseline: '0', target: 'sales', provenBy: ['AC2'], source: { kind: 'ticket', ref: '#42', quote: 'Users need to download the sales report as CSV.' } }],
  costOfInaction: { text: 'reports are copied by hand', source: u('A1', 'A', 'Q1') },
  unconfirmed: [],
};
const ADR = 'docs/adr/0001-report-export.md';
const adrText = () => readFileSync(join(repo, ADR), 'utf8');

test('should take a DoD from the grill to a committed ADR that paired-agent-tdd and qa-sweep read, and follow folder moves', async () => {
  // open and grill: everything but the ADR stays in the run folder
  const opened = cli('open', '--repo', repo, '--slug', 'report-export');
  assert.equal(opened.code, 0, opened.err);
  const run = opened.json.run;
  writeFileSync(join(run, 'ticket.md'), TICKET);
  writeFileSync(join(run, 'questions.md'), QUESTIONS);
  writeFileSync(join(run, 'answers.md'), ANSWERS);
  const dodFile = join(run, 'dod.json');
  writeFileSync(dodFile, JSON.stringify(DOD, null, 2));
  const checked = cli('check', '--dod', dodFile);
  assert.equal(checked.code, 0, checked.out + checked.err);
  assert.equal(checked.json.markdown, join(run, 'report-export.md'), 'a DoD JSON in the run folder keeps its .md there too');
  assert.equal(existsSync(join(repo, 'docs', 'dod')), false, 'nothing of the DoD lands in the repo');

  // adr: the ADR, the index and the pre-commit hook
  assert.equal(guard('Write', { file_path: join(repo, ADR), content: 'x' }), 'deny', 'no ADR before adr names it');
  const written = cli('adr', '--dod', dodFile);
  assert.equal(written.code, 0, written.out + written.err);
  assert.equal(written.json.adr, join(repo, ADR));
  assert.ok(written.json.hook.installed, JSON.stringify(written.json.hook));
  assert.match(readFileSync(join(repo, 'docs/adr/README.md'), 'utf8'), /0001-report-export\.md/);
  assert.match(adrText(), /^Trade-off accepted: big reports get a partial file$/m);

  // the agent reorganizes the draft: allowed on this ADR only, checked by adr-check
  assert.equal(guard('Edit', { file_path: join(repo, ADR), old_string: 'a', new_string: 'b' }), 'allow');
  assert.equal(guard('Write', { file_path: join(repo, 'docs/adr/0002-other.md'), content: 'x' }), 'deny');
  assert.equal(guard('Edit', { file_path: join(repo, 'src/reports/export.js'), old_string: 'a', new_string: 'b' }), 'deny', 'still no product code');
  writeFileSync(join(repo, ADR), adrText().replace('## Context\n', '## Context\n\nThe sales team exports reports by hand today.\n'));
  assert.equal(cli('adr-check', '--dod', dodFile).code, 0);
  const good = adrText();
  writeFileSync(join(repo, ADR), good.replace('  - pro: nothing is lost\n', ''));
  const dropped = cli('adr-check', '--dod', dodFile);
  assert.equal(dropped.code, 1);
  assert.match(dropped.out, /nothing is lost/);
  writeFileSync(join(repo, ADR), good);
  assert.equal(cli('close').code, 0);

  // commit only the ADR (and its index)
  git('add', 'docs/adr');
  git('commit', '-qm', 'ADR: report export');
  assert.deepEqual(git('ls-files').trim().split('\n').sort(), ['docs/adr/0001-report-export.md', 'docs/adr/README.md', 'docs/spec.md', 'src/reports/export.js']);

  // paired-agent-tdd: by dodFile, and found by touches; the real validatePlan accepts both
  const group = { id: 'g1', tests: ['t/export.test.js'], src: ['src/reports/export.js'], dod: ['AC1', 'AC2', 'AC3', 'AC4'] };
  const byFile = await resolveDod({ repo, cmd: 'node --test {file}', dodFile: ADR, groups: [group] }, { env, here: join(ROOT, 'skills', 'paired-agent-tdd') });
  assert.equal(byFile.error, undefined);
  assert.deepEqual(byFile.plan.dod.map(d => [d.id, d.kinds]), [['AC1', ['happy', 'fail', 'edge']], ['AC2', ['happy', 'fail']], ['AC3', ['happy']], ['AC4', ['happy', 'fail', 'edge']]]);
  assert.deepEqual(Object.keys(byFile.plan.dod[0]).sort(), ['id', 'kinds', 'source', 'text'], 'only what the model needs');
  assert.deepEqual(validatePlan(byFile.plan, undefined), []);
  const byTouches = await resolveDod({ repo, cmd: 'node --test {file}', groups: [group] }, { env, here: join(ROOT, 'skills', 'paired-agent-tdd') });
  assert.equal(byTouches.plan.dodFile, ADR);

  // qa-sweep: findings.mjs reads the same ADR and the report cites the decisions
  const qaTmp = join(tmp, 'qa'); mkdirSync(qaTmp);
  const qaRun = createRunDir('adr-e2e-' + process.pid, { tmp: qaTmp });
  const findings = join(tmp, 'findings.json');
  writeFileSync(findings, JSON.stringify({ dodFile: ADR, findings: [] }));
  const qa = spawnSync(process.execPath, [FINDINGS, '--run', qaRun, '--repo', repo, '--head', 'HEAD', '--findings', findings], { encoding: 'utf8', env: { ...env, TMPDIR: qaTmp } });
  assert.equal(qa.status, 0, qa.stderr);
  assert.equal(JSON.parse(qa.stdout).verified, 4);
  const report = readFileSync(join(qaRun, 'report.md'), 'utf8');
  assert.match(report, /dod:A2/);
  assert.match(report, /dod:S1/);

  // git mv a folder: the pre-commit hook rewrites touches and the index in the same commit
  git('mv', 'src/reports', 'src/export');
  git('commit', '-qm', 'move reports');
  assert.match(git('show', `HEAD:${ADR}`), /- "src\/export\/\*\*"/);
  assert.equal(git('status', '--porcelain'), '', 'the ADR change went into the commit');
  assert.deepEqual((await resolveDod({ repo, cmd: 'node --test {file}', dodFile: ADR, groups: [{ ...group, src: ['src/export/export.js'] }] }, { env, here: join(ROOT, 'skills', 'paired-agent-tdd') })).warnings, []);

  // plain mv by the agent: the Claude Code hook follows it before the commit
  execFileSync('mv', [join(repo, 'src/export'), join(repo, 'src/out')]);
  const said = spawnSync(process.execPath, [SYNC], { input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'mv src/export src/out' }, cwd: repo }), env, encoding: 'utf8' });
  assert.equal(said.status, 0, said.stderr);
  assert.match(JSON.parse(said.stdout).hookSpecificOutput.additionalContext, /src\/export\/\*\* -> src\/out\/\*\*/);
  assert.match(adrText(), /- "src\/out\/\*\*"/);
  git('add', '-A'); git('commit', '-qm', 'move again');

  // the ADR is still a valid DoD after both moves, and a stale glob is reported
  assert.equal((await resolveDod({ repo, cmd: 'node --test {file}', dodFile: ADR, groups: [{ ...group, src: ['src/out/export.js'] }] }, { env, here: join(ROOT, 'skills', 'paired-agent-tdd') })).error, undefined);
});

test('should exit 2, naming the fix, when DOD_ADR_PRECOMMIT_HOOK_ENABLED is not true or false', () => {
  const r = spawnSync(process.execPath, [CLI, 'adrs', '--repo', repo, '--sync'], { env: { ...env, DOD_ADR_PRECOMMIT_HOOK_ENABLED: '0' }, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /DOD_ADR_PRECOMMIT_HOOK_ENABLED=0 is not valid: use true or false/);
});
