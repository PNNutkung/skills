// The unenforced-rule gate end to end on a fixture repo (ADR 0013): collect -> findings that name a rule -> check (repeat + level gate,
// report) -> log (docs/retro/rule-hits.json). Each test builds its own repo and home, so tests share no state.
// flags: defaults. setup() drops every RETRO_* key from the env; the report test sets no flag, so it runs the way a real retro starts
// (rules/flag-defaults-e2e.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAG = 'RETRO_UNENFORCED_RULE_CHECK_ENABLED';
const OLD_HIT = { rule: 'paths/realpath', date: '2026-11-22', branch: 'old-branch', finding: 'F2' };
const HEADING = '## Repeats of unenforced rules';
const LOG_HEADER = '| date | work | sessions | tokens | findings | passed | approved | ratchetRules |';
const F1 = { id: 'F1', title: 'a path compare without realpath again', category: 'coding-standards', rule: 'paths/realpath',
  evidence: [{ kind: 'file', ref: 'rules/paths.md:5', quote: 'Compare two paths only after resolving both' }] };
const P1 = { id: 'P1', finding: 'F1', text: 'a check for path compares', files: ['rules/checks/realpath.mjs'], level: 'check' };

/** A fixture repo on branch feat with a judgment rule paths/realpath and one earlier hit of it; collect already ran. */
function setup() {
  const repo = mkdtempSync(join(tmpdir(), 'retro-unenf-repo-'));
  const home = mkdtempSync(join(tmpdir(), 'retro-unenf-home-'));
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RETRO_'))), CI: '', CLAUDE_CONFIG_DIR: home,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { env, encoding: 'utf8' });
  const put = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
  g('init', '-q', '-b', 'main');
  put('rules/paths.md', '# Paths\n\nCompare real paths.\n\n- Compare two paths only after resolving both to their real paths. <!-- rule: paths/realpath -->\n');
  put('rules/enforcers.json', `${JSON.stringify({ 'paths/realpath': { status: 'judgment', enforcers: [], reason: 'no check reads every compare yet' } }, null, 2)}\n`);
  put('docs/retro/rule-hits.json', `${JSON.stringify([OLD_HIT], null, 2)}\n`);
  put('src/a.mjs', 'export const a = 1;\n');
  g('add', '.'); g('commit', '-qm', 'init');
  const base = g('rev-parse', 'HEAD').trim();
  g('checkout', '-qb', 'feat');
  put('src/a.mjs', 'export const same = (x, y) => x === y;\n');
  g('add', '.'); g('commit', '-qm', 'feat: compare');
  const node = (args, extra = {}) => {
    const r = spawnSync(process.execPath, [join(HERE, 'retro.mjs'), ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
    return { code: r.status, out: JSON.parse(r.stdout || 'null'), err: r.stderr };
  };
  const c = node(['collect', '--base', base]);
  assert.equal(c.code, 0, c.err);
  const run = c.out.run;
  const write = (name, value) => writeFileSync(join(run, name), JSON.stringify(value));
  const read = name => readFileSync(join(run, name), 'utf8');
  return { repo, run, node, write, read, work: c.out.work };
}

test('should fail check naming F1 and the level when a repeat of an unenforced rule has no proposal (LevelGate, Repeat)', () => {
  const s = setup();
  s.write('findings.json', [F1]);
  const r = s.node(['check', '--run', s.run]);
  assert.equal(r.code, 1, JSON.stringify(r.out));
  assert.equal(r.out.ok, false);
  assert.ok(r.out.errors.some(e => e.startsWith('F1: ') && /level/.test(e) && e.includes('paths/realpath')), JSON.stringify(r.out.errors));
  const [v] = JSON.parse(s.read('verified.json'));
  assert.equal(v.verify, 'passed', JSON.stringify(v.reasons));
  assert.equal(v.repeat, true);
});

test('should pass check and list F1 with its earlier hit in report.md when the proposal names level check (Report, Repeat, Unenforced)', () => {
  const s = setup();
  s.write('findings.json', [F1]);
  s.write('proposals.json', [P1]);
  const r = s.node(['check', '--run', s.run]);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.errors, []);
  const [v] = JSON.parse(s.read('verified.json'));
  assert.equal(v.repeat, true);
  assert.deepEqual(v.earlierHits, [OLD_HIT]);
  const report = s.read('report.md');
  assert.ok(report.includes(HEADING), report);
  const section = report.slice(report.indexOf(HEADING));
  const line = section.split('\n').find(l => l.startsWith('- F1 '));
  assert.ok(line, section);
  assert.ok(line.includes('paths/realpath'), line);
  assert.ok(line.includes('2026-11-22') && line.includes('old-branch'), line);
  assert.match(line, /level check/);
});

test('should pass check with no repeats section when the flag is false and there is no proposal (FlagOff)', () => {
  const s = setup();
  s.write('findings.json', [F1]);
  const r = s.node(['check', '--run', s.run], { [FLAG]: 'false' });
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.ok(!s.read('report.md').includes(HEADING));
  const [v] = JSON.parse(s.read('verified.json'));
  assert.ok(!Object.hasOwn(v, 'repeat'), JSON.stringify(v));
});

test('should stop with exit 2 naming the flag, the value and the fix when the flag is not true or false (FlagBad)', () => {
  const s = setup();
  s.write('findings.json', [F1]);
  s.write('proposals.json', [P1]);
  const r = s.node(['check', '--run', s.run], { [FLAG]: 'maybe' });
  assert.equal(r.code, 2);
  const msg = r.out.errors.join('\n');
  for (const text of [msg, r.err]) {
    assert.ok(text.includes(FLAG), text);
    assert.ok(text.includes('maybe'), text);
    assert.ok(text.includes('true or false'), text);
  }
});

test('should check findings with no rule field exactly as before when the hits file names the rule (Compat)', () => {
  const s = setup();
  const { rule, ...noRule } = F1;
  assert.equal(rule, 'paths/realpath');
  s.write('findings.json', [noRule, { ...noRule, id: 'F2', evidence: [...noRule.evidence, ...noRule.evidence] }]);
  const r = s.node(['check', '--run', s.run]);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.deepEqual(r.out.counts, { passed: 2, 'not-passed': 0, 'no-evidence': 0 });
  assert.deepEqual(r.out.errors, []);
  for (const v of JSON.parse(s.read('verified.json'))) {
    assert.deepEqual(Object.keys(v).sort(), ['category', 'evidence', 'id', 'reasons', 'title', 'verify']);
  }
  assert.ok(!s.read('report.md').includes(HEADING));
});

test('should append the F1 hit to rule-hits.json and keep the log columns when log runs after check passes (RuleHits)', () => {
  const s = setup();
  s.write('findings.json', [F1, { id: 'F3', title: 'no rule', category: 'speed' }]);
  s.write('proposals.json', [P1]);
  assert.equal(s.node(['check', '--run', s.run]).code, 0);
  const r = s.node(['log', '--run', s.run]);
  assert.equal(r.code, 0, JSON.stringify(r.out));
  assert.equal(r.out.hits, 1);
  assert.equal(r.out.ok, true);
  const hits = JSON.parse(readFileSync(join(s.repo, 'docs', 'retro', 'rule-hits.json'), 'utf8'));
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], OLD_HIT);
  const { date, ...rest } = hits[1];
  assert.deepEqual(rest, { rule: 'paths/realpath', branch: s.work, finding: 'F1' });
  assert.equal(s.work, 'feat');
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  const log = readFileSync(join(s.repo, 'docs', 'retro', 'log.md'), 'utf8');
  assert.ok(log.split('\n').includes(LOG_HEADER), log);
  assert.match(log, /\| feat \| 0 \| 0 \| 2 \| 1 \| 0 \| 0 \|/);
  assert.ok(readFileSync(join(s.repo, 'docs', 'retro', 'rule-hits.json'), 'utf8').endsWith('}\n]\n'));
});
