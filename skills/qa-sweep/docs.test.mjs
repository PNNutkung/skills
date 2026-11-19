import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DOCS = ['SKILL.md', 'requirements.md', 'code.md', 'running-app.md'];
const MODE_FILE_MAX = 300; // the spec's split rule: a mode past this moves into its own skill
const SKILL_MAX = 100;
const SCRIPT_NAME = /\w[\w-]*\.(?:mjs|py)\b/g;
const VAR_REDIRECT = />>?\s*["']?\$/;
const read = f => readFileSync(join(HERE, f), 'utf8');
const lineCount = f => read(f).split('\n').length;

// every file name under dir, at any depth
const namesUnder = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? namesUnder(join(dir, e.name)) : [e.name]));

test('SKILL.md is a short router with a quoted description', () => {
  assert.ok(lineCount('SKILL.md') < SKILL_MAX, `SKILL.md has ${lineCount('SKILL.md')} lines`);
  assert.match(read('SKILL.md'), /^---\nname: qa-sweep\ndescription: "[^"]+"\n---/);
});

test('each mode file stays under the 300-line split threshold', () => {
  for (const f of ['requirements.md', 'code.md', 'running-app.md']) assert.ok(lineCount(f) < MODE_FILE_MAX, f);
});

test('every script the docs name exists', () => {
  const homes = ['skills/qa-sweep', 'skills/zero-trust-review', 'skills/paired-agent-tdd'].map(d => join(ROOT, d));
  const hookFiles = new Set(namesUnder(join(ROOT, 'hooks')));
  const named = new Set(DOCS.flatMap(f => read(f).match(SCRIPT_NAME) ?? []));
  assert.ok(named.has('run.mjs') && named.has('findings.mjs'), 'the docs name the scripts they rely on');
  const missing = [...named].filter(n => !homes.some(d => existsSync(join(d, n))) && !hookFiles.has(n));
  assert.deepEqual(missing, []);
});

// qa-guard reads a redirect target as plain text, so `> "$RUN/x"` lands inside the repo and is denied
test('no redirect in the docs targets a shell variable', () => {
  const bad = DOCS.flatMap(f => read(f).split('\n').filter(l => VAR_REDIRECT.test(l)).map(l => `${f}: ${l.trim()}`));
  assert.deepEqual(bad, []);
});

test('the docs use the scripts as they now work', () => {
  const [skill, code, app] = ['SKILL.md', 'code.md', 'running-app.md'].map(read);
  const all = DOCS.map(read).join('\n');
  assert.match(skill, /test -f "\$TIERS_PY"/, 'SKILL.md checks that pr-test-tiers.py is there');
  assert.match(readFileSync(join(ROOT, 'README.md'), 'utf8'), /qa-sweep[^\n]*\n[^\n]*pr-test-tiers\.py/, 'the README installs it with qa-sweep');
  assert.match(skill, /findings\.mjs" [^\n]*--tiers-py "\$TIERS_PY"/, 'findings.mjs runs the inventory itself');
  assert.doesNotMatch(all, /findings\.mjs[^\n]*--inventory/);
  assert.match(code, /--list-tier unit --module /, 'a test gap needs the module\'s whole tier');
  assert.match(code, /untiered/, 'untiered tests are not a missing tier');
  assert.match(code, /--budget 420/);
  assert.match(code, /background/);
  assert.match(app, /background/);
  assert.match(code, /conftest/, 'a support file outside the test folders is denied: ask');
  assert.match(code, /notUsable[\s\S]*unconfirmed/, 'a survivor with dropped tier files is not a proven gap');
  assert.doesNotMatch(readFileSync(join(ROOT, 'GLOSSARY.md'), 'utf8'), /The only enforcement this repo ships/);
  assert.ok(JSON.parse(read('evals.json')).some(e => e.expected_behavior.some(b => /untiered/.test(b))), 'an eval for a tier-less layout');
});

test('evals.json parses and has at least three cases', () => {
  const evals = JSON.parse(read('evals.json'));
  assert.ok(Array.isArray(evals) && evals.length >= 3, 'at least three cases');
  for (const e of evals) {
    assert.deepEqual(e.skills, ['qa-sweep']);
    assert.ok(typeof e.query === 'string' && e.query.length > 0);
    assert.ok(Array.isArray(e.files));
    assert.ok(Array.isArray(e.expected_behavior) && e.expected_behavior.length > 0);
    for (const b of e.expected_behavior) assert.ok(typeof b === 'string' && b.length > 0);
  }
});
