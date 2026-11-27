// Shared by the e2e*.test.mjs files that run one whole scripted run per test: the REAL workflow.js and the REAL tdd.mjs gates in a fixture git repo,
// SCRIPTED agents that run the gate commands their prompts name. Every gate is a real `tdd.mjs` process through a real runner (direct-run.mjs, or the sandbox).
// It sets no flag: the caller starts every process through its own `spawn`, so the env each process gets is written in the test file (rules/flag-defaults-e2e.md).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const TDD = join(HERE, 'tdd.mjs');
export const DIRECT_RUNNER = join(HERE, 'direct-run.mjs');
const wf = new (Object.getPrototypeOf(async () => {}).constructor)('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', readFileSync(join(HERE, 'workflow.js'), 'utf8').replace('export ', ''));
const parallel = ts => Promise.all(ts.map(async t => { try { return await t(); } catch { return null; } }));

/**
 * One whole run in its own fixture repo: plan, the Workflow with scripted agents, then verify. -> what happened and what it cost
 * spawn(file, args, fixtureEnv): starts a process with the caller's env plus fixtureEnv (TMPDIR and ZT_MARKER_DIR inside the fixture) -> spawnSync result
 * plan: plan.json without `repo`; groups: { id: { tests, src, testText, versions, rows } }; strays: files outside the plan written into the repo after `plan`;
 * base: files committed in the base commit (an ADR the plan names as dodFile);
 * scripts(tools): scripted agents that replace the default ones.
 */
export async function runE2E({ spawn, runner, plan: planRest, groups: GROUPS, prefix, strays = {}, base = {}, scripts = () => ({}) }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))), repo = join(dir, 'repo'), tmp = join(dir, 'tmp');
  for (const d of [repo, tmp]) mkdirSync(d);
  const fixtureEnv = { TMPDIR: tmp, ZT_MARKER_DIR: join(dir, 'marker') };
  try {
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
    const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };
    git('init', '-q'); put('package.json', '{"type":"module"}\n'); put('README.md', 'text utils\n'); for (const [p, text] of Object.entries(base)) put(p, text); git('add', '-A'); git('commit', '-qm', 'base');
    const plan = { repo, ...planRest };
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    const gateMs = {}, outputs = [];
    const exec = (cmd, kind) => {
      const t0 = performance.now(), out = spawn('sh', ['-c', `${cmd} --runner ${runner}`], fixtureEnv);
      gateMs[kind] = (gateMs[kind] ?? 0) + (performance.now() - t0);
      assert.equal(out.status, 0, `${cmd}\n${out.stderr}`);
      outputs.push([kind, cmd, out.stdout]);
      return out.stdout;
    };
    const planned = spawn(process.execPath, [TDD, 'plan', '--plan', join(dir, 'plan.json'), '--runner', runner], fixtureEnv);
    assert.equal(planned.status, 0, planned.stderr);
    const ARGS = JSON.parse(planned.stdout.trim().split('\n').pop());
    for (const [p, text] of Object.entries(strays)) put(p, text);
    const cmdOf = (prompt, re) => { const m = re.exec(prompt); return m && m[1]; };
    const GREEN_FULL = /`(node \S+\/tdd\.mjs green --run \S+ --group \w+(?: --retest)?)`/, GREEN_QUICK = /`(node \S+\/tdd\.mjs green [^`]*--quick)`/, GREEN_ANY = /`(node \S+\/tdd\.mjs green [^`]*)`/;
    const RED = /`(node \S+\/tdd\.mjs red --run \S+ --group \w+)`/, FINAL = /`(node \S+\/tdd\.mjs final --run \S+(?: --again)?)`/;
    const dodWith = (prompt, rs) => exec(`${/(node \S+\/tdd\.mjs dod --run \S+ --group \w+ --stage red)/.exec(prompt)[1]}${rs.map(r => ` --row '${r.dod}:${r.kind}:${r.test}:${r.file}'`).join('')}`, 'dod');
    const dods = prompt => [...prompt.matchAll(/`(node \S+\/tdd\.mjs dod [^`(]+)`/g)].map(m => exec(m[1], 'dod'));
    const ok = out => /ok=true/.test(out);
    // a driver's own GREEN loop: two bugs, one fixed per run; run 2 adds --quick when its prompt says so (PTDD_QUICK_DRIVER_GATE_ENABLED)
    const greenLoop = (gid, prompt) => {
      const G = GROUPS[gid], quick = cmdOf(prompt, GREEN_QUICK);
      let out = '';
      G.versions.forEach((v, i) => { put(G.src, v); out = exec(i === 1 && quick ? quick : cmdOf(prompt, GREEN_FULL), i === 1 && quick ? 'green-quick' : 'green'); });
      return { gateOk: ok(out), gateRuns: G.versions.length };
    };
    const writeRed = (gid, prompt) => { const G = GROUPS[gid]; put(G.tests, G.testText); return ok(exec(cmdOf(prompt, RED), 'red')) && ok(dodWith(prompt, G.rows)); };
    const navigator = prompt => {
      const red = cmdOf(prompt, RED) ? exec(cmdOf(prompt, RED), 'red') : 'ok=true', green = cmdOf(prompt, GREEN_ANY) && !/ROLE: navigator: verify the RED/.test(prompt) ? exec(cmdOf(prompt, GREEN_ANY), 'green-nav') : 'ok=true', dd = dods(prompt);
      return ok(red) && ok(green) && dd.every(ok) ? { verdict: 'PASS', defects: [], gateOk: true } : { verdict: 'FAIL', gateOk: false, defects: [{ cls: 'impl', what: [red, green, ...dd].join('\n').slice(0, 300) }] };
    };
    const events = [], calls = [];
    const script = {
      'tdd-driver': (gid, p) => { writeRed(gid, p); return { matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], srcFiles: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }; },
      'red-driver': (gid, p) => ({ matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], reuse: 'none', gateOk: writeRed(gid, p), gateRuns: 1 }),
      'green-driver': (gid, p) => ({ files: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }),
      'red-navigator': (gid, p) => navigator(p),
      'green-navigator': (gid, p) => navigator(p),
      reviewer: (gid, p) => {
        const fin = exec(cmdOf(p, FINAL), 'final'), survivors = [...new Set(fin.match(/X-[0-9a-f]{8}/g) ?? [])].map(id => ({ id })); // ADR 0011: the final gate's survivors, for the judge
        const finalOf = { final: { ok: /^FINAL ok=true/m.test(fin), survivors }, survivors };
        const src = GROUPS.a.src, lines = readFileSync(join(repo, src), 'utf8').split('\n'), line = lines.findIndex(l => l.includes('TODO')) + 1, quote = lines[line - 1].trim(); // '// TODO: ...' or '# TODO: ...'
        return { ...finalOf, findings: [{ title: 'Leftover TODO in shipped code', severity: 'medium', file: src, startLine: line, endLine: line, hazard: 'a stale TODO', failureScenario: 'readers think the class is wrong', quote, suggestedFix: 'delete it', anchorable: true, proof: { mode: 'read', ref: `${src}:${line}-${line}`, quote } }] };
      },
      fixer: (gid, p) => {
        put(GROUPS.a.src, readFileSync(join(repo, GROUPS.a.src), 'utf8').split('\n').filter(l => !l.includes('TODO')).join('\n'));
        return { fixed: [/^(R-\S+) \[/m.exec(p)[1]], notFixed: [], gateOk: ok(exec(cmdOf(p, GREEN_ANY), 'green')), gateRuns: 1 };
      },
      'final-verifier': (gid, p) => ({ ok: ok(exec(cmdOf(p, FINAL), 'final')), problems: [] }),
      // ADR 0011, fast mode with the test writer on: the test writer writes the tests and proves RED; the code driver writes the code and proves GREEN;
      // the judge marks each survivor its prompt names through `tdd.mjs equivalent`, then runs the final gate again when its prompt says so
      'test-writer': (gid, p) => ({ done: true, rejected: [], matrix: GROUPS[gid].rows, files: [GROUPS[gid].tests], reuse: 'none', gateOk: writeRed(gid, p), gateRuns: 1 }),
      'code-driver': (gid, p) => ({ done: true, testWrong: [], files: [GROUPS[gid].src], srcFiles: [GROUPS[gid].src], reuse: 'none', cleanup: 'none', ...greenLoop(gid, p) }),
      judge: (gid, p) => {
        const ids = [...new Set(p.match(/X-[0-9a-f]{8}/g) ?? [])];
        for (const id of ids) exec(`${process.execPath} ${TDD} equivalent --run ${ARGS.runDir} --add ${id} --reason 'a limit no caller reads yet: no input can tell the mutant apart'`, 'equivalent');
        const again = cmdOf(p, FINAL);
        if (again) exec(again, 'final');
        return { done: true, marked: ids, unmarked: [] };
      },
      ...scripts({ put, repo, exec, ok, cmdOf, GREEN_ANY }),
    };
    const agent = async (prompt, o) => {
      calls.push({ label: o.label, prompt });
      events.push(`start ${o.label}`);
      await new Promise(r => setImmediate(r)); // every agent the script starts together is in flight before any of them works
      try { const [node, gid] = o.label.split(':'); assert.ok(script[node], `no script for ${o.label}`); return script[node](gid, prompt); } finally { events.push(`end ${o.label}`); }
    };
    const out = await wf(agent, parallel, async () => [], () => {}, () => {}, ARGS, {});
    const retFile = join(dir, 'return.json');
    writeFileSync(retFile, JSON.stringify(out));
    const verify = JSON.parse(exec(`${process.execPath} ${TDD} verify --run ${ARGS.runDir} --ret ${retFile}`, 'verify').trim().split('\n').pop());
    const labels = calls.map(c => c.label);
    let equivalent = null;
    try { equivalent = JSON.parse(readFileSync(join(ARGS.runDir, 'mutation-equivalent.json'), 'utf8')); } catch { /* no mark written */ }
    return { plan, ARGS, out, verify, labels, equivalent, calls, events, outputs, gateMs, agents: labels.length, gateTotal: Object.values(gateMs).reduce((a, b) => a + b, 0) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
