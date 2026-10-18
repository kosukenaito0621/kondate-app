import { describe, expect, it } from 'vitest';
import { buildShoppingList, lineAmount, type ShoppingSource } from './shopping';

const src = (
  recipeName: string,
  ingredients: ShoppingSource['ingredients'],
  recipeServings = 2,
): ShoppingSource => ({
  recipeName,
  recipeServings,
  ingredients,
});
const ing = (
  name: string,
  quantity: number | null,
  unit: string | null,
  section: ShoppingSource['ingredients'][number]['section'],
  amountText: string | null = null,
) => ({ name, quantity, unit, amountText, section });

describe('買い物リストの集計', () => {
  it('同じ材料は合算し、どの料理に使うかを残す（表記ゆれも統一）', () => {
    const list = buildShoppingList(
      [
        src('肉じゃが', [ing('玉ねぎ', 1, '個', 'veg'), ing('牛切り落とし肉', 150, 'g', 'meat')]),
        src('オニオンスープ', [ing('タマネギ', 2, '個', 'veg')]),
      ],
      2,
    );
    expect(list.find((l) => l.name === '玉ねぎ')).toMatchObject({
      quantity: 3,
      unit: '個',
      sources: ['肉じゃが', 'オニオンスープ'],
    });
  });

  it('調味料は除外し、「買う」に指定したものだけ残す。水は出さない', () => {
    const recipes = [
      src('照り焼き', [
        ing('鶏もも肉', 1, '枚', 'meat'),
        ing('しょうゆ', 2, '大さじ', 'seasoning'),
        ing('みりん', 2, '大さじ', 'seasoning'),
        ing('水', 100, 'ml', 'seasoning'),
      ]),
    ];
    expect(buildShoppingList(recipes, 2).map((l) => l.name)).toEqual(['鶏もも肉']);
    expect(buildShoppingList(recipes, 2, ['みりん']).map((l) => l.name)).toEqual([
      '鶏もも肉',
      'みりん',
    ]);
  });

  it('ご飯は家にある前提で出さない（買うに指定すれば出す）', () => {
    const r = [
      src('親子丼', [ing('ご飯', null, null, 'other', '2杯'), ing('卵', 3, '個', 'dairy_egg')]),
    ];
    expect(buildShoppingList(r, 2).map((l) => l.name)).toEqual(['卵']);
    expect(buildShoppingList(r, 2, ['ご飯']).map((l) => l.name)).toEqual(['卵', 'ご飯']);
  });

  it('g と kg、ml とカップ・大さじはそろえて足す', () => {
    const list = buildShoppingList(
      [
        src('A', [ing('豚こま切れ肉', 800, 'g', 'meat'), ing('牛乳', 1, 'カップ', 'dairy_egg')]),
        src('B', [ing('豚こま切れ肉', 0.2, 'kg', 'meat'), ing('牛乳', 100, 'ml', 'dairy_egg')]),
      ],
      2,
    );
    expect(lineAmount(list.find((l) => l.name === '豚こま切れ肉')!)).toBe('1kg');
    expect(lineAmount(list.find((l) => l.name === '牛乳')!)).toBe('300ml');
  });

  it('合算できない単位は併記する', () => {
    const list = buildShoppingList(
      [src('A', [ing('トマト', 1, '個', 'veg')]), src('B', [ing('トマト', 200, 'g', 'veg')])],
      2,
    );
    expect(lineAmount(list[0]!)).toBe('1個 + 200g');
  });

  it('少々などの表記は残す', () => {
    const list = buildShoppingList([src('A', [ing('パセリ', null, null, 'veg', '少々')])], 2);
    expect(lineAmount(list[0]!)).toBe('少々');
  });

  it('人数に合わせて換算する', () => {
    const list = buildShoppingList([src('A', [ing('鮭', 2, '切れ', 'fish')], 2)], 3);
    expect(list[0]).toMatchObject({ quantity: 3, unit: '切れ' });
  });

  it('売り場順（野菜→肉→魚→…）に並ぶ', () => {
    const list = buildShoppingList(
      [
        src('A', [
          ing('木綿豆腐', 1, '丁', 'soy'),
          ing('鮭', 2, '切れ', 'fish'),
          ing('キャベツ', 1, '個', 'veg'),
          ing('鶏もも肉', 1, '枚', 'meat'),
          ing('卵', 2, '個', 'dairy_egg'),
        ]),
      ],
      2,
    );
    expect(list.map((l) => l.section)).toEqual(['veg', 'meat', 'fish', 'dairy_egg', 'soy']);
  });

  it('分数で割り切れる量は分数表示', () => {
    const list = buildShoppingList([src('A', [ing('大根', 1 / 3, '本', 'veg')])], 2);
    expect(lineAmount(list[0]!)).toBe('1/3本');
  });
});
