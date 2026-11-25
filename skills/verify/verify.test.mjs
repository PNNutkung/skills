// Integration: the CLI in-process on a fixture repo; one test runs it through a symlinked folder.
// cwd: linked
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FLAG, SLUG, goodPlan, makeRepo, writeFiles } from './fixture.mjs';
import { markedSections } from './marker.mjs';
import { main as cliMain } from './verify.mjs';

// every call checks the printed contract: ok is true exactly when the exit code is 0
const main = async (argv, deps) => {
  const r = await cliMain(argv, deps);
  assert.equal(r.out.ok, r.code === 0, `${argv.join(' ')}: ok ${r.out.ok} with exit ${r.code}`);
  return r;
};

const SESSION = 'sess-1';
const setup = (opts) => {
  const fx = makeRepo(opts);
  const env = { PATH: process.env.PATH, HOME: fx.base, VERIFY_CACHE_DIR: fx.cache, CLAUDE_CODE_SESSION_ID: SESSION };
  const cli = (argv, deps = {}) => main(argv, { env, cwd: fx.repo, ...deps });
  return { ...fx, env, cli };
};
const opened = async (opts) => {
  const s = setup(opts);
  const r = await s.cli(['open', '--slug', SLUG]);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return { ...s, run: r.out.run, open: r.out };
};
const putPlan = (run, plan) => writeFileSync(join(run, 'plan.json'), JSON.stringify(plan));
const verifyFile = repo => join(repo, 'docs', 'verify', `${SLUG}.md`);

test('should print the run dir, items, booked envs and new flags and write the session marker when open finds the ADR (Source)', async () => {
  const s = await opened();
  assert.deepEqual(s.open.items.map(i => i.id), ['AC1', 'Flag1']);
  assert.deepEqual(s.open.booked, ['cloud']);
  assert.deepEqual(s.open.newFlags, [DEMO_FLAG]);
  assert.match(s.open.adr, /0001-demo\.md$/);
  const marker = JSON.parse(readFileSync(join(s.cache, 'sessions', `${SESSION}.json`), 'utf8'));
  assert.equal(marker.run, s.run);
  assert.equal(marker.repo, realpathSync(s.repo));
  assert.equal(marker.slug, SLUG);
  assert.equal(marker.verifyFile, verifyFile(realpathSync(s.repo)));
  assert.ok(!s.run.startsWith(realpathSync(s.repo)), 'run dir outside the repo');
});

test('should exit 2 with no session id when the session id is missing (Guard fail)', async () => {
  const s = setup();
  const r = await main(['open', '--slug', SLUG], { env: { ...s.env, CLAUDE_CODE_SESSION_ID: '' }, cwd: s.repo });
  assert.equal(r.code, 2);
  assert.match(r.out.errors[0], /no session id/);
});

test('should exit 2 with the fix when a flag value is invalid or a removed flag is set (Timeout fail)', async () => {
  const s = setup();
  for (const [k, v, re] of [['VERIFY_RUN_TIMEOUT_MAX', 'soon', /VERIFY_RUN_TIMEOUT_MAX=soon is not valid/], ['VERIFY_GUARD_ENABLED', 'maybe', /VERIFY_GUARD_ENABLED=maybe is not valid/], ['VERIFY_FLAG_RUNS_ENABLED', 'true', /VERIFY_FLAG_RUNS_ENABLED was removed/]]) {
    const r = await main(['open', '--slug', SLUG], { env: { ...s.env, [k]: v }, cwd: s.repo });
    assert.equal(r.code, 2, k);
    assert.match(r.out.errors[0], re);
  }
});

test('should open with no items and list them from claims.json when there is no ADR (Source edge)', async () => {
  const s = setup();
  const r = await s.cli(['open', '--slug', 'other']);
  assert.equal(r.code, 0);
  assert.equal(r.out.adr, null);
  assert.deepEqual(r.out.items, []);
  writeFileSync(join(r.out.run, 'answers.md'), 'A1: yes, DEMO_Y_ENABLED is new\n');
  writeFileSync(join(r.out.run, 'claims.json'), JSON.stringify([{ id: 'C1', text: 'DEMO_Y_ENABLED=false hides y', answer: 'A1' }]));
  const st = await s.cli(['status']);
  assert.deepEqual(st.out.items.map(i => i.id), ['C1']);
  putPlan(r.out.run, { items: [{ id: 'C1', env: 'cloud', run: 'echo y' }] });
  const p = await s.cli(['plan']);
  assert.equal(p.code, 1);
  assert.match(p.out.errors.join(), /new flag DEMO_Y_ENABLED has no entry/);
});

test('should list flag, option and config candidates when claims reads the branch diff (Source)', async () => {
  const s = setup();
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['checkout', '-qb', 'feat'], { cwd: s.repo });
  writeFiles(s.repo, { 'cli.mjs': "if (process.argv.includes('--dry-run') && process.env.DEMO_Z_ENABLED) {}\n", 'c.json': '{ "retries": 2 }\n' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'], { cwd: s.repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat'], { cwd: s.repo });
  const r = await s.cli(['claims', '--base', 'main']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.flags.map(f => f.name), ['DEMO_Z_ENABLED']);
  assert.deepEqual(r.out.options.map(f => f.name), ['--dry-run']);
  assert.deepEqual(r.out.configKeys.map(f => f.key), ['retries']);
  assert.equal((await s.cli(['claims', '--base', 'nope'])).code, 1);
});

test('should show the normalized plan with preset expects when the plan is complete (Plan)', async () => {
  const s = await opened();
  putPlan(s.run, goodPlan());
  const r = await s.cli(['plan']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.match(r.out.plan[0].expectLine, /node --test preset/);
  assert.deepEqual(r.out.needsAsk, []);
});

test('should refuse with every error when the plan misses an item or plan.json is bad (Plan fail)', async () => {
  const s = await opened();
  const missing = await s.cli(['plan']);
  assert.equal(missing.code, 1);
  assert.match(missing.out.errors[0], /plan\.json is missing/);
  writeFileSync(join(s.run, 'plan.json'), '{nope');
  assert.equal((await s.cli(['plan'])).code, 1);
  putPlan(s.run, { items: [goodPlan().items[0]] });
  const r = await s.cli(['plan']);
  assert.equal(r.code, 1);
  assert.match(r.out.errors.join('\n'), /Flag1: no plan entry/);
  assert.match(r.out.errors.join('\n'), /new flag DEMO_X_ENABLED has no entry/);
});

test('should run each item and write its section from the real run when the plan is good (Run, FlagRuns)', async () => {
  const s = await opened();
  putPlan(s.run, goodPlan());
  const r = await s.cli(['run']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.passed.sort(), ['AC1', 'Flag1']);
  const md = readFileSync(verifyFile(s.repo), 'utf8');
  assert.ok(md.startsWith('# Verify: demo (ADR 0001)\n'));
  assert.match(md, /## AC1\n<!-- verify[^\n]*\nenv: cloud \(local shell\)\nrun: node --test tool\.test\.mjs\nresult: pass\n/);
  assert.match(md, /--- 1\/3 DEMO_X_ENABLED unset \(default true\): exit 0 ---\nx=true/);
  assert.match(md, /--- 2\/3 DEMO_X_ENABLED=false: exit 0 ---\nx=false/);
  assert.match(md, /--- 3\/3 DEMO_X_ENABLED=maybe \(invalid\): exit 2 ---\nDEMO_X_ENABLED=maybe is not valid/);
  for (const [, v] of markedSections(md)) assert.equal(v.intact, true);
});

test('should fail a flag entry when the invalid value does not exit non-zero naming the flag (FlagRuns fail)', async () => {
  const s = await opened();
  writeFiles(s.repo, { 'tool.mjs': "console.log('x=' + (process.env.DEMO_X_ENABLED !== 'false'));\n" });
  putPlan(s.run, goodPlan());
  const r = await s.cli(['run', '--only', 'Flag1']);
  assert.equal(r.code, 1);
  assert.match(r.out.failed[0].why.join(), /3\/3 .*exit 0, expected non-zero/);
  assert.match(r.out.failed[0].why.join(), /names DEMO_X_ENABLED with maybe/);
});

test('should write result fail with the output, run the rest and report every failure when items fail (Fail)', async () => {
  const s = await opened();
  putPlan(s.run, { items: [{ id: 'AC1', env: 'cloud', run: 'echo boom; exit 4', expect: 'never printed' }, { ...goodPlan().items[1], run: 'node missing.mjs' }] });
  const r = await s.cli(['run']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.out.failed.map(f => f.id).sort(), ['AC1', 'Flag1']);
  const md = readFileSync(verifyFile(s.repo), 'utf8');
  assert.match(md, /## AC1\n[^\n]*\nenv: cloud \(local shell\)\nrun: echo boom; exit 4\nresult: fail\n/);
  assert.match(md, /why: exit 4, expected 0/);
  assert.match(md, /```\nboom\n```/);
});

test('should stop a command past VERIFY_RUN_TIMEOUT_MAX and write it as a timeout fail when the limit is set (Timeout)', async () => {
  const s = await opened();
  putPlan(s.run, { items: [{ id: 'AC1', env: 'cloud', run: 'echo started; sleep 30', expect: 'started' }, { ...goodPlan().items[1] }] });
  const t0 = Date.now();
  const r = await s.cli(['run', '--only', 'AC1'], { env: { ...s.env, VERIFY_RUN_TIMEOUT_MAX: '1' } });
  assert.ok(Date.now() - t0 < 10000);
  assert.equal(r.code, 1);
  assert.match(r.out.failed[0].why.join(), /timeout after 1s/);
  assert.match(readFileSync(verifyFile(s.repo), 'utf8'), /result: fail\n[\s\S]*why: timeout after 1s/);
});

test('should replace only the sections that ran and keep hand-written text when run again with --only (Rerun)', async () => {
  const s = await opened();
  putPlan(s.run, goodPlan());
  await s.cli(['run']);
  const f = verifyFile(s.repo);
  const before = readFileSync(f, 'utf8');
  writeFileSync(f, `${before}## Dogfood\nhand notes\n`);
  const flagSection = before.slice(before.indexOf('## Flag1'));
  const r = await s.cli(['run', '--only', 'AC1']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out.ran, ['AC1']);
  const after = readFileSync(f, 'utf8');
  assert.ok(after.includes(`${flagSection}## Dogfood\nhand notes\n`));
  assert.equal((await s.cli(['run', '--only', 'Nope'])).code, 2);
});

test('should read the check run through gh and write name, conclusion and URL when an entry is ci (Envs)', async () => {
  const s = await opened({ booked: '[cloud] here; [ci] actions' });
  putPlan(s.run, { items: [goodPlan().items[0], { id: 'Flag1', env: 'ci', ci: 'test', flag: undefined }, ] });
  const gh = () => JSON.stringify({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success', html_url: 'https://gh/run/1' }] });
  let r = await s.cli(['plan']);
  assert.match(r.out.errors.join(), /new flag DEMO_X_ENABLED has no entry/);
  putPlan(s.run, { items: [{ ...goodPlan().items[1] }, { id: 'AC1', env: 'ci', ci: 'test' }] });
  r = await s.cli(['run'], { gh });
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.match(readFileSync(verifyFile(s.repo), 'utf8'), /## AC1\n[^\n]*\nenv: ci \(gh check runs\)\nrun: gh api repos\/\{owner\}\/\{repo\}\/commits\/[0-9a-f]{40}\/check-runs \(check "test"\)\nresult: pass\n[\s\S]*html_url: https:\/\/gh\/run\/1/);
});

test('should wait for record on a remote entry and write the relayed output with where it came from when an entry is remote (Envs, Ask)', async () => {
  const s = await opened({ booked: '[cloud] here; [nut-wsl] my machine' });
  writeFileSync(join(s.run, 'answers.md'), 'A1: yes, run it on my machine\n');
  const remote = { id: 'AC1', env: 'nut-wsl', run: 'node --test tool.test.mjs', remote: true, approved: 'A1' };
  putPlan(s.run, { items: [remote, goodPlan().items[1]] });
  const r = await s.cli(['run']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.waiting, ['AC1']);
  const rec = await s.cli(['record', '--id', 'AC1', '--from', 'Remote Control on nut-wsl', '--exit', '0'], { stdin: '✔ should print x when the tool runs (AC1)\nℹ pass 1\nℹ fail 0\n' });
  assert.equal(rec.code, 0, JSON.stringify(rec.out));
  assert.match(readFileSync(verifyFile(s.repo), 'utf8'), /## AC1\n[^\n]*\nenv: nut-wsl \(relayed: Remote Control on nut-wsl\)\nrun: node --test tool\.test\.mjs\nresult: pass\n/);
  const bad = await s.cli(['record', '--id', 'AC1', '--from', 'x', '--exit', '1'], { stdin: 'ℹ fail 1' });
  assert.equal(bad.code, 1);
  assert.match(readFileSync(verifyFile(s.repo), 'utf8'), /relayed: x\)\nrun: [^\n]*\nresult: fail/);
});

test('should refuse record for a local entry, a missing id or a bad exit when the call is wrong (Envs edge)', async () => {
  const s = await opened();
  putPlan(s.run, goodPlan());
  assert.match((await s.cli(['record', '--id', 'AC1', '--from', 'x', '--exit', '0'], { stdin: '' })).out.errors.join(), /not a remote entry/);
  assert.equal((await s.cli(['record', '--id', 'AC1', '--from', 'x', '--exit', 'no'], { stdin: '' })).code, 2);
  assert.equal((await s.cli(['record', '--from', 'x', '--exit', '0'], { stdin: '' })).code, 2);
});

test('should refuse to run a remote entry the user has not approved and name it in needsAsk when no answer approves it (Ask fail)', async () => {
  const s = await opened({ booked: '[cloud] here; [nut-wsl] my machine' });
  putPlan(s.run, { items: [{ id: 'AC1', env: 'nut-wsl', run: 'node --test tool.test.mjs', remote: true }, goodPlan().items[1]] });
  const r = await s.cli(['run']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.out.needsAsk, ['AC1']);
  assert.equal(existsSync(verifyFile(s.repo)), false);
});

test('should write accepted A<n> with the answer and fail a missing image when an entry has no command or its image is not made (Image)', async () => {
  const s = await opened();
  writeFileSync(join(s.run, 'answers.md'), 'A3: I checked the screen myself\n');
  putPlan(s.run, { items: [{ id: 'AC1', env: 'cloud', accepted: 'A3' }, { ...goodPlan().items[1], image: 'shot.png' }] });
  let r = await s.cli(['run']);
  assert.equal(r.code, 1);
  assert.match(r.out.failed[0].why.join(), /image shot\.png was not made/);
  const md = readFileSync(verifyFile(s.repo), 'utf8');
  assert.match(md, /## AC1\n[^\n]*\nenv: cloud \(accepted\)\nrun: \(none: accepted by the user\)\nresult: accepted A3\n[\s\S]*A3: I checked the screen myself/);
  putPlan(s.run, { items: [{ id: 'AC1', env: 'cloud', accepted: 'A3' }, { ...goodPlan().items[1], run: 'node tool.mjs && touch shot.png', image: 'shot.png' }] });
  r = await s.cli(['run', '--only', 'Flag1']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.match(readFileSync(verifyFile(s.repo), 'utf8'), /image: shot\.png/);
});

test('should show each item with its written result and whether its section is intact when status is asked (Run edge)', async () => {
  const s = await opened();
  putPlan(s.run, goodPlan());
  await s.cli(['run', '--only', 'AC1']);
  const f = verifyFile(s.repo);
  writeFileSync(f, readFileSync(f, 'utf8').replace('result: pass', 'result: pass '));
  const r = await s.cli(['status']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out.items.map(i => [i.id, i.result, i.intact]), [['AC1', 'pass', false], ['Flag1', null, null]]);
});

test('should delete the session marker when close ends the run and refuse later commands (Guard)', async () => {
  const s = await opened();
  const marker = join(s.cache, 'sessions', `${SESSION}.json`);
  assert.ok(existsSync(marker));
  const r = await s.cli(['close']);
  assert.equal(r.code, 0);
  assert.equal(existsSync(marker), false);
  assert.match((await s.cli(['status'])).out.errors[0], /no open verify run/);
});

test('should refuse a second open for another slug when a run is open in the session (Guard edge)', async () => {
  const s = await opened();
  const r = await s.cli(['open', '--slug', 'other']);
  assert.equal(r.code, 1);
  assert.match(r.out.errors[0], /a verify run is open for demo/);
  assert.equal((await s.cli(['open', '--slug', SLUG])).code, 0);
  assert.equal((await s.cli(['bogus'])).code, 2);
  assert.equal((await s.cli(['open', '--slug', 'Bad Slug'])).code, 2);
});

test('should see the repo by its real path when the cwd is a symlinked folder (Run edge)', async () => {
  const s = setup();
  const link = join(s.base, 'linked');
  symlinkSync(s.repo, link);
  const r = await main(['open', '--slug', SLUG], { env: s.env, cwd: link });
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.equal(r.out.verifyFile, verifyFile(realpathSync(s.repo)));
});

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'verify.mjs');

test('should find the repo from a subfolder and take a slug that starts with a digit when open runs there (Source edge)', async () => {
  const s = setup();
  const r = await main(['open', '--slug', '2nd'], { env: s.env, cwd: join(s.repo, 'docs', 'adr') });
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.equal(r.out.verifyFile, join(realpathSync(s.repo), 'docs', 'verify', '2nd.md'));
});

test('should read the ADR given with --dod and refuse a --dod that does not exist when open names one (Source edge)', async () => {
  const s = setup();
  const r = await s.cli(['open', '--slug', 'other', '--dod', 'docs/adr/0001-demo.md']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.items.map(i => i.id), ['AC1', 'Flag1']);
  const bad = await s.cli(['open', '--slug', 'other', '--dod', 'docs/adr/none.md']);
  assert.equal(bad.code, 2);
  assert.match(bad.out.errors[0], /--dod docs\/adr\/none\.md does not exist/);
});

test('should find the run by --slug without a session and refuse a bad slug, no repo, no run or an unknown option when status names one (Guard edge)', async () => {
  const s = await opened();
  const env = { ...s.env, CLAUDE_CODE_SESSION_ID: '' };
  const r = await main(['status', '--slug', SLUG], { env, cwd: s.repo });
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.equal(r.out.run, s.run);
  for (const [argv, re] of [[['status', '--slug', 'Bad Slug'], /--slug: lowercase/], [['status', '--slug', SLUG, '--repo', s.base], /not inside a git repository/],
    [['status', '--slug', 'ghost'], /no verify run for ghost/], [['status', '--bogus', 'x'], /unknown or incomplete option --bogus/]]) {
    const bad = await main(argv, { env, cwd: s.repo });
    assert.equal(bad.code, 2, argv.join(' '));
    assert.match(bad.out.errors[0], re);
  }
});

test('should give each of the three flag runs a third of the cap when the flag runs print long output (FlagRuns edge)', async () => {
  const s = await opened();
  writeFiles(s.repo, { 'tool.mjs': `${readFileSync(join(s.repo, 'tool.mjs'), 'utf8')}console.log('y'.repeat(5000));\n` });
  putPlan(s.run, goodPlan());
  const r = await s.cli(['run', '--only', 'Flag1']);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  const md = readFileSync(verifyFile(s.repo), 'utf8');
  assert.equal(md.match(/the first and last 1283 are kept/g)?.length, 2, 'runs 1 and 2 cut to (8000 / 3 - 100) chars');
});

test('should refuse record with no --from, accept exit 255, exit 1 on a bad plan and name the verify file when record is called (Envs edge)', async () => {
  const s = await opened({ booked: '[cloud] here; [nut-wsl] my machine' });
  const rec = argv => s.cli(['record', ...argv], { stdin: 'ℹ fail 1' });
  assert.equal((await rec(['--id', 'AC1', '--from', 'x', '--exit', '1'])).code, 1, 'no plan.json');
  writeFileSync(join(s.run, 'answers.md'), 'A1: yes\n');
  putPlan(s.run, { items: [{ id: 'AC1', env: 'nut-wsl', run: 'node --test tool.test.mjs', remote: true, approved: 'A1' }, goodPlan().items[1]] });
  assert.equal((await rec(['--id', 'AC1', '--exit', '0'])).code, 2);
  const r = await rec(['--id', 'AC1', '--from', 'x', '--exit', '255']);
  assert.equal(r.code, 1);
  assert.match(r.out.why.join(), /exit 255, expected 0/);
  assert.equal(r.out.verifyFile, verifyFile(realpathSync(s.repo)));
  assert.equal((await rec(['--id', 'Flag1', '--from', 'x', '--exit', '0'])).code, 1, 'a local entry');
});

test('should read record output from stdin and print usage with exit 2 when the CLI runs as a process (Envs)', async () => {
  const s = await opened({ booked: '[cloud] here; [nut-wsl] my machine' });
  writeFileSync(join(s.run, 'answers.md'), 'A1: yes\n');
  putPlan(s.run, { items: [{ id: 'AC1', env: 'nut-wsl', run: 'node --test tool.test.mjs', remote: true, approved: 'A1' }, goodPlan().items[1]] });
  const env = { ...s.env, NODE_TEST_CONTEXT: '' };
  const rec = spawnSync(process.execPath, [CLI, 'record', '--id', 'AC1', '--from', 'x', '--exit', '0'], { cwd: s.repo, env, input: '✔ should x (AC1)\nℹ pass 1\nℹ fail 0\n', encoding: 'utf8', timeout: 20000 });
  assert.equal(rec.status, 0, rec.stdout + rec.stderr);
  assert.equal(JSON.parse(rec.stdout).ok, true);
  const bare = spawnSync(process.execPath, [CLI], { cwd: s.repo, env, encoding: 'utf8', timeout: 20000 });
  assert.equal(bare.status, 2);
  assert.match(JSON.parse(bare.stdout).errors[0], /^usage: verify\.mjs open\|claims/);
});

test('should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)', async () => {
  const s = await opened();
  putPlan(s.run, goodPlan());
  await s.cli(['run']);
  const f = verifyFile(s.repo);
  writeFileSync(f, `${readFileSync(f, 'utf8')}## AC1\nenv: cloud\nresult: pass\n`);
  const st = await s.cli(['status']);
  assert.equal(st.code, 1);
  assert.match(st.out.errors.join(), /AC1: 2 sections .*docs\/verify\/demo\.md/);
  const r = await s.cli(['run', '--only', 'Flag1']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.out.passed, ['Flag1']);
  assert.match(r.out.errors.join(), /AC1: 2 sections/);
});

test('should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)', async () => {
  const s = await opened();
  writeFiles(s.repo, {
    'tool.mjs': "console.log('x=' + JSON.parse(process.env.DEMO_X_ENABLED || 'true'));\n",
    'flag.test.mjs': "import { test } from 'node:test';\nimport { execFileSync } from 'node:child_process';\ntest('should print x per DEMO_X_ENABLED when it runs (Flag1)', () => { execFileSync(process.execPath, [new URL('./tool.mjs', import.meta.url).pathname]); });\n",
  });
  putPlan(s.run, { items: [goodPlan().items[0], { ...goodPlan().items[1], run: 'node --test flag.test.mjs', expect: undefined }] });
  const r = await s.cli(['run', '--only', 'Flag1']);
  assert.equal(r.code, 1, JSON.stringify(r.out));
  assert.match(r.out.failed[0].why.join(), /3\/3 .*no line outside the test results names DEMO_X_ENABLED with maybe/);
});
