// E2E: one whole DoD session through the real CLI and the real hook, as an agent and a user would drive it, on a throwaway git repo.
// grill answers -> check fails (open question) -> answer -> check passes and writes docs/dod -> render ticket -> hook denies the post ->
// user approves -> hook allows -> DoD changes -> hook denies again -> export for both skills -> close -> hook allows product code again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from '../paired-agent-tdd/gates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'dod.mjs');
const HOOK = join(HERE, '..', '..', 'hooks', 'dod-guard.mjs');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dod-e2e-')));
const repo = join(tmp, 'repo');
mkdirSync(join(repo, 'src'), { recursive: true });
writeFileSync(join(repo, 'src', 'reports.js'), 'export const x = 1;\n');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8' });
git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base');

const SESSION = 'e2e-session';
const env = { ...process.env, DOD_MARKER_DIR: join(tmp, 'm'), DOD_RUN_BASE: join(tmp, 'r'), DOD_CONFIG_DIR: join(tmp, 'c'), DOD_GUARD: '', DOD_GUARD_ENABLED: 'true', CLAUDE_CODE_SESSION_ID: SESSION };
function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() };
}
function hook(tool, input) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ session_id: SESSION, cwd: repo, tool_name: tool, tool_input: input }), env, encoding: 'utf8' });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

const TICKET = 'title: Export reports\nผู้ใช้อยาก export รายงานเป็น CSV\nเพื่อเอาไปเปิดใน Excel\n';
const u = (ref, quote, question) => ({ kind: 'user', ref, quote, question });
const dodFile = join(repo, 'docs', 'dod', 'report-csv.json');
function writeDod(extra = {}) {
  mkdirSync(dirname(dodFile), { recursive: true });
  writeFileSync(dodFile, JSON.stringify({
    slug: 'report-csv',
    ticket: { system: 'github', ref: 'acme/web#42' },
    items: [
      { id: 'AC1', text: 'Export button on sales and stock', source: u('A1', 'A', 'Q1 Which pages? (A) both (B) sales') },
      { id: 'AC2', text: 'CSV opens in Excel', source: { kind: 'ticket', ref: 'acme/web#42', quote: 'เพื่อเอาไปเปิดใน Excel' } },
      ...(extra.items ?? []),
    ],
    required: {
      featureFlag: { value: 'REPORT_CSV_EXPORT, default off', source: u('A2', 'REPORT_CSV_EXPORT', 'Q2 flag?') },
      backwardCompat: { value: 'no API change', source: u('A3', 'no API change', 'Q3 compat?') },
      nonGoals: { value: ['xlsx'], source: u('A4', 'xlsx', 'Q4 out of scope?') },
      verifyEnv: { value: 'staging', source: u('A5', 'staging', 'Q5 where to verify?') },
      testTiers: { value: ['unit', 'e2e'], source: u('A6', 'unit, e2e', 'Q6 tiers?') },
    },
    unconfirmed: extra.unconfirmed ?? [],
  }, null, 2));
}

test('should drive a whole DoD session end to end when an agent and a user follow the skill', () => {
  // open: the run folder and the guard
  const opened = cli('open', '--repo', repo, '--slug', 'report-csv');
  assert.equal(opened.code, 0, opened.err);
  const run = opened.json.run;
  assert.equal(hook('Edit', { file_path: join(repo, 'src', 'reports.js'), old_string: 'x', new_string: 'y' }), 'deny', 'no product code during the grill');

  // the agent saves the ticket and the answers in the run folder (allowed), and drafts the DoD in docs/dod (allowed)
  assert.equal(hook('Write', { file_path: join(run, 'ticket.md'), content: TICKET }), 'allow');
  writeFileSync(join(run, 'ticket.md'), TICKET);
  writeFileSync(join(run, 'answers.md'), 'A1: A\ntime: t\nA2: REPORT_CSV_EXPORT\ntime: t\nA3: no API change\ntime: t\nA4: xlsx\ntime: t\nA5: staging\ntime: t\nA6: unit, e2e\ntime: t\n');
  assert.equal(hook('Write', { file_path: dodFile, content: '{}' }), 'allow');
  writeDod({ unconfirmed: [{ question: 'Q7 What about more than 10,000 rows?' }] });

  // the user stopped before Q7: check fails, export refuses
  const stopped = cli('check', '--dod', dodFile);
  assert.equal(stopped.code, 1);
  assert.match(stopped.out, /unconfirmed: Q7/);
  assert.notEqual(cli('export', '--dod', dodFile, '--to', 'ptdd', '--out', join(run, 'ptdd')).code, 0);

  // Q7 answered: check passes and writes the readable DoD next to the JSON
  writeFileSync(join(run, 'answers.md'), readFileSync(join(run, 'answers.md'), 'utf8') + 'A7: B\ntime: t\n');
  writeDod({ items: [{ id: 'AC3', text: 'Cap at 10,000 rows and warn', source: u('A7', 'B', 'Q7 Over 10,000 rows? (A) all (B) cap and warn') }] });
  const passed = cli('check', '--dod', dodFile);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.ok(existsSync(join(repo, 'docs', 'dod', 'report-csv.md')));

  // the ticket: tool choice, render, self-check, then the guard holds the post until the user approves that exact text
  assert.ok(['cli', 'mcp-or-file', 'ask-trust'].includes(cli('tools', '--system', 'github').json.use));
  const rendered = cli('render', '--dod', dodFile, '--lang', 'th');
  assert.equal(rendered.code, 0, rendered.err);
  const text = readFileSync(join(run, 'ticket-new.md'), 'utf8');
  assert.match(text, /- \[ \] AC3 Cap at 10,000 rows and warn/);
  assert.match(text, /บันทึกเดิม/);
  assert.equal(cli('ticket-check', '--dod', dodFile).code, 0);
  const post = { command: `gh issue edit 42 --body-file ${join(run, 'ticket-new.md')}` };
  assert.equal(hook('Bash', post), 'deny');
  assert.equal(hook('Bash', { command: `node ${CLI} approve` }), 'deny', 'the agent cannot approve for the user');
  assert.equal(cli('approve').code, 0, 'the user approves in their own terminal');
  assert.equal(hook('Bash', post), 'allow');

  // after posting, the agent reads the ticket back and verifies it matches what was approved
  writeFileSync(join(run, 'posted.md'), text.replace(/\n/g, '\r\n') + '\n');
  assert.equal(cli('ticket-check', '--dod', dodFile, '--posted', join(run, 'posted.md')).code, 0);
  writeFileSync(join(run, 'posted.md'), 'someone else rewrote it\n');
  const drift = cli('ticket-check', '--dod', dodFile, '--posted', join(run, 'posted.md'));
  assert.equal(drift.code, 1);
  assert.match(drift.out, /differs from the approved text/);

  // the DoD changes later: a new render needs a new approval
  writeFileSync(join(run, 'answers.md'), readFileSync(join(run, 'answers.md'), 'utf8') + 'A8: yes, the header row is Thai\ntime: t\n');
  writeDod({ items: [{ id: 'AC3', text: 'Cap at 10,000 rows and warn', source: u('A7', 'B', 'Q7 ...') }, { id: 'AC4', text: 'Thai header row', source: u('A8', 'the header row is Thai', 'Q8 header language?') }] });
  assert.equal(cli('render', '--dod', dodFile).code, 0);
  assert.equal(hook('Bash', post), 'deny');

  // the fallback file when no CLI or MCP can write the ticket
  assert.equal(cli('render', '--dod', dodFile, '--fallback').code, 0);
  assert.ok(existsSync(join(repo, 'docs', 'dod', 'report-csv.ticket.md')));

  // export for both skills: files the next skill reads as is
  const ptdd = cli('export', '--dod', dodFile, '--to', 'ptdd', '--out', join(run, 'ptdd'));
  assert.equal(ptdd.code, 0, ptdd.err);
  const items = JSON.parse(readFileSync(join(run, 'ptdd', 'dod.json'), 'utf8'));
  const plan = { repo, cmd: 'node --test {file}', dod: items, groups: [{ id: 'g', tests: ['t.test.mjs'], src: ['src/reports.js'], dod: items.map(i => i.id) }] };
  assert.deepEqual(validatePlan(plan, readFileSync(join(run, 'ptdd', 'dod-source.md'), 'utf8')), []);
  const qa = cli('export', '--dod', dodFile, '--to', 'qa', '--out', join(run, 'qa'));
  assert.equal(qa.code, 0, qa.err);
  assert.equal(JSON.parse(readFileSync(join(run, 'qa', 'requirements.json'), 'utf8')).length, 4);
  assert.ok(existsSync(join(run, 'qa', 'answers.md')) && existsSync(join(run, 'qa', 'ticket.md')));

  // close: product code is editable again
  assert.equal(cli('close').code, 0);
  assert.equal(hook('Edit', { file_path: join(repo, 'src', 'reports.js'), old_string: 'x', new_string: 'y' }), 'allow');
});

test('should exit 2 with a usage line when the command is unknown or arguments are missing', () => {
  assert.equal(cli('nope').code, 2);
  assert.equal(cli('check').code, 2);
  assert.equal(cli('export', '--dod', dodFile, '--to', 'xlsx').code, 2);
});

test('should exit 2 when no DoD session is open for a command that needs one', () => {
  const r = cli('render', '--dod', dodFile);
  assert.equal(r.code, 2);
  assert.match(r.err, /no active run/);
});
