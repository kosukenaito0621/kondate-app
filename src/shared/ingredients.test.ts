import { describe, expect, it } from 'vitest';
import { normalizeIngredientName, sectionOf } from './ingredients';

describe('材料名の正規化', () => {
  it.each([
    ['たまねぎ', '玉ねぎ'],
    ['タマネギ', '玉ねぎ'],
    ['玉葱', '玉ねぎ'],
    ['人参', 'にんじん'],
    ['ニンジン', 'にんじん'],
    ['豚こま', '豚こま切れ肉'],
    ['醤油', 'しょうゆ'],
    ['ｼｮｳｶﾞ', 'しょうが'], // 半角カナ
    [' 鶏モモ肉 ', '鶏もも肉'],
    ['海老', 'えび'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeIngredientName(raw)).toBe(expected);
  });

  it('辞書にない材料はそのまま（全角英数・空白だけ整える）', () => {
    expect(normalizeIngredientName(' ドラゴンフルーツ ')).toBe('ドラゴンフルーツ');
    expect(normalizeIngredientName('ＡＢＣソース')).toBe('ABCソース');
  });

  it('区分を引ける', () => {
    expect(sectionOf('タマネギ')).toBe('veg');
    expect(sectionOf('豚バラ')).toBe('meat');
    expect(sectionOf('しょう油')).toBe('seasoning');
    expect(sectionOf('絹豆腐')).toBe('soy');
    expect(sectionOf('ドラゴンフルーツ')).toBeUndefined();
  });
});
