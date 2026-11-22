// End to end with the DEFAULT environment (no PTDD_* flag set: fast pipeline, quick driver gate, gate reuse, courier skip, parallel review all on), the way a real run starts.
// The REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo, SCRIPTED agents that run the gate commands their prompts name; 3 independent groups, 6 DoD items, 18 pairs.
// A real run left files outside the plan in the repo (an args file, a hook cache): the final gate fails on them alone, which is work left for the run, never a void of every group's proven pairs.
//   node --test e2e.default.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEED_ENV } from './speed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TDD = join(HERE, 'tdd.mjs');
const RUNNER = join(HERE, 'direct-run.mjs');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const DEFAULT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !Object.values(SPEED_ENV).includes(k) && !/^ZT_/.test(k)));

const head = name => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${name} } from '../src/${name}.mjs';\n`;
const GROUPS = {
  a: {
    goal: 'slugify', dod: ['AC1', 'AC2'], tests: 'tests/test_slugify.mjs', src: 'src/slugify.mjs',
    testText: `${head('slugify')}test('test_ac1_happy_words', () => assert.equal(slugify('Hello, World!'), 'hello-world'));
test('test_ac1_fail_non_string', () => assert.throws(() => slugify(42), TypeError));
test('test_ac1_edge_empty', () => assert.equal(slugify(''), ''));
test('test_ac2_happy_cut', () => assert.equal(slugify('abcdef', 3), 'abc'));
test('test_ac2_fail_zero', () => assert.throws(() => slugify('ab', 0), RangeError));
test('test_ac2_edge_no_trailing_dash', () => assert.equal(slugify('ab cd', 3), 'ab'));
test('test_ac2_one', () => assert.equal(slugify('ab', 1), 'a'));
test('test_ac2_default_length', () => assert.equal(slugify('a'.repeat(50)).length, 40));
test('test_ac1_leading', () => assert.equal(slugify('--Hi'), 'hi'));
test('test_ac1_digits', () => assert.equal(slugify('Route 66'), 'route-66'));
`,
    versions: [
      `export function slugify(text, max = 40) {\n  return String(text).toLowerCase();\n}\n`,
      `export function slugify(text, max = 40) {\n  if (typeof text !== 'string') throw new TypeError('text');\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');\n}\n`,
      `export function slugify(text, max = 40) {\n  if (typeof text !== 'string') throw new TypeError('text');\n  if (max < 1) throw new RangeError('max');\n  // TODO: tighten the character class\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');\n}\n`,
    ],
  },
  b: {
    goal: 'clamp', dod: ['AC3', 'AC4'], tests: 'tests/test_clamp.mjs', src: 'src/clamp.mjs',
    testText: `${head('clamp')}test('test_ac3_happy_inside', () => assert.equal(clamp(5, 0, 10), 5));
test('test_ac3_fail_non_number', () => assert.throws(() => clamp('5', 0, 10), TypeError));
test('test_ac3_edge_at_bounds', () => { assert.equal(clamp(0, 0, 10), 0); assert.equal(clamp(10, 0, 10), 10); });
test('test_ac4_happy_below', () => assert.equal(clamp(-3, 0, 10), 0));
test('test_ac4_fail_inverted', () => assert.throws(() => clamp(1, 10, 0), RangeError));
test('test_ac4_edge_above', () => assert.equal(clamp(11, 0, 10), 10));
test('test_ac4_equal_bounds', () => assert.equal(clamp(3, 2, 2), 2));
`,
    versions: [
      `export function clamp(n, lo, hi) {\n  return n;\n}\n`,
      `export function clamp(n, lo, hi) {\n  if (typeof n !== 'number') throw new TypeError('n');\n  return Math.min(hi, Math.max(lo, n));\n}\n`,
      `export function clamp(n, lo, hi) {\n  if (typeof n !== 'number') throw new TypeError('n');\n  if (lo > hi) throw new RangeError('bounds');\n  return Math.min(hi, Math.max(lo, n));\n}\n`,
    ],
  },
  c: {
    goal: 'countWords', dod: ['AC5', 'AC6'], tests: 'tests/test_countWords.mjs', src: 'src/countWords.mjs',
    testText: `${head('countWords')}test('test_ac5_happy_three', () => assert.equal(countWords('a b c'), 3));
test('test_ac5_fail_non_string', () => assert.throws(() => countWords(null), TypeError));
test('test_ac5_edge_empty', () => assert.equal(countWords(''), 0));
test('test_ac6_happy_runs_of_space', () => assert.equal(countWords('a   b'), 2));
test('test_ac6_fail_object', () => assert.throws(() => countWords({}), TypeError));
test('test_ac6_edge_padded', () => assert.equal(countWords('  a b  '), 2));
test('test_ac6_one', () => assert.equal(countWords('word'), 1));
`,
    versions: [
      `export function countWords(text) {\n  return String(text).split(' ').length;\n}\n`,
      `export function countWords(text) {\n  return String(text).split(/\\s+/).filter(Boolean).length;\n}\n`,
      `export function countWords(text) {\n  if (typeof text !== 'string') throw new TypeError('text');\n  return text.split(/\\s+/).filter(Boolean).length;\n}\n`,
    ],
  },
};
const KIND_TESTS = text => [...text.matchAll(/test\('(test_(ac\d)_(happy|fail|edge)_\w+)'/g)].map(m => ({ dod: m[2].toUpperCase(), kind: m[3], test: m[1] }));
for (const G of Object.values(GROUPS)) G.rows = KIND_TESTS(G.testText).map(r => ({ ...r, file: G.tests }));

/** One whole run with the default flags in its own fixture repo. strays: files outside the plan written into the repo after `plan`, as a real run left them. */
async function runDefault({ strays = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-e2e-default-'))), repo = join(dir, 'repo'), tmp = join(dir, 'tmp');
  for (const d of [repo, tmp]) mkdirSync(d);
  const ENV = { ...DEFAULT_ENV, TMPDIR: tmp, ZT_MARKER_DIR: join(dir, 'marker') };
  try {
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
    const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
    git('init', '-q'); put('package.json', '{"type":"module"}\n'); put('README.md', 'text utils\n'); git('add', '-A'); git('commit', '-qm', 'base');
    const items = { AC1: 'slugify lowercases and hyphenates, TypeError for a non-string', AC2: 'slugify cuts to max, RangeError below 1', AC3: 'clamp keeps a number inside, TypeError otherwise', AC4: 'clamp pulls a number to its bounds, RangeError for inverted bounds', AC5: 'countWords counts words, TypeError for a non-string', AC6: 'countWords ignores runs of white space' };
    const plan = {
      repo, cmd: 'node --test {file}', mutation: { max: 10, budget: 60 },
      dod: Object.entries(items).map(([id, text]) => ({ id, text, source: 'assumed' })),
      groups: Object.entries(GROUPS).map(([id, G]) => ({ id, goal: G.goal, tests: [G.tests], src: [G.src], dod: G.dod, after: [] })),
    };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    const outputs = [];
    const exec = (cmd, kind) => {
      const out = spawnSync('sh', ['-c', `${cmd} --runner ${RUNNER}`], { encoding: 'utf8', env: ENV });
      assert.equal(out.status, 0, `${cmd}\n${out.stderr}`);
      outputs.push([kind, cmd, out.stdout]);
      return out.stdout;
    };
    const planned = spawnSync(process.execPath, [TDD, 'plan', '--plan', join(dir, 'plan.json'), '--runner', RUNNER], { encoding: 'utf8', env: ENV });
    assert.equal(planned.status, 0, planned.stderr);
    const ARGS = JSON.parse(planned.stdout.trim().split('\n').pop());
    for (const [p, text] of Object.entries(strays)) put(p, text);
    const cmdOf = (prompt, re) => { const m = re.exec(prompt); return m && m[1]; };
    const GREEN_FULL = /`(node \S+\/tdd\.mjs green --run \S+ --group \w+(?: --retest)?)`/, GREEN_QUICK = /`(node \S+\/tdd\.mjs green [^`]*--quick)`/, GREEN_ANY = /`(node \S+\/tdd\.mjs green [^`]*)`/;
    const RED = /`(node \S+\/tdd\.mjs red --run \S+ --group \w+)`/, FINAL = /`(node \S+\/tdd\.mjs final --run \S+(?: --again)?)`/;
    const dodWith = (prompt, rs) => exec(`${/(node \S+\/tdd\.mjs dod --run \S+ --group \w+ --stage red)/.exec(prompt)[1]}${rs.map(r => ` --row '${r.dod}:${r.kind}:${r.test}:${r.file}'`).join('')}`, 'dod');
    const dods = prompt => [...prompt.matchAll(/`(node \S+\/tdd\.mjs dod [^`(]+)`/g)].map(m => exec(m[1], 'dod'));
    const ok = out => /ok=true/.test(out);
    const greenLoop = (gid, prompt) => {
      const G = GROUPS[gid], quick = cmdOf(prompt, GREEN_QUICK);
      let out = '';
      G.versions.forEach((v, i) => { put(G.src, v); out = exec(i === 1 && quick ? quick : cmdOf(prompt, GREEN_FULL), i === 1 && quick ? 'green-quick' : 'green'); });
      return { gateOk: ok(out), gateRuns: G.versions.length };
    };
    const writeRed = (gid, prompt) => { const G = GROUPS[gid]; put(G.tests, G.testText); return ok(exec(cmdOf(prompt, RED), 'red')) && ok(dodWith(prompt, G.rows)); };
    const navigator = prompt => {
      const red = cmdOf(prompt, RED) ? exec(cmdOf(prompt, RED), 'red') : 'ok=true', green = cmdOf(prompt, GREEN_ANY) ? exec(cmdOf(prompt, GREEN_ANY), 'green-nav') : 'ok=true', dd = dods(prompt);
      return ok(red) && ok(green) && dd.every(ok) ? { verdict: 'PASS', defects: [], gateOk: true } : { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'impl', what: [red, green, ...dd].join('\n').slice(0, 300) }] };
    };
    const script = {
      'tdd-driver': (gid, p) => { writeRed(gid, p); return { matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], srcFiles: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }; },
      'red-driver': (gid, p) => ({ matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], reuse: 'none', gateOk: writeRed(gid, p), gateRuns: 1 }),
      'green-driver': (gid, p) => ({ files: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }),
      'red-navigator': (gid, p) => navigator(p),
      'green-navigator': (gid, p) => navigator(p),
      reviewer: (gid, p) => {
        exec(cmdOf(p, FINAL), 'final');
        const src = GROUPS.a.src, line = readFileSync(join(repo, src), 'utf8').split('\n').findIndex(l => l.includes('TODO')) + 1, quote = '// TODO: tighten the character class';
        return { findings: [{ title: 'Leftover TODO in shipped code', severity: 'medium', file: src, startLine: line, endLine: line, hazard: 'a stale TODO', failureScenario: 'readers think the class is wrong', quote, suggestedFix: 'delete it', anchorable: true, proof: { mode: 'read', ref: `${src}:${line}-${line}`, quote } }] };
      },
      fixer: (gid, p) => {
        put(GROUPS.a.src, readFileSync(join(repo, GROUPS.a.src), 'utf8').split('\n').filter(l => !l.includes('TODO')).join('\n'));
        return { fixed: [/^(R-\S+) \[/m.exec(p)[1]], notFixed: [], gateOk: ok(exec(cmdOf(p, GREEN_ANY), 'green')), gateRuns: 1 };
      },
      'final-verifier': (gid, p) => ({ ok: ok(exec(cmdOf(p, FINAL), 'final')), problems: [] }),
    };
    const labels = [];
    const agent = async (prompt, o) => {
      labels.push(o.label);
      await new Promise(r => setImmediate(r));
      const [node, gid] = o.label.split(':');
      assert.ok(script[node], `no script for ${o.label}`);
      return script[node](gid, prompt);
    };
    const out = await wf(agent, parallel, async () => [], () => {}, () => {}, ARGS, {});
    const retFile = join(dir, 'return.json');
    writeFileSync(retFile, JSON.stringify(out));
    const verify = JSON.parse(exec(`${process.execPath} ${TDD} verify --run ${ARGS.runDir} --ret ${retFile}`, 'verify').trim().split('\n').pop());
    return { ARGS, out, verify, labels, outputs };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const allDone = r => assert.deepEqual(Object.values(r.out.groups).map(g => g.state), ['done', 'done', 'done'], JSON.stringify([r.out.notDone, r.outputs.filter(([k]) => /green|red/.test(k)).map(o => o[2].split('\n').filter(l => /survivor|^(RED|GREEN)/.test(l)).join(' | '))]));

test('default flags, 3 independent groups: one tdd-driver and one navigator each, the courier skipped, verify proves all 18 DoD pairs', async () => {
  const r = await runDefault();
  allDone(r);
  assert.deepEqual([r.ARGS.mode, r.ARGS.speed?.courierSkip, r.out.courierSkipped], ['fast', true, true]);
  assert.deepEqual(r.labels.filter(l => /^(tdd|red|green)-/.test(l)).sort(), ['green-navigator:a', 'green-navigator:b', 'green-navigator:c', 'tdd-driver:a', 'tdd-driver:b', 'tdd-driver:c']);
  assert.ok(r.outputs.some(([k]) => k === 'green-quick'), 'the drivers ran a quick GREEN');
  assert.ok(r.outputs.filter(([k]) => k === 'green-nav').every(([, cmd, o]) => /--reuse/.test(cmd) && /reused:/.test(o)), 'the navigators reused the drivers\' full runs');
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.final, r.verify.notDone], [18, 18, true, []], JSON.stringify(r.verify));
});

test('default flags, files outside the plan left in the repo: final fails on them alone; verify names them as work left for the run and still proves all 18 pairs', async () => {
  const r = await runDefault({ strays: { 'args.json': '{"runDir":"x"}\n', '.hook-cache/state.json': '{}\n' } });
  allDone(r);
  assert.equal(r.out.courierSkipped, true);
  assert.equal(r.verify.final, false, JSON.stringify(r.verify));
  assert.deepEqual(r.verify.notDone.length, 1, JSON.stringify(r.verify.notDone));
  assert.match(r.verify.notDone[0], /^run: final gate not ok: files outside the plan changed: (\.hook-cache\/state\.json, args\.json|args\.json, \.hook-cache\/state\.json)$/);
  assert.deepEqual([r.verify.dod.covered, r.verify.dod.total, r.verify.dod.gaps], [18, 18, []], 'a stray file is no group\'s failure: every group\'s GREEN gate still proves its pairs');
});

test('SKILL.md has the lead keep its run files out of the repo: a file it writes there is a stray that fails final', () => {
  const md = readFileSync(join(HERE, 'SKILL.md'), 'utf8');
  assert.doesNotMatch(md, />\s*args\.json/, 'tdd.mjs plan already writes $RUN/args.json');
  assert.deepEqual([...md.matchAll(/(\S*)return\.json/g)].map(m => m[1]).filter(p => !/\$RUN\/$/.test(p)), [], 'every return.json is $RUN/return.json');
  assert.deepEqual([...md.matchAll(/--plan (\S+)/g)].map(m => m[1]).filter(p => !p.startsWith('$W/') && !p.startsWith('<')), [], 'plan.json is written outside the repo');
});
