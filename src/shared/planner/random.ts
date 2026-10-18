/** シード付き乱数（mulberry32）。テストで結果を再現できるようにする */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 重み付きで1つ選ぶ（重みがすべて0なら undefined） */
export function weightedPick<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rng: () => number,
): T | undefined {
  const ws = items.map(weight);
  const total = ws.reduce((s, w) => s + w, 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
