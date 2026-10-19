import { describe, expect, it } from 'vitest';
import { aiRecipeSchema, extractJson, toRecipeDraft } from './draft';

const base = {
  name: '豚の生姜焼き',
  category: 'main',
  genre: 'wa',
  servings: 2,
  timeMinutes: 15,
  costYen: 450,
  mainIngredient: 'pork',
  difficulty: 'futaba',
  ingredients: [
    { name: '豚ロース', amount: '250g', section: 'meat' },
    { name: 'タマネギ', amount: '1/2個', section: 'other' },
    { name: '醤油', amount: '大さじ2', section: 'other' },
  ],
  steps: [
    { text: '玉ねぎを切る', tip: '繊維に沿って' },
    { text: '肉を焼く', tip: '広げて焼く' },
  ],
  tags: ['#定番'],
};

describe('AI の結果を整える', () => {
  it('材料名をそろえ、区分は辞書を優先し、分量を読み取る', () => {
    const { draft, warnings } = toRecipeDraft(aiRecipeSchema.parse(base));
    expect(draft.ingredients).toEqual([
      {
        name: '豚ロース肉',
        section: 'meat',
        quantity: 250,
        unit: 'g',
        amountText: null,
        group: null,
      },
      { name: '玉ねぎ', section: 'veg', quantity: 0.5, unit: '個', amountText: null, group: null },
      {
        name: 'しょうゆ',
        section: 'seasoning',
        quantity: 2,
        unit: '大さじ',
        amountText: null,
        group: null,
      },
    ]);
    expect(draft.difficulty).toBe('futaba');
    expect(draft.tags).toEqual(['定番']);
    expect(warnings).toEqual([]);
  });

  it('材料名のかっこ書きは外してそろえる', () => {
    const { draft } = toRecipeDraft(
      aiRecipeSchema.parse({
        ...base,
        ingredients: [
          { name: 'ぶり（切り身）', amount: '2切れ', section: 'fish' },
          { name: 'タマネギ (中)', amount: '1個', section: 'veg' },
        ],
      }),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(['ぶり', '玉ねぎ']);
  });

  it('「A」「【B】」などのグループを読み取り、同じ調味料も別々に残す', () => {
    const { draft } = toRecipeDraft(
      aiRecipeSchema.parse({
        ...base,
        ingredients: [
          { name: '醤油', amount: '大さじ1', section: 'seasoning', group: 'A' },
          { name: 'みりん', amount: '大さじ1', section: 'seasoning', group: 'A' },
          { name: '醤油', amount: '小さじ1', section: 'seasoning', group: '【B】' },
          { name: '塩', amount: '少々', section: 'seasoning', group: '' },
        ],
      }),
    );
    expect(draft.ingredients.map((i) => [i.name, i.group, i.quantity])).toEqual([
      ['しょうゆ', 'A', 1],
      ['みりん', 'A', 1],
      ['しょうゆ', 'B', 1],
      ['塩', null, null],
    ]);
  });

  it('揚げ物や手順が多いレシピはわかばにしない', () => {
    const fried = toRecipeDraft(
      aiRecipeSchema.parse({ ...base, steps: [{ text: '170℃の油で揚げる', tip: 'x' }] }),
    );
    expect(fried.draft.difficulty).toBe('minori');
    expect(fried.draft.tags).toContain('揚げ物');

    const long = toRecipeDraft(
      aiRecipeSchema.parse({
        ...base,
        steps: Array.from({ length: 7 }, (_, i) => ({ text: `手順${i}`, tip: 'x' })),
      }),
    );
    expect(long.draft.difficulty).toBe('minori');
    expect(long.warnings[0]).toMatch(/🌾/);
  });

  it('わかばでコツが空の手順があれば知らせる', () => {
    const r = toRecipeDraft(aiRecipeSchema.parse({ ...base, steps: [{ text: '焼く' }] }));
    expect(r.warnings.some((w) => w.includes('コツ'))).toBe(true);
  });

  it('不正な値は既定値に置き換える', () => {
    const parsed = aiRecipeSchema.parse({
      ...base,
      category: '主菜',
      genre: 'japanese',
      servings: '4',
    });
    expect(parsed).toMatchObject({ category: 'main', genre: 'wa', servings: 4 });
  });
});

describe('extractJson', () => {
  it('前後の説明文やコードブロックを取り除く', () => {
    expect(extractJson('はい、こちらです。\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('結果: {"a": {"b": 2}} 以上')).toEqual({ a: { b: 2 } });
    expect(extractJson({ a: 1 })).toEqual({ a: 1 });
    expect(extractJson('JSONではない')).toBeNull();
  });
});
