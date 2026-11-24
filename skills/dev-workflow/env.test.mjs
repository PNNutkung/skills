// The verify env check (ADR 0005): verify.md env: against the names booked in the ADR's `- verify env:` line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_NAMES_WARNING, bookedEnvs, checkVerify } from './check.mjs';

const adr = envLine => `# 5. Demo\n\n## Definition of done\n\n- [ ] Skill (happy): a skill\n\n${envLine}\n- test tiers: unit (A2)\n`;
const section = (id, env, result = 'pass') => `## ${id}\nenv: ${env}\nrun: node --test\nresult: ${result}\n\`\`\`\n# pass 1\n\`\`\`\n`;

test('should read the bracketed names in order, lowercased and once each, when the verify env line books them (EnvNames)', () => {
  assert.deepEqual(bookedEnvs(adr('- verify env: [cloud] e2e on a fixture; [CI] CI green; [cloud] again; [nut-wsl] one run (A7)')), ['cloud', 'ci', 'nut-wsl']);
});

test('should book nothing when the verify env line is prose, missing, or names sit on another line (EnvNames, NoNames)', () => {
  assert.deepEqual(bookedEnvs(adr('- verify env: cloud container, CI green (A16)')), []);
  assert.deepEqual(bookedEnvs(adr('- feature flag: [x] not an env (A1)')), []);
  assert.deepEqual(bookedEnvs(''), []);
  assert.deepEqual(bookedEnvs(undefined), []);
  assert.deepEqual(bookedEnvs(adr('- verify env: [] empty; [ bad name ] spaces (A1)')), []);
});

test('should pass and tick every item when each env starts with a booked name in any case (EnvMatch, TrustText)', () => {
  const md = section('Skill', 'Cloud container (Linux)') + section('Gate', '[ci] GitHub Actions run 42');
  const r = checkVerify(md, ['Skill', 'Gate'], {}, { booked: ['cloud', 'ci'] });
  assert.deepEqual(r, { ok: true, errors: [], tickable: ['Skill', 'Gate'], warnings: [] });
});

test('should close the gate and name the item, its env and the booked names when an env is not booked (EnvMatch, Mismatch)', () => {
  const md = section('Skill', 'staging') + section('Gate', 'ci');
  const r = checkVerify(md, ['Skill', 'Gate'], {}, { booked: ['cloud', 'ci'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.startsWith('Skill: env "staging"') && e.includes('[cloud], [ci]') && /accepted A<n>/.test(e)), r.errors.join('\n'));
  assert.deepEqual(r.tickable, ['Gate'], 'a mismatched item is never ticked');
});

test('should not match a booked name when it is only the start of a longer word (EnvMatch edge)', () => {
  const r = checkVerify(section('Skill', 'cloudy staging') + section('Gate', 'ci'), ['Skill', 'Gate'], {}, { booked: ['cloud', 'ci'] });
  assert.ok(r.errors.some(e => e.startsWith('Skill: env "cloudy staging"')));
  const ok = checkVerify(section('Skill', 'cloud-1 runner') + section('Gate', 'ci:linux'), ['Skill', 'Gate'], {}, { booked: ['cloud', 'ci'] });
  assert.equal(ok.ok, false, 'cloud-1 is a different name, ci: is a separator');
  assert.ok(!ok.errors.some(e => e.startsWith('Gate:')), ok.errors.join('\n'));
});

test('should let the user accept an item by answer id when its env is not booked (Mismatch)', () => {
  const md = section('Skill', 'cloud') + section('Gate', 'staging', 'accepted A9');
  const r = checkVerify(md, ['Skill', 'Gate'], { A9: 'accept, staging is down' }, { booked: ['cloud'] });
  assert.deepEqual(r, { ok: true, errors: [], tickable: ['Skill'], warnings: [] });
});

test('should fail and name each booked env when no passing item used it (EnvCoverage)', () => {
  const md = section('Skill', 'cloud') + section('Gate', 'cloud box', 'accepted A9');
  const r = checkVerify(md, ['Skill', 'Gate'], { A9: 'ok' }, { booked: ['cloud', 'ci', 'nut-wsl'] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.filter(e => /booked env/.test(e)).map(e => e.split(' ')[2]), ['[ci]', '[nut-wsl]']);
  assert.deepEqual(r.tickable, ['Skill']);
});

test('should not count an item as using a booked env when it is mismatched or failing (EnvCoverage edge)', () => {
  const md = section('Skill', 'ci-staging') + section('Gate', 'ci', 'fail');
  const r = checkVerify(md, ['Skill', 'Gate'], {}, { booked: ['ci'] });
  assert.ok(r.errors.some(e => /booked env \[ci\] has no passing item/.test(e)), r.errors.join('\n'));
});

test('should skip the comparison and warn when no names are booked (NoNames)', () => {
  const md = section('Skill', 'anything at all');
  assert.deepEqual(checkVerify(md, ['Skill'], {}, { booked: [] }), { ok: true, errors: [], tickable: ['Skill'], warnings: [NO_NAMES_WARNING] });
  assert.match(NO_NAMES_WARNING, /no env names booked/);
});

test('should behave exactly as before when no booked list is given (Flag false, backward compat)', () => {
  const md = section('Skill', 'staging');
  assert.deepEqual(checkVerify(md, ['Skill'], {}), { ok: true, errors: [], tickable: ['Skill'] });
  assert.deepEqual(checkVerify(md, ['Skill'], {}, { booked: null }), { ok: true, errors: [], tickable: ['Skill'] });
});
