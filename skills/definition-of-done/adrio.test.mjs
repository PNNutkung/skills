// Integration tests for adrio.mjs on throwaway git repos: the ADR folder, the index, loading a DoD at HEAD, renames and the pre-commit hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAdr } from './adr.mjs';
import { adrDir, adrTarget, findAdrsFor, installHook, listAdrs, loadAdrDod, relPath, repoFiles, stagedRenames, syncRepo, writeIndex } from './adrio.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOD_MJS = join(HERE, 'dod.mjs');
const QUESTIONS = 'Q1: Which pages?\n(A) both\n  + consistent\n  - two pages to test\n(B) sales\n  + smaller\n  - stock users ask again\nrecommended: A\n';
const ANSWERS = 'A1: A\ntime: t\n';
const dod = (slug = 'report-export', touches = ['src/reports/**']) => ({
  slug, touches,
  items: [{ id: 'AC1', text: 'button on both pages', source: { kind: 'user', ref: 'A1', quote: 'A', question: 'Q1' } }],
  required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: { kind: 'user', ref: 'A1', quote: 'A', question: 'Q1' } }])),
});
const adrText = (n, d = dod()) => renderAdr({ dod: d, answers: ANSWERS, questions: QUESTIONS, ticket: '', number: n, date: '2026-11-22' }).text;

function newRepo() {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'adrio-')));
  const g = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8' });
  g('init', '-q');
  const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
  return { repo, g, put, commit: (m = 'c') => { g('add', '-A'); g('commit', '-qm', m); } };
}

test('should pick .adr-dir, then a known folder, then docs/adr when choosing the ADR folder', () => {
  const { repo, put } = newRepo();
  assert.equal(adrDir(repo), 'docs/adr');
  put('docs/decisions/0001-x.md', '# 1. x\n');
  assert.equal(adrDir(repo), 'docs/decisions');
  put('.adr-dir', 'architecture/adr\n');
  assert.equal(adrDir(repo), 'architecture/adr');
  put('.adr-dir', '../outside\n');
  assert.equal(adrDir(repo), 'docs/decisions', 'a path out of the repo is ignored');
});

test('should reuse the file of the same DoD slug and otherwise take the next number', () => {
  const { repo, put } = newRepo();
  put('docs/adr/0003-old.md', '# 3. old\n');
  assert.deepEqual(adrTarget(repo, 'report-export'), { n: 4, file: 'docs/adr/0004-report-export.md', existing: false });
  put('docs/adr/0004-report-export.md', adrText(4));
  put('docs/adr/0009-other.md', adrText(9, dod('other')));
  assert.deepEqual(adrTarget(repo, 'report-export'), { n: 4, file: 'docs/adr/0004-report-export.md', existing: true });
});

test('should write an index of every ADR in the folder README and change nothing on a second run', () => {
  const { repo, put } = newRepo();
  put('docs/adr/0001-report-export.md', adrText(1));
  put('docs/adr/0002-cache.md', '---\ntouches:\n  - "src/cache/**"\n---\n# 2. Cache\n\nStatus: Superseded\n');
  put('docs/adr/README.md', '# Decisions\n\nOurs.\n');
  assert.equal(writeIndex(repo).changed, true);
  const readme = readFileSync(join(repo, 'docs/adr/README.md'), 'utf8');
  assert.match(readme, /^# Decisions\n\nOurs\.\n/);
  assert.match(readme, /\| \[1\]\(0001-report-export\.md\) \| Report export \| Accepted \| `src\/reports\/\*\*` \|/);
  assert.match(readme, /\| \[2\]\(0002-cache\.md\) \| Cache \| Superseded \| `src\/cache\/\*\*` \|/);
  assert.equal(writeIndex(repo).changed, false);
});

test('should find the active ADRs whose touches match the files, skipping superseded ones', () => {
  const { repo, put, commit } = newRepo();
  put('docs/adr/0001-report-export.md', adrText(1));
  put('docs/adr/0002-cache.md', '---\ntouches:\n  - "src/reports/**"\n---\n# 2. Cache\n\nStatus: Superseded\n');
  commit();
  const found = findAdrsFor(repo, ['src/reports/export.ts', '../evil']);
  assert.deepEqual(found.map(f => [f.file, f.hasDod]), [['docs/adr/0001-report-export.md', true]]);
  assert.deepEqual(findAdrsFor(repo, ['src/other.ts']), []);
  assert.equal(findAdrsFor(repo, ['src/reports/a.ts'], { rev: 'HEAD' }).length, 1);
});

test('should load the DoD of a committed ADR and refuse one that is uncommitted, edited, missing or not an ADR', () => {
  const { repo, put, commit } = newRepo();
  const file = 'docs/adr/0001-report-export.md';
  put(file, adrText(1));
  assert.match(loadAdrDod({ repo, file }).errors.join('\n'), /not committed at HEAD/);
  commit();
  const ok = loadAdrDod({ repo, file });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.parsed.section.items.map(i => i.id), ['AC1']);
  assert.match(ok.blob, /^[0-9a-f]{40}$/);
  put(file, adrText(1) + '\nmore\n');
  assert.match(loadAdrDod({ repo, file }).errors.join('\n'), /differs from HEAD; commit it first/);
  assert.equal(loadAdrDod({ repo, file, rev: 'HEAD~0' }).ok, true, 'another rev reads git only');
  put('docs/dod/x.json', '{"slug":"x"}'); commit();
  assert.match(loadAdrDod({ repo, file: 'docs/dod/x.json' }).errors.join('\n'), /not an ADR with a "## Definition of done" section/);
  assert.match(loadAdrDod({ repo, file: '/etc/passwd' }).errors.join('\n'), /relative path inside the repo/);
});

test('should list staged renames and the repo files', () => {
  const { repo, g, put, commit } = newRepo();
  put('src/reports/a.ts', 'a\n'); put('src/reports/b.ts', 'b\n'); commit();
  g('mv', 'src/reports', 'src/export');
  assert.deepEqual(stagedRenames(repo).sort(), [['src/reports/a.ts', 'src/export/a.ts'], ['src/reports/b.ts', 'src/export/b.ts']]);
  put('new.txt', 'x');
  assert.ok(repoFiles(repo).includes('new.txt'));
  assert.ok(!repoFiles(repo, { staged: true }).includes('new.txt'));
});

test('should rewrite the touches, refresh the index and stage both when a folder move is synced', () => {
  const { repo, g, put, commit } = newRepo();
  const file = 'docs/adr/0001-report-export.md';
  put(file, adrText(1)); put('src/reports/a.ts', 'a\n'); commit();
  writeIndex(repo); commit('index');
  g('mv', 'src/reports', 'src/export');
  const r = syncRepo({ repo, renames: stagedRenames(repo), files: repoFiles(repo, { staged: true }), stage: true });
  assert.deepEqual(r.changes, [{ adr: file, from: 'src/reports/**', to: 'src/export/**' }]);
  assert.deepEqual(r.changed, [file, 'docs/adr/README.md']);
  assert.match(readFileSync(join(repo, file), 'utf8'), /^---\ntouches:\n {2}- "src\/export\/\*\*"\n/);
  assert.match(g('diff', '--cached', '--name-only'), /0001-report-export\.md[\s\S]*README\.md/);
  commit('moved');
  assert.equal(loadAdrDod({ repo, file }).ok, true, 'the DoD section is untouched by the sync');
});

test('should install the pre-commit hook once, update its own hook, and leave a foreign hook or a hook manager alone', () => {
  const { repo, g } = newRepo();
  const r = installHook({ repo, dodMjs: DOD_MJS });
  assert.ok(r.installed && existsSync(r.installed));
  assert.ok(statSync(r.installed).mode & 0o100, 'executable');
  assert.match(readFileSync(r.installed, 'utf8'), /DOD_ADR_PRECOMMIT_HOOK_ENABLED" = "false" \] && exit 0/);
  assert.ok(installHook({ repo, dodMjs: DOD_MJS }).installed, 'rewrites its own hook');
  writeFileSync(r.installed, '#!/bin/sh\nnpm test\n');
  const foreign = installHook({ repo, dodMjs: DOD_MJS });
  assert.match(foreign.skipped, /exists and is not ours/);
  assert.match(foreign.line, /adrs --sync --staged/);
  assert.equal(readFileSync(r.installed, 'utf8'), '#!/bin/sh\nnpm test\n');
  g('config', 'core.hooksPath', '.husky');
  assert.match(installHook({ repo, dodMjs: DOD_MJS }).skipped, /core\.hooksPath is \.husky/);
});

test('should follow a folder move through a real commit when the hook is installed', () => {
  const { repo, g, put, commit } = newRepo();
  const file = 'docs/adr/0001-report-export.md';
  put(file, adrText(1)); put('src/reports/a.ts', 'a\n'); commit();
  installHook({ repo, dodMjs: DOD_MJS });
  g('mv', 'src/reports', 'src/export');
  const out = spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'move'], { encoding: 'utf8', env: { ...process.env, DOD_ADR_PRECOMMIT_HOOK_ENABLED: '' } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stderr, /dod-adr: docs\/adr\/0001-report-export\.md: src\/reports\/\*\* -> src\/export\/\*\*/);
  assert.match(g('show', `HEAD:${file}`), /- "src\/export\/\*\*"/, 'the fix is in the same commit as the move');
  g('mv', 'src/export', 'src/x');
  const off = spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'move2'], { encoding: 'utf8', env: { ...process.env, DOD_ADR_PRECOMMIT_HOOK_ENABLED: 'false' } });
  assert.equal(off.status, 0);
  assert.match(g('show', `HEAD:${file}`), /- "src\/export\/\*\*"/, 'DOD_ADR_PRECOMMIT_HOOK_ENABLED=false skips the hook');
  renameSync(join(repo, 'src/x'), join(repo, 'src/y'));
});

test('should accept only normalized relative paths inside the repo', () => {
  assert.equal(relPath('docs/adr/x.md'), 'docs/adr/x.md');
  assert.equal(relPath('./docs//adr/x.md'), 'docs/adr/x.md');
  for (const bad of ['', '/abs', '../x', 'a/../../x', null, 3, 'a\0b']) assert.equal(relPath(bad), null, String(bad));
});

test('should list ADRs from a git revision as well as from the working tree', () => {
  const { repo, put, commit } = newRepo();
  put('docs/adr/0001-report-export.md', adrText(1)); commit();
  put('docs/adr/0002-other.md', adrText(2, dod('other')));
  assert.deepEqual(listAdrs(repo).map(a => a.n), [1, 2]);
  assert.deepEqual(listAdrs(repo, { rev: 'HEAD' }).map(a => a.n), [1]);
});
