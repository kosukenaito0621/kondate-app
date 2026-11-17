import { describe, expect, it } from 'vitest';
import { cropRect } from './crop';

describe('cropRect', () => {
  it('小さい写真は引き伸ばさない', () => {
    expect(cropRect({ x: 100, y: 0, width: 900, height: 900 }, 1200, 900, 1600)).toEqual({
      sx: 100,
      sy: 0,
      sw: 900,
      sh: 900,
      w: 900,
      h: 900,
    });
  });

  it('大きい写真は長辺1600に縮める（縦長の写真）', () => {
    const r = cropRect({ x: 0, y: 500, width: 3000, height: 3000 }, 3000, 4000, 1600);
    expect(r).toMatchObject({ sx: 0, sy: 500, sw: 3000, sh: 3000, w: 1600, h: 1600 });
  });

  it('はみ出した範囲は画像の中に収め、正方形を保つ', () => {
    const r = cropRect({ x: -3.4, y: 10.6, width: 1000.7, height: 1000.7 }, 1000, 1200, 1600);
    expect(r.sx).toBe(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(1000);
    expect(r.sy + r.sh).toBeLessThanOrEqual(1200);
    expect(r.sw).toBe(r.sh);
    expect(r.w).toBe(r.h);
  });
});
