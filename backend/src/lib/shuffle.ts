// ponytail: tiny shared randomness helpers — Fisher-Yates + round-robin interleave.
// Used by the visual feed (fresh shuffle per reload) and the meme engine (interleaved
// insert order). One home for both so the two never drift apart.

/** In-place Fisher-Yates shuffle. `rand` is injectable so tests stay deterministic. */
export function shuffleInPlace<T>(items: T[], rand: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Spread items so the same key never clusters: shuffle within each key group, shuffle
 * the group order, then deal round-robin (group A, B, C… then A, B, C…). A repeat is
 * only adjacent when one group outnumbers all others combined (mathematically forced).
 */
export function interleaveRoundRobin<T>(items: T[], key: (item: T) => string, rand: () => number = Math.random): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item) || "";
    const g = groups.get(k) ?? [];
    g.push(item);
    groups.set(k, g);
  }
  const shuffled = [...groups.values()].map((g) => shuffleInPlace([...g], rand));
  shuffleInPlace(shuffled, rand);
  const out: T[] = [];
  let placed = true;
  while (placed) {
    placed = false;
    for (const g of shuffled) {
      const item = g.shift();
      if (item !== undefined) {
        out.push(item);
        placed = true;
      }
    }
  }
  return out;
}
