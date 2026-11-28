// Pins the output cap of the git calls of the mutation gate in `workflow.mjs next` (ADR 0011): 256 MiB, as the engine's gitOut has. The cap is read from the
// options handed to execFileSync, in a child node with node:child_process mocked: a real run past the cap would hold 256 MiB in this process, too much for
// parallel CI runners. Needs Node 22.3+ (mock.module).
// Run: node --test skills/dev-workflow/workflow.mut-buffer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = `import { mock } from 'node:test';
import * as cp from 'node:child_process';
const seen = [];
mock.module('node:child_process', { namedExports: { ...cp, execFileSync: (cmd, args, o) => { if (cmd === 'git') seen.push({ args, maxBuffer: o?.maxBuffer }); return cp.execFileSync(cmd, args, o); } } });
const fx = await import(process.env.FX_URL);
const { main } = await import(process.env.WF_URL);
const r = fx.mrepo({ base: { [fx.CALC]: fx.CALC_SRC, [fx.CALC_TEST]: fx.STRONG }, branch: { [fx.CALC]: 'export const isBig = (n) => n >= 10;\\n' } });
try {
  const env = { ...r.env, WORKFLOW_MUTATION_CHECK_ENABLED: 'true' };
  const call = argv => main(argv, { env, cwd: r.repo, gh: () => { throw new Error('no gh'); }, dodMjs: '/none' });
  const opened = await call(['open', '--slug', 'demo']);
  if (!opened.out.run) throw new Error(JSON.stringify(opened));
  fx.toTdd(opened.out.run);
  await call(['next', '--pr', fx.PR, '--pr-body', r.body, '--test-cmd', fx.TEST_CMD]);
  console.log(JSON.stringify(seen.filter(s => s.args.includes('--verify') || s.args.includes('ls-tree') || s.args.includes('show') || s.args.includes('-U0'))));
} finally { r.done(); }`;

test('should cap the output of every git call of the mutation gate at 256 MiB when the gate reads the branch', () => {
  const href = f => pathToFileURL(join(HERE, f)).href;
  const r = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--no-warnings', '--input-type=module', '-e', CHILD], { encoding: 'utf8', timeout: 15000, env: { ...process.env, FX_URL: href('fixtures/mutation.mjs'), WF_URL: href('workflow.mjs') } });
  assert.equal(r.status, 0, r.stderr);
  const seen = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.ok(seen.length >= 3, `git calls seen: ${seen.length}`);
  assert.ok(seen.some(s => s.args.includes('ls-tree')), 'the test listing ran');
  assert.deepEqual([...new Set(seen.map(s => s.maxBuffer))], [256 * 1024 * 1024]);
});
