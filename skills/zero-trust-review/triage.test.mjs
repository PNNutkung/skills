// triage.py's agent cap parsing (ZT_AGENT_CAP): run with node --test. Needs python3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRIAGE = join(dirname(fileURLToPath(import.meta.url)), 'triage.py');
const capOf = raw => {
  const py = 'import importlib.util,sys,json\ns=importlib.util.spec_from_file_location("t",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.agent_cap(sys.argv[2])))';
  const r = spawnSync('python3', ['-I', '-c', py, TRIAGE, raw], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('should read ZT_AGENT_CAP as a positive integer when it is one, and as no cap otherwise', () => {
  for (const [raw, want] of [['25', 25], ['1', 1], ['', null], ['0', null], ['-1', null], ['abc', null], ['2.5', null], ['1e3', null]]) {
    assert.equal(capOf(raw), want, JSON.stringify(raw));
  }
});
