// Shared fixture of the tdd.mutation*.test.mjs files (ADR 0011 phase 2: the mutation gate in paired-agent-tdd). Fixture repos with small JavaScript sources whose
// mutants are known in advance, a fixture ADR with or without an `## Interface` section, and a Workflow launcher with canned agents (no model, no git).
// tdd.mjs runs in-process through test-fixture.mjs; every command of one fixture gets the same env (fx.env), so a flag read at `plan` or at a gate sees the same value.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE, fixture } from '../test-fixture.mjs';

// the definition-of-done skill renders the fixture ADR exactly as `dod.mjs adr` does (a dynamic import: no static import across skills)
const { renderAdr } = await import(pathToFileURL(join(HERE, '..', 'definition-of-done', 'adr.mjs')).href);

export const TW_OFF = { PTDD_TEST_WRITER_ENABLED: 'false' };
/** ADR 0011 "All flags off": the gates act as on main, except plain mutation.off */
export const MUTATION_OFF_ENV = { PTDD_MUTATION_SCORE_MIN: '0', PTDD_TEST_WRITER_ENABLED: 'false', WORKFLOW_MUTATION_CHECK_ENABLED: 'false', PTDD_MUTATION_MAX: '12' };

// ---------------------------------------------------------------- the fixture ADR
export const ADR_FILE = 'docs/adr/0001-calc.md';
export const INTERFACE_MARK = 'IFACE-7Q: calc.mjs exports f() -> 2 and g() -> 3; no errors';
export const DOD_TEXT = 'f gives 2 and g gives 3';
const QUESTIONS = 'Q1: Which values?\n(A) two and three\n  + simple\n  - fixed values\n(B) any\n  + flexible\n  - vague\nrecommended: A\n';
const ANSWERS = 'A1: A\ntime: t\n';
const u = ref => ({ kind: 'user', ref, quote: 'A', question: 'Q' });
const DOD = {
  slug: 'calc', touches: ['src/**'], items: [{ id: 'AC1', text: DOD_TEXT, source: u('A1') }],
  required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: k, source: u('A1') }])),
};
/** the ADR text; iface: write a `## Interface` section (with INTERFACE_MARK) before the Consequences; empty: the heading with no text under it; else no Interface heading */
export function adrText({ iface = true, empty = false } = {}) {
  const text = renderAdr({ dod: DOD, answers: ANSWERS, questions: QUESTIONS, ticket: '', number: 1, date: '2026-11-27' }).text.replace(/^## Interface\n[\s\S]*?(?=^## )/m, '');
  if (empty) return text.replace(/^## Consequences$/m, '## Interface\n\n## Consequences');
  return iface ? text.replace(/^## Consequences$/m, `## Interface\n\n\`\`\`mermaid\nflowchart LR\n  t[test] --> c[calc.mjs]\n\`\`\`\n\n- ${INTERFACE_MARK}\n\n## Consequences`) : text;
}

// ---------------------------------------------------------------- sources, tests and their mutants
export const CALC_TEST = 'tests/calc.test.mjs';
export const CALC = 'src/calc.mjs';
/** a node test file: imports calc.mjs and exits 1 unless every check holds; checks = [[name, want], ...] */
export const jsTest = (checks, name = 'test_ac1_happy') => `// ${name}\nimport * as m from '../src/calc.mjs';\nconst bad = ${JSON.stringify(checks)}.filter(([k, v]) => m[k]?.() !== v);\nif (bad.length) { console.error('wrong:', JSON.stringify(bad)); process.exit(1); }\n`;
/** f = 2 (line 1), g = 3 (line 2): one const-inc mutant on each line */
export const FG = 'export const f = () => 2;\nexport const g = () => 3;\n';
/** f1..f14, fN = N * 10 on line N: one const-inc mutant per line, 14 in all; a sample of 12 leaves out lines 7 and 14 */
export const FOURTEEN = `${Array.from({ length: 14 }, (_, i) => `export const f${i + 1} = () => ${(i + 1) * 10};`).join('\n')}\n`;
export const fourteenChecks = (skip = []) => Array.from({ length: 14 }, (_, i) => [`f${i + 1}`, (i + 1) * 10]).filter(([k]) => !skip.includes(k));
/** the id the mutation engine gives a mutant: a hash of file, line and edit (ADR 0011 equivalent.mjs) */
export const mutantId = (file, line, op, newLine) => `X-${createHash('sha1').update(`${file}:${line}:${op}:${newLine}`).digest('hex').slice(0, 8)}`;

// ---------------------------------------------------------------- fixtures
const JS_PLAN = { cmd: 'node {file}', mutation: undefined, dod: [{ id: 'AC1', text: DOD_TEXT, source: 'assumed', kinds: ['happy'] }],
  groups: [{ id: 'a', tests: [CALC_TEST], src: [CALC], dod: ['AC1'], after: [] }] };

/**
 * A fixture repo plus fx.go(cmd, args, env) (fx.tdd with fx.env first) and fx.planOk(). plan: keys over the JavaScript plan above (a function gets the repo);
 * adr: 'iface' | 'empty' | 'bare' puts the fixture ADR at ADR_FILE in the base commit and sets plan.dodFile (no dod[]); env: the flags every command of this fixture gets.
 */
export function mfx(t, { files = {}, plan = {}, env = {}, adr } = {}) {
  const adrFiles = adr ? { [ADR_FILE]: adrText({ iface: adr === 'iface', empty: adr === 'empty' }) } : {};
  const fx = fixture(t, { files: { ...adrFiles, ...files }, plan: repo => ({ ...JS_PLAN, ...(adr ? { dod: undefined, dodFile: ADR_FILE } : {}), ...(typeof plan === 'function' ? plan(repo) : plan) }) });
  fx.env = env;
  fx.go = (cmd, args = [], more = {}) => fx.tdd(cmd, args, { ...fx.env, ...more });
  fx.planRaw = (extra = ['--skip-preflight'], more = {}) => fx.go('plan', ['--plan', join(fx.dir, 'plan.json'), ...extra], more);
  fx.planOk = async (extra, more) => {
    const r = await fx.planRaw(extra, more);
    if (r.status !== 0) throw new Error(`plan failed (${r.status}): ${r.err}`);
    fx.run = JSON.parse(r.out.trim().split('\n').pop()).runDir;
    fx.args = JSON.parse(r.out.trim().split('\n').pop());
    return r;
  };
  return fx;
}
/** test runs the stub runner logged that name the file (every test command the gates ran, mutants included) */
export const runsOf = (fx, file = CALC_TEST) => { try { return readFileSync(join(fx.stub, 'calls.log'), 'utf8').split('\n').filter(l => l.includes(file)).length; } catch { return 0; } };
/** the whole text of a gate file, '' when there is none */
export const gateText = (fx, name) => { try { return readFileSync(join(fx.run, 'gates', name), 'utf8'); } catch { return ''; } };

// ---------------------------------------------------------------- the Workflow with canned agents (as workflow.test.mjs, but answers by node, so new labels need no table)
const SRC = readFileSync(join(HERE, 'workflow.js'), 'utf8');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', SRC.replace('export ', ''));
// the generated NODE table of workflow.js: one `'name': {json},` line per node
export const NODE_TABLE = Object.fromEntries([...(/const NODE = \{([\s\S]*?)\n\}/.exec(SRC)?.[1] ?? '').matchAll(/^\s*'?([\w-]+)'?:\s*(\{.*\}),?\s*$/gm)].map(([, k, v]) => [k, JSON.parse(v)]));
const KINDS = ['happy', 'fail', 'edge'];
export const rowsOf = (g, dod) => g.dod.flatMap(id => ((dod.find(d => d.id === id) || {}).kinds || KINDS).map(kind => ({ dod: id, kind, test: `test_${id.toLowerCase()}_${kind}_case`, file: g.tests[0] })));
export const PASS = { verdict: 'PASS', defects: [], gateOk: true };

/** answers by node (the label's first part); over[node] = (label, nth call of that node, default answer) -> answer replaces one */
export function respond(args, over = {}) {
  const seen = {};
  return label => {
    const [node, gid] = label.split(':'), g = (args.groups || []).find(x => x.id === gid) || (args.groups || [])[0], n = (seen[node] = (seen[node] || 0) + 1);
    const rows = rowsOf(g, args.dod || []);
    const dflt = {
      // ADR 0011 returns: the test writer {done, rejected}, the code driver {done, testWrong}; the other keys are what the existing drivers return
      'test-writer': { done: true, rejected: [], matrix: rows, files: g.tests, reuse: 'codebase', gateOk: true, gateRuns: 1, remaining: [], notes: '' },
      'code-driver': { done: true, testWrong: [], files: g.src, srcFiles: g.src, reuse: 'docs', cleanup: 'none', gateOk: true, gateRuns: 1, testGaps: [], remaining: [], notes: '' },
      judge: { done: true, marked: [], unmarked: [], notes: '' },
      'tdd-driver': { matrix: rows, files: g.tests, srcFiles: g.src, reuse: 'codebase', cleanup: 'none', gateOk: true, gateRuns: 1 },
      'red-driver': { matrix: rows, files: g.tests, reuse: 'codebase', gateOk: true, gateRuns: 1 },
      'green-driver': { files: g.src, reuse: 'docs', cleanup: 'none', gateOk: true, gateRuns: 1 },
      'red-navigator': PASS, 'green-navigator': PASS, reviewer: { findings: [] },
      'integration-tester': { file: 'tests/integration/test_flow.mjs', exit: 0, findings: [] }, fixer: { fixed: [], notFixed: [] }, 'final-verifier': { ok: true, problems: [] },
    }[node] ?? { ...PASS, matrix: rows, files: g.tests, srcFiles: g.src, findings: [], marks: [] };
    return over[node] ? over[node](label, n, dflt) : dflt;
  };
}
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));
const pipeline = (items, ...stages) => Promise.all(items.map(async (it, i) => { try { let v = it; for (const s of stages) v = await s(v, it, i); return v; } catch { return null; } }));
/** one Workflow run over args with the canned answers: -> { out, calls: [{ prompt, o, node }], events, logs, of(node) } */
export async function play(args, over = {}) {
  const calls = [], events = [], logs = [], answer = respond(args, over);
  const agent = async (prompt, o) => {
    calls.push({ prompt, o, node: String(o.label).split(':')[0] });
    events.push(`start ${o.label}`);
    try { await new Promise(r => setTimeout(r, 1)); return await answer(o.label); } finally { events.push(`end ${o.label}`); }
  };
  const out = await wf(agent, parallel, pipeline, () => {}, m => logs.push(m), args, {});
  return { out, calls, events, logs, of: node => calls.filter(c => c.node === node) };
}
