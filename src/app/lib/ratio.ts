export type GenreRatio = { wa: number; yo: number; chu: number };

/** 2つのつまみ位置（0≤a≤b≤100）→ 割合 */
export function cutsToRatio(a: number, b: number): GenreRatio {
  return { wa: a, yo: b - a, chu: 100 - b };
}

/** 割合 → 2つのつまみ位置 */
export function ratioToCuts(r: GenreRatio): [number, number] {
  return [r.wa, r.wa + r.yo];
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * つまみ thumb を pct に動かした新しい位置。
 * もう一方のつまみを追い越さない（重なりは可＝そのジャンル 0%）。
 */
export function moveCut(
  cuts: [number, number],
  thumb: 0 | 1,
  pct: number,
  step = 5,
): [number, number] {
  const [a, b] = cuts;
  const v = snap(clamp(pct, 0, 100), step);
  return thumb === 0 ? [clamp(v, 0, b), b] : [a, clamp(v, a, 100)];
}

/** ポインタ位置からどちらのつまみを動かすか（重なっているときは動かす方向で決める） */
export function pickThumb(cuts: [number, number], pct: number): 0 | 1 {
  const [a, b] = cuts;
  if (a === b) return pct < a ? 0 : 1;
  return Math.abs(pct - a) <= Math.abs(pct - b) ? 0 : 1;
}
