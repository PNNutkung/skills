// Unit tests for the shape of skills/mutation (ADR 0011 Interface, A18): its files, proc.mjs re-exported by zero-trust-review's probelib.mjs, an engine that
// reads no env, usage errors thrown as UsageError (exported by engine.mjs), and results returned as data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as probelib from '../zero-trust-review/probelib.mjs';
import { MUTATION_DIR, attempt, calcOpts, calcRepo } from './fixtures/repo.mjs';

const FILES = ['engine.mjs', 'score.mjs', 'equivalent.mjs', 'select.mjs', 'mutants.mjs', 'proc.mjs', 'cli.mjs', 'SKILL.md'];
const PROC = ['gitOut', 'changes', 'extract', 'runIn', 'pool', 'shq', 'isSource', 'TEST', 'DOC'];
const NO_ENV = ['engine.mjs', 'score.mjs', 'equivalent.mjs', 'select.mjs', 'mutants.mjs'];
const src = f => readFileSync(join(MUTATION_DIR, f), 'utf8');

test('should hold the engine, mutators, score, equivalent file, selection, helpers, CLI and SKILL.md when the skill folder is listed (Module happy)', () => {
  for (const f of FILES) assert.ok(existsSync(join(MUTATION_DIR, f)), `skills/mutation/${f}`);
  const skill = src('SKILL.md');
  assert.match(skill, /^---\n[\s\S]*?\bname:\s*mutation\b[\s\S]*?\n---/, 'SKILL.md has front matter naming the skill');
  for (const word of ['MUTATION_DIR', 'mutation-equivalent.json', 'runMutation']) assert.ok(skill.includes(word), `SKILL.md mentions ${word}`);
});

test('should re-export the same proc.mjs helpers when zero-trust-review imports probelib.mjs (Module)', async () => {
  const proc = await import('./proc.mjs');
  for (const name of PROC) {
    assert.ok(name in proc, `proc.mjs exports ${name}`);
    assert.equal(probelib[name], proc[name], `probelib.${name} is proc.${name}`);
  }
});

test('should read no environment variable and import nothing from zero-trust-review when the engine files are read (Module)', () => {
  for (const f of NO_ENV) {
    const text = src(f);
    assert.doesNotMatch(text, /process\.env/, `${f} reads no env: each caller passes options`);
    assert.doesNotMatch(text, /zero-trust-review/, `${f} does not depend on zero-trust-review (the runner is passed in)`);
  }
});

test('should call runMutation when zero-trust-review mutate.mjs is read (Module)', () => {
  assert.match(readFileSync(join(MUTATION_DIR, '..', 'zero-trust-review', 'mutate.mjs'), 'utf8'), /runMutation/);
});

test('should throw a UsageError when an option is not valid (Module fail)', async t => {
  const { runMutation, UsageError } = await import('./engine.mjs');
  assert.equal(typeof UsageError, 'function');
  assert.ok(new UsageError('x') instanceof Error);
  const fx = calcRepo(t);
  const bad = { cmd: 'node test.mjs', scoreMin: 101, max: 0, select: 'graph', jobs: 0, budget: -1 };
  for (const [k, v] of Object.entries(bad)) {
    const r = await attempt(() => runMutation(calcOpts(fx, { [k]: v })));
    assert.equal(r.ok, false, `${k}=${v} is a usage error`);
    assert.ok(r.error instanceof UsageError, `${k}=${v}: ${r.error?.constructor?.name} ${r.error?.message}`);
  }
  const { repo, ...noRepo } = calcOpts(fx);
  assert.ok((await attempt(() => runMutation(noRepo))).error instanceof UsageError, 'repo is required');
  const { base, ...noBase } = calcOpts(fx);
  assert.ok((await attempt(() => runMutation(noBase))).error instanceof UsageError, 'base (or files) is required');
});

test('should resolve with a reason and pass false when the change is empty (Module edge)', async t => {
  const { runMutation } = await import('./engine.mjs');
  const fx = calcRepo(t);
  const r = await runMutation(calcOpts(fx, { base: fx.head })); // base = head: no changed source and no changed test
  assert.equal(typeof r.reason, 'string');
  assert.deepEqual(r.mutants, []);
  assert.equal(r.pass, false, 'no mutant counted never passes');
  assert.equal(r.score.value, null);
});
