// E2E for ADR 0012 through the real CLI on a throwaway git repo: a new session requires why / outcomes / costOfInaction, an older session's
// marker does not, DOD_TICKET_WHY_ENABLED=false gives the old behavior, render puts the 4 sections first, render --pr reads docs/verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBody } from '../ticket-writer/why.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'dod.mjs');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dod-why-')));
const repo = join(tmp, 'repo');
mkdirSync(repo, { recursive: true });
writeFileSync(join(repo, 'a.txt'), 'x\n');
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8' });
git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base');

const base = { ...process.env, DOD_MARKER_DIR: join(tmp, 'm'), DOD_RUN_BASE: join(tmp, 'r'), DOD_CONFIG_DIR: join(tmp, 'c'), DOD_GUARD_ENABLED: 'false' };
for (const k of Object.keys(base)) if (k === 'DOD_TICKET_WHY_ENABLED') delete base[k];
let n = 0;
function session(env = {}) {
  const e = { ...base, CLAUDE_CODE_SESSION_ID: `why-${++n}`, ...env };
  const cli = (...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, env: e, encoding: 'utf8' }); return { code: r.status, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })(), err: r.stderr }; };
  const opened = cli('open', '--repo', repo, '--slug', 'csv');
  assert.equal(opened.code, 0, opened.err);
  const run = opened.json.run;
  writeFileSync(join(run, 'ticket.md'), 'title: CSV\nUsers need CSV export.\n');
  writeFileSync(join(run, 'answers.md'), 'A1: A\ntime: t\nA2: users copy by hand\ntime: t\n');
  return { cli, run, env: e };
}
const u = (ref, quote) => ({ kind: 'user', ref, quote, question: `Q${ref.slice(1)} ...` });
function dodJson(run, withWhy) {
  const d = {
    slug: 'csv', items: [{ id: 'AC1', text: 'export works', source: u('A1', 'A') }],
    required: Object.fromEntries(['featureFlag', 'backwardCompat', 'nonGoals', 'verifyEnv', 'testTiers'].map(k => [k, { value: 'not relevant', source: u('A1', 'A') }])),
    unconfirmed: [],
  };
  if (withWhy) Object.assign(d, {
    why: { text: 'users cannot export', source: { kind: 'ticket', ref: '#1', quote: 'Users need CSV export.' } },
    outcomes: [{ id: 'O1', metric: 'exports per day', baseline: '0', target: 'at least 1', provenBy: ['AC1'], source: u('A1', 'A') }],
    costOfInaction: { text: 'users copy by hand', source: u('A2', 'users copy by hand') },
  });
  const f = join(run, 'dod.json');
  writeFileSync(f, JSON.stringify(d));
  return f;
}

test('should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)', () => {
  const s = session();
  const r = s.cli('check', '--dod', dodJson(s.run, false));
  assert.equal(r.code, 1);
  assert.ok(r.json.errors.some(e => e.startsWith('why: missing')));
  assert.equal(s.cli('check', '--dod', dodJson(s.run, true)).code, 0);
  s.cli('close');
});

test('should pass a DoD without the fields when the session marker is from an older version (NewOnly)', () => {
  const s = session();
  const marker = join(tmp, 'm', `${s.env.CLAUDE_CODE_SESSION_ID}.json`);
  const m = JSON.parse(readFileSync(marker, 'utf8'));
  delete m.whyFields;
  writeFileSync(marker, JSON.stringify(m) + '\n', { mode: 0o600 });
  const r = s.cli('check', '--dod', dodJson(s.run, false));
  assert.equal(r.code, 0, JSON.stringify(r.json));
  s.cli('close');
});

test('should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)', () => {
  const off = session({ DOD_TICKET_WHY_ENABLED: 'false' });
  assert.equal(off.cli('check', '--dod', dodJson(off.run, false)).code, 0);
  const f = dodJson(off.run, true);
  assert.equal(off.cli('render', '--dod', f).code, 0);
  assert.ok(!readFileSync(join(off.run, 'ticket-new.md'), 'utf8').includes('## Why'));
  assert.equal(off.cli('render', '--pr', '--dod', f).code, 1);
  off.cli('close');
  const bad = session({ DOD_TICKET_WHY_ENABLED: 'yes' });
  const r = bad.cli('check', '--dod', dodJson(bad.run, true));
  assert.equal(r.code, 2);
  assert.match(r.err, /DOD_TICKET_WHY_ENABLED=yes is not valid: use true or false/);
  bad.cli('close', '--session', bad.env.CLAUDE_CODE_SESSION_ID);
});

test('should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)', () => {
  const s = session();
  const f = dodJson(s.run, true);
  assert.equal(s.cli('render', '--dod', f, '--lang', 'th').code, 0);
  const text = readFileSync(join(s.run, 'ticket-new.md'), 'utf8');
  assert.match(text, /^## ทำไม \(Why\)/);
  assert.deepEqual(checkBody(text), []);
  assert.equal(s.cli('ticket-check', '--dod', f).code, 0);
  writeFileSync(join(s.run, 'ticket-new.md'), text.replace('users copy by hand', ''));
  const r = s.cli('ticket-check', '--dod', f);
  assert.equal(r.code, 1);
  assert.ok(r.json.errors.some(e => /empty/.test(e)));
  s.cli('close');
});

test('should write the PR top with results from docs/verify when render --pr runs (PrBody)', () => {
  const s = session();
  const f = dodJson(s.run, true);
  const before = s.cli('render', '--pr', '--dod', f, '--ticket-url', 'https://example.test/issues/1');
  assert.equal(before.code, 0, JSON.stringify(before.json));
  assert.ok(!readFileSync(before.json.prTop, 'utf8').includes('| Result |'));
  mkdirSync(join(repo, 'docs', 'verify'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'verify', 'csv.md'), '# Verify\n\n## AC1\nenv: cloud\nresult: pass\n');
  const after = s.cli('render', '--pr', '--dod', f);
  const top = readFileSync(after.json.prTop, 'utf8');
  assert.match(top, /\| met \|/);
  assert.deepEqual(checkBody(top), []);
  assert.equal(dirname(after.json.prTop), s.run);
  s.cli('close');
});
