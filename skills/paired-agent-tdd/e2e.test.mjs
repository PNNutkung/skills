// End to end: the REAL workflow.js and the REAL tdd.mjs gates (plan, red, green with mutants, final, verify) in a fixture git repo, with SCRIPTED agents that edit
// files and run the gate commands from their prompts exactly as the real agents are told to. No model. The sandbox is a stub runner. Run: node e2e.test.mjs
// It proves the two halves fit: the args plan prints, the commands the prompts name, the gate files verify reads, the return shape and the reviewer proofs.
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TDD = join(HERE, 'tdd.mjs');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pat-e2e-')));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const repo = join(dir, 'repo'), stub = join(dir, 'stub'), tmp = join(dir, 'tmp');
for (const d of [repo, stub, tmp]) mkdirSync(d);
process.env.TMPDIR = tmp; // the per-user zt-review base (where plan makes the run folder, and the only place the ledger tools approve one) lives in the fixture
process.env.ZT_MARKER_DIR = join(dir, 'marker'); // never the user's own active review marker
let run = '';
writeFileSync(join(stub, 'runner.mjs'), `
import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2);
if (a[0] === '--check') { console.log('stub'); process.exit(0); }
const cut = a.indexOf('--'), flags = a.slice(0, cut), cmd = a.slice(cut + 1), val = k => flags[flags.indexOf(k) + 1];
const env = { ...process.env };
flags.forEach((f, i) => { if (f === '--env') { const kv = flags[i + 1]; env[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1); } });
process.exit(spawnSync(cmd[0], cmd.slice(1), { cwd: val('--cwd'), env, stdio: 'inherit' }).status ?? 1);
`);
const REAL = process.env.E2E_REAL === '1'; // opt-in: the real sandbox runner and this node binary instead of the stub
const RUNNER = REAL ? join(HERE, '..', 'zero-trust-review', 'sandbox-run.mjs') : join(stub, 'runner.mjs');
const NODE = realpathSync(process.execPath);
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
git('init', '-q');
put('package.json', '{"type":"module"}\n');
put('README.md', 'text utils\n');
git('add', '-A'); git('commit', '-qm', 'base');

// ---- the change: two groups, b waits for a ----
const TICKET = 'slugify(text, {maxLength}) lowercases and hyphenates, cuts to maxLength (default 40), and throws TypeError for a non-string. title(text) turns a slug into Title Case.';
writeFileSync(join(dir, 'ticket.md'), TICKET);
const plan = {
  repo, cmd: `${REAL ? NODE : 'node'} --test {file}`, ...(REAL ? { ro: [dirname(dirname(NODE))] } : {}), ticket: join(dir, 'ticket.md'), mutation: { max: 10, budget: 60 },
  dod: [{ id: 'AC1', text: 'slugify lowercases and hyphenates words, throws TypeError for a non-string', source: 'lowercases and hyphenates' },
    { id: 'AC2', text: 'slugify cuts to maxLength, default 40', source: 'cuts to maxLength (default 40)', kinds: ['happy', 'edge'] },
    { id: 'AC3', text: 'title turns a slug into Title Case', source: 'Title Case' }],
  groups: [{ id: 'a', goal: 'slugify', tests: ['tests/test_slug.mjs'], src: ['src/slug.mjs'], dod: ['AC1', 'AC2'], after: [] },
    { id: 'b', goal: 'title, built on slugify', tests: ['tests/test_title.mjs'], src: ['src/title.mjs'], dod: ['AC3'], after: ['a'] }],
};
writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
const tdd = (cmd, args) => spawnSync(process.execPath, [TDD, cmd, ...(run && cmd !== 'plan' ? ['--run', run] : []), '--runner', RUNNER, ...args], { encoding: 'utf8' });
const planned = tdd('plan', ['--plan', join(dir, 'plan.json')]);
assert.equal(planned.status, 0, planned.stderr);
const ARGS = JSON.parse(planned.stdout.trim().split('\n').pop());
run = ARGS.runDir;

const WEAK = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.mjs';
test('test_ac1_happy_words', () => assert.equal(slugify('Hello, World!'), 'hello-world'));
test('test_ac1_fail_non_string', () => assert.throws(() => slugify(42), TypeError));
test('test_ac1_edge_empty', () => assert.equal(slugify(''), ''));
test('test_ac2_happy_cut', () => assert.equal(slugify('abcdef', { maxLength: 3 }), 'abc'));
test('test_ac2_edge_no_trailing_dash', () => assert.equal(slugify('ab cd', { maxLength: 3 }), 'ab'));
`;
const STRONG = `${WEAK}test('test_ac2_edge_default_length', () => assert.equal(slugify('a'.repeat(50)).length, 40));
test('test_ac1_edge_digits', () => assert.equal(slugify('Route 66'), 'route-66'));
`;
const SLUG = `export function slugify(text, { maxLength = 40 } = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  // TODO: tighten the character class
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, maxLength).replace(/-+$/, '');
}
`;
const TITLE_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { title } from '../src/title.mjs';
test('test_ac3_happy_words', () => assert.equal(title('hello, world'), 'Hello World'));
test('test_ac3_fail_non_string', () => assert.throws(() => title(7), TypeError));
test('test_ac3_edge_empty', () => assert.equal(title(''), ''));
`;
const TITLE = `import { slugify } from './slug.mjs';
export const title = text => slugify(text).split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
`;
const rows = (id, tests, file) => tests.map(([kind, test]) => ({ dod: id, kind, test, file }));

// what a navigator is told to run: the command inside the backticks of its prompt, here with the stub runner
function gate(prompt) {
  const m = /node (\S+\/tdd\.mjs) (red|green|final) --run ([^\s`]+)(?: --group (\w+))?( --retest)?/.exec(prompt);
  assert.ok(m, 'the prompt names no gate command');
  const out = spawnSync(process.execPath, [m[1], m[2], '--run', m[3], ...(m[4] ? ['--group', m[4]] : []), ...(m[5] ? ['--retest'] : []), '--runner', RUNNER], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const verdict = out => (/ok=true/.test(out) ? { verdict: 'PASS', defects: [], gateOk: true } : { verdict: 'FAIL', gateOk: false, defects: [/survived/.test(out) ? { cls: 'gap', what: out.match(/survivor [^\n]*/)?.[0] ?? 'a mutant survived' } : { cls: 'impl', what: out.slice(0, 300) }] });

const sawGate = [];
const script = {
  'red-driver:a': () => { put('tests/test_slug.mjs', WEAK); return { matrix: [...rows('AC1', [['happy', 'test_ac1_happy_words'], ['fail', 'test_ac1_fail_non_string'], ['edge', 'test_ac1_edge_empty']], 'tests/test_slug.mjs'), ...rows('AC2', [['happy', 'test_ac2_happy_cut'], ['edge', 'test_ac2_edge_no_trailing_dash']], 'tests/test_slug.mjs')], files: ['tests/test_slug.mjs'], reuse: 'none' }; },
  'red-driver:b': () => { put('tests/test_title.mjs', TITLE_TEST); return { matrix: rows('AC3', [['happy', 'test_ac3_happy_words'], ['fail', 'test_ac3_fail_non_string'], ['edge', 'test_ac3_edge_empty']], 'tests/test_title.mjs'), files: ['tests/test_title.mjs'], reuse: 'none' }; },
  'green-driver:a': () => { put('src/slug.mjs', SLUG); return { files: ['src/slug.mjs'], reuse: 'none', cleanup: 'none' }; },
  'green-driver:b': () => { put('src/title.mjs', TITLE); return { files: ['src/title.mjs'], reuse: 'codebase', cleanup: 'none' }; },
  'red-driver:a:strengthen': () => { put('tests/test_slug.mjs', STRONG); return { matrix: rows('AC2', [['edge', 'test_ac2_edge_default_length']], 'tests/test_slug.mjs'), files: ['tests/test_slug.mjs'], reuse: 'none' }; },
  reviewer: prompt => {
    gate(prompt);
    const line = readFileSync(join(repo, 'src/slug.mjs'), 'utf8').split('\n').findIndex(l => l.includes('TODO')) + 1;
    return { findings: [{ title: 'Leftover TODO in shipped code', severity: 'medium', file: 'src/slug.mjs', startLine: line, endLine: line, hazard: 'a TODO about the character class was left in', failureScenario: 'readers assume the class is wrong', quote: '// TODO: tighten the character class', suggestedFix: 'delete the comment', anchorable: true, proof: { mode: 'read', ref: `src/slug.mjs:${line}-${line}`, quote: '// TODO: tighten the character class' } }] };
  },
  'fixer:a': prompt => {
    const id = /^(R-\S+) \[/m.exec(prompt)[1];
    put('src/slug.mjs', readFileSync(join(repo, 'src/slug.mjs'), 'utf8').split('\n').filter(l => !l.includes('TODO')).join('\n'));
    return { fixed: [id], notFixed: [] };
  },
};
const calls = [];
const agent = async (prompt, o) => {
  calls.push({ label: o.label, prompt });
  if (/^(red|green)-navigator:/.test(o.label)) { const out = gate(prompt); sawGate.push([o.label, out.split('\n')[0]]); return verdict(out); }
  const f = script[o.label];
  assert.ok(f, `no script for ${o.label}`);
  return f(prompt);
};
const out = await wf(agent, parallel, async () => [], () => {}, () => {}, ARGS, {});

// ---- what the run did ----
assert.deepEqual([out.groups.a.state, out.groups.b.state], ['done', 'done'], JSON.stringify(out.notDone));
assert.deepEqual(calls.map(c => c.label).filter(l => /strengthen|recheck/.test(l)), ['red-driver:a:strengthen', 'green-navigator:a:recheck'], 'the weak tests left a mutant alive: one strengthening, one re-check');
assert.ok(sawGate.some(([l, first]) => l === 'green-navigator:a' && /ok=false/.test(first)), 'the first GREEN gate refused the weak tests: ' + JSON.stringify(sawGate));
assert.ok(sawGate.some(([l, first]) => l === 'green-navigator:a:recheck' && /ok=true/.test(first)));
assert.match(calls.find(c => c.label === 'green-navigator:a:recheck').prompt, /--retest/);
assert.equal(out.groups.a.green.reworks, 1);
assert.deepEqual(out.groups.a.matrix.map(m => m.test).slice(-1), ['test_ac2_edge_default_length']);
assert.equal(out.groups.a.matrix.at(-1).late, true, 'the strengthening row is marked late: it never failed at RED, so the closure does not credit it');
assert.equal(out.clusters.length, 1);
assert.deepEqual([out.clusters[0].status, out.clusters[0].evidence], ['confirmed', 'read']);
assert.deepEqual(out.fixes.a.fixed, [out.clusters[0].id]);

// ---- the lead's T0 audit ----
const retFile = join(dir, 'return.json');
writeFileSync(retFile, JSON.stringify(out));
const v = tdd('verify', ['--ret', retFile]);
assert.equal(v.status, 0, v.stderr);
const res = JSON.parse(v.stdout.trim().split('\n').pop());
assert.deepEqual([res.dod.covered, res.dod.total, res.dod.gaps], [8, 8, []]);
assert.deepEqual([res.final, res.overridden, res.unfixed, res.notDone], [true, [], [], []]);
assert.deepEqual(res.proofcheck, { confirmed: 1 }, 'the reviewer proof is checked against the tree the reviewer saw, not the fixed one');
assert.match(readFileSync(join(run, 'dod-matrix.md'), 'utf8'), /DoD closure: 8\/8/);
const g = name => JSON.parse(readFileSync(join(run, 'gates', name), 'utf8'));
assert.deepEqual([g('a.green.json').ok, g('b.green.json').ok, g('a.green.json').mutation.survivors.length], [true, true, 0]);
assert.ok(g('b.green.json').mutation.score.killed >= 1, 'group b was mutated too');

// the user's repo holds only the agents' own edits: no commit, no ref, no stray file
assert.deepEqual(git('status', '--porcelain').split('\n').sort(), ['?? src/', '?? tests/']);
assert.equal(git('for-each-ref', '--format=%(refname)').split('\n').length, 1, 'only the base branch: no ref, tag or stash was created');
assert.equal(git('rev-list', '--count', 'HEAD'), '1', 'no commit was made on the user\'s branch');
assert.equal(readFileSync(join(repo, 'src/slug.mjs'), 'utf8').includes('TODO'), false);
if (REAL) {
  const ledger = readFileSync(join(run, 'exec.jsonl'), 'utf8').trim().split('\n');
  assert.ok(ledger.length >= 10, `the sandbox ledger has the gate runs: ${ledger.length}`);
  assert.ok(Object.values(g('a.red.json').tests).every(t => t.run), 'every RED run carries a ZT-RUN id');
}
console.log(`ok - paired-agent-tdd end to end${REAL ? ' (REAL sandbox)' : ''}: plan -> workflow -> gates -> verify (8/8 DoD pairs, 1 mutant-driven strengthening, 1 fixed finding)`);
