import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { weekStartOf } from '../../shared/date';
import { normalizeIngredientName, sectionOf } from '../../shared/ingredients';
import { compareStock, qtyLabel, stockLabel } from '../../shared/pantry';
import { parseAmount } from '../../shared/recipe';
import {
  buildShoppingList,
  isHomeStock,
  lineKey,
  type ShoppingLine,
  type ShoppingListView,
  type ShoppingSource,
  usageOf,
} from '../../shared/shopping';
import { chunkRows } from '../db/chunk';
import type { Db } from '../db/client';
import {
  mealPlanItems,
  mealPlans,
  recipeIngredients,
  recipes,
  shoppingItems,
  users,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import { loadPantry } from './pantry';
import { loadSettings } from './settings';

type Ctx = Context<AppEnv>;

async function findPlan(db: Db, groupId: string, weekStart: string) {
  return db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(and(eq(mealPlans.groupId, groupId), eq(mealPlans.weekStart, weekStart)))
    .get();
}

/** 献立のレシピと材料を集める */
async function planSources(db: Db, planId: string): Promise<ShoppingSource[]> {
  const items = await db
    .select({
      recipeId: recipes.id,
      name: recipes.name,
      servings: recipes.servings,
      date: mealPlanItems.date,
    })
    .from(mealPlanItems)
    .innerJoin(recipes, eq(recipes.id, mealPlanItems.recipeId))
    .where(eq(mealPlanItems.planId, planId));
  if (!items.length) return [];
  const ings = await db
    .select()
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, [...new Set(items.map((i) => i.recipeId))]));
  return items.map((it) => ({
    recipeName: it.name,
    date: it.date,
    recipeServings: it.servings,
    ingredients: ings
      .filter((g) => g.recipeId === it.recipeId)
      .map((g) => ({
        name: g.name,
        quantity: g.quantity,
        unit: g.unit,
        amountText: g.amountText,
        section: g.section,
      })),
  }));
}

const signature = (lines: Pick<ShoppingLine, 'name' | 'quantity' | 'unit' | 'amountText'>[]) =>
  lines
    .map((l) => `${l.name}|${l.quantity ?? ''}|${l.unit ?? ''}|${l.amountText ?? ''}`)
    .sort()
    .join('\n');

async function computeLines(db: Db, groupId: string, planId: string) {
  const settings = await loadSettings(db, groupId);
  const sources = await planSources(db, planId);
  const lines = buildShoppingList(sources, settings.servings, settings.buySeasonings);
  const buy = new Set(settings.buySeasonings.map(normalizeIngredientName));
  const excluded = [
    ...new Set(
      sources.flatMap((s) =>
        s.ingredients
          .map((i) => ({ section: i.section, name: normalizeIngredientName(i.name) }))
          .filter(
            (i) =>
              isHomeStock(i.section, i.name) &&
              !buy.has(i.name) &&
              i.name !== '水' &&
              i.name !== '湯',
          )
          .map((i) => i.name),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, 'ja'));
  return { lines, excluded, servings: settings.servings };
}

/** 生成した項目を入れ替える。チェック状態は名前で引き継ぎ、手で追加した項目は残す */
async function writeLines(c: Ctx, planId: string, lines: ShoppingLine[]) {
  const db = c.var.db;
  const groupId = c.var.group.id;
  const old = await db
    .select()
    .from(shoppingItems)
    .where(and(eq(shoppingItems.planId, planId), eq(shoppingItems.isManual, false)));
  const checked = new Map(old.filter((o) => o.checked).map((o) => [lineKey(o), o]));
  const now = Date.now();
  const rows = lines.map((l, sort) => {
    const prev = checked.get(lineKey(l));
    return {
      id: crypto.randomUUID(),
      planId,
      groupId,
      name: l.name,
      section: l.section,
      quantity: l.quantity,
      unit: l.unit,
      amountText: l.amountText,
      sources: l.sources,
      checked: !!prev,
      checkedBy: prev?.checkedBy ?? null,
      checkedAt: prev?.checkedAt ?? null,
      isManual: false,
      sort,
      updatedAt: now,
    };
  });
  await db.batch([
    db
      .delete(shoppingItems)
      .where(and(eq(shoppingItems.planId, planId), eq(shoppingItems.isManual, false))),
    ...chunkRows(rows, 15).map((chunk) => db.insert(shoppingItems).values(chunk)),
  ]);
}

async function buildView(c: Ctx, weekStart: string): Promise<ShoppingListView> {
  const db = c.var.db;
  const groupId = c.var.group.id;
  const plan = await findPlan(db, groupId, weekStart);
  if (!plan) {
    const s = await loadSettings(db, groupId);
    return {
      weekStart,
      exists: false,
      items: [],
      outdated: false,
      excludedSeasonings: [],
      servings: s.servings,
    };
  }
  const { lines, excluded, servings } = await computeLines(db, groupId, plan.id);
  let stored = await db
    .select({ item: shoppingItems, user: users })
    .from(shoppingItems)
    .leftJoin(users, eq(users.id, shoppingItems.checkedBy))
    .where(eq(shoppingItems.planId, plan.id));

  // まだ一度も作っていなければ自動で作る
  if (!stored.some((s) => !s.item.isManual) && lines.length) {
    await writeLines(c, plan.id, lines);
    stored = await db
      .select({ item: shoppingItems, user: users })
      .from(shoppingItems)
      .leftJoin(users, eq(users.id, shoppingItems.checkedBy))
      .where(eq(shoppingItems.planId, plan.id));
  }
  const pantry = await loadPantry(db, groupId);
  const stockOf = (item: {
    name: string;
    quantity: number | null;
    unit: string | null;
    amountText: string | null;
  }) => {
    const have = pantry.filter((p) => p.name === lineKey(item));
    if (!have.length) return null;
    // 「1個 + 100g」のように合算できない分量は、在庫を添えるだけにする
    const mixed = item.quantity === null && !!item.amountText?.includes('+');
    const r = mixed
      ? { status: 'none' as const, remaining: item }
      : compareStock(item, have, lineKey(item));
    return {
      status: r.status,
      have: stockLabel(have, lineKey(item)),
      remaining: r.status === 'partial' ? qtyLabel(r.remaining) : null,
    };
  };
  const usageByName = new Map(lines.map((l) => [lineKey(l), usageOf(l)]));
  const generated = stored.filter((s) => !s.item.isManual).map((s) => s.item);
  return {
    weekStart,
    exists: true,
    outdated: signature(generated) !== signature(lines),
    excludedSeasonings: excluded,
    servings,
    items: stored
      .sort(
        (a, b) => Number(a.item.isManual) - Number(b.item.isManual) || a.item.sort - b.item.sort,
      )
      .map(({ item, user }) => ({
        id: item.id,
        name: item.name,
        section: item.section as ShoppingListView['items'][number]['section'],
        quantity: item.quantity,
        unit: item.unit,
        amountText: item.amountText,
        sources: item.sources,
        checked: item.checked,
        checkedBy:
          item.checked && user
            ? { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl }
            : null,
        isManual: item.isManual,
        stocked: item.stocked,
        stock: item.checked ? null : stockOf(item),
        usage: item.isManual ? null : (usageByName.get(lineKey(item)) ?? null),
      })),
  };
}

function weekParam(c: Ctx) {
  const ws = c.req.param('weekStart') ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(ws) && weekStartOf(ws) === ws ? ws : null;
}

const itemWhere = (c: Ctx) =>
  and(eq(shoppingItems.id, c.req.param('id')!), eq(shoppingItems.groupId, c.var.group.id));

/** 項目の変更を、その週の買い物リストを見ているメンバーに知らせる */
async function notifyShopping(c: Ctx, planId: string, summary: string) {
  const plan = await c.var.db
    .select({ weekStart: mealPlans.weekStart })
    .from(mealPlans)
    .where(eq(mealPlans.id, planId))
    .get();
  if (plan) notifyGroup(c, { type: 'shopping.updated', weekStart: plan.weekStart, summary });
}

export const shoppingRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  .get('/:weekStart', async (c) => {
    const ws = weekParam(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    return c.json(await buildView(c, ws));
  })
  /** 献立に合わせて作り直す（チェック状態は名前で引き継ぐ） */
  .post('/:weekStart/regenerate', async (c) => {
    const ws = weekParam(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    const plan = await findPlan(c.var.db, c.var.group.id, ws);
    if (!plan) return c.json({ error: 'no_plan' }, 404);
    const { lines } = await computeLines(c.var.db, c.var.group.id, plan.id);
    await writeLines(c, plan.id, lines);
    notifyGroup(c, {
      type: 'shopping.updated',
      weekStart: ws,
      summary: '買い物リストを献立に合わせて更新しました',
    });
    return c.json(await buildView(c, ws));
  })
  /** 手で追加（例: 牛乳 1本） */
  .post(
    '/:weekStart/items',
    zValidator(
      'json',
      z.object({
        name: z.string().trim().min(1).max(40),
        amount: z.string().trim().max(20).optional(),
      }),
    ),
    async (c) => {
      const ws = weekParam(c);
      if (!ws) return c.json({ error: 'invalid_week' }, 400);
      const plan = await findPlan(c.var.db, c.var.group.id, ws);
      if (!plan) return c.json({ error: 'no_plan' }, 404);
      const { name, amount } = c.req.valid('json');
      const normalized = normalizeIngredientName(name);
      const parsed = amount
        ? parseAmount(amount)
        : { quantity: null, unit: null, amountText: null };
      await c.var.db.insert(shoppingItems).values({
        id: crypto.randomUUID(),
        planId: plan.id,
        groupId: c.var.group.id,
        name: normalized,
        section: sectionOf(normalized) ?? 'other',
        ...parsed,
        sources: [],
        isManual: true,
        sort: Date.now() % 1_000_000_000,
        updatedAt: Date.now(),
      });
      notifyGroup(c, {
        type: 'shopping.updated',
        weekStart: ws,
        summary: `${normalized}を買い物リストに追加しました`,
      });
      return c.json(await buildView(c, ws), 201);
    },
  )
  /** チェックする／外す（後から押した方が優先） */
  .patch('/items/:id', zValidator('json', z.object({ checked: z.boolean() })), async (c) => {
    const { checked } = c.req.valid('json');
    const res = await c.var.db
      .update(shoppingItems)
      .set({
        checked,
        checkedBy: checked ? c.var.user.id : null,
        checkedAt: checked ? Date.now() : null,
        updatedAt: Date.now(),
      })
      .where(itemWhere(c))
      .returning({ id: shoppingItems.id, name: shoppingItems.name, planId: shoppingItems.planId });
    if (!res.length) return c.json({ error: 'not_found' }, 404);
    await notifyShopping(
      c,
      res[0]!.planId,
      `${res[0]!.name}を${checked ? 'かごに入れました' : 'リストに戻しました'}`,
    );
    return c.json({ ok: true, checked });
  })
  .delete('/items/:id', async (c) => {
    const res = await c.var.db
      .delete(shoppingItems)
      .where(itemWhere(c))
      .returning({ id: shoppingItems.id });
    if (!res.length) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });
