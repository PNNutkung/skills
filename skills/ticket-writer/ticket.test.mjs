// cwd: linked
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './ticket.mjs';
import { checkBody } from './why.mjs';

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'tw-')));

test('should pass issue-check and exit 0 when the body file has the 4 sections (IssueCheck)', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'b.md'), '## Why\nx\n## Expected outcome\nnot measurable: wording\n## If we do nothing\ny\n## How we know\nz\n');
    assert.deepEqual(main(['issue-check', '--body', 'b.md'], { cwd: d }), { code: 0, out: { ok: true, errors: [] } });
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('should fail issue-check with exit 1 and point to the template when sections are missing (IssueCheck)', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'b.md'), 'hello');
    const r = main(['issue-check', '--body', join(d, 'b.md')], { cwd: d });
    assert.equal(r.code, 1);
    assert.equal(r.out.errors.length, 4);
    assert.match(r.out.template, /template\.md$/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('should exit 2 with the usage when a command or argument is missing', () => {
  assert.equal(main([]).code, 2);
  assert.equal(main(['issue-check']).code, 2);
  assert.equal(main(['issue-check', '--body', '/no/such/file']).code, 2);
  assert.equal(main(['template', '--lang', 'fr']).code, 2);
});

test('should print a template whose headings the check knows when template runs in either language (IssueCheck)', () => {
  for (const lang of ['en', 'th']) {
    const { code, out } = main(['template', '--lang', lang]);
    assert.equal(code, 0);
    // only "empty" errors: every heading is found and in order
    assert.ok(checkBody(out.text).every(e => /empty|row 1/.test(e)), `${lang}: ${checkBody(out.text).join('; ')}`);
  }
  assert.match(main(['template', '--lang', 'th']).out.text, /## ทำไม \(Why\)/);
});

test('should read a relative --body from the real folder when the cwd is a symlinked folder (IssueCheck edge)', () => {
  const d = tmp();
  try {
    mkdirSync(join(d, 'real'));
    writeFileSync(join(d, 'real', 'b.md'), '## Why\nx\n## Expected outcome\nnot measurable: wording\n## If we do nothing\ny\n## How we know\nz\n');
    symlinkSync(join(d, 'real'), join(d, 'link'));
    assert.equal(main(['issue-check', '--body', 'b.md'], { cwd: join(d, 'link') }).code, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
