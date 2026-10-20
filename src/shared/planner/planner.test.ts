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
  reuseFactor,
  stockFactor,
  type PerishableUse,
  type PlannerDay,
  type PlannerInput,
} from './index';
import { createRng } from './random';
import { isPacked, toPackUnit } from '../purchase';

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

  it('汁物・副菜は主菜と同じジャンル（和洋中）にそろえる', () => {
    for (let seed = 0; seed < 30; seed++) {
      const res = generateWeek(input({ seed }));
      for (const date of WEEK) {
        const main = res.items.find((i) => i.date === date && i.slot === 'main');
        if (!main) continue;
        const genre = byId.get(main.recipeId)!.genre;
        for (const it of res.items.filter((i) => i.date === date && i.slot !== 'main')) {
          expect(byId.get(it.recipeId)!.genre, `seed ${seed} ${date}`).toBe(genre);
        }
      }
    }
  });

  it('同じジャンルの汁物がなければ、ほかのジャンルから選んで知らせる', () => {
    const noChuSoup = recipes.filter((r) => !(r.category === 'soup' && r.genre === 'chu'));
    const res = generateWeek(input({ recipes: noChuSoup, ratio: { wa: 0, yo: 0, chu: 100 } }));
    expect(res.items.filter((i) => i.slot === 'soup')).toHaveLength(7);
    expect(res.warnings.some((w) => w.includes('ジャンルの条件をゆるめました'))).toBe(true);
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
    it('わかばの日はわかばのレシピだけ', () => {
      for (let seed = 0; seed < 20; seed++) {
        const res = generateWeek(input({ seed, days: days({ level: 'futaba' }) }));
        expect(res.items.every((i) => byId.get(i.recipeId)!.difficulty === 'futaba')).toBe(true);
      }
    });

    it('曜日ごとの上書き：土曜だけわかば', () => {
      const res = generateWeek(
        input({ days: days((i) => ({ level: i === 5 ? 'futaba' : 'minori' })) }),
      );
      const sat = res.items.filter((i) => i.date === WEEK[5]);
      expect(sat.every((i) => byId.get(i.recipeId)!.difficulty === 'futaba')).toBe(true);
    });

    it('みのりの日は手の込んだ料理が優先され、わかばばかりにならない', () => {
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

    it('わかばで候補が足りないときは条件をゆるめて埋め、理由を知らせる', () => {
      // 初期の110品（各カテゴリ×ジャンルの20番目まで）だけで、候補が足りない状況を作る
      const few = recipes.filter((r) => Number(r.id.slice(-2)) <= 20);
      const res = generateWeek(
        input({
          recipes: few,
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

    it('わかばの候補がまったくなければ空欄にして知らせる', () => {
      const onlyMinori = recipes
        .filter((r) => r.category !== 'side' || r.difficulty === 'minori')
        .map((r) => (r.category === 'side' ? r : r));
      const res = generateWeek(
        input({
          recipes: onlyMinori.filter((r) => !(r.category === 'side' && r.difficulty === 'futaba')),
          days: days({ level: 'futaba' }),
        }),
      );
      // 副菜はみのりしかないので、わかばの日は付かない
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

  it('わかばの日の作り直しもわかばのみ', () => {
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

describe('季節', () => {
  const summerOnly = recipes.map((r) =>
    r.id === 'sys-main-yo-01' ? { ...r, seasons: ['summer' as const], seasonOnly: true } : r,
  );
  const winterDays = weekDates('2026-12-07').map((date) => ({ ...days()[0]!, date }));
  const summerDays = weekDates('2026-07-06').map((date) => ({ ...days()[0]!, date }));

  it('季節限定のレシピは、季節外の献立に出ない', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = generateWeek(input({ recipes: summerOnly, days: winterDays, seed }));
      expect(r.items.some((i) => i.recipeId === 'sys-main-yo-01')).toBe(false);
    }
  });

  it('季節限定のレシピも、その季節なら出る', () => {
    const seen = Array.from({ length: 40 }, (_, k) =>
      generateWeek(input({ recipes: summerOnly, days: summerDays, seed: k + 1 })),
    ).some((r) => r.items.some((i) => i.recipeId === 'sys-main-yo-01'));
    expect(seen).toBe(true);
  });

  it('旬のレシピは、その季節に出やすい', () => {
    const autumn = weekDates('2026-10-19').map((date) => ({ ...days()[0]!, date }));
    const spring = weekDates('2026-04-06').map((date) => ({ ...days()[0]!, date }));
    const autumnIds = new Set(recipes.filter((r) => r.seasons.includes('autumn')).map((r) => r.id));
    expect(autumnIds.size).toBeGreaterThan(0);
    const count = (ds: PlannerDay[]) =>
      Array.from({ length: 60 }, (_, k) => generateWeek(input({ days: ds, seed: k + 1 }))).reduce(
        (n, r) => n + r.items.filter((i) => autumnIds.has(i.recipeId)).length,
        0,
      );
    expect(count(autumn)).toBeGreaterThan(count(spring) * 1.5);
  });

  it('季節限定しか候補がなければ、季節外でも使って知らせる', () => {
    const only = recipes
      .filter((r) => r.category !== 'main' || r.id === 'sys-main-yo-01')
      .map((r) =>
        r.id === 'sys-main-yo-01' ? { ...r, seasons: ['summer' as const], seasonOnly: true } : r,
      );
    const r = generateWeek(
      input({ recipes: only, days: winterDays.slice(0, 1), ratio: { wa: 0, yo: 100, chu: 0 } }),
    );
    expect(r.items.find((i) => i.slot === 'main')?.recipeId).toBe('sys-main-yo-01');
    expect(r.warnings.join()).toContain('季節外');
  });
});

describe('外食・テイクアウトの日', () => {
  it('お休みの日は献立を作らず、ジャンルは料理する日に割り当てる', () => {
    const res = generateWeek(
      input({
        days: days((i) => ({ off: i === 4 || i === 6 })),
        ratio: { wa: 100, yo: 0, chu: 0 },
      }),
    );
    expect(res.items.some((it) => it.date === WEEK[4] || it.date === WEEK[6])).toBe(false);
    const mains = mainsOf(res.items);
    expect(mains).toHaveLength(5);
    expect(mains.every((r) => r.genre === 'wa')).toBe(true);
  });

  it('お休みの日を作り直しても、何も足さない', () => {
    const base = input();
    const week = generateWeek(base);
    const off = { ...base, days: base.days.map((d, i) => (i === 2 ? { ...d, off: true } : d)) };
    const res = regenerate(off, week.items, WEEK[2]!);
    expect(res.items.some((it) => it.date === WEEK[2])).toBe(false);
  });
});
describe('在庫を使う料理を出やすくする', () => {
  const stock = {
    items: [
      { name: '鶏もも肉', expiresOn: '2026-10-21' },
      { name: '玉ねぎ', expiresOn: null },
    ],
    ingredients: { a: ['鶏もも肉', '玉ねぎ'], b: ['玉ねぎ'], c: ['豚肉'] },
  };

  it('在庫の食材を使うほど重く、期限が近いとさらに重い', () => {
    const none = new Map<string, number>();
    expect(stockFactor(stock, none, 'c', '2026-10-20')).toBe(1);
    expect(stockFactor(stock, none, 'b', '2026-10-20')).toBeCloseTo(1.6);
    expect(stockFactor(stock, none, 'a', '2026-10-20')).toBeCloseTo(1 + 0.6 + 1.5 + 0.6);
    expect(stockFactor(undefined, none, 'a', '2026-10-20')).toBe(1);
  });

  it('期限を過ぎた日には効かせず、同じ週で使った食材は効きを弱める', () => {
    expect(stockFactor(stock, new Map(), 'a', '2026-10-23')).toBeCloseTo(1.6);
    expect(stockFactor(stock, new Map([['玉ねぎ', 1]]), 'b', '2026-10-20')).toBeCloseTo(1.3);
  });

  it('在庫の食材を使うレシピが選ばれやすくなる', () => {
    const mains = recipes.filter((r) => r.category === 'main');
    const target = mains[0]!;
    const count = (withStock: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const res = generateWeek({
          ...input(),
          seed,
          stock: withStock
            ? {
                items: [{ name: '在庫の食材', expiresOn: null }],
                ingredients: { [target.id]: ['在庫の食材'] },
              }
            : undefined,
        });
        if (res.items.some((i) => i.recipeId === target.id)) n++;
      }
      return n;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });
});

describe('買った食材を使い切る', () => {
  it('あまった分で足りる料理は重く、新しく買って大きくあまる料理は軽い', () => {
    const left = new Map([['白菜', 0.25]]);
    expect(reuseFactor([{ name: '白菜', amount: 0.125 }], left, 1)).toBe(2.5);
    // 1/4個から売るので 0.05個だけ使うと大半があまる
    expect(reuseFactor([{ name: 'キャベツ', amount: 0.05 }], new Map(), 1)).toBeCloseTo(
      1 - 0.5 * (0.45 / 0.5),
    );
    expect(reuseFactor([{ name: '白菜', amount: 0.25 }], new Map(), 1)).toBe(1);
    expect(reuseFactor([{ name: 'ニラ', amount: null }], new Map([['ニラ', 0]]), 1)).toBe(1.5);
    expect(reuseFactor(undefined, left, 1)).toBe(1);
  });

  it('使い切りを考えると、1週間で買う傷みやすい食材の種類とあまりが減る', () => {
    const perishables: Record<string, PerishableUse[]> = {};
    for (const r of recipes) {
      const uses = r.ingredients
        .filter((i) => isPacked(i.name))
        .map((i) => ({
          name: i.name,
          amount: toPackUnit(i.name, { ...i, amountText: i.amountText ?? null }),
        }));
      if (uses.length) perishables[r.id] = uses;
    }
    const kinds = (withReuse: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const res = generateWeek(input({ seed, perishables: withReuse ? perishables : undefined }));
        const names = new Set(
          res.items.flatMap((it) => (perishables[it.recipeId] ?? []).map((u) => u.name)),
        );
        n += names.size;
      }
      return n;
    };
    expect(kinds(true)).toBeLessThan(kinds(false));
  });
});
