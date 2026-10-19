import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  GENRES,
  LEVELS,
  TIME_LEVELS,
  timeLevelFits,
  type Category,
  type CostLevel,
  type Genre,
} from '../src/shared/constants';
import { FUTABA_RULES } from '../src/shared/levels';
import { recipeInputSchema } from '../src/shared/recipe';
import { SEED_RECIPES } from './recipes';

const EXPECTED: Record<Category, Record<Genre, number>> = {
  main: { wa: 50, yo: 50, chu: 50 },
  soup: { wa: 23, yo: 23, chu: 24 },
  side: { wa: 10, yo: 10, chu: 26 },
};

const of = (category: Category, genre?: Genre) =>
  SEED_RECIPES.filter((r) => r.category === category && (!genre || r.genre === genre));

/** 予算の段階：その日の段階以下のレシピが選べる（節約の日は節約のみ） */
const budgetFits = (day: CostLevel, recipe: CostLevel) =>
  LEVELS.indexOf(recipe) <= LEVELS.indexOf(day);

describe('初期レシピ', () => {
  it('合計件数が指定どおり', () => {
    const total = Object.values(EXPECTED)
      .flatMap((g) => Object.values(g))
      .reduce((a, b) => a + b, 0);
    expect(SEED_RECIPES).toHaveLength(total);
  });

  it.each(CATEGORIES.flatMap((c) => GENRES.map((g) => [c, g] as const)))(
    '%s × %s の件数が指定どおり',
    (category, genre) => {
      expect(of(category, genre)).toHaveLength(EXPECTED[category][genre]);
    },
  );

  it('料理名とIDに重複がない', () => {
    expect(new Set(SEED_RECIPES.map((r) => r.name)).size).toBe(SEED_RECIPES.length);
    expect(new Set(SEED_RECIPES.map((r) => r.id)).size).toBe(SEED_RECIPES.length);
  });

  it('すべて入力スキーマに合格する（材料・手順・時間・費用あり）', () => {
    for (const r of SEED_RECIPES) {
      const result = recipeInputSchema.safeParse(r);
      expect(result.success, `${r.name}: ${result.error?.message}`).toBe(true);
      expect(r.ingredients.length, r.name).toBeGreaterThan(0);
      expect(r.steps.length, r.name).toBeGreaterThan(0);
    }
  });

  it('材料の分量が読み取れている（数量か「少々」などの表記がある）', () => {
    for (const r of SEED_RECIPES) {
      for (const i of r.ingredients) {
        expect(i.quantity !== null || i.amountText !== null, `${r.name} / ${i.name}`).toBe(true);
      }
    }
  });

  it('主菜は主材料が偏らない（6種類以上・豚は25%以下）', () => {
    expect(new Set(of('main').map((r) => r.mainIngredient)).size).toBeGreaterThanOrEqual(6);
    const pork = of('main').filter((r) => r.mainIngredient === 'pork').length;
    expect(pork / of('main').length).toBeLessThanOrEqual(0.25);
  });

  it('季節限定のレシピには季節がある', () => {
    for (const r of SEED_RECIPES.filter((r) => r.seasonOnly))
      expect(r.seasons.length, r.name).toBeGreaterThan(0);
  });

  describe('料理レベル', () => {
    it.each(CATEGORIES.flatMap((c) => GENRES.map((g) => [c, g] as const)))(
      '%s × %s でふたばが4割以上',
      (category, genre) => {
        const list = of(category, genre);
        const futaba = list.filter((r) => r.difficulty === 'futaba').length;
        expect(futaba / list.length).toBeGreaterThanOrEqual(0.4);
      },
    );

    it('ふたばは基準を満たす（手順5つ以内・全手順にコツ・材料7品目以内・揚げ物なし）', () => {
      for (const r of SEED_RECIPES.filter((r) => r.difficulty === 'futaba')) {
        expect(r.steps.length, r.name).toBeLessThanOrEqual(FUTABA_RULES.maxSteps);
        expect(
          r.steps.every((s) => s.tip),
          `${r.name}: コツのない手順がある`,
        ).toBe(true);
        const items = r.ingredients.filter((i) => i.section !== 'seasoning').length;
        expect(items, r.name).toBeLessThanOrEqual(FUTABA_RULES.maxIngredients);
        for (const tag of FUTABA_RULES.excludedTags) expect(r.tags, r.name).not.toContain(tag);
      }
    });

    it('揚げ物タグはみのりだけ', () => {
      for (const r of SEED_RECIPES.filter((r) => r.tags.includes('揚げ物'))) {
        expect(r.difficulty, r.name).toBe('minori');
      }
    });
  });

  describe('どの曜日設定でも候補が残る', () => {
    const combos = GENRES.flatMap((g) =>
      TIME_LEVELS.flatMap((t) => LEVELS.map((b) => [g, t, b] as const)),
    );

    it.each(combos)('主菜 %s / 時間:%s / 予算:%s に2件以上', (genre, time, budget) => {
      const hits = of('main', genre).filter(
        (r) => timeLevelFits(time, r.timeMinutes) && budgetFits(budget, r.costLevel),
      );
      expect(hits.length).toBeGreaterThanOrEqual(2);
    });

    it.each(combos)('ふたばの主菜 %s / 時間:%s / 予算:%s に1件以上', (genre, time, budget) => {
      const hits = of('main', genre).filter(
        (r) =>
          r.difficulty === 'futaba' &&
          timeLevelFits(time, r.timeMinutes) &&
          budgetFits(budget, r.costLevel),
      );
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });

    it.each(['soup', 'side'] as const)('%s は時短・節約でも各ジャンルに候補がある', (category) => {
      for (const g of GENRES) {
        const hits = of(category, g).filter(
          (r) => timeLevelFits('quick', r.timeMinutes) && r.costLevel === 'save',
        );
        expect(hits.length, `${category} ${g}`).toBeGreaterThanOrEqual(1);
      }
    });

    it('調理時間と費用がばらけている', () => {
      const mains = of('main');
      for (const t of TIME_LEVELS) {
        const n = mains.filter(
          (r) => timeLevelFits(t, r.timeMinutes) && (t === 'quick' || r.timeMinutes > 20),
        ).length;
        expect(n, t).toBeGreaterThan(5);
      }
      for (const lv of LEVELS) {
        expect(mains.filter((r) => r.costLevel === lv).length, lv).toBeGreaterThan(5);
      }
    });
  });
});
