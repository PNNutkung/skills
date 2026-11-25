import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adrItems, adrNumber, bookedEnvs, newFlags, parseAnswers } from './adr.mjs';

const ADR = `---
dod: demo
---
# 7. Demo

## Definition of done

- [ ] Plan (happy, fail): the agent writes a plan (A1)
- [x] Run2 (happy): code runs it (A2)
- not an item
- [ ] toolongidentifier1 (x): skipped

- feature flag: DEMO_X_ENABLED=true|false, default true; DEMO_LIMIT_MAX=<n>|unlimited; no DEMO_OLD_ENABLED (A3); DEMO_MODE stays
- verify env: [cloud] container; [CI] actions; [cloud] again

## Consequences

- [ ] After (x): not in the DoD
`;

test('should list each DoD item id with its text when the ADR has a Definition of done (Source)', () => {
  assert.deepEqual(adrItems(ADR), [
    { id: 'Plan', text: '(happy, fail): the agent writes a plan (A1)' },
    { id: 'Run2', text: '(happy): code runs it (A2)' },
  ]);
});

test('should list no items when the ADR has no Definition of done heading (Source fail)', () => {
  assert.deepEqual(adrItems('# x\n- [ ] Plan (a): b\n'), []);
  assert.deepEqual(adrItems(undefined), []);
});

test('should book each bracketed env name once, lowercased, when the verify env line names them (Envs)', () => {
  assert.deepEqual(bookedEnvs(ADR), ['cloud', 'ci']);
  assert.deepEqual(bookedEnvs('- verify env: the container'), []);
});

test('should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)', () => {
  assert.deepEqual(newFlags(ADR), ['DEMO_X_ENABLED', 'DEMO_LIMIT_MAX', 'DEMO_MODE']);
  assert.deepEqual(newFlags('- feature flag: none'), []);
  assert.deepEqual(newFlags('no flag line'), []);
});

test('should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)', () => {
  assert.deepEqual(parseAnswers('A1: yes\nmore\ntime: now\nA12: run it on my box\n'), { A1: 'yes\nmore', A12: 'run it on my box' });
  assert.deepEqual(parseAnswers(''), {});
});

test('should take the four-digit number from the ADR file name when it has one (Run edge)', () => {
  assert.equal(adrNumber('/r/docs/adr/0008-verify-skill.md'), '0008');
  assert.equal(adrNumber('/r/notes.md'), null);
});
