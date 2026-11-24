// The whole retro flow on a fixture repo (not this repo) with a fixture Claude Code transcript: collect -> findings -> check ->
// approvals -> apply -> applied-check -> log, then the ratchet the approved proposal added guards the next commits.
// flags: defaults. Every RETRO_* flag is dropped from the env, so the whole-flow test runs on the defaults; see rules/flag-defaults-e2e.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 'ghp_' + 'E'.repeat(36);

function setup() {
  const repo = mkdtempSync(join(tmpdir(), 'retro-e2e-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'retro-e2e-home-'));
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RETRO_'))), CI: '', CLAUDE_CONFIG_DIR: home,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { env, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  g('add', '.'); g('commit', '-qm', 'init');
  const base = g('rev-parse', 'HEAD').trim();
  g('checkout', '-qb', 'feat');
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = x as Foo;\nexport const b = y as Bar;\n');
  g('add', '.'); g('commit', '-qm', 'feat: casts');
  const now = new Date().toISOString();
  const proj = join(home, 'projects', '-fixture');
  mkdirSync(proj, { recursive: true });
  const L = o => JSON.stringify({ sessionId: 'sess1', cwd: repo, timestamp: now, ...o });
  const transcript = join(proj, 'sess1.jsonl');
  writeFileSync(transcript, [
    L({ type: 'user', message: { role: 'user', content: `please add the casts, token ${SECRET}` } }),
    L({ type: 'assistant', message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }], usage: { input_tokens: 10, output_tokens: 90 } } }),
    L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Exit code 1' }] } }),
    L({ type: 'assistant', message: { id: 'm2', role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test' } }], usage: { input_tokens: 10, output_tokens: 90 } } }),
    L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'Exit code 1' }] } }),
    L({ type: 'user', message: { role: 'user', content: 'no, stop casting with as' } }),
  ].join('\n'));
  const node = (script, args) => { const r = spawnSync(process.execPath, [join(HERE, script), ...args], { cwd: repo, env, encoding: 'utf8' }); return { code: r.status, out: JSON.parse(r.stdout || 'null'), err: r.stderr }; };
  return { repo, g, env, base, transcript, node, commit: m => spawnSync('git', ['-C', repo, 'commit', '-qm', m], { env, encoding: 'utf8' }) };
}

test('should leave a ratchet that guards later commits when a whole retro runs on another repo (RAny, RSrc, RScope, RProp, RAppr, EProof, ERedact, SMatch, OLog, CGuard, RtRun)', () => {
  const s = setup();
  const c = s.node('retro.mjs', ['collect', '--base', s.base, '--lang', 'th']);
  assert.equal(c.code, 0, c.err);
  const run = c.out.run;
  const collected = JSON.parse(readFileSync(join(run, 'collect.json'), 'utf8'));
  assert.equal(collected.totals.sessions, 1);
  assert.equal(collected.totals.tokens, 200);
  assert.deepEqual(collected.sessions[0].failedCommands, [{ cmd: 'npm test', times: 2, lines: [3, 5] }]);
  assert.equal(collected.guardrail.finding, true);
  assert.ok(collected.ratchet.applicable.includes('retro:ts-as-cast'));
  assert.deepEqual(collected.standards, { file: 'CODING_STANDARDS.md', create: true });
  assert.ok(!readFileSync(join(run, 'collect.json'), 'utf8').includes(SECRET));

  writeFileSync(join(run, 'findings.json'), JSON.stringify([
    { id: 'F1', title: 'the user had to stop the as casts', category: 'coding-standards', evidence: [{ kind: 'transcript', ref: `${s.transcript}:6`, quote: 'stop casting with as' }, { kind: 'file', ref: 'src/a.ts:1', quote: 'x as Foo' }] },
    { id: 'F2', title: 'no guardrail', category: 'automated-checks', evidence: [{ kind: 'metric', ref: 'guardrail.finding', quote: 'true' }] },
    { id: 'F3', title: 'tests failed twice', category: 'test-gaps', evidence: [{ kind: 'transcript', ref: `${s.transcript}:2`, quote: 'npm run lint' }] },
    { id: 'F4', title: 'feels slow', category: 'speed' },
  ]));
  writeFileSync(join(run, 'proposals.json'), JSON.stringify([
    { id: 'P1', finding: 'F1', text: 'ratchet retro:ts-as-cast', files: ['.ratchet.json'] },
    { id: 'P2', finding: 'F2', text: 'a CI workflow', files: ['.github/workflows/*.yml'] },
  ]));
  const chk = s.node('retro.mjs', ['check', '--run', run]);
  assert.equal(chk.code, 0, JSON.stringify(chk.out));
  assert.deepEqual(chk.out.counts, { passed: 2, 'not-passed': 1, 'no-evidence': 1 });
  const report = readFileSync(join(run, 'report.md'), 'utf8');
  assert.match(report, /## ข้อเสนอ/); assert.match(report, /F3 · not-passed/);

  writeFileSync(join(run, 'proposals.json'), JSON.stringify([{ id: 'P3', finding: 'F3', text: 'x', files: ['a'] }]));
  assert.equal(s.node('retro.mjs', ['check', '--run', run]).code, 1);
  writeFileSync(join(run, 'proposals.json'), JSON.stringify([
    { id: 'P1', finding: 'F1', text: 'ratchet retro:ts-as-cast', files: ['.ratchet.json'] },
    { id: 'P2', finding: 'F2', text: 'a CI workflow', files: ['.github/workflows/*.yml'] },
  ]));
  assert.equal(s.node('retro.mjs', ['check', '--run', run]).code, 0);

  writeFileSync(join(run, 'answers.md'), 'A1: P1 C, P2 B\ntime: 2026-11-22T09:00:00Z\n');
  const wrongLetter = s.node('retro.mjs', ['applied-check', '--run', run]);
  assert.equal(wrongLetter.code, 1);
  assert.deepEqual(wrongLetter.out.errors, ['P1: C is not an option (A, B)']);
  writeFileSync(join(run, 'answers.md'), 'A1: P1 A, P2 B\ntime: 2026-11-22T09:00:00Z\n');
  assert.deepEqual(s.node('retro.mjs', ['applied-check', '--run', run]).out.approved, ['P1']);
  writeFileSync(join(run, 'answers.md'), 'A1: P1 ok, P2 no\ntime: 2026-11-22T09:00:00Z\n');
  assert.equal(s.node('ratchet.mjs', ['add', '--rule', 'retro:ts-as-cast']).code, 0);
  assert.equal(s.node('retro.mjs', ['applied-check', '--run', run]).code, 0);
  mkdirSync(join(s.repo, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(s.repo, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  const bad = s.node('retro.mjs', ['applied-check', '--run', run]);
  assert.equal(bad.code, 1);
  assert.deepEqual(bad.out.unapproved, [{ file: '.github/workflows/ci.yml', proposal: 'P2' }]);
  execFileSync('rm', ['-r', join(s.repo, '.github')]);

  const log = s.node('retro.mjs', ['log', '--run', run]);
  assert.equal(log.code, 0);
  assert.deepEqual({ ...log.out.row, date: 'd' }, { date: 'd', work: 'feat', sessions: 1, tokens: 200, findings: 4, passed: 2, approved: 1, ratchetRules: 1 });
  assert.match(readFileSync(join(s.repo, 'docs', 'retro', 'log.md'), 'utf8'), /\| feat \| 1 \| 200 \| 4 \| 2 \| 1 \| 1 \|/);
  assert.equal(s.node('retro.mjs', ['applied-check', '--run', run]).code, 0);

  for (const f of s.g('ls-files', '--others', '--cached').split('\n').filter(Boolean)) {
    const text = readFileSync(join(s.repo, f), 'utf8');
    assert.ok(!text.includes('stop casting') && !text.includes(SECRET), `transcript text in ${f}`);
  }

  assert.ok(s.node('ratchet.mjs', ['install']).out.installed);
  s.g('add', '.'); assert.equal(s.commit('retro: ratchet').status, 0);
  writeFileSync(join(s.repo, 'src', 'b.ts'), 'export const c = z as Baz;\n'); s.g('add', '.');
  assert.notEqual(s.commit('more casts').status, 0);
  writeFileSync(join(s.repo, 'src', 'b.ts'), 'export const c: Baz = z;\n');
  writeFileSync(join(s.repo, 'src', 'a.ts'), 'export const a: Foo = x;\nexport const b = y as Bar;\n'); s.g('add', '.');
  assert.equal(s.commit('fewer casts').status, 0);
  assert.match(s.g('show', 'HEAD:.ratchet.json'), /"src\/a\.ts": 1/);
});

test('should skip transcripts and say so when RETRO_TRANSCRIPTS_ENABLED is false (FFlags)', () => {
  const s = setup();
  const r = spawnSync(process.execPath, [join(HERE, 'retro.mjs'), 'collect', '--base', s.base], { cwd: s.repo, env: { ...s.env, RETRO_TRANSCRIPTS_ENABLED: 'false' }, encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(out.sessions, 0);
  assert.match(out.notes.join(' '), /RETRO_TRANSCRIPTS_ENABLED=false/);
});

test('should stop with exit 2 when a flag or an option is not valid (FStrict)', () => {
  const s = setup();
  const run = (args, env = {}) => spawnSync(process.execPath, [join(HERE, 'retro.mjs'), ...args], { cwd: s.repo, env: { ...s.env, ...env }, encoding: 'utf8' }).status;
  assert.equal(run(['collect'], { RETRO_STEERING_BYTES_MAX: 'lots' }), 2);
  assert.equal(run(['collect', '--lang', 'fr']), 2);
  assert.equal(run(['collect', '--pr', '1', '--since', '7d']), 2);
  assert.equal(run(['check', '--run', 'relative/path']), 2);
  assert.equal(run(['check', '--run', join(tmpdir(), 'no-such-run')]), 2);
  assert.equal(run(['frobnicate']), 2);
  assert.ok(readdirSync(tmpdir()).length);
});

test('should cut the window to the given days and still find the session when --since is used (RScope)', () => {
  const s = setup();
  const r = spawnSync(process.execPath, [join(HERE, 'retro.mjs'), 'collect', '--since', '1d'], { cwd: s.repo, env: s.env, encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(out.work, 'since 1d');
  assert.equal(out.sessions, 1);
});
