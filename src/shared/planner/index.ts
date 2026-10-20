import {
  CATEGORY_LABEL,
  GENRES,
  LEVELS,
  timeLevelFits,
  type Category,
  type CostLevel,
  type Genre,
  type MainIngredient,
  type TimeLevel,
} from '../constants';
import { WEEKDAY_LABELS, weekdayIndex } from '../date';
import { MINORI_PREFERENCE_WEIGHT, type CookingLevel } from '../levels';
import { isInSeason, isOutOfSeasonOnly, seasonOf, type Season } from '../season';
import { createRng, shuffle, weightedPick } from './random';

export type Slot = Category;
export const SLOTS: readonly Slot[] = ['main', 'soup', 'side'];

export type PlannerRecipe = {
  id: string;
  category: Category;
  genre: Genre;
  timeMinutes: number;
  costYen: number;
  servings: number;
  costLevel: CostLevel;
  mainIngredient: MainIngredient;
  difficulty: CookingLevel;
  /** 旬・季節限定の季節（空なら通年） */
  seasons: Season[];
  /** 季節限定（季節外は出さない） */
  seasonOnly: boolean;
};

export type SideMode = 'auto' | 'on' | 'off';

export type PlannerDay = {
  date: string;
  budgetLevel: CostLevel;
  timeLevel: TimeLevel;
  sideMode: SideMode;
  /** グループ既定と曜日の上書きを解決済みのレベル */
  level: CookingLevel;
  /** 外食・テイクアウトの日は献立を作らない（省略時は料理する） */
  off?: boolean;
};

export type PlanItem = { date: string; slot: Slot; recipeId: string };

export type GenreRatio = { wa: number; yo: number; chu: number };

export type PlannerInput = {
  recipes: readonly PlannerRecipe[];
  days: readonly PlannerDay[];
  ratio: GenreRatio;
  weeklyBudget: number;
  servings: number;
  /** recipeId → 何週前に使ったか（1〜3） */
  history: Readonly<Record<string, number>>;
  /** うちの在庫（あれば、在庫を使う料理を出やすくする） */
  stock?: PlannerStock;
  seed: number;
};

export type PlannerStock = {
  /** 在庫にある食材（正規化した名前）と、いちばん近い期限 */
  items: readonly { name: string; expiresOn: string | null }[];
  /** recipeId → 使う食材の名前（調味料などを除く） */
  ingredients: Readonly<Record<string, readonly string[]>>;
};

export type PlanResult = {
  items: PlanItem[];
  estimatedCost: number;
  overBudget: boolean;
  warnings: string[];
};

// ===== 重み =====

/** 直近に使ったレシピは選ばれにくくする */
const HISTORY_FACTOR: Record<number, number> = { 1: 0.15, 2: 0.35, 3: 0.6 };
/** 主菜の主材料が前後の日と同じなら選ばれにくくする */
const SAME_MAIN_INGREDIENT_FACTOR = 0.1;
/** 旬のレシピは出やすく、旬でない季節は少し出にくくする */
const IN_SEASON_FACTOR = 2;
const OFF_SEASON_FACTOR = 0.5;
/** 在庫の食材を使う料理は出やすく。期限が近い（3日以内）ものはさらに */
const STOCK_BONUS = 0.6;
const STOCK_URGENT_BONUS = 1.5;
const STOCK_URGENT_DAYS = 3;
const STOCK_FACTOR_MAX = 4;

/**
 * 在庫による重み。食材ごとに足し、同じ週ですでに使った食材は効きを弱める（1品で使い切る想定）。
 * 期限を過ぎた日には効かせない。
 */
export function stockFactor(
  stock: PlannerStock | undefined,
  stockUses: ReadonlyMap<string, number>,
  recipeId: string,
  date: string,
): number {
  const names = stock?.ingredients[recipeId];
  if (!stock || !names?.length) return 1;
  let bonus = 0;
  for (const name of names) {
    const item = stock.items.find((i) => i.name === name);
    if (!item) continue;
    if (item.expiresOn && item.expiresOn < date) continue;
    let b = STOCK_BONUS;
    if (item.expiresOn && daysBetween(date, item.expiresOn) <= STOCK_URGENT_DAYS)
      b += STOCK_URGENT_BONUS;
    bonus += b / (1 + (stockUses.get(name) ?? 0));
  }
  return Math.min(1 + bonus, STOCK_FACTOR_MAX);
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** 副菜を付けるか（自動なら、時短か節約の日は付けない） */
export function includeSide(day: PlannerDay): boolean {
  if (day.sideMode === 'on') return true;
  if (day.sideMode === 'off') return false;
  return day.timeLevel !== 'quick' && day.budgetLevel !== 'save';
}

/** その日の予算段階以下のレシピを選ぶ（節約の日は節約のみ） */
export const budgetFits = (day: CostLevel, recipe: CostLevel) =>
  LEVELS.indexOf(recipe) <= LEVELS.indexOf(day);

export function recipeCost(r: PlannerRecipe, servings: number) {
  return Math.round((r.costYen * servings) / r.servings);
}

/** 主菜のジャンルを割合どおりに7日へ配分（最大剰余法）してシャッフル */
export function allocateGenres(ratio: GenreRatio, days: number, rng: () => number): Genre[] {
  const total = ratio.wa + ratio.yo + ratio.chu || 1;
  const exact = GENRES.map((g) => ({ g, v: (ratio[g] / total) * days }));
  const counts = exact.map((e) => ({ g: e.g, n: Math.floor(e.v), rem: e.v - Math.floor(e.v) }));
  let left = days - counts.reduce((s, c) => s + c.n, 0);
  for (const c of [...counts].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    if (ratio[c.g] > 0) {
      c.n++;
      left--;
    }
  }
  return shuffle(
    counts.flatMap((c) => Array<Genre>(c.n).fill(c.g)),
    rng,
  );
}

// ===== 条件のゆるめ方 =====

type Relax = {
  time: boolean;
  budget: boolean;
  genre: boolean;
  /** 季節限定のレシピを季節外にも使わない */
  season: boolean;
  dup: boolean;
  reason: string | null;
};

/** 候補がないとき、上から順に条件をゆるめる。料理レベル（わかばの日はわかばのみ）はゆるめない */
const RELAX_STEPS: Relax[] = [
  { time: true, budget: true, genre: true, season: true, dup: false, reason: null },
  {
    time: false,
    budget: true,
    genre: true,
    season: true,
    dup: false,
    reason: '調理時間の条件をゆるめました',
  },
  {
    time: false,
    budget: false,
    genre: true,
    season: true,
    dup: false,
    reason: '予算の条件をゆるめました',
  },
  {
    time: false,
    budget: false,
    genre: false,
    season: true,
    dup: false,
    reason: 'ジャンルの条件をゆるめました',
  },
  {
    time: false,
    budget: false,
    genre: false,
    season: true,
    dup: true,
    reason: '同じ週のレシピをくり返しました',
  },
  {
    time: false,
    budget: false,
    genre: false,
    season: false,
    dup: true,
    reason: '季節外のレシピも使いました',
  },
];

type PickContext = {
  recipes: readonly PlannerRecipe[];
  history: Readonly<Record<string, number>>;
  used: Set<string>;
  rng: () => number;
  stock?: PlannerStock;
  /** 在庫の食材を、この週で何品に使ったか */
  stockUses: Map<string, number>;
};

/** 選んだレシピを使用済みにし、使う在庫を数える */
function markUsed(ctx: PickContext, recipe: PlannerRecipe) {
  ctx.used.add(recipe.id);
  for (const name of ctx.stock?.ingredients[recipe.id] ?? [])
    if (ctx.stock?.items.some((i) => i.name === name))
      ctx.stockUses.set(name, (ctx.stockUses.get(name) ?? 0) + 1);
}

function dayLabel(date: string) {
  return `${WEEKDAY_LABELS[weekdayIndex(date)]}曜`;
}

function pick(
  ctx: PickContext,
  day: PlannerDay,
  slot: Slot,
  opts: { genre?: Genre; mainGenre?: Genre; neighborIngredients: MainIngredient[] },
): { recipe: PlannerRecipe | undefined; warning: string | null } {
  const season = seasonOf(day.date);
  const pool = ctx.recipes.filter(
    (r) => r.category === slot && (day.level === 'minori' || r.difficulty === 'futaba'),
  );
  // 主菜は割り当てたジャンル、汁物・副菜は主菜と同じジャンルにそろえる
  const genre = slot === 'main' ? opts.genre : opts.mainGenre;
  for (const step of RELAX_STEPS) {
    const candidates = pool.filter(
      (r) =>
        (step.dup || !ctx.used.has(r.id)) &&
        (!step.season || !isOutOfSeasonOnly(r, season)) &&
        (!step.time || timeLevelFits(day.timeLevel, r.timeMinutes)) &&
        (!step.budget || budgetFits(day.budgetLevel, r.costLevel)) &&
        (!step.genre || !genre || r.genre === genre),
    );
    const baseWeight = (r: PlannerRecipe) => {
      let w = HISTORY_FACTOR[ctx.history[r.id] ?? 0] ?? 1;
      if (
        slot === 'main' &&
        r.mainIngredient !== 'veg' &&
        r.mainIngredient !== 'other' &&
        opts.neighborIngredients.includes(r.mainIngredient)
      ) {
        w *= SAME_MAIN_INGREDIENT_FACTOR;
      }
      if (day.level === 'minori' && r.difficulty === 'minori') w *= MINORI_PREFERENCE_WEIGHT;
      if (isInSeason(r, season)) w *= IN_SEASON_FACTOR;
      else if (r.seasons.length > 0) w *= OFF_SEASON_FACTOR;
      w *= stockFactor(ctx.stock, ctx.stockUses, r.id, day.date);
      return w;
    };
    const recipe = weightedPick(candidates, baseWeight, ctx.rng);
    if (recipe) {
      const warning = step.reason
        ? `${dayLabel(day.date)}の${CATEGORY_LABEL[slot]}は${day.level === 'futaba' ? 'わかばの' : ''}候補が少ないため、${step.reason}`
        : null;
      return { recipe, warning };
    }
  }
  return {
    recipe: undefined,
    warning: `${dayLabel(day.date)}の${CATEGORY_LABEL[slot]}に合うレシピが見つかりませんでした。レシピを追加するか、曜日の設定を見直してください`,
  };
}

/** 1日分（または1品）を選ぶ。prev/next は前後の日の主菜（主材料の連続を避ける） */
function planDay(
  ctx: PickContext,
  day: PlannerDay,
  genre: Genre | undefined,
  neighbors: (PlannerRecipe | undefined)[],
  slots: readonly Slot[],
  keepMain?: PlannerRecipe,
) {
  const items: PlanItem[] = [];
  const warnings: string[] = [];
  const neighborIngredients = neighbors.filter(Boolean).map((r) => r!.mainIngredient);

  let main = keepMain;
  if (slots.includes('main')) {
    const res = pick(ctx, day, 'main', { genre, neighborIngredients });
    if (res.warning) warnings.push(res.warning);
    main = res.recipe;
    if (main) {
      markUsed(ctx, main);
      items.push({ date: day.date, slot: 'main', recipeId: main.id });
    }
  }
  for (const slot of ['soup', 'side'] as const) {
    if (!slots.includes(slot)) continue;
    // 副菜は日の設定に従う。ただし副菜だけを明示的に作り直すときは付ける
    if (slot === 'side' && slots.length > 1 && !includeSide(day)) continue;
    const res = pick(ctx, day, slot, { mainGenre: main?.genre ?? genre, neighborIngredients: [] });
    if (res.warning) warnings.push(res.warning);
    if (res.recipe) {
      markUsed(ctx, res.recipe);
      items.push({ date: day.date, slot, recipeId: res.recipe.id });
    }
  }
  return { items, warnings };
}

export function estimateCost(
  items: readonly PlanItem[],
  recipes: readonly PlannerRecipe[],
  servings: number,
) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return items.reduce((s, it) => {
    const r = byId.get(it.recipeId);
    return s + (r ? recipeCost(r, servings) : 0);
  }, 0);
}

/**
 * 予算を超えていたら、高い品を同じ条件のより安いレシピに置き換える。
 * 置き換えられる品がなくなったら止める。
 */
function fitBudget(input: PlannerInput, items: PlanItem[], ctx: PickContext) {
  const byId = new Map(input.recipes.map((r) => [r.id, r]));
  const dayOf = new Map(input.days.map((d) => [d.date, d]));
  const cost = (id: string) => recipeCost(byId.get(id)!, input.servings);
  let total = estimateCost(items, input.recipes, input.servings);

  for (let guard = 0; guard < 21 && total > input.weeklyBudget; guard++) {
    const order = [...items].sort((a, b) => cost(b.recipeId) - cost(a.recipeId));
    let replaced = false;
    for (const item of order) {
      const day = dayOf.get(item.date)!;
      const current = byId.get(item.recipeId)!;
      const cheaper = input.recipes
        .filter(
          (r) =>
            r.category === item.slot &&
            !ctx.used.has(r.id) &&
            !isOutOfSeasonOnly(r, seasonOf(day.date)) &&
            (day.level === 'minori' || r.difficulty === 'futaba') &&
            timeLevelFits(day.timeLevel, r.timeMinutes) &&
            r.genre === current.genre &&
            cost(r.id) < cost(current.id),
        )
        .sort((a, b) => cost(a.id) - cost(b.id));
      const next = cheaper[0];
      if (!next) continue;
      ctx.used.delete(current.id);
      ctx.used.add(next.id);
      item.recipeId = next.id;
      total = estimateCost(items, input.recipes, input.servings);
      replaced = true;
      break;
    }
    if (!replaced) break;
  }
  return total;
}

/** 1週間分の献立を生成する */
export function generateWeek(input: PlannerInput): PlanResult {
  const rng = createRng(input.seed);
  // ジャンルは料理する日にだけ割り当てる
  const cookDays = input.days.filter((d) => !d.off);
  const cookGenres = allocateGenres(input.ratio, cookDays.length, rng);
  const genres = input.days.map((d) => (d.off ? undefined : cookGenres[cookDays.indexOf(d)]));
  const ctx: PickContext = {
    recipes: input.recipes,
    history: input.history,
    used: new Set(),
    rng,
    stock: input.stock,
    stockUses: new Map(),
  };
  const byId = new Map(input.recipes.map((r) => [r.id, r]));

  const items: PlanItem[] = [];
  const warnings: string[] = [];
  let prevMain: PlannerRecipe | undefined;
  input.days.forEach((day, i) => {
    if (day.off) return;
    const res = planDay(ctx, day, genres[i], [prevMain], SLOTS);
    items.push(...res.items);
    warnings.push(...res.warnings);
    const mainItem = res.items.find((it) => it.slot === 'main');
    prevMain = mainItem ? byId.get(mainItem.recipeId) : undefined;
  });

  const estimatedCost = fitBudget(input, items, ctx);
  return { items, estimatedCost, overBudget: estimatedCost > input.weeklyBudget, warnings };
}

/**
 * 1日分（slot 指定なら1品だけ）を作り直す。ほかの日の献立は変えない。
 * 同じ週で使っているレシピは避け、前後の日の主材料も考慮する。
 */
export function regenerate(
  input: PlannerInput,
  current: readonly PlanItem[],
  date: string,
  slot?: Slot,
): PlanResult {
  const rng = createRng(input.seed);
  const byId = new Map(input.recipes.map((r) => [r.id, r]));
  const day = input.days.find((d) => d.date === date);
  if (!day) throw new Error(`unknown date ${date}`);
  if (day.off) {
    const items = current.filter((it) => it.date !== date);
    const estimatedCost = estimateCost(items, input.recipes, input.servings);
    return { items, estimatedCost, overBudget: estimatedCost > input.weeklyBudget, warnings: [] };
  }

  const replacing = (it: PlanItem) => it.date === date && (!slot || it.slot === slot);
  const kept = current.filter((it) => !replacing(it));
  // 作り直す品と同じものが再び選ばれないよう、元のレシピも「使用済み」に含める
  const used = new Set(current.map((it) => it.recipeId));
  const ctx: PickContext = {
    recipes: input.recipes,
    history: input.history,
    used,
    rng,
    stock: input.stock,
    stockUses: new Map(),
  };
  for (const it of kept) {
    const r = byId.get(it.recipeId);
    if (r) markUsed(ctx, r);
  }

  const idx = input.days.indexOf(day);
  const mainOf = (d: PlannerDay | undefined) => {
    const it = d && kept.find((x) => x.date === d.date && x.slot === 'main');
    return it ? byId.get(it.recipeId) : undefined;
  };
  const oldMain = current.find((it) => it.date === date && it.slot === 'main');
  const genre = oldMain ? byId.get(oldMain.recipeId)?.genre : undefined;
  const keepMain = slot && slot !== 'main' ? mainOf(day) : undefined;

  const res = planDay(
    ctx,
    day,
    genre,
    [mainOf(input.days[idx - 1]), mainOf(input.days[idx + 1])],
    slot ? [slot] : SLOTS,
    keepMain,
  );
  const items = [...kept, ...res.items];
  const estimatedCost = estimateCost(items, input.recipes, input.servings);
  return {
    items,
    estimatedCost,
    overBudget: estimatedCost > input.weeklyBudget,
    warnings: res.warnings,
  };
}
