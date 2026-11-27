// The why / expected outcome / cost fields of a DoD (ADR 0012): checkWhy, the ticket render and ticket-check with the 4 sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWhy, outcomeResults, renderPrTop, renderTicket, ticketCheck, verifyResults } from './dodcheck.mjs';
import { checkBody } from '../ticket-writer/why.mjs';

const ANSWERS = 'A1: A\ntime: t\nA2: CI goes red at random\ntime: t\nA3: accept O2 not measurable\ntime: t\nA4: accept costOfInaction none\ntime: t\n';
const TICKET = 'title: CI slow\nPR #26: suite 122 s\n';
const ctx = { answers: ANSWERS, ticket: TICKET, show: () => null };
const user = (ref, quote) => ({ kind: 'user', ref, quote, question: `Q${ref.slice(1)} ...` });
function dod() {
  return {
    slug: 'ci-speed',
    items: [{ id: 'CiMedian', text: 'median <= 90 s', source: user('A1', 'A') }, { id: 'Docs', text: 'docs read well', source: user('A1', 'A') }],
    why: { text: 'The suite takes 122 s, over the 120 s cap.', source: { kind: 'ticket', ref: '#33', quote: 'PR #26: suite 122 s' } },
    outcomes: [
      { id: 'O1', metric: 'CI suite median', baseline: '122 s', target: '<= 90 s', provenBy: ['CiMedian'], source: { kind: 'ticket', ref: '#33', quote: 'suite 122 s' } },
      { id: 'O2', metric: 'docs read well', notMeasurable: 'wording only', accepted: 'A3', provenBy: ['Docs'] },
    ],
    costOfInaction: { text: 'CI goes red at random', source: user('A2', 'CI goes red at random') },
  };
}

test('should pass when why, outcomes and cost are complete and quoted (DodFields)', () => {
  assert.deepEqual(checkWhy(dod(), ctx, { required: true }), []);
});

test('should name each missing field when required and the DoD has none of them (CostCheck)', () => {
  const d = dod(); delete d.why; delete d.outcomes; delete d.costOfInaction;
  const errs = checkWhy(d, ctx, { required: true });
  for (const f of ['why', 'outcomes', 'costOfInaction']) assert.ok(errs.some(e => e.startsWith(`${f}:`)), f);
});

test('should report nothing when not required and the DoD has none of the fields (NewOnly)', () => {
  const d = dod(); delete d.why; delete d.outcomes; delete d.costOfInaction;
  assert.deepEqual(checkWhy(d, ctx, { required: false }), []);
});

test('should still check a field when not required but the field is present (NewOnly)', () => {
  const d = dod(); d.why.source.quote = 'not in the ticket';
  assert.ok(checkWhy(d, ctx, { required: false }).some(e => /^why: .*ticket\.md/.test(e)));
});

test('should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)', () => {
  for (const k of ['metric', 'baseline', 'target']) {
    const d = dod(); delete d.outcomes[0][k];
    assert.ok(checkWhy(d, ctx, { required: true }).some(e => e.startsWith('O1:') && e.includes(k)), k);
  }
});

test('should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)', () => {
  const d = dod(); delete d.outcomes[1].accepted;
  assert.ok(checkWhy(d, ctx, { required: true }).some(e => /^O2: .*accepted/.test(e)));
  const d2 = dod(); d2.outcomes[1].accepted = 'A1';
  assert.ok(checkWhy(d2, ctx, { required: true }).some(e => /^O2: .*answer A1 does not accept O2/.test(e)));
});

test('should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)', () => {
  const d = dod(); d.outcomes[0].provenBy = [];
  assert.ok(checkWhy(d, ctx, { required: true }).some(e => /^O1: provenBy/.test(e)));
  const d2 = dod(); d2.outcomes[0].provenBy = ['Docz'];
  assert.ok(checkWhy(d2, ctx, { required: true }).some(e => /^O1: .*"Docz"/.test(e)));
});

test('should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)', () => {
  const d = dod(); d.outcomes[1].id = 'O1';
  assert.ok(checkWhy(d, ctx, { required: true }).some(e => /O1 is repeated/.test(e)));
  const d2 = dod(); d2.outcomes[0].id = 'o-1!';
  assert.ok(checkWhy(d2, ctx, { required: true }).some(e => /outcome id/.test(e)));
});

test('should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)', () => {
  const d = dod(); d.costOfInaction = { text: 'no clear cost: internal tidy-up', source: user('A2', 'CI goes red at random') };
  assert.ok(checkWhy(d, ctx, { required: true }).some(e => /^costOfInaction: .*accepted/.test(e)));
  d.costOfInaction.accepted = 'A4';
  assert.deepEqual(checkWhy(d, ctx, { required: true }), []);
});

test('should not crash when the fields have the wrong types', () => {
  for (const bad of [{ why: 'x', outcomes: 'y', costOfInaction: 3 }, { outcomes: [null, 5] }, null]) assert.ok(Array.isArray(checkWhy(bad, ctx, { required: true })));
});

test('should render the 4 sections first and the checklist after them when the DoD has the fields (Render)', () => {
  const text = renderTicket(dod(), TICKET, { lang: 'en', sections: true });
  assert.ok(text.indexOf('## Why') < text.indexOf('## Definition of Done'));
  assert.deepEqual(checkBody(text), []);
  assert.match(text, /\| CI suite median \| 122 s \| <= 90 s \| CiMedian \|/);
  assert.match(text, /O1 \(CI suite median\): CiMedian.*docs\/verify\/ci-speed\.md/);
});

test('should render Thai headings when lang is th (Render)', () => {
  const text = renderTicket(dod(), TICKET, { lang: 'th', sections: true });
  assert.match(text, /## ทำไม \(Why\)/);
  assert.deepEqual(checkBody(text), []);
});

test('should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)', () => {
  const d = dod(); delete d.why; delete d.outcomes; delete d.costOfInaction;
  assert.equal(renderTicket(d, TICKET, { sections: true }), renderTicket(d, TICKET, {}));
  assert.ok(!renderTicket(dod(), TICKET, { sections: false }).includes('## Why'));
});

test('should list a missing or empty section when ticket-check runs with sections (TicketCheck)', () => {
  const text = renderTicket(dod(), TICKET, { sections: true });
  assert.deepEqual(ticketCheck(TICKET, text, dod(), { sections: true }).sections, []);
  const broken = text.replace(/## If we do nothing\n\nCI goes red at random/, '## If we do nothing\n\n');
  const r = ticketCheck(TICKET, broken, dod(), { sections: true });
  assert.equal(r.ok, false);
  assert.ok(r.sections.some(e => /If we do nothing.*empty/.test(e)));
  assert.equal(ticketCheck(TICKET, broken, dod(), {}).ok, true);
});

test('should read item results from a verify file when it has result lines (PrBody)', () => {
  const md = '# Verify\n\n## CiMedian\nenv: ci\nresult: pass\n```\n## Fake\nresult: fail\n```\n\n## Docs\nresult: fail\n\n## Other\nresult: accepted A9\n';
  assert.deepEqual(verifyResults(md), { CiMedian: 'pass', Docs: 'fail', Other: 'accepted' });
});

test('should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)', () => {
  const outs = [{ id: 'O1', provenBy: ['A', 'B'] }, { id: 'O2', provenBy: ['C'] }, { id: 'O3', provenBy: ['A', 'D'] }];
  assert.deepEqual(outcomeResults(outs, { A: 'pass', B: 'accepted', C: 'fail' }), { O1: 'met', O2: 'not met', O3: 'not run' });
});

test('should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)', () => {
  const top = renderPrTop(dod(), { lang: 'en', ticketUrl: 'https://github.com/o/r/issues/33', results: { CiMedian: 'pass' } });
  assert.deepEqual(checkBody(top), []);
  assert.match(top, /\| Result \|/);
  assert.match(top, /\| met \|/);
  assert.match(top, /\| not run \|/);
  assert.match(top, /issues\/33/);
  assert.ok(!renderPrTop(dod(), {}).includes('| Result |'));
});

test('should write the 4 sections under Context when the ADR is rendered with sections (Adr)', async () => {
  const { renderAdr } = await import('./adr.mjs');
  const d = { ...dod(), touches: ['src/**'], required: {} };
  const qs = 'Q1: Pick?\n(A) a\n  + p\n  - c\n(B) b\n  + p\n  - c\nrecommended: A\ntime: t\n';
  const on = renderAdr({ dod: d, answers: 'A1: A\ntime: t\n', questions: qs, ticket: TICKET, number: 3, date: '2026-11-27', sections: true });
  assert.deepEqual(on.errors, []);
  const ctxPart = on.text.slice(on.text.indexOf('## Context'), on.text.indexOf('## Decision'));
  for (const h of ['### Why', '### Expected outcome', '### If we do nothing', '### How we know']) assert.ok(ctxPart.includes(h), h);
  const off = renderAdr({ dod: d, answers: 'A1: A\ntime: t\n', questions: qs, ticket: TICKET, number: 3, date: '2026-11-27' });
  assert.ok(!off.text.includes('### Why'));
});

test('should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)', async () => {
  const { readFileSync } = await import('node:fs');
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\| `DOD_TICKET_WHY_ENABLED` \| `true` \\\| `false` \| `true` \|/);
  const { TICKET_WHY_ENV } = await import('./dod.mjs');
  assert.equal(TICKET_WHY_ENV, 'DOD_TICKET_WHY_ENABLED');
});
