import { zValidator } from '@hono/zod-validator';
import { and, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { CATEGORY_LABEL } from '../../shared/constants';
import { addDays, WEEKDAY_LABELS, weekDates, weekdayIndex, weekStartOf } from '../../shared/date';
import {
  DAY_MODE_LABEL,
  dayModeSchema,
  isOffDay,
  regenerateSchema,
  setSlotSchema,
  swapSchema,
  versionSchema,
  weekStartParam,
  type DayMode,
  type PlanView,
} from '../../shared/plan';
import {
  estimateCost,
  generateWeek,
  regenerate,
  type PlanItem,
  type PlannerDay,
  type PlannerInput,
  type PlannerRecipe,
  type Slot,
} from '../../shared/planner';
import { chunkRows } from '../db/chunk';
import type { Db } from '../db/client';
import { cookLogs, hiddenRecipes, mealPlanItems, mealPlans, recipes, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import { toSummary } from './recipes';
import { loadSettings } from './settings';

type Ctx = Context<AppEnv>;

const dayName = (date: string) => `${WEEKDAY_LABELS[weekdayIndex(date)]}曜`;

/** グループから使えるレシピ（システム共通＋自グループ、非表示は除く） */
async function plannerRecipes(db: Db, groupId: string) {
  const rows = await db
    .select()
    .from(recipes)
    .where(
      and(
        or(isNull(recipes.groupId), eq(recipes.groupId, groupId)),
        sql`${recipes.id} not in (select ${hiddenRecipes.recipeId} from ${hiddenRecipes} where ${hiddenRecipes.groupId} = ${groupId})`,
      ),
    );
  return rows.map(toSummary);
}

/** 直近3週に使ったレシピ（recipeId → 何週前か） */
async function recentHistory(db: Db, groupId: string, weekStart: string) {
  const rows = await db
    .select({ recipeId: mealPlanItems.recipeId, weekStart: mealPlans.weekStart })
    .from(mealPlanItems)
    .innerJoin(mealPlans, eq(mealPlans.id, mealPlanItems.planId))
    .where(
      and(
        eq(mealPlans.groupId, groupId),
        gte(mealPlans.weekStart, addDays(weekStart, -21)),
        lt(mealPlans.weekStart, weekStart),
      ),
    );
  const history: Record<string, number> = {};
  for (const r of rows) {
    const weeksAgo = Math.round(
      (Date.parse(weekStart) - Date.parse(r.weekStart)) / (7 * 86_400_000),
    );
    history[r.recipeId] = Math.min(history[r.recipeId] ?? 9, weeksAgo);
  }
  return history;
}

/** その週の予定の変更（日付 → 予定）。曜日の設定より優先 */
type DayModes = Record<string, DayMode>;

async function plannerInput(
  db: Db,
  groupId: string,
  weekStart: string,
  dayModes: DayModes = {},
): Promise<PlannerInput> {
  const [settings, recipeList, history] = await Promise.all([
    loadSettings(db, groupId),
    plannerRecipes(db, groupId),
    recentHistory(db, groupId, weekStart),
  ]);
  const days: PlannerDay[] = weekDates(weekStart).map((date) => {
    const s = settings.days[weekdayIndex(date)]!;
    return {
      date,
      budgetLevel: s.budgetLevel,
      timeLevel: s.timeLevel,
      sideMode: s.sideMode,
      level: s.level === 'inherit' ? settings.defaultLevel : s.level,
      off: isOffDay(dayModes[date] ?? s.mode),
    };
  });
  return {
    recipes: recipeList satisfies PlannerRecipe[],
    days,
    ratio: settings.ratio,
    weeklyBudget: settings.weeklyBudget,
    servings: settings.servings,
    history,
    seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
  };
}

async function findPlan(db: Db, groupId: string, weekStart: string) {
  return db
    .select()
    .from(mealPlans)
    .where(and(eq(mealPlans.groupId, groupId), eq(mealPlans.weekStart, weekStart)))
    .get();
}

async function planItems(db: Db, planId: string): Promise<PlanItem[]> {
  const rows = await db
    .select({
      date: mealPlanItems.date,
      slot: mealPlanItems.slot,
      recipeId: mealPlanItems.recipeId,
    })
    .from(mealPlanItems)
    .where(eq(mealPlanItems.planId, planId));
  return rows;
}

export async function buildPlanView(
  db: Db,
  groupId: string,
  weekStart: string,
  warnings: string[] = [],
): Promise<PlanView> {
  const settings = await loadSettings(db, groupId);
  const plan = await findPlan(db, groupId, weekStart);
  const rows = plan
    ? await db
        .select({ item: mealPlanItems, recipe: recipes })
        .from(mealPlanItems)
        .innerJoin(recipes, eq(recipes.id, mealPlanItems.recipeId))
        .where(eq(mealPlanItems.planId, plan.id))
    : [];
  const updater = plan?.updatedBy
    ? await db
        .select({ id: users.id, name: users.displayName })
        .from(users)
        .where(eq(users.id, plan.updatedBy))
        .get()
    : null;
  // その週に「作った」と記録した料理（日付と料理の組 → 記録の id）
  const dates = weekDates(weekStart);
  const logs = await db
    .select({ id: cookLogs.id, date: cookLogs.date, recipeId: cookLogs.recipeId })
    .from(cookLogs)
    .where(and(eq(cookLogs.groupId, groupId), inArray(cookLogs.date, dates)));
  const cooked = new Map(logs.map((l) => [`${l.date}|${l.recipeId}`, l.id]));
  const slotOrder = { main: 0, soup: 1, side: 2 } as const;
  const summaries = rows.map((r) => toSummary(r.recipe));
  const estimatedCost = estimateCost(
    rows.map((r) => ({ date: r.item.date, slot: r.item.slot, recipeId: r.item.recipeId })),
    summaries,
    settings.servings,
  );
  return {
    weekStart,
    exists: !!plan,
    version: plan?.version ?? 0,
    estimatedCost,
    weeklyBudget: settings.weeklyBudget,
    overBudget: estimatedCost > settings.weeklyBudget,
    servings: settings.servings,
    updatedBy: updater ?? null,
    updatedAt: plan?.updatedAt ?? 0,
    warnings,
    days: weekDates(weekStart).map((date) => {
      const s = settings.days[weekdayIndex(date)]!;
      return {
        date,
        weekday: weekdayIndex(date),
        budgetLevel: s.budgetLevel,
        timeLevel: s.timeLevel,
        sideMode: s.sideMode,
        levelSetting: s.level,
        level: s.level === 'inherit' ? settings.defaultLevel : s.level,
        mode: plan?.dayModes[date] ?? s.mode,
        modeSetting: s.mode,
        items: rows
          .filter((r) => r.item.date === date)
          .sort((a, b) => slotOrder[a.item.slot] - slotOrder[b.item.slot])
          .map((r) => ({
            slot: r.item.slot,
            recipe: toSummary(r.recipe),
            updatedBy: r.item.updatedBy,
            updatedAt: r.item.updatedAt,
            cookedLogId: cooked.get(`${date}|${r.item.recipeId}`) ?? null,
          })),
      };
    }),
  };
}

/**
 * 版番号を確認して1つ進める。古い版からの保存なら null（呼び出し側で 409）。
 * 献立がなければ作る。
 */
async function bumpVersion(c: Ctx, weekStart: string, expected: number | undefined) {
  const db = c.var.db;
  const groupId = c.var.group.id;
  const now = Date.now();
  const existing = await findPlan(db, groupId, weekStart);
  if (!existing) {
    if (expected !== undefined && expected !== 0) return null;
    const id = crypto.randomUUID();
    await db
      .insert(mealPlans)
      .values({
        id,
        groupId,
        createdBy: c.var.user.id,
        weekStart,
        version: 1,
        updatedBy: c.var.user.id,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const created = await findPlan(db, groupId, weekStart);
    return created?.id === id ? created : null;
  }
  const versionCond = expected === undefined ? sql`1 = 1` : eq(mealPlans.version, expected);
  const updated = await db
    .update(mealPlans)
    .set({ version: sql`${mealPlans.version} + 1`, updatedBy: c.var.user.id, updatedAt: now })
    .where(and(eq(mealPlans.id, existing.id), versionCond))
    .returning()
    .get();
  return updated ?? null;
}

const stale = (c: Ctx) =>
  c.json(
    {
      error: 'stale',
      message: 'ほかのメンバーが献立を更新しました。最新の献立を読み込んでください',
    },
    409,
  );

/** 指定した日（と品目）の行を入れ替える */
async function replaceItems(
  c: Ctx,
  planId: string,
  next: PlanItem[],
  scope: { date?: string; slot?: Slot },
) {
  const db = c.var.db;
  const now = Date.now();
  const where = and(
    eq(mealPlanItems.planId, planId),
    scope.date ? eq(mealPlanItems.date, scope.date) : undefined,
    scope.slot ? eq(mealPlanItems.slot, scope.slot) : undefined,
  );
  const rows = next
    .filter(
      (it) => (!scope.date || it.date === scope.date) && (!scope.slot || it.slot === scope.slot),
    )
    .map((it) => ({
      id: crypto.randomUUID(),
      planId,
      date: it.date,
      slot: it.slot,
      recipeId: it.recipeId,
      updatedBy: c.var.user.id,
      updatedAt: now,
    }));
  await db.batch([
    db.delete(mealPlanItems).where(where),
    ...chunkRows(rows, 7).map((chunk) => db.insert(mealPlanItems).values(chunk)),
  ]);
}

async function saveCost(db: Db, groupId: string, planId: string, weekStart: string) {
  const view = await buildPlanView(db, groupId, weekStart);
  await db
    .update(mealPlans)
    .set({ estimatedCost: view.estimatedCost })
    .where(eq(mealPlans.id, planId));
}

function validWeekStart(c: Ctx) {
  const ws = c.req.param('weekStart')!;
  const ok = weekStartParam.safeParse(ws).success && weekStartOf(ws) === ws;
  return ok ? ws : null;
}

function inWeek(weekStart: string, date: string) {
  return weekDates(weekStart).includes(date);
}

export const planRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  .get('/:weekStart', async (c) => {
    const ws = validWeekStart(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    return c.json(await buildPlanView(c.var.db, c.var.group.id, ws));
  })
  /** 1週間分をまとめて生成（既存の献立は置き換え） */
  .post('/:weekStart/generate', zValidator('json', versionSchema), async (c) => {
    const ws = validWeekStart(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    const plan = await bumpVersion(c, ws, c.req.valid('json').version);
    if (!plan) return stale(c);
    const input = await plannerInput(c.var.db, c.var.group.id, ws, plan.dayModes);
    const result = generateWeek(input);
    await replaceItems(c, plan.id, result.items, {});
    await saveCost(c.var.db, c.var.group.id, plan.id, ws);
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: weekDates(ws),
      summary: '1週間の献立を作り直しました',
    });
    return c.json(await buildPlanView(c.var.db, c.var.group.id, ws, result.warnings));
  })
  /** 1日分（slot 指定なら1品）だけ作り直す */
  .post('/:weekStart/days/:date/regenerate', zValidator('json', regenerateSchema), async (c) => {
    const ws = validWeekStart(c);
    const date = c.req.param('date');
    if (!ws || !inWeek(ws, date)) return c.json({ error: 'invalid_date' }, 400);
    const { version, slot } = c.req.valid('json');
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    const input = await plannerInput(c.var.db, c.var.group.id, ws, plan.dayModes);
    const current = await planItems(c.var.db, plan.id);
    const result = regenerate(input, current, date, slot);
    await replaceItems(c, plan.id, result.items, { date, slot });
    await saveCost(c.var.db, c.var.group.id, plan.id, ws);
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [date],
      summary: `${dayName(date)}の${slot ? CATEGORY_LABEL[slot] : '献立'}を変更しました`,
    });
    return c.json(await buildPlanView(c.var.db, c.var.group.id, ws, result.warnings));
  })
  // 「/days/:date/:slot」より先に置く（mode が slot として扱われないように）
  /**
   * その日の予定を変える（料理する／外食／テイクアウト）。
   * 外食・テイクアウトにしたらその日の献立を外し、料理する日に戻したら献立を作る
   */
  .put('/:weekStart/days/:date/mode', zValidator('json', dayModeSchema), async (c) => {
    const ws = validWeekStart(c);
    const date = c.req.param('date');
    if (!ws || !inWeek(ws, date)) return c.json({ error: 'invalid_date' }, 400);
    const { version, mode } = c.req.valid('json');
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    const db = c.var.db;
    const dayModes: DayModes = { ...plan.dayModes, [date]: mode };
    await db.update(mealPlans).set({ dayModes }).where(eq(mealPlans.id, plan.id));
    let warnings: string[] = [];
    if (isOffDay(mode)) {
      await replaceItems(c, plan.id, [], { date });
    } else if (!(await planItems(db, plan.id)).some((it) => it.date === date)) {
      const input = await plannerInput(db, c.var.group.id, ws, dayModes);
      const result = regenerate(input, await planItems(db, plan.id), date);
      await replaceItems(c, plan.id, result.items, { date });
      warnings = result.warnings;
    }
    await saveCost(db, c.var.group.id, plan.id, ws);
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [date],
      summary: isOffDay(mode)
        ? `${dayName(date)}を${DAY_MODE_LABEL[mode]}の日にしました`
        : `${dayName(date)}を料理する日にしました`,
    });
    return c.json(await buildPlanView(db, c.var.group.id, ws, warnings));
  })
  /** レシピを手動で指定（null で外す） */
  .put('/:weekStart/days/:date/:slot', zValidator('json', setSlotSchema), async (c) => {
    const ws = validWeekStart(c);
    const date = c.req.param('date');
    const slot = c.req.param('slot') as Slot;
    if (!ws || !inWeek(ws, date) || !['main', 'soup', 'side'].includes(slot)) {
      return c.json({ error: 'invalid_date' }, 400);
    }
    const { version, recipeId } = c.req.valid('json');
    const db = c.var.db;
    if (recipeId) {
      const usable = await plannerRecipes(db, c.var.group.id);
      const r = usable.find((x) => x.id === recipeId);
      if (!r) return c.json({ error: 'recipe_not_found' }, 404);
      if (r.category !== slot) return c.json({ error: 'category_mismatch' }, 400);
    }
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    await replaceItems(c, plan.id, recipeId ? [{ date, slot, recipeId }] : [], { date, slot });
    await saveCost(db, c.var.group.id, plan.id, ws);
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [date],
      summary: `${dayName(date)}の${CATEGORY_LABEL[slot]}を${recipeId ? '変更' : '外'}しました`,
    });
    return c.json(await buildPlanView(db, c.var.group.id, ws));
  })
  /** 2つの曜日の献立を入れ替える（外食・テイクアウトの予定も一緒に入れ替える） */
  .post('/:weekStart/swap', zValidator('json', swapSchema), async (c) => {
    const ws = validWeekStart(c);
    const { from, to, version } = c.req.valid('json');
    if (!ws || !inWeek(ws, from) || !inWeek(ws, to) || from === to) {
      return c.json({ error: 'invalid_date' }, 400);
    }
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    const db = c.var.db;
    const now = Date.now();
    const tmp = '0000-00-00';
    const move = (a: string, b: string) =>
      db
        .update(mealPlanItems)
        .set({ date: b, updatedBy: c.var.user.id, updatedAt: now })
        .where(and(eq(mealPlanItems.planId, plan.id), eq(mealPlanItems.date, a)));
    // 予定（外食など）も入れ替える。曜日の設定どおりの日も、明示した予定として入れ替える
    const settings = await loadSettings(db, c.var.group.id);
    const modeOf = (d: string) => plan.dayModes[d] ?? settings.days[weekdayIndex(d)]!.mode;
    const dayModes: DayModes = { ...plan.dayModes, [from]: modeOf(to), [to]: modeOf(from) };
    // ユニーク制約（plan, date, slot）に当たらないよう一時日付を経由する
    await db.batch([
      move(from, tmp),
      move(to, from),
      move(tmp, to),
      db.update(mealPlans).set({ dayModes }).where(eq(mealPlans.id, plan.id)),
    ]);
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [from, to],
      summary: `${dayName(from)}と${dayName(to)}の献立を入れ替えました`,
    });
    return c.json(await buildPlanView(db, c.var.group.id, ws));
  });

/** 今日の献立（ホーム用） */
export async function todayItems(db: Db, groupId: string, date: string) {
  const view = await buildPlanView(db, groupId, weekStartOf(date));
  return { view, day: view.days.find((d) => d.date === date)! };
}
