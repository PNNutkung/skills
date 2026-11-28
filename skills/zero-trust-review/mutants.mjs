// The mutant generator moved to skills/mutation/mutants.mjs (ADR 0011 A18); this file re-exports it, so zero-trust-review's tools and paired-agent-tdd import it as before.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MUTATION_SKILL_DIR } from './probelib.mjs';

const mutants = await import(pathToFileURL(join(MUTATION_SKILL_DIR, 'mutants.mjs')).href);
export const { EQUIV_SKIP, LANG, changedLines, fileRanges, generateMutants, sample } = mutants;
