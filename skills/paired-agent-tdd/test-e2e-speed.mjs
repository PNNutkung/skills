// The fixture of the e2e.speed*.test.mjs files (ADR 0001): 2 groups (b after a), an integration test, one finding, scripted agents. Each file runs one flag set
// (ADR 0007: one test a file, so node --test spreads the runs over the cores); runWithInWorker runs one in a worker thread, for a test that needs two side by side.
// Two languages of the same fixture (ADR 0003 A13): POSIX sh (the default: `sh {file}`, so a fixture test run starts no node; zero-trust-review mutates no .sh line,
// so these runs have no mutants) and JavaScript (`node {file}`, mutated) for the runs that assert on mutation (runWithJs).
// E2E_REAL=1: the zero-trust-review sandbox (and this node binary for the JS fixture) instead of the direct runner.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { SPEED_ENV, SPEED_OFF_ENV } from './speed.mjs';
import { DIRECT_RUNNER, HERE, runE2E } from './test-e2e-run.mjs';

export { SPEED_ENV, SPEED_OFF_ENV };
const REAL = process.env.E2E_REAL === '1';
const RUNNER = REAL ? join(HERE, '..', 'zero-trust-review', 'sandbox-run.mjs') : DIRECT_RUNNER;
const NODE = realpathSync(process.execPath);
export const ON_ENV = Object.fromEntries(Object.values(SPEED_ENV).map(k => [k, '']));
// every flag of both skills off: PTDD_* as SPEED_OFF_ENV, and zero-trust-review's probe flags off with no process cap
export const ALL_OFF_ENV = { ...SPEED_OFF_ENV, ZT_MUTATION_BASELINE_REUSE_ENABLED: 'false', ZT_MUTATION_BUDGET_STRICT_ENABLED: 'false', ZT_TEST_PROCESS_MAX: '' };

const WEAK_FREE = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.mjs';
test('test_ac1_happy_words', () => assert.equal(slugify('Hello, World!'), 'hello-world'));
test('test_ac1_fail_non_string', () => assert.throws(() => slugify(42), TypeError));
test('test_ac1_edge_empty', () => assert.equal(slugify(''), ''));
test('test_ac1_edge_digits', () => assert.equal(slugify('Route 66'), 'route-66'));
test('test_ac2_happy_cut', () => assert.equal(slugify('abcdef', { maxLength: 3 }), 'abc'));
test('test_ac2_edge_no_trailing_dash', () => assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab'));
test('test_ac2_edge_default_length', () => assert.equal(slugify('a'.repeat(50)).length, 40));
`;
const SLUGS = [
  `export function slugify(text) {\n  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
  `export function slugify(text) {\n  if (typeof text !== 'string') throw new TypeError('text must be a string');\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
  `export function slugify(text, { maxLength = 40 } = {}) {\n  if (typeof text !== 'string') throw new TypeError('text must be a string');\n  // TODO: tighten the character class\n  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n  return slug.slice(0, maxLength).replace(/-+$/, '');\n}\n`,
];
const TITLE_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { title } from '../src/title.mjs';
test('test_ac3_happy_words', () => assert.equal(title('hello, world'), 'Hello World'));
test('test_ac3_fail_non_string', () => assert.throws(() => title(7), TypeError));
test('test_ac3_edge_empty', () => assert.equal(title(''), ''));
`;
const TITLES = [
  `import { slugify } from './slug.mjs';\nexport const title = text => slugify(text).split('-').join(' ');\n`,
  `import { slugify } from './slug.mjs';\nexport const title = text => slugify(text).split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('-');\n`,
  `import { slugify } from './slug.mjs';\nexport const title = text => slugify(text).split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');\n`,
];
const rows = (id, tests, file) => tests.map(([kind, t]) => ({ dod: id, kind, test: t, file }));
const groupsOf = (ext, slug, title) => ({
  a: { tests: `tests/test_slug.${ext}`, src: `src/slug.${ext}`, ...slug, rows: [...rows('AC1', [['happy', 'test_ac1_happy_words'], ['fail', 'test_ac1_fail_non_string'], ['edge', 'test_ac1_edge_empty']], `tests/test_slug.${ext}`), ...rows('AC2', [['happy', 'test_ac2_happy_cut'], ['edge', 'test_ac2_edge_no_trailing_dash']], `tests/test_slug.${ext}`)] },
  b: { tests: `tests/test_title.${ext}`, src: `src/title.${ext}`, ...title, rows: rows('AC3', [['happy', 'test_ac3_happy_words'], ['fail', 'test_ac3_fail_non_string'], ['edge', 'test_ac3_edge_empty']], `tests/test_title.${ext}`) },
});
export const GROUPS_JS = groupsOf('mjs', { testText: WEAK_FREE, versions: SLUGS }, { testText: TITLE_TEST, versions: TITLES });

// The same fixture in POSIX sh. A test file sources the code, defines one function per test (the names tdd.mjs looks for) and runs every test_* function it
// defines; it exits 1 when one fails, 2 when the code it sources is missing. "Throws TypeError for a non-string" becomes "fails when called without the text".
const SH_RUN = `fail=0
for t in $(sed -n 's/^\\(test_[a-z0-9_]*\\)().*/\\1/p' "$0"); do
  if "$t"; then echo "ok - $t"; else echo "not ok - $t"; fail=1; fi
done
exit "$fail"
`;
const SH_SLUG_TEST = `. src/slug.sh
test_ac1_happy_words() { [ "$(slugify 'Hello, World!')" = hello-world ]; }
test_ac1_fail_non_string() { ! slugify 2>/dev/null; }
test_ac1_edge_empty() { [ "$(slugify '')" = '' ]; }
test_ac1_edge_digits() { [ "$(slugify 'Route 66')" = route-66 ]; }
test_ac2_happy_cut() { [ "$(slugify abcdef 3)" = abc ]; }
test_ac2_edge_no_trailing_dash() { [ "$(slugify 'ab cd' 3)" = ab ]; }
test_ac2_edge_default_length() { s=$(slugify ${'a'.repeat(50)}); [ "\${#s}" = 40 ]; }
${SH_RUN}`;
const SH_LOWER = `printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-*//; s/-*$//'`;
const SH_SLUGS = [
  `slugify() {\n  ${SH_LOWER}\n}\n`,
  `slugify() {\n  [ $# -ge 1 ] || { echo 'text is required' >&2; return 1; }\n  ${SH_LOWER}\n}\n`,
  `slugify() {\n  [ $# -ge 1 ] || { echo 'text is required' >&2; return 1; }\n  # TODO: tighten the character class\n  s=$(${SH_LOWER})\n  printf '%s' "$s" | cut -c1-"\${2:-40}" | sed 's/-*$//'\n}\n`,
];
const SH_TITLE_TEST = `. src/title.sh
test_ac3_happy_words() { [ "$(title 'hello, world')" = 'Hello World' ]; }
test_ac3_fail_non_string() { ! title 2>/dev/null; }
test_ac3_edge_empty() { [ "$(title '')" = '' ]; }
${SH_RUN}`;
const SH_CAPS = `awk -F- '{ for (i = 1; i <= NF; i++) if ($i != "") printf "%s%s%s", (n++ ? SEP : ""), toupper(substr($i, 1, 1)), substr($i, 2) }'`;
const SH_TITLES = [
  `. src/slug.sh\ntitle() {\n  s=$(slugify "$@") || return 1\n  printf '%s' "$s" | tr '-' ' '\n}\n`,
  `. src/slug.sh\ntitle() {\n  s=$(slugify "$@") || return 1\n  printf '%s' "$s" | ${SH_CAPS.replace('SEP', '"-"')}\n}\n`,
  `. src/slug.sh\ntitle() {\n  s=$(slugify "$@") || return 1\n  printf '%s' "$s" | ${SH_CAPS.replace('SEP', '" "')}\n}\n`,
];
export const GROUPS = groupsOf('sh', { testText: SH_SLUG_TEST, versions: SH_SLUGS }, { testText: SH_TITLE_TEST, versions: SH_TITLES });

const LANGS = {
  sh: { groups: GROUPS, cmd: 'sh {file}', integ: 'tests/integration/test_flow.sh', integText: `. src/title.sh\n[ "$(title 'a b')" = 'A B' ]\n` },
  js: {
    groups: GROUPS_JS, cmd: `${REAL ? NODE : 'node'} {file}`, ...(REAL ? { ro: [dirname(dirname(NODE))] } : {}),
    integ: 'tests/integration/test_flow.mjs', integText: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { title } from '../../src/title.mjs';\ntest('flow', () => assert.equal(title('a b'), 'A B'));\n`,
  },
};

/** One whole run in its own fixture repo with `env` over process.env, the sh fixture. tweak(tools) -> scripted agents that replace the default ones. -> what happened, what it cost, critical-path hops */
export const runWith = (env, tweak = () => ({})) => runIn('sh', env, tweak);
/** the same run with the JavaScript fixture: zero-trust-review mutates its source lines */
export const runWithJs = (env, tweak = () => ({})) => runIn('js', env, tweak);

/** Runs the module at `url` in a worker thread with `data` as its workerData -> the first message it posts; rejects on an error, or an exit before a message. */
export const inWorker = (url, data) => new Promise((resolve, reject) => {
  const w = new Worker(url, { workerData: data });
  w.once('message', resolve);
  w.once('error', reject);
  w.once('exit', code => reject(new Error(`worker exited with code ${code} before it posted a result`)));
});
/** runWith(env) in a worker thread (this module is the worker's entry), so two runs of one test go side by side. -> the same result as runWith */
export const runWithInWorker = env => inWorker(new URL(import.meta.url), { runWorker: true, env });
if (!isMainThread && workerData?.runWorker) parentPort.postMessage(await runWith(workerData.env));

async function runIn(lang, env, tweak) {
  const L = LANGS[lang], G = L.groups;
  const plan = {
    cmd: L.cmd, ...(L.ro ? { ro: L.ro } : {}), mutation: { max: 10, budget: 60 }, integration: { file: L.integ, goal: 'title and slugify together, through the module boundary' },
    dod: [{ id: 'AC1', text: 'slugify lowercases and hyphenates words, throws TypeError for a non-string', source: 'assumed' }, { id: 'AC2', text: 'slugify cuts to maxLength, default 40', source: 'assumed', kinds: ['happy', 'edge'] },
      { id: 'AC3', text: 'title turns a slug into Title Case', source: 'assumed' }],
    groups: [{ id: 'a', goal: 'slugify', tests: [G.a.tests], src: [G.a.src], dod: ['AC1', 'AC2'], after: [] }, { id: 'b', goal: 'title, built on slugify', tests: [G.b.tests], src: [G.b.src], dod: ['AC3'], after: ['a'] }],
  };
  const r = await runE2E({
    spawn: (file, args, fixtureEnv) => spawnSync(file, args, { encoding: 'utf8', env: { ...process.env, PTDD_TEST_WRITER_ENABLED: 'false', ...fixtureEnv, ...env } }), // ADR 0011: the one tdd-driver these runs measure; an inline dod[] fast plan with the test writer on stops
    runner: RUNNER, plan, groups: G, prefix: 'pat-e2e-speed-',
    scripts: tools => ({
      'integration-tester': () => { tools.put(L.integ, L.integText); return { file: L.integ, exit: 0, findings: [] }; },
      ...tweak(tools),
    }),
  });
  return { ...r, hops: hops(r.labels, plan.groups, r.events) };
}

/** Critical-path agent hops: inside a group the agents run one after the other; a group's GREEN starts after the groups it waits for; then review (the integration tester and the reviewer, together or not), fixers by `after`, couriers with their fixers. */
function hops(labels, groups, events) {
  const byId = Object.fromEntries(groups.map(g => [g.id, g])), mine = gid => labels.filter(l => /^(red|green|tdd)-/.test(l) && l.split(':')[1] === gid);
  const isRed = l => /^(red-driver|red-navigator):\w+(:(rework\d*|recheck\d*|matrix))?$/.test(l);
  const chain = gid => { const red = mine(gid).filter(isRed).length, green = mine(gid).length - red, deps = byId[gid].after.map(chain); return deps.length ? Math.max(red, ...deps) + green : red + green; };
  const overlap = (x, y) => events.indexOf(`start ${x}`) < events.indexOf(`end ${y}`) && events.indexOf(`start ${y}`) < events.indexOf(`end ${x}`);
  const review = labels.includes('integration-tester') && labels.includes('reviewer') ? (overlap('integration-tester', 'reviewer') ? 1 : 2) : labels.includes('reviewer') ? 1 : 0;
  const fixers = labels.filter(l => /^fixer:\w+$/.test(l)).map(l => l.split(':')[1]), fdepth = gid => 1 + Math.max(0, ...byId[gid].after.filter(d => fixers.includes(d)).map(fdepth));
  const converge = labels.filter(l => /^final-verifier/.test(l)).length + new Set(labels.filter(l => /^fixer:\w+:final/.test(l)).map(l => l.split(':')[2])).size;
  return Math.max(...groups.map(g => chain(g.id))) + review + Math.max(0, ...fixers.map(fdepth)) + converge;
}

export const done = r => {
  assert.deepEqual([r.out.groups.a.state, r.out.groups.b.state], ['done', 'done'], JSON.stringify(r.out.notDone));
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.final, r.verify.unfixed, r.verify.integration], [8, 8, true, [], 'ok'], JSON.stringify(r.verify));
};
export const only = flag => ({ ...SPEED_OFF_ENV, ...(flag === SPEED_ENV.pipeline ? { [flag]: 'fast' } : { [flag]: 'true' }) });
