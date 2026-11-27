// Fuzz: random bodies, commands and flag values never make the core throw, and never turn into a pass the input does not hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCall, mcpCreate } from './create.mjs';
import { FLAG, FlagError, enabled } from './flags.mjs';
import { HEADINGS, SECTIONS, checkBody, renderSections, sectionKey } from './why.mjs';
import { verdict } from '../../hooks/ticket-why-guard.mjs';

let seed = 0x5eed1234;
const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2 ** 32; };
const pick = a => a[Math.floor(rand() * a.length)];
const RUNS = 500;
const HEADS = [...Object.values(HEADINGS.en), ...Object.values(HEADINGS.th), 'Notes', 'Why not', 'วิธีทำ'];
const LINES = ['text', '', '<!-- fill -->', '| Metric | Today | Target |', '|---|---|---|', '| a | 0 | 1 |', '| a |  | 1 |', 'not measurable: wording', 'วัดไม่ได้: ไม่มีตัววัด', '```', '- item', 'é ไทย'];
const body = () => Array.from({ length: Math.floor(rand() * 12) }, () => (rand() < 0.4 ? `${pick(['#', '##', '###'])} ${pick(HEADS)}` : pick(LINES))).join('\n');

test('should never throw and pass a random body only when its first 4 headings are the 4 sections in order (Tests, Sections)', () => {
  for (let i = 0; i < RUNS; i++) {
    const b = rand() < 0.05 ? pick([null, undefined, 3, {}, []]) : body();
    const errors = checkBody(b);
    assert.ok(Array.isArray(errors));
    if (errors.length) continue;
    // a pass: the first 4 headings outside code blocks are the 4 sections, in order
    let fence = false;
    const heads = [];
    for (const l of String(b).split('\n')) {
      if (/^```/.test(l)) { fence = !fence; continue; }
      if (!fence && /^#{1,6} /.test(l)) heads.push(l.replace(/^#+ /, ''));
    }
    assert.deepEqual(heads.slice(0, 4).map(sectionKey), SECTIONS, JSON.stringify(b));
  }
});

test('should render bodies that pass the check in Thai and English when the field values are random (Tests, Sections)', () => {
  const words = ['x', 'a | b', 'ไทย', 'line\nbreak', ' 1 '];
  for (let i = 0; i < RUNS; i++) {
    const outcomes = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, j) => (rand() < 0.3
      ? { id: `O${j}`, metric: pick(words), notMeasurable: pick(words), provenBy: ['A'] }
      : { id: `O${j}`, metric: pick(words), baseline: pick(words), target: pick(words), provenBy: ['A', 'B'] }));
    const text = renderSections({ why: pick(words), outcomes, cost: pick(words), how: [pick(words)] }, { lang: pick(['en', 'th']) });
    assert.deepEqual(checkBody(text), [], text);
  }
});

test('should never throw and find a create call only for gh or glab create when commands and MCP inputs are random (Tests, Guard, GuardMcp)', () => {
  const parts = ['gh', 'glab', 'issue', 'pr', 'mr', 'create', 'list', '--body', '-b', '--body-file', '-F', '-', 'x.md', '"## Why"', "'q'", '$(cat f)', '&&', ';', '|', 'sh', '-c', 'A=1', '--fill', '<<EOF', 'EOF', '\n', '"'];
  for (let i = 0; i < RUNS; i++) {
    const cmd = Array.from({ length: Math.floor(rand() * 10) }, () => pick(parts)).join(' ');
    const call = createCall(cmd);
    if (call) assert.match(cmd, /\b(gh|glab)\b[\s\S]*\bcreate\b/, cmd);
    const name = pick(['mcp__github__create_issue', 'mcp__gitlab__create_merge_request', 'mcp__github__issue_write', 'mcp__x__create_issue', 'Bash']);
    const input = pick([undefined, null, {}, { body: body() }, { method: pick(['create', 'update']), body: 'x' }, { description: 3 }]);
    if (mcpCreate(name, input)) assert.match(name, /git(hub|lab)/);
  }
});

test('should accept only true or false in any case and stop with the flag name when the value is random (Tests, GuardFlag)', () => {
  const vals = ['true', 'false', 'TRUE', 'False', ' true ', '', '1', '0', 'yes', 'maybe', 'tru', 'off', 'ไม่', '\n'];
  for (let i = 0; i < RUNS; i++) {
    const v = rand() < 0.8 ? pick(vals) : String.fromCharCode(...Array.from({ length: Math.floor(rand() * 5) }, () => 32 + Math.floor(rand() * 90)));
    const t = v.trim().toLowerCase();
    if (t === '' || t === 'true' || t === 'false') assert.equal(enabled({ [FLAG.guard]: v }, FLAG.guard, true), t !== 'false');
    else assert.throws(() => enabled({ [FLAG.guard]: v }, FLAG.guard, true), e => e instanceof FlagError && e.message.includes(FLAG.guard));
  }
});

test('should never throw from the hook and deny only create calls when payloads are random (Tests, Guard)', () => {
  for (let i = 0; i < RUNS; i++) {
    const tool = pick(['Bash', 'mcp__github__create_issue', 'mcp__github__create_pull_request', 'Read', undefined]);
    const ti = pick([undefined, null, { command: `gh ${pick(['issue', 'pr'])} create --body "${body().replace(/"/g, '')}"` }, { command: 'ls' }, { body: body() }, {}]);
    const r = verdict({ tool_name: tool, tool_input: ti, cwd: '/' }, { [FLAG.guard]: pick(['true', undefined, 'maybe']) });
    if (r !== null) assert.ok(tool === 'Bash' ? /create/.test(ti?.command ?? '') : String(tool).startsWith('mcp__'), `${tool} ${JSON.stringify(ti)}`);
  }
});
