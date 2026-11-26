import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFromDiff, claimItems } from './claims.mjs';

const DIFF = `diff --git a/cli.mjs b/cli.mjs
--- a/cli.mjs
+++ b/cli.mjs
@@ -1,2 +1,4 @@
 const old = '--old-opt';
-const gone = process.env.GONE_ENABLED;
+const x = process.env.DEMO_X_ENABLED ?? 'true';
+if (argv.includes('--dry-run')) dry(); // also --dry-run again
diff --git a/README.md b/README.md
+++ b/README.md
@@ -1 +1,2 @@
+Set DEMO_LIMIT_MAX or pass --not-code
diff --git a/config.json b/config.json
+++ b/config.json
@@ -1 +1,3 @@
+  "retryCount": 3,
+  "nested": { "inner": 1 }
diff --git a/app.yml b/app.yml
+++ b/app.yml
@@ -1 +1,2 @@
+  timeout_seconds: 30
+# comment: no
diff --git a/pyproject.toml b/pyproject.toml
+++ b/pyproject.toml
@@ -1 +1,2 @@
+line_length = 100
`;

test('should list added flags, CLI options and config keys with their files when the branch diff adds them (Source)', () => {
  const c = candidatesFromDiff(DIFF);
  assert.deepEqual(c.flags, [{ name: 'DEMO_X_ENABLED', file: 'cli.mjs' }, { name: 'DEMO_LIMIT_MAX', file: 'README.md' }]);
  assert.deepEqual(c.options, [{ name: '--dry-run', file: 'cli.mjs' }]);
  assert.deepEqual(c.configKeys, [{ key: 'retryCount', file: 'config.json' }, { key: 'nested', file: 'config.json' }, { key: 'inner', file: 'config.json' }, { key: 'timeout_seconds', file: 'app.yml' }, { key: 'line_length', file: 'pyproject.toml' }]);
});

test('should list nothing when the diff only removes or keeps lines (Source edge)', () => {
  assert.deepEqual(candidatesFromDiff('+++ b/a.mjs\n-const x = process.env.A_ENABLED;\n const y = "--z";\n'), { flags: [], options: [], configKeys: [] });
  assert.deepEqual(candidatesFromDiff(''), { flags: [], options: [], configKeys: [] });
});

test('should make confirmed claims the items when each answer is in answers.md (Source)', () => {
  const r = claimItems([{ id: 'C1', text: 'DEMO_X_ENABLED=false hides x', answer: 'A3' }], { A3: 'yes' });
  assert.deepEqual(r, { items: [{ id: 'C1', text: 'DEMO_X_ENABLED=false hides x' }], errors: [] });
});

test('should refuse a claim with no answer, a missing answer, a bad id or a duplicate when claims.json is wrong (Source fail)', () => {
  const r = claimItems([{ id: 'C1', text: 't', answer: 'A9' }, { id: 'C1', text: 't', answer: 'A1' }, { id: 'bad id', text: 't', answer: 'A1' }, { id: 'C3', text: '' }], { A1: 'ok' });
  assert.match(r.errors.join('\n'), /C1: answer A9 is not in answers.md/);
  assert.match(r.errors.join('\n'), /duplicate claim C1/);
  assert.match(r.errors.join('\n'), /bad id/);
  assert.match(r.errors.join('\n'), /C3: no text/);
  assert.match(claimItems({}, {}).errors.join(), /must be a JSON array/);
});

test('should list an option with digits 2 to 9 when the diff adds one (Source edge)', () => {
  assert.deepEqual(candidatesFromDiff('+++ b/cli.mjs\n+if (args.includes("--x9-mode")) run();\n').options, [{ name: '--x9-mode', file: 'cli.mjs' }]);
});
