// flags: defaults
// Tests for hooks/reply-style.mjs and the reply-style rule (docs/adr/0010-reply-style.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, readEnabled } from './reply-style.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const HOOK = join(HERE, 'reply-style.mjs');
const RULE = readFileSync(join(ROOT, 'rules', 'reply-style.md'), 'utf8');
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('REPLY_')));
const fire = (input, env = {}, hook = HOOK) => {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(input), env: { ...BASE_ENV, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr };
};

test('should inject the whole rule file when the session starts with the flag unset (Hook)', () => {
  for (const source of ['startup', 'resume', 'clear', 'compact']) {
    const r = fire({ hook_event_name: 'SessionStart', source });
    assert.equal(r.code, 0, source);
    assert.equal(r.err, '', source);
    assert.deepEqual(r.out, { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: RULE } }, source);
  }
});

test('should inject the rule when REPLY_STYLE_ENABLED is true or empty in any case (Hook)', () => {
  for (const v of ['true', 'TRUE', 'True', '']) {
    const out = handle({ hook_event_name: 'SessionStart', source: 'startup' }, { REPLY_STYLE_ENABLED: v });
    assert.equal(out.code, 0, v);
    assert.equal(out.stdout.hookSpecificOutput.additionalContext, RULE, v);
  }
});

test('should print nothing and exit 0 when REPLY_STYLE_ENABLED is false (FlagOff)', () => {
  const r = fire({ hook_event_name: 'SessionStart', source: 'startup' }, { REPLY_STYLE_ENABLED: 'false' });
  assert.deepEqual(r, { code: 0, out: null, err: '' });
  assert.equal(handle({ hook_event_name: 'SessionStart' }, { REPLY_STYLE_ENABLED: 'FALSE' }).stdout, undefined);
});

test('should exit 2 and name the flag, the value and the fix when REPLY_STYLE_ENABLED is invalid (FlagBad)', () => {
  const r = fire({ hook_event_name: 'SessionStart', source: 'startup' }, { REPLY_STYLE_ENABLED: '1' });
  assert.equal(r.code, 2);
  assert.equal(r.out, null);
  assert.match(r.err, /REPLY_STYLE_ENABLED/);
  assert.match(r.err, /"1"/);
  assert.match(r.err, /true or false/);
});

test('should accept only true, false or empty when the flag value is random (FlagBad, fuzz)', () => {
  let seed = 7;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const chars = 'tTrRuUeEfFaAlLsS01 -_yYnNoO\t';
  for (let k = 0; k < 500; k++) {
    const v = Array.from({ length: rand(7) }, () => chars[rand(chars.length)]).join('');
    const low = v.toLowerCase();
    if (low === 'true' || v === '') assert.equal(readEnabled({ REPLY_STYLE_ENABLED: v }), true, JSON.stringify(v));
    else if (low === 'false') assert.equal(readEnabled({ REPLY_STYLE_ENABLED: v }), false, JSON.stringify(v));
    else assert.throws(() => readEnabled({ REPLY_STYLE_ENABLED: v }), /REPLY_STYLE_ENABLED/, JSON.stringify(v));
  }
});

test('should do nothing when the event is not SessionStart (Hook)', () => {
  for (const input of [{ hook_event_name: 'PreToolUse', tool_name: 'Bash' }, {}, null]) {
    assert.deepEqual(handle(input, {}), { code: 0 });
  }
});

test('should warn on stderr and exit 0 when the rule file is missing (Missing)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reply-style-'));
  try {
    mkdirSync(join(dir, 'hooks'));
    cpSync(HOOK, join(dir, 'hooks', 'reply-style.mjs'));
    const r = fire({ hook_event_name: 'SessionStart', source: 'startup' }, {}, join(dir, 'hooks', 'reply-style.mjs'));
    assert.equal(r.code, 0);
    assert.equal(r.out, null);
    assert.match(r.err, /reply-style: .*rules[\\/]reply-style\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('should inject the rule when the plugin folder is reached through a symlink (Hook, rules/paths.md)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reply-style-link-'));
  try {
    symlinkSync(ROOT, join(dir, 'plugin'), 'dir');
    const r = fire({ hook_event_name: 'SessionStart', source: 'startup' }, {}, join(dir, 'plugin', 'hooks', 'reply-style.mjs'));
    assert.equal(r.code, 0);
    assert.equal(r.out?.hookSpecificOutput?.additionalContext, RULE);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('should keep the rule parts the ADR asks for when the rule file is read (RuleFile, FirstUse, SteRules, Scope, Guideline)', () => {
  for (const want of [/technical term/i, /brackets/i, /latest message/i, /plain English/i, /first use/i, /backticks/i,
    /ASD-STE100/, /20 words/, /25 words/, /one idea/i, /active voice/i, /code comments/i, /commit messages/i, /REPLY_STYLE_ENABLED/]) {
    assert.match(RULE, want);
  }
  assert.match(readFileSync(join(ROOT, 'rules', 'README.md'), 'utf8'), /\[`reply-style\.md`\]\(\.\/reply-style\.md\)/);
});

test('should link the rule from every SKILL.md when the skills are read (SkillLine)', () => {
  const skills = readdirSync(join(ROOT, 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  assert.ok(skills.length >= 9);
  for (const s of skills) {
    assert.match(readFileSync(join(ROOT, 'skills', s, 'SKILL.md'), 'utf8'), /\(\.\.\/\.\.\/rules\/reply-style\.md\)/, s);
  }
});

test('should register the hook and document the flag when the plugin files are read (Docs)', () => {
  const hooks = JSON.parse(readFileSync(join(HERE, 'hooks.json'), 'utf8')).hooks.SessionStart ?? [];
  assert.ok(hooks.some(h => h.hooks.some(x => /hooks\/reply-style\.mjs/.test(x.command))));
  assert.match(readFileSync(join(ROOT, 'README.md'), 'utf8'), /\| `REPLY_STYLE_ENABLED` \| `true` \\\| `false` \| `true` \|/);
});
