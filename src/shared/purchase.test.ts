import { describe, expect, it } from 'vitest';
import { purchaseFor, roundLeftover, toPackUnit } from './purchase';
import { buildShoppingList, usageOf } from './shopping';

describe('買う単位', () => {
  it('レシピの書き方を数える単位にそろえる', () => {
    expect(toPackUnit('キャベツ', { quantity: 2, unit: '枚' })).toBeCloseTo(0.1);
    expect(toPackUnit('キャベツ', { quantity: 0.25, unit: '個' })).toBe(0.25);
    expect(toPackUnit('大根', { quantity: null, unit: null, amountText: '5cm' })).toBeCloseTo(
      1 / 6,
    );
    expect(toPackUnit('牛乳', { quantity: 2, unit: 'カップ' })).toBe(400);
    expect(toPackUnit('白菜', { quantity: 1, unit: 'パック' })).toBeNull();
    expect(toPackUnit('玉ねぎ', { quantity: 1, unit: '個' })).toBeNull();
  });

  it('売っている量の倍数で、いちばん少なく済む買い方', () => {
    expect(purchaseFor('白菜', 0.3)).toMatchObject({ buy: 0.5, unit: '個' });
    expect(purchaseFor('白菜', 0.25)).toMatchObject({ buy: 0.25, leftover: 0 });
    expect(purchaseFor('なす', 4)).toMatchObject({ buy: 6, leftover: 2 });
    expect(purchaseFor('牛乳', 600)).toMatchObject({ buy: 1000, leftover: 400 });
    expect(purchaseFor('玉ねぎ', 1)).toBeNull();
    expect(roundLeftover('白菜', 0.175)).toBe(0.125);
    expect(roundLeftover('長ねぎ', 0.67)).toBe(0.75);
    expect(roundLeftover('なす', 1.4)).toBe(1);
    expect(roundLeftover('牛乳', 380)).toBe(400);
  });
});

describe('使い切りの目安', () => {
  const src = (date: string, recipeName: string, ings: [string, number, string][]) => ({
    recipeName,
    recipeServings: 2,
    date,
    ingredients: ings.map(([name, quantity, unit]) => ({
      name,
      quantity,
      unit,
      amountText: null,
      section: 'veg' as const,
    })),
  });

  it('2日以上で使う食材は使う日を、あまるときは買う量とあまりを出す', () => {
    const lines = buildShoppingList(
      [
        src('2026-10-19', '白菜の煮びたし', [['白菜', 4, '枚']]),
        src('2026-10-22', '豚と白菜の鍋', [['白菜', 0.125, '個']]),
        src('2026-10-20', '麻婆なす', [['なす', 2, '本']]),
      ],
      2,
    );
    const hakusai = lines.find((l) => l.name === '白菜')!;
    expect(hakusai.days).toEqual(['2026-10-19', '2026-10-22']);
    expect(hakusai.packNeed).toBeCloseTo(0.325);
    expect(usageOf(hakusai)).toEqual({
      days: ['2026-10-19', '2026-10-22'],
      buy: '1/2個',
      leftover: '1/8個',
    });
    // なすは1日だけ・3本袋で1本あまる
    expect(usageOf(lines.find((l) => l.name === 'なす')!)).toEqual({
      days: [],
      buy: '3本',
      leftover: '1本',
    });
  });

  it('ちょうど使い切れて1日だけなら何も出さない', () => {
    const lines = buildShoppingList([src('2026-10-19', 'a', [['白菜', 0.25, '個']])], 2);
    expect(usageOf(lines[0]!)).toBeNull();
  });
});
