// Offline checks for tdd.mjs plan: validation, the run folder, preflight, the DoD file, the Workflow args and the flags it reads. tdd.mjs runs in-process through the shared fixture (test-fixture.mjs). Run: node --test tdd.plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SPEED_DEFAULT, SPEED_OFF_ENV } from './speed.mjs';
import { main } from './tdd.mjs';
import { HERE, TDD, envOf, git, put, PLAN, fixture, FAST, dryRun, ON_ENV, plannedWith, plan_, BAD_ZT } from './test-fixture.mjs';

test('plan: validates, snapshots a clean tree as HEAD, writes the run folder, prints the Workflow args', async t => {
  const fx = fixture(t);
  const r = await fx.plan();
  assert.equal(r.status, 0, r.err);
  const args = JSON.parse(r.out.trim().split('\n').pop());
  assert.equal(args.base, fx.head);
  assert.deepEqual([args.groups.length, args.dod.length, args.sandbox], [2, 2, 'stub']);
  assert.ok(args.runDir.startsWith(join(fx.tmp, `zt-review-${process.getuid()}`)), 'the run folder lives under the per-user zt-review base: the only place the ledger tools approve');
  assert.equal(existsSync(join(fx.tmp, `zt-review-${process.getuid()}`, '..', '.cache')), false);
  assert.ok(existsSync(join(fx.run, 'plan.json')) && existsSync(join(fx.run, 'args.json')));
  assert.ok(args.scratch.startsWith(realpathSync(tmpdir())) && args.skillDir === HERE);
});

test('plan: should write agentCap into the Workflow args when PTDD_AGENT_MAX is a positive integer, and leave it out when unset', async t => {
  for (const [raw, want] of [['25', 25], ['', undefined]]) {
    const fx = fixture(t);
    const r = await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], { PTDD_AGENT_MAX: raw });
    assert.equal(r.status, 0, r.err);
    assert.equal(JSON.parse(r.out.trim().split('\n').pop()).agentCap, want, JSON.stringify(raw));
  }
});

test('plan: should exit 2, naming the fix, when a flag is not valid or an old flag name is set', async t => {
  for (const [env, re] of [
    [{ PTDD_AGENT_MAX: '0' }, /PTDD_AGENT_MAX=0 is not valid: use a whole number above 0/],
    [{ PTDD_AGENT_MAX: 'abc' }, /PTDD_AGENT_MAX=abc is not valid/],
    [{ PTDD_AGENT_CAP: '5' }, /PTDD_AGENT_CAP was renamed: use PTDD_AGENT_MAX=<number>/],
    [{ PTDD_GUARD_ENABLED: '1' }, /PTDD_GUARD_ENABLED=1 is not valid: use true or false/],
    [{ PTDD_GUARD: '1' }, /PTDD_GUARD was renamed: use PTDD_GUARD_ENABLED=true/],
  ]) {
    const fx = fixture(t);
    const r = await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], env);
    assert.equal(r.status, 2, JSON.stringify(env));
    assert.match(r.err, re);
  }
});

test('plan: should write the file fence and its marker when PTDD_GUARD_ENABLED=true, and nothing when it is unset or false', async t => {
  for (const [flag, want] of [['true', true], ['', false], ['false', false]]) {
    const fx = fixture(t);
    const r = await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], { PTDD_GUARD_ENABLED: flag });
    assert.equal(r.status, 0, r.err);
    const run = JSON.parse(r.out.trim().split('\n').pop()).runDir;
    assert.equal(existsSync(join(fx.dir, 'marker', '.ptdd-active')), want, `marker for ${JSON.stringify(flag)}`);
    assert.equal(existsSync(join(run, 'fence.json')), want, `fence.json for ${JSON.stringify(flag)}`);
    if (want) assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(run, 'fence.json'), 'utf8')).groups).length > 0, true);
  }
});

test('plan: should read the DoD from plan.dodFile (an ADR) and record which file and blob it came from', async t => {
  const { renderAdr } = await import('../definition-of-done/adr.mjs');
  const q = 'Q1: Which?\n(A) a\n  + p\n  - c\n(B) b\n  + p\n  - c\n';
  const src = { kind: 'user', ref: 'A1', quote: 'A', question: 'Q1' };
  const adr = renderAdr({ dod: { slug: 'alpha', touches: ['src/**'], items: [{ id: 'AC1', text: 'alpha says new', kinds: ['happy'], source: src }, { id: 'AC2', text: 'beta says beta', kinds: ['happy'], source: src }], required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: src }])) }, answers: 'A1: A\n', questions: q, ticket: '', number: 1, date: '2026-11-22' }).text;
  const fx = fixture(t, { files: { 'docs/adr/0001-alpha.md': adr }, plan: repo => ({ ...PLAN(repo), dod: undefined, dodFile: 'docs/adr/0001-alpha.md' }) });
  const r = await fx.plan();
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /plan ok: 2 group\(s\), 2 DoD item\(s\) from docs\/adr\/0001-alpha\.md @ [0-9a-f]{8}, base/);
  const args = JSON.parse(r.out.trim().split('\n').pop());
  assert.deepEqual(args.dod.map(d => d.id), ['AC1', 'AC2']);
  assert.equal(JSON.parse(readFileSync(join(fx.run, 'plan.json'), 'utf8')).dodFile, 'docs/adr/0001-alpha.md', 'resume reads the same DoD from the run folder');
  const noAuto = fixture(t, { files: { 'docs/adr/0001-alpha.md': adr }, plan: repo => ({ ...PLAN(repo), dod: undefined }) });
  assert.equal((await noAuto.tdd('plan', ['--plan', join(noAuto.dir, 'plan.json')], { PTDD_ADR_AUTO_FIND_ENABLED: '' })).status, 0, 'found by touches');
  const off = await noAuto.tdd('plan', ['--plan', join(noAuto.dir, 'plan.json')], { PTDD_ADR_AUTO_FIND_ENABLED: 'false' });
  assert.equal(off.status, 2);
  assert.match(off.err, /at least one DoD item is required/);
});

test('plan: should exit 2 when dodFile and dod[] are both set, or dodFile is not an ADR', async t => {
  const both = fixture(t, { plan: { dodFile: 'docs/adr/0001-x.md' } });
  const r = await both.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /use dodFile or dod\[\], not both/);
  const notAdr = fixture(t, { files: { 'docs/dod/x.json': '{}' }, plan: repo => ({ ...PLAN(repo), dod: undefined, dodFile: 'docs/dod/x.json' }) });
  const r2 = await notAdr.plan();
  assert.equal(r2.status, 2);
  assert.match(r2.err, /not an ADR with a "## Definition of done" section/);
});

test('plan: a dirty working tree becomes the base (a snapshot), and the user\'s repo is untouched', async t => {
  const fx = fixture(t);
  put(fx.repo, { 'src/alpha.txt': 'dirty\n', 'notes.txt': 'new file\n' });
  const state = () => [git(fx.repo, 'status', '--porcelain'), git(fx.repo, 'for-each-ref'), git(fx.repo, 'rev-parse', 'HEAD'), git(fx.repo, 'diff', '--cached')];
  const before = state();
  const args = JSON.parse((await fx.plan()).out.trim());
  assert.notEqual(args.base, fx.head);
  assert.equal(git(fx.repo, 'show', `${args.base}:src/alpha.txt`), 'dirty');
  assert.equal(git(fx.repo, 'show', `${args.base}:notes.txt`), 'new file');
  assert.equal(git(fx.repo, 'rev-parse', `${args.base}^`), fx.head);
  assert.deepEqual(state(), before);
});

test('plan: invalid plans exit 2 with every error, an untrusted run dir exits 3, a missing zero-trust-review exits 2', async t => {
  const fx = fixture(t, { plan: { cmd: 'sh', dod: [] } });
  const r = await fx.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /cmd must contain \{file\}[\s\S]*at least one DoD item/);
  const open = fixture(t), loose = join(open.tmp, 'loose');
  mkdirSync(loose, { mode: 0o777 }); chmodSync(loose, 0o777);
  assert.equal((await open.plan(['--run', loose])).status, 3, 'a run folder that others can write, or that plan did not create, is refused');
  assert.equal((await open.tdd('red', ['--run', loose, '--group', 'a'])).status, 3);
  const noZt = spawnSync(process.execPath, [TDD, 'plan'], { encoding: 'utf8', env: { ...process.env, ZT_DIR: join(fx.dir, 'nowhere') } });
  assert.equal(noZt.status, 2);
  assert.match(noZt.stderr, /zero-trust-review skill is not at/);
});

test('plan: a ticket makes every DoD quote verifiable', async t => {
  const fx = fixture(t, { plan: { ticket: '/nonexistent' } });
  assert.equal((await fx.plan()).status, 2);
  const ok = fixture(t);
  writeFileSync(join(ok.dir, 'ticket.md'), 'The service says new.');
  const p = JSON.parse(readFileSync(join(ok.dir, 'plan.json'), 'utf8'));
  p.ticket = join(ok.dir, 'ticket.md'); p.dod[0].source = 'says new'; p.dod[1].source = 'says old';
  writeFileSync(join(ok.dir, 'plan.json'), JSON.stringify(p));
  const r = await ok.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /AC2: source quote not found/);
});

test('plan: rounds is validated and travels to the Workflow args', async t => {
  const bad = fixture(t, { plan: { rounds: 9 } });
  assert.match((await bad.plan()).err, /rounds must be an integer from 1 to 4/);
  const ok = fixture(t, { plan: { rounds: 2 } });
  assert.equal(JSON.parse((await ok.plan()).out.trim().split('\n').pop()).rounds, 2);
});

test('plan: preflight tries tests, not the files around them: __init__, conftest, helpers and other languages are skipped, a file that holds no test says nothing', async t => {
  const noise = { 'tests/__init__.sh': 'exit 9\n', 'tests/conftest.sh': 'exit 9\n', 'tests/fixtures/data.sh': 'exit 9\n', 'tests/test_other.py': 'exit 9\n', 'scripts/run.sh': 'exit 9\n', 'tests/test_real.sh': 'true\n' };
  const fx = fixture(t, { files: noise });
  const r = await fx.plan();
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(fx.gate('preflight.json').tried.map(x => x.file), ['tests/test_real.sh'], 'a test-named file of the groups\' kind goes first, and one pass ends it');
  const sized = fixture(t, { files: { 'tests/test_aaa.sh': `exit 9\n# ${'x'.repeat(200)}\n`, 'tests/test_zzz.sh': 'true\n' } });
  assert.equal((await sized.plan()).status, 0);
  assert.deepEqual(sized.gate('preflight.json').tried.map(x => x.file), ['tests/test_zzz.sh'], 'among the tests named like one, the smallest goes first');
  const capped = fixture(t, { files: { 'tests/test_f1.sh': 'exit 9\n', 'tests/test_f2.sh': 'exit 9\n', 'tests/test_f3.sh': 'exit 9\n' } }); // the 4th candidate, existing_alpha.sh, would pass
  const c = await capped.plan();
  assert.equal(c.status, 3, 'three tries and no more: a plan is not held up by a fourth run');
  capped.run = /--run (\S+) reuses/.exec(c.err)[1]; // the run folder of the refused plan keeps the evidence
  assert.deepEqual(capped.gate('preflight.json').tried.map(x => x.file), ['tests/test_f1.sh', 'tests/test_f2.sh', 'tests/test_f3.sh']);
  const own = fixture(t, { plan: { dod: [{ id: 'AC1', text: 'alpha', source: 'assumed', kinds: ['happy'] }], groups: [{ id: 'a', tests: ['tests/existing_alpha.sh'], src: ['src/alpha.txt'], dod: ['AC1'], after: [] }] } });
  assert.equal((await own.plan()).status, 0);
  assert.deepEqual([own.gate('preflight.json').verdict, own.gate('preflight.json').tried], ['skipped', []], 'a file the plan owns is the change under test, never the proof of the sandbox');
  const empty = fixture(t, { files: { 'tests/test_empty.sh': 'echo "collected 0 items"; exit 5\n' } });
  assert.equal((await empty.plan()).status, 0);
  assert.deepEqual(empty.gate('preflight.json').tried.map(x => [x.file, x.empty]), [['tests/test_empty.sh', true], ['tests/existing_alpha.sh', undefined]], 'no test collected is skipped as a candidate, the next one proves the sandbox');
  const only = fixture(t, { files: { 'tests/existing_alpha.sh': null, 'tests/test_empty.sh': 'echo "collected 0 items"; exit 5\n' } });
  const o = await only.plan();
  assert.equal(o.status, 0, o.err);
  assert.equal(only.gate('preflight.json').verdict, 'skipped', 'nothing ran a test: not evidence of a broken environment');
  assert.match(o.err, /PREFLIGHT ok=true verdict=skipped\n  no existing test at the base ran a test: set plan\.smoke/, 'a skipped proof says so, so nobody mistakes it for a verified sandbox');
});

test('plan: every try timing out, or a command that cannot start, stops the plan with its own verdict', async t => {
  for (const [exit, verdict] of [[124, 'timeout'], [127, 'unverifiable']]) {
    const r = await fixture(t, { fake: { exit } }).plan();
    assert.equal(r.status, 3, String(exit));
    assert.match(r.err, new RegExp(`PREFLIGHT ok=false verdict=${verdict}`));
  }
});

test('plan: with no --runner the tests run through direct-run.mjs (the preflight runs a real test through it); plan.sandbox: true asks for the zero-trust-review sandbox instead', async t => {
  const run = async (fx, extra = []) => { const r = await main(['plan', '--plan', join(fx.dir, 'plan.json'), ...extra], { env: envOf(fx) }); return { status: r.code, stdout: r.stdout, stderr: r.stderr }; }; // no --runner
  const direct = await run(fixture(t));
  assert.equal(direct.status, 0, direct.stderr);
  assert.deepEqual([JSON.parse(direct.stdout.trim()).sandbox, JSON.parse(direct.stdout.trim()).preflight], ['direct', 'ok']);
  assert.match(direct.stderr, /PREFLIGHT ok=true verdict=ok: tests\/existing_alpha\.sh passed/);
  const boxed = await run(fixture(t, { plan: { sandbox: true } }));
  if (boxed.status === 0) assert.notEqual(JSON.parse(boxed.stdout.trim()).sandbox, 'direct', 'the sandbox backend of this machine, not the direct runner');
  else { assert.equal(boxed.status, 3); assert.match(boxed.stderr, /plan\.sandbox is true: fix the sandbox/, 'no sandbox here: the refusal says how to run directly'); }
});

test('plan: preflight runs a test that passes at the base through the sandbox before anything else; the verdict travels in the args', async t => {
  const fx = fixture(t);
  const r = await fx.plan();
  assert.equal(r.status, 0, r.err);
  assert.match(r.err, /PREFLIGHT ok=true verdict=ok: tests\/existing_alpha\.sh passed in the sandbox/);
  assert.deepEqual([fx.gate('preflight.json').ok, fx.gate('preflight.json').tried.map(x => x.file)], [true, ['tests/existing_alpha.sh']]);
  assert.equal(JSON.parse(r.out.trim()).preflight, 'ok');
  const again = await fx.tdd('preflight');
  assert.match(again.out, /^PREFLIGHT ok=true verdict=ok/, 'the same check as a command: re-run it after fixing the environment');
});

test('plan: a sandbox that cannot run the tests stops the plan (exit 3, nothing printed) and --skip-preflight is the explicit way past', async t => {
  const fx = fixture(t, { fake: { exit: 86 } });
  const r = await fx.plan();
  assert.equal(r.status, 3);
  assert.match(r.err, /PREFLIGHT ok=false verdict=unverifiable[\s\S]*tests\/existing_alpha\.sh: exit 86[\s\S]*--skip-preflight/);
  assert.equal(r.out, '', 'no Workflow args exist for an unproven environment');
  const skip = await fixture(t, { fake: { exit: 86 } }).plan(['--skip-preflight']);
  assert.equal(skip.status, 0, skip.err);
  assert.equal(JSON.parse(skip.out.trim()).preflight, 'skipped');
});

test('plan: no usable runner at all exits 3 before anything is created', async t => {
  const fx = fixture(t);
  const dead = join(fx.stub, 'dead-runner.mjs');
  writeFileSync(dead, 'process.exit(1);\n');
  const r = await fx.plan(['--runner', dead]);
  assert.equal(r.status, 3);
  assert.match(r.err, /no usable runner[\s\S]*Fix it and run plan again/);
  assert.doesNotMatch(r.err, /plan\.sandbox is true/, 'the sandbox hint only appears when the plan asked for the sandbox');
  assert.deepEqual(readdirSync(fx.tmp), [], 'no scratch dir, no run folder');
});

test('plan: tests that fail at the base mean a wrong command or environment (exit 3); plan.smoke names tests that do pass; no test at the base is skipped, not failed', async t => {
  const failing = { 'tests/existing_alpha.sh': 'exit 3\n' };
  const broken = await fixture(t, { files: failing }).plan();
  assert.equal(broken.status, 3);
  assert.match(broken.err, /PREFLIGHT ok=false verdict=broken\n  a test that should pass at the base fails here[\s\S]*tests\/existing_alpha\.sh: exit 3/);
  const named = fixture(t, { files: { ...failing, 'tests/existing_ok.sh': 'true\n' }, plan: { smoke: ['tests/existing_ok.sh'] } });
  const n = await named.plan();
  assert.equal(n.status, 0, n.err);
  assert.deepEqual(named.gate('preflight.json').tried.map(x => x.file), ['tests/existing_ok.sh'], 'plan.smoke replaces the guess');
  const none = fixture(t, { files: { 'tests/existing_alpha.sh': null } });
  const s = await none.plan();
  assert.equal(s.status, 0, s.err);
  assert.match(s.err, /PREFLIGHT ok=true verdict=skipped/);
});

test('plan refuses: a subdirectory of a work tree, a src file with a test-like path, an active review marker; it resolves a moving base to a sha', async t => {
  const sub = fixture(t, { plan: repo => ({ repo: join(repo, 'sub') }) });
  mkdirSync(join(sub.repo, 'sub'));
  const r = await sub.plan();
  assert.equal(r.status, 2);
  assert.match(r.err, /top level of its work tree/);
  const cfg = fixture(t, { plan: p => ({ groups: [{ ...PLAN(p).groups[0], src: ['src/test_alpha_helper.txt'] }], dod: PLAN(p).dod.slice(0, 1) }) });
  const c = await cfg.plan();
  assert.equal(c.status, 2);
  assert.match(c.err, /src files with a test-like path: a: src\/test_alpha_helper\.txt/);
  const marked = fixture(t);
  const md = join(marked.dir, 'marker'), live = join(marked.dir, 'live-run');
  for (const d of [md, live]) { mkdirSync(d); chmodSync(d, 0o700); }
  writeFileSync(join(md, '.active'), `${live}\n`, { mode: 0o600 });
  const m = await marked.plan();
  assert.equal(m.status, 3);
  assert.match(m.err, /zero-trust-review run is still active[\s\S]*deactivate/);
  const moving = fixture(t, { plan: { base: 'HEAD' } });
  assert.equal(JSON.parse((await moving.plan()).out.trim()).base, moving.head, 'HEAD is stored as the sha it is now');
});

test('plan: only the exact mode "fast" is special, it reaches the Workflow args as fast: true, and the plan says the effective mode; every other value plans exactly as before', async t => {
  const fast = fixture(t, FAST), fr = await fast.plan();
  assert.equal(fr.status, 0, fr.err);
  const fastArgs = JSON.parse(fr.out.trim().split('\n').pop());
  assert.deepEqual([fastArgs.mode, fastArgs.fast], ['fast', true]);
  assert.match(fr.err, /preflight \S+, mode fast;/);
  for (const mode of ['standard', 'plan', 'turbo', 'Fast', 'FAST', ' fast', null, true]) {
    const fx = fixture(t, { plan: { mode } }), r = await fx.plan();
    assert.equal(r.status, 0, `${JSON.stringify(mode)} is not refused (the original ignored the key): ${r.err}`);
    const args = JSON.parse(r.out.trim().split('\n').pop());
    assert.deepEqual([args.mode, 'fast' in args], [mode, false], `${JSON.stringify(mode)} reaches the args as given, with no fast key (a typo is fast mode off)`);
    assert.match(r.err, /preflight \S+, mode standard;/, `${JSON.stringify(mode)} is visibly standard`);
  }
  const none = fixture(t), nr = await none.plan(), noneArgs = JSON.parse(nr.out.trim().split('\n').pop());
  assert.deepEqual(['mode' in noneArgs, 'fast' in noneArgs], [false, false]);
  assert.match(nr.err, /preflight \S+, mode standard;/);
});

test('plan: a `fast` key in plan.json never reaches the Workflow args (only mode "fast" sets it) and the dry run of such a plan is the default one', async t => {
  const plain = fixture(t), plainRun = await plain.plan(), plainArgs = JSON.parse(plainRun.out.trim().split('\n').pop());
  const plainDry = await dryRun(plainArgs);
  assert.equal(plainDry.plan.counts['tdd-driver'], undefined);
  for (const extra of [{ fast: true }, { fast: true, mode: 'standard' }, { fast: 1 }, { fast: null }, { fast: 'FAST' }, { fast: true, mode: 'Fast' }, { fast: true, mode: 'plan' }]) {
    const fx = fixture(t, { plan: extra }), r = await fx.plan();
    assert.equal(r.status, 0, JSON.stringify(extra) + r.err);
    const args = JSON.parse(r.out.trim().split('\n').pop());
    assert.equal('fast' in args, false, JSON.stringify(extra) + ': no fast key in the args');
    assert.deepEqual(Object.keys(args).filter(k => k !== 'mode'), Object.keys(plainArgs), JSON.stringify(extra) + ': the same args as a plan without the key (mode aside)');
    assert.equal('fast' in JSON.parse(readFileSync(join(fx.run, 'args.json'), 'utf8')), false, 'and in args.json, which the lead hands to the Workflow');
    const dry = await dryRun(args);
    assert.deepEqual([dry.plan.counts['tdd-driver'], dry.plan.total], [undefined, plainDry.plan.total], JSON.stringify(extra) + ': the dry run is the default one');
  }
  const fast = fixture(t, { plan: { mode: 'fast', fast: false } }), fr = await fast.plan(), fastArgs = JSON.parse(fr.out.trim().split('\n').pop());
  assert.equal(fastArgs.fast, true, 'mode "fast" sets fast after the spread: a user key cannot unset it');
  assert.equal((await dryRun(fastArgs)).plan.counts['tdd-driver'], 1, 'and its dry run is the fast one (group a has no after, group b does)');
});

test('pmode, fstrict: unset speed flags mean the fast pipeline and every speed flag on; plan says so and writes them into the args and plan.json', async t => {
  const { fx, args, err } = await plannedWith(t, ON_ENV);
  assert.deepEqual([args.mode, args.fast, args.speed], ['fast', true, SPEED_DEFAULT]);
  assert.deepEqual([plan_(fx).mode, plan_(fx).speed], ['fast', SPEED_DEFAULT]);
  assert.match(err, /mode fast; speed flags pipeline=fast quickDriverGate=true gateReuse=true courierSkip=true parallelReview=true;/);
});

test('pmode: plan.mode "fast" or "paired" overrides PTDD_PIPELINE_MODE; the flag value itself travels in args.speed', async t => {
  for (const [planMode, flag, want] of [['paired', 'fast', 'standard'], ['fast', 'paired', 'fast'], [undefined, 'paired', 'standard'], [undefined, 'fast', 'fast']]) {
    const { args, err } = await plannedWith(t, { ...ON_ENV, PTDD_PIPELINE_MODE: flag }, { plan: planMode ? { mode: planMode } : {} });
    assert.equal(args.fast === true, want === 'fast', `${planMode}/${flag}`);
    assert.equal(args.speed.pipeline, flag);
    assert.match(err, new RegExp(`mode ${want};`));
  }
});

test('fcompat: with every speed flag off, plan writes the v2.0.0 args and plan.json: no speed key, no mode key, no fast key', async t => {
  const { fx, args } = await plannedWith(t, SPEED_OFF_ENV);
  assert.deepEqual(Object.keys(args), ['repo', 'cmd', 'mutation', 'dod', 'groups', 'scratch', 'base', 'run', 'skillDir', 'ztDir', 'runDir', 'sandbox', 'preflight']);
  assert.deepEqual(Object.keys(plan_(fx)), ['repo', 'cmd', 'mutation', 'dod', 'groups', 'scratch', 'base', 'run']);
  const fast = await plannedWith(t, SPEED_OFF_ENV, FAST);
  assert.deepEqual([fast.args.mode, fast.args.fast, 'speed' in fast.args], ['fast', true, false], 'a v2.0.0 fast plan is unchanged too');
  const own = await plannedWith(t, SPEED_OFF_ENV, { plan: { speed: { gateReuse: true } } });
  assert.deepEqual(['speed' in own.args, 'speed' in plan_(own.fx)], [false, false], 'a speed key of the user\'s plan.json never switches a flag on');
});

test('fstrict: a speed flag with a value that is not valid stops the plan (exit 2) with the fix', async t => {
  for (const [k, v, re] of [['PTDD_PIPELINE_MODE', 'turbo', /PTDD_PIPELINE_MODE=turbo is not valid: use one of fast, paired/], ...['PTDD_QUICK_DRIVER_GATE_ENABLED', 'PTDD_GATE_REUSE_ENABLED', 'PTDD_COURIER_SKIP_ENABLED', 'PTDD_PARALLEL_REVIEW_ENABLED'].map(n => [n, '1', new RegExp(`${n}=1 is not valid: use true or false`)])]) {
    const fx = fixture(t), r = await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], { [k]: v });
    assert.equal(r.status, 2, k);
    assert.match(r.err, re);
  }
});

test('fstrict: plan validates the zero-trust-review flags up front: a value that is not valid stops it (exit 2) with the zero-trust-review fix', async t => {
  for (const [k, v, re] of BAD_ZT) {
    const fx = fixture(t), r = await fx.tdd('plan', ['--plan', join(fx.dir, 'plan.json')], { [k]: v });
    assert.equal(r.status, 2, `${k}=${v}: ${r.err}`);
    assert.match(r.err, re);
    assert.equal(r.out, '', 'no Workflow args');
  }
});
