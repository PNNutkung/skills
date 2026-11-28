// The mutation score (ADR 0011 A1): value = 100 * (killed + timeout) / (total - equivalent). Skipped, inconclusive and unverifiable count as not killed: a mutant
// nobody judged never helps the score. Nothing counted gives value null and pass false. value is not rounded; pass = value >= min.
const KILLS = new Set(['killed', 'timeout']);

/** -> { value (0-100 | null), pass, counted, equivalent }; min (0-100, default 100) that is not a number in range throws */
export function scoreOf(mutants, { min = 100 } = {}) {
  if (typeof min !== 'number' || Number.isNaN(min) || min < 0 || min > 100) throw new RangeError(`scoreOf: min must be a number from 0 to 100, got ${String(min)}`);
  let equivalent = 0, kills = 0;
  for (const m of mutants) {
    if (m.result === 'equivalent') equivalent++;
    else if (KILLS.has(m.result)) kills++;
  }
  const counted = mutants.length - equivalent;
  const value = counted ? (100 * kills) / counted : null;
  return { value, pass: value !== null && value >= min, counted, equivalent };
}
