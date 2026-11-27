// The mutant generator moved to skills/mutation/mutants.mjs (ADR 0011 A18); this file re-exports it, so zero-trust-review's tools and paired-agent-tdd import it as before.
// LANG below names the file types that get mutants: paired-agent-tdd's docs.test.mjs reads it from this file, and loading this file fails if it ever differs from the
// generator's own table.
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MUTATION_SKILL_DIR } from './probelib.mjs';

const LANG = { py: 'p', js: 'j', jsx: 'j', mjs: 'j', cjs: 'j', ts: 'j', tsx: 'j', go: 'c', java: 'c', c: 'c', h: 'c', cc: 'c', cpp: 'c', cs: 'c', rs: 'c', kt: 'c', swift: 'c', php: 'c', scala: 'c' };
const mutants = await import(pathToFileURL(join(MUTATION_SKILL_DIR, 'mutants.mjs')).href);
if (!isDeepStrictEqual(LANG, mutants.LANG)) throw new Error('zero-trust-review/mutants.mjs: LANG differs from skills/mutation/mutants.mjs: copy the table here');
export const { changedLines, fileRanges, generateMutants, sample } = mutants;
