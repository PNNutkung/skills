// Unit tests for inproc-cwd.mjs on small fixtures, and the check on this repo (the CI enforcement). Run: node --test inproc-cwd.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModule, checkRepo, mainBody } from './inproc-cwd.mjs';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'inproc-cwd.mjs');
const HELPER = "const realCwd = c => { try { return realpathSync(c); } catch { return c; } };\n";
const mod = ({ helper = HELPER, call = 'realCwd(cwd)', sig = '{ env = process.env, cwd = process.cwd() }' } = {}) =>
  `import { realpathSync } from 'node:fs';\n${helper}export async function main(argv, ${sig}) {\n  return run(argv, env, ${call});\n}\n\nfunction other() { return realpathSync('.'); }\n`;
const linkedTest = (marker = '// cwd: linked', file = 'tool.mjs', link = "symlinkSync(real, linked);") =>
  ({ name: 'tool.test.mjs', text: `import { symlinkSync } from 'node:fs';\nimport { main } from './${file}';\n${marker}\ntest('should match when linked', () => { ${link} });\n` });

test('should pass when main resolves cwd through a realCwd helper and a marked test beside it makes a symlink', () => {
  assert.deepEqual(checkModule('skills/x/tool.mjs', mod(), [linkedTest()]), []);
});

test('should pass when main calls realpathSync on cwd itself without a helper', () => {
  assert.deepEqual(checkModule('skills/x/tool.mjs', mod({ helper: '', call: 'realpathSync(cwd)' }), [linkedTest()]), []);
});

test('should report the module when main passes cwd on without resolving it', () => {
  const p = checkModule('skills/x/tool.mjs', mod({ call: 'cwd' }), [linkedTest()]);
  assert.deepEqual(p, ['skills/x/tool.mjs: main(argv, { cwd }) does not resolve cwd with realpathSync (or a realCwd helper); a started process sees a real path']);
});

test('should report the module when realCwd is called but not defined with realpathSync', () => {
  const p = checkModule('skills/x/tool.mjs', mod({ helper: 'const realCwd = c => c;\n' }), [linkedTest()]);
  assert.match(p.join('\n'), /realCwd is not defined with realpathSync/);
});

test('should report a missing linked test when the marker, the import or the symlink is missing', () => {
  const cases = { 'no marker': linkedTest('// an e2e test'), 'imports another module': linkedTest('// cwd: linked', 'other.mjs'), 'no symlink': linkedTest('// cwd: linked', 'tool.mjs', 'link(real);') };
  for (const [why, t] of Object.entries(cases)) assert.match(checkModule('skills/x/tool.mjs', mod(), [t]).join('\n'), /no test file beside it is marked `\/\/ cwd: linked`/, why);
  assert.equal(checkModule('skills/x/tool.mjs', mod(), []).length, 1, 'no test file at all');
});

test('should skip the module and not count realpathSync outside main when main takes no cwd or is not exported', () => {
  assert.equal(mainBody(mod({ sig: '{ env = process.env }' })), null);
  assert.equal(mainBody('export function run(argv, { cwd }) {}\n'), null);
  assert.doesNotMatch(mainBody(mod({ call: 'cwd' })), /realpathSync\('\.'\)/, 'the body stops at the closing brace of main');
  const r = checkRepo([{ path: 'skills/x/plain.mjs', text: 'export function main(argv) {}\n' }, { path: 'skills/x/tool.mjs', text: mod({ call: 'cwd' }) }], { 'skills/x': [] });
  assert.deepEqual(r.checked, ['skills/x/tool.mjs']);
  assert.equal(r.ok, false);
});

test('should find the tests in the module folder only when the repo has two folders', () => {
  const r = checkRepo([{ path: 'skills/a/tool.mjs', text: mod() }], { 'skills/b': [linkedTest()] });
  assert.equal(r.ok, false);
  assert.equal(checkRepo([{ path: 'skills/a/tool.mjs', text: mod() }], { 'skills/a': [linkedTest()] }).ok, true);
});

test('should pass on this repo, checking every in-process main with a cwd, when CI runs it', () => {
  const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(r.status, 0, r.stdout);
  for (const m of ['skills/paired-agent-tdd/tdd.mjs', 'skills/zero-trust-review/mutate.mjs', 'skills/zero-trust-review/note.mjs']) assert.ok(out.checked.includes(m), m);
});

test('should exit 2 when an argument is unknown', () => {
  const r = spawnSync(process.execPath, [CHECK, '--bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).error, /usage: inproc-cwd\.mjs/);
});
