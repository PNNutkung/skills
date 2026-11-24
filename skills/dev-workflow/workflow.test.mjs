// Integration: workflow.mjs main() in-process on a temp git repo, with the real definition-of-done dod.mjs for the DoD gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './workflow.mjs';
import { SIBLING_DOD, cacheBase, openRuns, runDir } from './io.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'ignore' });

export function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'dw-'));
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'feat/x');
  git(repo, 'config', 'user.email', 't@example.com'); git(repo, 'config', 'user.name', 't');
  writeFileSync(join(repo, 'a.js'), 'export const a = 1;\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'init');
  const env = { PATH: process.env.PATH, HOME: base, XDG_CACHE_HOME: join(base, 'cache'), DOD_MARKER_DIR: join(base, 'dodm'), DOD_RUN_BASE: join(base, 'dodr'), CLAUDE_CODE_SESSION_ID: 'sess-1' };
  return { base, repo, env, done: () => rmSync(base, { recursive: true, force: true }) };
}

export const ADR = slug => `---\ntouches:\n  - "a.js"\ndod: ${slug}\n---\n# 1. Demo\n\n## Definition of done\n\n- [ ] Skill (happy): a skill\n- [ ] Gate (happy): a gate\n`;
export const BOARD = { slug: 'demo', question: 'Q2', concept: 'demo concept', variants: [{ id: 'A', title: 'a', pros: ['p'], cons: ['c'] }, { id: 'B', title: 'b', pros: ['p'], cons: ['c'] }], recommended: 'A' };
export const VERIFY = '## Skill\nenv: local\nrun: node --test\nresult: pass\n```\n# pass 3\n```\n\n## Gate\nenv: local\nresult: accepted A3\n';

const noGh = () => { throw new Error('no gh'); };

test('should walk every step to done when each gate gets its evidence (Order, Gate, Board, Verify, RetroFirst)', () => {
  const f = fixture();
  try {
    const call = argv => main(argv, { env: f.env, cwd: f.repo, gh: noGh, dodMjs: '/nonexistent/dod.mjs' });
    const opened = call(['open', '--slug', 'demo']);
    assert.equal(opened.code, 0, JSON.stringify(opened.out));
    const run = opened.out.run;
    assert.ok(run.startsWith(cacheBase(f.env)), 'run folder under the cache, not the repo (RunDir, RunCache)');

    const step = () => call(['status']).out.step;
    assert.equal(call(['next']).code, 1);
    writeFileSync(join(run, 'facts.md'), '- export const a: a.js:1\n');
    assert.equal(call(['next']).out.step, 'dod');

    const dodFile = join(f.base, 'dod.json');
    writeFileSync(dodFile, JSON.stringify({ slug: 'demo', items: [{ id: 'Skill' }], unconfirmed: [] }));
    assert.equal(call(['next', '--dod', dodFile]).out.step, 'board');

    writeFileSync(join(run, 'board.json'), JSON.stringify(BOARD));
    assert.match(call(['next']).out.errors.join(), /user's choice/);
    writeFileSync(join(f.base, 'answers.md'), 'A2: A\ntime: t\n\nA3: accept Gate, needs prod\ntime: t\n');
    assert.equal(call(['next']).out.step, 'lock', 'the choice is read from the answers.md next to the DoD JSON');

    mkdirSync(join(f.repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(f.repo, 'docs', 'adr', '0001-demo.md'), ADR('demo'));
    assert.equal(call(['next']).out.step, 'tdd');
    assert.match(call(['next']).out.errors.join(), /pull request/);
    assert.equal(call(['next', '--pr', 'https://github.com/o/r/pull/9']).out.step, 'verify');

    mkdirSync(join(f.repo, 'docs', 'verify'), { recursive: true });
    writeFileSync(join(f.repo, 'docs', 'verify', 'demo.md'), VERIFY);
    assert.deepEqual(call(['tick']).out.tick, ['Skill']);
    assert.equal(call(['next']).out.step, 'retro');

    assert.equal(call(['next']).code, 1);
    mkdirSync(join(f.repo, 'docs', 'retro'), { recursive: true });
    writeFileSync(join(f.repo, 'docs', 'retro', 'log.md'), '| date | work | sessions |\n|---|---|---|\n| 2026-11-23 | feat/x | 1 |\n');
    assert.equal(call(['next']).out.step, 'done');
    assert.equal(step(), 'done');
    assert.equal(openRuns(f.env, f.repo).length, 0, 'a done run guards nothing');
  } finally { f.done(); }
});

test('should resume at the step the repo shows when the run folder is gone (Resume)', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(f.repo, 'docs', 'adr', '0002-demo.md'), ADR('demo'));
    const r = main(['status', '--slug', 'demo'], { env: f.env, cwd: f.repo, gh: () => 'https://github.com/o/r/pull/3\n', dodMjs: '/none' });
    assert.equal(r.code, 0);
    assert.equal(r.out.step, 'verify');
    assert.equal(r.out.resumed, true);
    assert.equal(r.out.evidence.pr, 'https://github.com/o/r/pull/3');
  } finally { f.done(); }
});

test('should skip the board and refuse to skip the DoD when a saved answer gives a reason (ShortPath)', () => {
  const f = fixture();
  try {
    const call = argv => main(argv, { env: f.env, cwd: f.repo, gh: noGh, dodMjs: '/none' });
    const run = call(['open', '--slug', 'small']).out.run;
    writeFileSync(join(run, 'facts.md'), 'a.js:1\n');
    writeFileSync(join(run, 'answers.md'), 'A1: skip the DoD please\ntime: t\n\nA2: skip the board, typo fix only\ntime: t\n');
    call(['next']);
    assert.match(call(['skip', '--answer', 'A1']).out.errors.join(), /never skipped/);
    const dodFile = join(f.base, 'd.json');
    writeFileSync(dodFile, JSON.stringify({ items: [{ id: 'X' }] }));
    call(['next', '--dod', dodFile]);
    const s = call(['skip', '--answer', 'A2']);
    assert.equal(s.out.step, 'lock', JSON.stringify(s.out));
  } finally { f.done(); }
});

test('should exit 2 or 1 when given a bad slug, an unknown command, a second open or a bad flag', () => {
  const f = fixture();
  try {
    const call = (argv, env = f.env) => main(argv, { env, cwd: f.repo, gh: noGh, dodMjs: '/none' });
    assert.equal(call(['open', '--slug', 'Bad Slug']).code, 2);
    assert.equal(call(['frobnicate']).code, 2);
    assert.equal(call(['status']).code, 2, 'no open run');
    assert.equal(call(['open', '--slug', 'one']).code, 0);
    assert.equal(call(['open', '--slug', 'one']).code, 1);
    assert.equal(call(['open', '--slug', 'two']).code, 0);
    assert.match(call(['status']).out.errors.join(), /several runs/);
    assert.equal(call(['status', '--slug', 'one'], { ...f.env, WORKFLOW_GUARD_ENABLED: 'yes' }).code, 2);
    assert.equal(main(['status'], { env: f.env, cwd: f.base }).code, 2, 'outside a repo');
    assert.equal(call(['close', '--slug', 'one']).code, 0);
    assert.equal(call(['next', '--slug', 'one']).code, 1, 'closed');
  } finally { f.done(); }
});

test('should pass the DoD gate only when the real dod.mjs check passes in an open DoD session (Gate, integration)', () => {
  const f = fixture();
  try {
    const dod = (...a) => JSON.parse(execFileSync(process.execPath, [SIBLING_DOD, ...a], { env: f.env, cwd: f.repo, encoding: 'utf8' }).trim().split('\n').pop());
    const dodRun = dod('open', '--repo', f.repo, '--slug', 'demo').run;
    writeFileSync(join(dodRun, 'questions.md'), 'Q1: Which?\ncontext: c\n(A) a\n  + p\n  - c\n(B) b\n  + p\n  - c\nrecommended: A\ntime: t\n');
    writeFileSync(join(dodRun, 'answers.md'), 'A1: A\ntime: t\n');
    const u = { kind: 'user', ref: 'A1', quote: 'A', question: 'Q1 Which? (A) a (B) b' };
    const good = { slug: 'demo', touches: ['a.js'], items: [{ id: 'Skill', text: 'a skill', source: u }], required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: 'x', source: u }])), unconfirmed: [] };
    const dodFile = join(dodRun, 'dod.json');
    writeFileSync(dodFile, JSON.stringify({ ...good, items: [{ id: 'Skill', text: 'a skill', source: { kind: 'assumed' } }] }));
    const call = argv => main(argv, { env: f.env, cwd: f.repo, gh: noGh });
    const run = call(['open', '--slug', 'demo']).out.run;
    writeFileSync(join(run, 'facts.md'), 'a.js:1\n');
    call(['next']);
    const bad = call(['next', '--dod', dodFile]);
    assert.equal(bad.code, 1, JSON.stringify(bad.out));
    writeFileSync(dodFile, JSON.stringify(good));
    const ok = call(['next']);
    assert.equal(ok.out.step, 'board', JSON.stringify(ok.out));
  } finally { f.done(); }
});

test('should keep the run folder under the cache and write nothing in the repo when a run opens (RunDir, RunCache)', () => {
  const f = fixture();
  try {
    const r = main(['open', '--slug', 'demo'], { env: f.env, cwd: f.repo, gh: noGh, dodMjs: '/none' });
    assert.ok(r.out.run.startsWith(join(f.base, 'cache', 'dev-workflow')), r.out.run);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: f.repo, encoding: 'utf8' }), '', 'nothing written in the repo');
    assert.ok(cacheBase({}).endsWith(join('.cache', 'dev-workflow')), cacheBase({}));
    assert.equal(cacheBase({ XDG_CACHE_HOME: '/x' }), join('/x', 'dev-workflow'));
    assert.ok(!cacheBase({}).startsWith(tmpdir()), 'not under /tmp');
  } finally { f.done(); }
});

test('should read the same evidence from any folder when --dod was given as a relative path (Gate, Board)', () => {
  const f = fixture();
  try {
    const sub = join(f.repo, 'sub');
    mkdirSync(join(f.repo, 'docs', 'dod'), { recursive: true }); mkdirSync(sub);
    writeFileSync(join(f.repo, 'docs', 'dod', 'demo.json'), JSON.stringify({ items: [{ id: 'X' }] }));
    writeFileSync(join(f.repo, 'docs', 'dod', 'answers.md'), 'A2: A because simple\ntime: t\n');
    const call = (argv, cwd) => main(argv, { env: f.env, cwd, gh: noGh, dodMjs: '/none' });
    const run = call(['open', '--slug', 'demo'], f.repo).out.run;
    writeFileSync(join(run, 'facts.md'), 'a.js:1\n');
    call(['next'], f.repo);
    assert.equal(call(['next', '--dod', '../docs/dod/demo.json'], sub).out.step, 'board');
    writeFileSync(join(run, 'board.json'), JSON.stringify(BOARD));
    assert.equal(call(['status'], f.repo).out.evidence.choice, 'A');
    assert.equal(call(['status'], sub).out.evidence.choice, 'A');
  } finally { f.done(); }
});

test('should keep run folders apart per repo and slug when two repos share a name', () => {
  const env = { XDG_CACHE_HOME: '/c' };
  assert.notEqual(runDir(env, '/a/repo', 's'), runDir(env, '/b/repo', 's'));
  assert.ok(runDir(env, '/a/repo', 's').startsWith(join('/c', 'dev-workflow')));
  assert.ok(HERE);
});

// cwd: linked (rules/checks/inproc-cwd.mjs, rules/paths.md): a started process sees its cwd as a real path, so main must too
test('should give the same run folder and dod path spawned and in-process when the cwd is a linked folder', () => {
  const f = fixture();
  try {
    const linked = join(f.base, 'linked');
    symlinkSync(f.repo, linked);
    const opened = main(['open', '--slug', 'lnk'], { env: f.env, cwd: linked });
    assert.equal(opened.code, 0, JSON.stringify(opened.out));
    const r = spawnSync(process.execPath, [join(HERE, 'workflow.mjs'), 'status', '--slug', 'lnk'], { cwd: linked, env: f.env, encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout).run, opened.out.run);
    writeFileSync(join(opened.out.run, 'facts.md'), 'a.js:1 exports a\n');
    main(['next', '--slug', 'lnk'], { env: f.env, cwd: linked });
    main(['next', '--slug', 'lnk', '--dod', 'dod.json'], { env: f.env, cwd: linked });
    const state = JSON.parse(readFileSync(join(opened.out.run, 'state.json'), 'utf8'));
    assert.equal(state.dod, join(realpathSync(f.repo), 'dod.json'));
  } finally { f.done(); }
});
