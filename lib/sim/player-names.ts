import pools from "./player-name-pools.json";

export const surnamePool: readonly string[] = pools.surnames;
export const surnamePopulations: readonly number[] = pools.surnamePopulations;
export const givenNamePool: readonly string[] = pools.givenNames;
const surnameTotal = surnamePopulations.reduce((sum, population) => sum + population, 0);
const surnameCumulative: number[] = [];
for (const population of surnamePopulations) surnameCumulative.push((surnameCumulative.at(-1) ?? 0) + population);

// Surnames follow population shares within the selected top 100.
// Whole given names are uniform; no syllable mixing or duplicate rerolls.
export function generatePlayerName(random: () => number): string {
  const target = random() * surnameTotal;
  let lo = 0, hi = surnameCumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (target < surnameCumulative[mid]) hi = mid;
    else lo = mid + 1;
  }
  return surnamePool[lo] + givenNamePool[Math.floor(random() * givenNamePool.length)];
}

// Private name stream: names depend on career seed and identity, not ability,
// age or other simulation streams. The same save/seed remains replayable.
export function seededPlayerName(seed: string): string {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return generatePlayerName(() => {
    let a = state += 0x6D2B79F5;
    a = Math.imul(a ^ a >>> 15, a | 1);
    a ^= a + Math.imul(a ^ a >>> 7, a | 61);
    state >>>= 0;
    return ((a ^ a >>> 14) >>> 0) / 4294967296;
  });
}
