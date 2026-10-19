import { describe, expect, it } from 'vitest';
import { isOutOfSeasonOnly, seasonBadge, seasonOf, seasonsFromIngredients } from './season';

describe('季節', () => {
  it('月から季節を決める（春3〜5／夏6〜8／秋9〜11／冬12〜2）', () => {
    expect(['2026-03-01', '2026-05-31', '2026-06-01', '2026-08-31'].map(seasonOf)).toEqual([
      'spring',
      'spring',
      'summer',
      'summer',
    ]);
    expect(['2026-09-01', '2026-11-30', '2026-12-01', '2027-02-28'].map(seasonOf)).toEqual([
      'autumn',
      'autumn',
      'winter',
      'winter',
    ]);
  });

  it('旬の材料から季節を推定する（通年の材料は数えない）', () => {
    expect(seasonsFromIngredients(['かぼちゃ', '玉ねぎ'])).toEqual(['autumn']);
    expect(seasonsFromIngredients(['菜の花', 'しめじ'])).toEqual(['spring', 'autumn']);
    expect(seasonsFromIngredients(['玉ねぎ', 'トマト', '大根'])).toEqual([]);
  });

  it('表示と、季節限定の判定', () => {
    expect(seasonBadge({ seasons: ['autumn'], seasonOnly: false })).toBe('秋が旬');
    expect(seasonBadge({ seasons: ['summer'], seasonOnly: true })).toBe('夏だけ');
    expect(seasonBadge({ seasons: [], seasonOnly: false })).toBeNull();
    expect(isOutOfSeasonOnly({ seasons: ['summer'], seasonOnly: true }, 'winter')).toBe(true);
    expect(isOutOfSeasonOnly({ seasons: ['summer'], seasonOnly: false }, 'winter')).toBe(false);
  });
});
