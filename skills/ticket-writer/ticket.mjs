#!/usr/bin/env node
// ticket-writer CLI (ADR 0012). Every command prints one JSON line; exit 0 ok, 1 the check failed, 2 usage error.
//   issue-check --body FILE     the body starts with Why, Expected outcome, If we do nothing, How we know (Thai or English headings)
//   template [--lang en|th]     print the template for a new issue or PR body
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADINGS, checkBody } from './why.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: ticket.mjs issue-check --body FILE | template [--lang en|th]';

function template(lang) {
  const text = readFileSync(join(HERE, 'template.md'), 'utf8');
  if (lang !== 'th') return text;
  const en = HEADINGS.en, th = HEADINGS.th;
  return Object.keys(en).reduce((t, k) => t.replace(`## ${en[k]}\n`, `## ${th[k]}\n`), text).replace('| Metric | Today | Target |', '| ตัววัด | วันนี้ | เป้า |');
}

/** -> {code, out} */
export function main(argv, { cwd = process.cwd() } = {}) {
  const [cmd, ...rest] = argv;
  const opt = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === 'issue-check') {
    const f = opt('--body');
    if (!f) return { code: 2, out: { ok: false, error: USAGE } };
    const p = resolve(realpathSync(cwd), f);
    if (!existsSync(p)) return { code: 2, out: { ok: false, error: `no file ${f}` } };
    const errors = checkBody(readFileSync(p, 'utf8'));
    return { code: errors.length ? 1 : 0, out: { ok: !errors.length, errors, ...(errors.length ? { template: join(HERE, 'template.md') } : {}) } };
  }
  if (cmd === 'template') {
    const lang = opt('--lang') ?? 'en';
    if (!['en', 'th'].includes(lang)) return { code: 2, out: { ok: false, error: USAGE } };
    return { code: 0, out: { ok: true, lang, text: template(lang) } };
  }
  return { code: 2, out: { ok: false, error: USAGE } };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { code, out } = main(process.argv.slice(2));
  console.log(JSON.stringify(out));
  process.exit(code);
}
