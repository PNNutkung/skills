// Backward compatibility of zero-trust-review/mutate.mjs once it is a thin wrapper around skills/mutation (ADR 0011 Interface, A18). It passes on the code
// before the move and must keep passing after it: the same CLI, exit codes, summary/score/mutants keys, ZT_MUTATION_* / ZT_TEST_PROCESS_MAX flags and the
// defaults max 30 and jobs 4 (budget 600 is not observable without waiting 600 s). A sh stub runner (no node start per call) stands in for the sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../zero-trust-review/mutate.mjs';
import { MUTATION_DIR, calcRepo } from './fixtures/repo.mjs';

const MUTATE = join(MUTATION_DIR, '..', 'zero-trust-review', 'mutate.mjs');
// A mutant run (its command holds ZT-MUTANT) leaves a marker in live/ while it lasts and logs each count of markers it saw to peak.log. It waits, at most 10 s,
// until `target` markers existed at once (then the file go opens the barrier for every run): with 5 mutants and target 4, 4 parallel workers give a peak of
// exactly 4, fewer never reach it, more could show 5 (polling, not a fixed wait: rules/flaky-tests.md).
const STUB = `#!/bin/sh
d=\${0%/*}
[ "$1" = --check ] && { echo stub; exit 0; }
target=$(cat "$d/target")
case "$*" in *ZT-MUTANT*) mut=1;; *) mut=;; esac
cwd=
while [ "$#" -gt 0 ] && [ "$1" != -- ]; do
  case "$1" in --cwd) cwd=$2;; --env) export "$2";; esac
  shift 2
done
shift
if [ -n "$mut" ]; then
  mkdir -p "$d/live"; : > "$d/live/$$"
  i=0
  while :; do
    n=$(ls "$d/live" | wc -l | tr -d ' '); echo "$n" >> "$d/peak.log"
    [ "$n" -ge "$target" ] && : > "$d/go"
    [ -e "$d/go" ] && break
    i=$((i + 1)); [ "$i" -ge 100 ] && break
    sleep 0.1
  done
fi
cd "$cwd" || exit 1
"$@"; code=$?
[ -n "$mut" ] && rm -f "$d/live/$$"
printf 'ZT-RUN stub-%s exit=%s\\n' "$$" "$code" >&2
exit "$code"
`;
// 40 changed lines with two mutants each (add-sub, const-inc): more than the default max of 30
const MANY = Array.from({ length: 40 }, (_, i) => `export const a${i} = x => x + ${i + 1};`).join('\n') + '\n';
const SCORE_KEYS = ['inconclusive', 'killed', 'skipped', 'survived', 'timeout', 'total', 'unverifiable'];
const FLAGS = ['ZT_MUTATION_BASELINE_REUSE_ENABLED', 'ZT_MUTATION_BUDGET_STRICT_ENABLED', 'ZT_TEST_PROCESS_MAX'];

function setup(t, target = 1) {
  const fx = calcRepo(t, { source: MANY });
  const sd = join(fx.dir, 'stub');
  mkdirSync(sd);
  writeFileSync(join(sd, 'stub-runner'), STUB);
  chmodSync(join(sd, 'stub-runner'), 0o755);
  writeFileSync(join(sd, 'target'), `${target}\n`);
  const peak = () => Math.max(0, ...(existsSync(join(sd, 'peak.log')) ? readFileSync(join(sd, 'peak.log'), 'utf8').split('\n').filter(Boolean).map(Number) : []));
  return { fx, peak, argv: ['--repo', fx.repo, '--base', fx.base, '--head', fx.head, '--scratch', fx.scratch, '--cmd', 'test -f {file}', '--runner', join(sd, 'stub-runner')] };
}
const cleanEnv = (more = {}) => { const env = { ...process.env }; for (const k of FLAGS) delete env[k]; return { ...env, ...more }; };
const run = async (argv, env = cleanEnv()) => { const r = await main(argv, { env }); return { ...r, out: r.code === 0 ? JSON.parse(r.stdout) : null }; };

test('should keep the output keys and sample 30 mutants when mutate.mjs runs with no --max (Module happy)', async t => {
  const { argv } = setup(t);
  const r = await run(argv);
  assert.equal(r.code, 0, r.stderr);
  for (const k of ['backend', 'available', 'mutants', 'score', 'summary', 'tests']) assert.ok(k in r.out, `output key ${k}`);
  assert.equal(r.out.backend, 'stub');
  assert.ok(r.out.available > 30, String(r.out.available));
  assert.equal(r.out.mutants.length, 30, 'default --max 30');
  assert.deepEqual(Object.keys(r.out.score).filter(k => SCORE_KEYS.includes(k)).sort(), SCORE_KEYS);
  assert.equal(r.out.score.total, 30);
  assert.equal(r.out.score.survived, 30);
  assert.match(r.out.summary, /^mutation: 30 of \d+ mutants on changed lines: 0 killed, 30 survived\nsurvived X-[0-9a-f]{8} src\/calc\.mjs:\d+ /);
  assert.deepEqual(r.out.tests, { run: ['test/calc.test.mjs'], notUsable: [] });
});

test('should exit 2 with a mutate: message when an option or a ZT flag is not valid (Module fail)', async t => {
  const { argv } = setup(t);
  const noCmd = spawnSync(process.execPath, [MUTATE, ...argv.filter((a, i) => a !== '--cmd' && argv[i - 1] !== '--cmd')], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(noCmd.status, 2, noCmd.stderr);
  assert.match(noCmd.stderr, /^mutate: --cmd is required/);
  assert.equal(noCmd.stdout, '');
  for (const flag of FLAGS) {
    const r = await run(argv, cleanEnv({ [flag]: 'maybe' }));
    assert.equal(r.code, 2, `${flag}=maybe`);
    assert.match(r.stderr, new RegExp(`^mutate: ${flag}=maybe is not valid`));
  }
});

test('should run 4 mutants at once by default and honor ZT_TEST_PROCESS_MAX when mutate.mjs runs (Module edge)', async t => {
  const four = setup(t, 4);
  const r = await run([...four.argv, '--max', '5']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(four.peak(), 4, 'default --jobs 4');
  const one = setup(t, 1);
  const r1 = await run([...one.argv, '--max', '5'], cleanEnv({ ZT_TEST_PROCESS_MAX: '1' }));
  assert.equal(r1.code, 0, r1.stderr);
  assert.equal(one.peak(), 1);
  assert.deepEqual(r1.out.mutants.map(m => [m.id, m.result]), r.out.mutants.map(m => [m.id, m.result]));
});
