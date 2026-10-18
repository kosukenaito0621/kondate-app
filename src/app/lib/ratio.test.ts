import { describe, expect, it } from 'vitest';
import { cutsToRatio, moveCut, pickThumb, ratioToCuts } from './ratio';

describe('genre ratio slider math', () => {
  it('つまみ位置と割合は相互変換でき、合計は常に100', () => {
    const r = cutsToRatio(40, 75);
    expect(r).toEqual({ wa: 40, yo: 35, chu: 25 });
    expect(r.wa + r.yo + r.chu).toBe(100);
    expect(ratioToCuts(r)).toEqual([40, 75]);
  });

  it('5%刻みにスナップし、範囲外はクランプ', () => {
    expect(moveCut([40, 75], 0, 33)).toEqual([35, 75]);
    expect(moveCut([40, 75], 1, 140)).toEqual([40, 100]);
    expect(moveCut([40, 75], 0, -10)).toEqual([0, 75]);
  });

  it('もう一方のつまみを追い越さない', () => {
    expect(moveCut([40, 60], 0, 90)).toEqual([60, 60]);
    expect(moveCut([40, 60], 1, 10)).toEqual([40, 40]);
  });

  it('重なっているときは動かす方向でつまみを選ぶ', () => {
    expect(pickThumb([50, 50], 30)).toBe(0);
    expect(pickThumb([50, 50], 70)).toBe(1);
    expect(pickThumb([20, 80], 45)).toBe(0);
    expect(pickThumb([20, 80], 55)).toBe(1);
  });
});
