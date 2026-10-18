import { describe, expect, it } from 'vitest';
import { SEED_RECIPES } from '../../../seed/recipes';
import { timeLevelFits } from '../constants';
import { weekDates } from '../date';
import {
  allocateGenres,
  budgetFits,
  estimateCost,
  generateWeek,
  includeSide,
  regenerate,
  type PlannerDay,
  type PlannerInput,
} from './index';
import { createRng } from './random';

const recipes = SEED_RECIPES;
const byId = new Map(recipes.map((r) => [r.id, r]));
const WEEK = weekDates('2026-10-19');

function days(
  patch: Partial<PlannerDay> | ((i: number) => Partial<PlannerDay>) = {},
): PlannerDay[] {
  return WEEK.map((date, i) => ({
    date,
    budgetLevel: 'normal',
    timeLevel: 'normal',
    sideMode: 'on',
    level: 'minori',
    ...(typeof patch === 'function' ? patch(i) : patch),
  }));
}

function input(over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    recipes,
    days: days(),
    ratio: { wa: 50, yo: 30, chu: 20 },
    weeklyBudget: 100_000,
    servings: 2,
    history: {},
    seed: 42,
    ...over,
  };
}

const mainsOf = (items: { slot: string; recipeId: string }[]) =>
  items.filter((i) => i.slot === 'main').map((i) => byId.get(i.recipeId)!);

describe('allocateGenres', () => {
  it('割合どおりに7日へ配分する（最大剰余法）', () => {
    const g = allocateGenres({ wa: 50, yo: 30, chu: 20 }, 7, createRng(1));
    const count = (x: string) => g.filter((y) => y === x).length;
    expect([count('wa'), count('yo'), count('chu')]).toEqual([4, 2, 1]);
  });
  it('0%のジャンルは出ない', () => {
    const g = allocateGenres({ wa: 0, yo: 100, chu: 0 }, 7, createRng(1));
    expect(new Set(g)).toEqual(new Set(['yo']));
  });
});

describe('generateWeek', () => {
  it('3品×7日を作り、同じ週にレシピが重複しない', () => {
    const res = generateWeek(input());
    expect(res.items).toHaveLength(21);
    expect(new Set(res.items.map((i) => i.recipeId)).size).toBe(21);
    expect(res.warnings).toEqual([]);
  });

  it('同じシードなら同じ献立になる（再現性）', () => {
    expect(generateWeek(input()).items).toEqual(generateWeek(input()).items);
    expect(generateWeek(input({ seed: 1 })).items).not.toEqual(
      generateWeek(input({ seed: 2 })).items,
    );
  });

  it('主菜のジャンルが割合に沿う', () => {
    const mains = mainsOf(generateWeek(input({ ratio: { wa: 0, yo: 0, chu: 100 } })).items);
    expect(mains.every((r) => r.genre === 'chu')).toBe(true);
  });

  it('汁物・副菜は主菜と同じジャンルが選ばれやすい', () => {
    let same = 0;
    let total = 0;
    for (let seed = 0; seed < 30; seed++) {
      const res = generateWeek(input({ seed }));
      for (const date of WEEK) {
        const main = res.items.find((i) => i.date === date && i.slot === 'main');
        const soup = res.items.find((i) => i.date === date && i.slot === 'soup');
        if (!main || !soup) continue;
        total++;
        if (byId.get(main.recipeId)!.genre === byId.get(soup.recipeId)!.genre) same++;
      }
    }
    expect(same / total).toBeGreaterThan(0.6);
  });

  it('時短の日は20分以内、節約の日は節約のレシピだけ', () => {
    const res = generateWeek(input({ days: days({ timeLevel: 'quick', budgetLevel: 'save' }) }));
    for (const it of res.items) {
      const r = byId.get(it.recipeId)!;
      expect(timeLevelFits('quick', r.timeMinutes) || res.warnings.length > 0, r.name).toBe(true);
      expect(budgetFits('save', r.costLevel) || res.warnings.length > 0, r.name).toBe(true);
    }
  });

  it('副菜は「なし」なら付かず、「自動」なら時短・節約の日だけ付かない', () => {
    const res = generateWeek(
      input({
        days: days((i) =>
          i === 0
            ? { sideMode: 'off' }
            : i === 1
              ? { sideMode: 'auto', timeLevel: 'quick' }
              : i === 2
                ? { sideMode: 'auto', budgetLevel: 'save' }
                : { sideMode: 'auto' },
        ),
      }),
    );
    const sideDates = res.items.filter((i) => i.slot === 'side').map((i) => i.date);
    expect(sideDates).not.toContain(WEEK[0]);
    expect(sideDates).not.toContain(WEEK[1]);
    expect(sideDates).not.toContain(WEEK[2]);
    expect(sideDates).toEqual(WEEK.slice(3));
    expect(includeSide({ ...days()[0]!, sideMode: 'auto' })).toBe(true);
  });

  it('主菜の主材料が連日続きにくい', () => {
    let repeats = 0;
    for (let seed = 0; seed < 30; seed++) {
      const mains = mainsOf(generateWeek(input({ seed })).items);
      for (let i = 1; i < mains.length; i++) {
        if (mains[i]!.mainIngredient === mains[i - 1]!.mainIngredient) repeats++;
      }
    }
    // 30週×6回の比較のうち、連続はごく少数
    expect(repeats / (30 * 6)).toBeLessThan(0.08);
  });

  it('直近に使ったレシピは選ばれにくい', () => {
    const first = generateWeek(input({ seed: 7 }));
    const history = Object.fromEntries(first.items.map((i) => [i.recipeId, 1]));
    let reused = 0;
    for (let seed = 100; seed < 120; seed++) {
      const next = generateWeek(input({ seed, history }));
      reused += next.items.filter((i) => history[i.recipeId]).length;
    }
    expect(reused / (20 * 21)).toBeLessThan(0.25);
  });

  it('予算を超えるときは安いレシピに置き換えて収めようとする', () => {
    const loose = generateWeek(input({ days: days({ budgetLevel: 'rich' }), seed: 3 }));
    const budget = Math.round(loose.estimatedCost * 0.75);
    const tight = generateWeek(
      input({ days: days({ budgetLevel: 'rich' }), seed: 3, weeklyBudget: budget }),
    );
    expect(tight.estimatedCost).toBeLessThan(loose.estimatedCost);
    expect(tight.estimatedCost).toBe(estimateCost(tight.items, recipes, 2));
    expect(tight.overBudget).toBe(tight.estimatedCost > budget);
    expect(new Set(tight.items.map((i) => i.recipeId)).size).toBe(tight.items.length);
  });

  it('到底無理な予算なら overBudget を返す', () => {
    const res = generateWeek(input({ weeklyBudget: 100 }));
    expect(res.overBudget).toBe(true);
  });

  it('人数に応じて費用が増える', () => {
    const two = generateWeek(input({ seed: 5 }));
    const four = generateWeek(input({ seed: 5, servings: 4 }));
    expect(four.items).toEqual(two.items);
    expect(four.estimatedCost).toBeGreaterThan(two.estimatedCost * 1.9);
  });

  describe('料理レベル', () => {
    it('ふたばの日はふたばのレシピだけ', () => {
      for (let seed = 0; seed < 20; seed++) {
        const res = generateWeek(input({ seed, days: days({ level: 'futaba' }) }));
        expect(res.items.every((i) => byId.get(i.recipeId)!.difficulty === 'futaba')).toBe(true);
      }
    });

    it('曜日ごとの上書き：土曜だけふたば', () => {
      const res = generateWeek(
        input({ days: days((i) => ({ level: i === 5 ? 'futaba' : 'minori' })) }),
      );
      const sat = res.items.filter((i) => i.date === WEEK[5]);
      expect(sat.every((i) => byId.get(i.recipeId)!.difficulty === 'futaba')).toBe(true);
    });

    it('みのりの日は手の込んだ料理が優先され、ふたばばかりにならない', () => {
      // じっくり・ゆとりの日（時間・予算で候補が偏らない条件）で比べる
      const d = days({ timeLevel: 'slow', budgetLevel: 'rich' });
      const pool = recipes.filter((r) => r.category === 'main');
      const baseline = pool.filter((r) => r.difficulty === 'minori').length / pool.length;
      let minori = 0;
      let total = 0;
      for (let seed = 0; seed < 60; seed++) {
        const mains = mainsOf(generateWeek(input({ seed, days: d })).items);
        total += mains.length;
        minori += mains.filter((r) => r.difficulty === 'minori').length;
      }
      // 候補に占めるみのりの割合（5割）より、はっきり多く選ばれる
      expect(minori / total).toBeGreaterThan(baseline + 0.05);
    });

    it('ふたばで候補が足りないときは条件をゆるめて埋め、理由を知らせる', () => {
      const res = generateWeek(
        input({
          days: days({ level: 'futaba', timeLevel: 'quick', budgetLevel: 'save' }),
          ratio: { wa: 0, yo: 100, chu: 0 },
        }),
      );
      expect(res.items.every((i) => byId.get(i.recipeId)!.difficulty === 'futaba')).toBe(true);
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(
        res.warnings.some((w) => w.includes('ゆるめました') || w.includes('くり返しました')),
      ).toBe(true);
    });

    it('ふたばの候補がまったくなければ空欄にして知らせる', () => {
      const onlyMinori = recipes
        .filter((r) => r.category !== 'side' || r.difficulty === 'minori')
        .map((r) => (r.category === 'side' ? r : r));
      const res = generateWeek(
        input({
          recipes: onlyMinori.filter((r) => !(r.category === 'side' && r.difficulty === 'futaba')),
          days: days({ level: 'futaba' }),
        }),
      );
      // 副菜はみのりしかないので、ふたばの日は付かない
      expect(res.items.some((i) => i.slot === 'side')).toBe(false);
      expect(res.warnings.some((w) => w.includes('見つかりませんでした'))).toBe(true);
    });
  });
});

describe('regenerate', () => {
  it('1日だけ作り直し、ほかの日は変えない。週内の重複も起きない', () => {
    const base = generateWeek(input());
    const res = regenerate(input({ seed: 99 }), base.items, WEEK[2]!);
    const others = (items: typeof base.items) => items.filter((i) => i.date !== WEEK[2]);
    expect(others(res.items)).toEqual(others(base.items));
    const before = base.items.filter((i) => i.date === WEEK[2]).map((i) => i.recipeId);
    const after = res.items.filter((i) => i.date === WEEK[2]).map((i) => i.recipeId);
    expect(after).toHaveLength(3);
    expect(after.some((id) => before.includes(id))).toBe(false);
    expect(new Set(res.items.map((i) => i.recipeId)).size).toBe(res.items.length);
  });

  it('品目だけ（主菜だけ）作り直せる。ジャンルは元の主菜に合わせる', () => {
    const base = generateWeek(input());
    const old = base.items.find((i) => i.date === WEEK[0] && i.slot === 'main')!;
    const res = regenerate(input({ seed: 7 }), base.items, WEEK[0]!, 'main');
    const next = res.items.find((i) => i.date === WEEK[0] && i.slot === 'main')!;
    expect(next.recipeId).not.toBe(old.recipeId);
    expect(byId.get(next.recipeId)!.genre).toBe(byId.get(old.recipeId)!.genre);
    expect(res.items.filter((i) => i.date === WEEK[0] && i.slot !== 'main')).toEqual(
      base.items.filter((i) => i.date === WEEK[0] && i.slot !== 'main'),
    );
  });

  it('副菜なしの日でも、副菜だけを指定すれば追加できる', () => {
    const base = generateWeek(input({ days: days({ sideMode: 'off' }) }));
    expect(base.items.some((i) => i.slot === 'side')).toBe(false);
    const res = regenerate(
      input({ days: days({ sideMode: 'off' }) }),
      base.items,
      WEEK[1]!,
      'side',
    );
    expect(res.items.filter((i) => i.slot === 'side').map((i) => i.date)).toEqual([WEEK[1]]);
  });

  it('ふたばの日の作り直しもふたばのみ', () => {
    const d = days({ level: 'futaba' });
    const base = generateWeek(input({ days: d }));
    const res = regenerate(input({ days: d, seed: 11 }), base.items, WEEK[4]!);
    expect(
      res.items
        .filter((i) => i.date === WEEK[4])
        .every((i) => byId.get(i.recipeId)!.difficulty === 'futaba'),
    ).toBe(true);
  });
});
