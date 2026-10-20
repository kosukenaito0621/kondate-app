import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Section } from '../../shared/constants';
import type { PlannerStock } from '../../shared/planner';
import { purchaseFor, toPackUnit } from '../../shared/purchase';
import { isHomeStock } from '../../shared/shopping';
import { normalizeIngredientName, sectionOf } from '../../shared/ingredients';
import {
  addQty,
  pantryInputSchema,
  pantryPatchSchema,
  stockFromShoppingSchema,
  type PantryItemView,
} from '../../shared/pantry';
import type { Db } from '../db/client';
import { mealPlans, pantryItems, recipeIngredients, recipes, shoppingItems } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';

export async function loadPantry(db: Db, groupId: string) {
  return db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.groupId, groupId))
    .orderBy(asc(pantryItems.name), asc(pantryItems.expiresOn));
}

const toView = (r: typeof pantryItems.$inferSelect): PantryItemView => ({
  id: r.id,
  name: r.name,
  section: r.section as Section,
  quantity: r.quantity,
  unit: r.unit,
  expiresOn: r.expiresOn,
  updatedAt: r.updatedAt,
});

const chunk = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * 買ったものを在庫に入れるときの量。白菜のように売っている単位が決まっている食材は、
 * 必要な量ではなく実際に買う量（例：0.3個分が必要 → 1/2個）で入れる
 */
function boughtAmount(b: { name: string; quantity: number | null; unit: string | null }) {
  const need = toPackUnit(b.name, b);
  const p = need ? purchaseFor(b.name, need) : null;
  return p ? { quantity: p.buy, unit: p.unit } : { quantity: b.quantity, unit: b.unit };
}

type Add = { name: string; quantity: number | null; unit: string | null; expiresOn: string | null };

/**
 * 在庫に足す。同じ食材・同じ期限の行があって単位が足せるなら合わせ、なければ新しい行にする。
 * 戻り値は D1 の batch に入れる文
 */
function addStatements(
  db: Db,
  groupId: string,
  userId: string,
  current: (typeof pantryItems.$inferSelect)[],
  adds: Add[],
) {
  const now = Date.now();
  const rows = current.map((r) => ({ ...r }));
  const touched = new Set<string>();
  const inserts: (typeof pantryItems.$inferInsert)[] = [];
  for (const a of adds) {
    const name = normalizeIngredientName(a.name);
    const same = rows.find((r) => r.name === name && r.expiresOn === a.expiresOn);
    const merged = same && addQty(same, a, name);
    if (same && merged) {
      same.quantity = merged.quantity;
      same.unit = merged.unit;
      touched.add(same.id);
      continue;
    }
    const row = {
      id: crypto.randomUUID(),
      groupId,
      name,
      section: sectionOf(name) ?? 'other',
      quantity: a.quantity,
      unit: a.quantity === null ? null : a.unit,
      expiresOn: a.expiresOn,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    rows.push(row);
    inserts.push(row);
  }
  return [
    ...rows
      .filter((r) => touched.has(r.id) && !inserts.some((i) => i.id === r.id))
      .map((r) =>
        db
          .update(pantryItems)
          .set({ quantity: r.quantity, unit: r.unit, updatedBy: userId, updatedAt: now })
          .where(eq(pantryItems.id, r.id)),
      ),
    ...inserts.map((r) => db.insert(pantryItems).values(r)),
  ];
}

export type RecipeIngredientAmount = {
  name: string;
  quantity: number | null;
  unit: string | null;
  amountText: string | null;
};

/** 見えるレシピごとの食材（名前は正規化済み。調味料など家にある前提のものは除く） */
export async function loadRecipeIngredientNames(db: Db, groupId: string) {
  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      name: recipeIngredients.name,
      section: recipeIngredients.section,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      amountText: recipeIngredients.amountText,
    })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
    .where(or(isNull(recipes.groupId), eq(recipes.groupId, groupId)));
  const out: Record<string, RecipeIngredientAmount[]> = {};
  for (const r of rows) {
    const name = normalizeIngredientName(r.name);
    if (isHomeStock(r.section, name)) continue;
    (out[r.recipeId] ??= []).push({
      name,
      quantity: r.quantity,
      unit: r.unit,
      amountText: r.amountText,
    });
  }
  return out;
}

/**
 * 在庫と、レシピごとに「在庫にある食材」の名前（調味料など家にある前提のものは除く）。
 * 献立作成の重み付けと「在庫で探す」に使う。在庫が空なら読み込まない
 */
export async function loadStockIndex(
  db: Db,
  groupId: string,
  /** 読み込み済みのレシピごとの食材名（なければここで読む） */
  preloaded?: Record<string, RecipeIngredientAmount[]>,
): Promise<PlannerStock | undefined> {
  const stock = await loadPantry(db, groupId);
  if (!stock.length) return undefined;
  const earliest = new Map<string, string | null>();
  for (const s of stock) {
    const prev = earliest.get(s.name);
    if (prev === undefined || (s.expiresOn && (!prev || s.expiresOn < prev)))
      earliest.set(s.name, s.expiresOn);
  }
  const all = preloaded ?? (await loadRecipeIngredientNames(db, groupId));
  const ingredients: Record<string, string[]> = {};
  for (const [id, ings] of Object.entries(all)) {
    const have = [...new Set(ings.map((i) => i.name))].filter((n) => earliest.has(n));
    if (have.length) ingredients[id] = have;
  }
  return {
    items: [...earliest].map(([name, expiresOn]) => ({ name, expiresOn })),
    ingredients,
  };
}

export const pantryRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  .get('/', async (c) => c.json((await loadPantry(c.var.db, c.var.group.id)).map(toView)))
  .post('/', zValidator('json', pantryInputSchema), async (c) => {
    const db = c.var.db;
    const groupId = c.var.group.id;
    const input = c.req.valid('json');
    const stmts = addStatements(db, groupId, c.var.user.id, await loadPantry(db, groupId), [input]);
    const [first, ...rest] = stmts;
    if (first) await db.batch([first, ...rest]);
    notifyGroup(c, { type: 'pantry.updated', summary: `${input.name}を在庫に入れました` });
    return c.json((await loadPantry(db, groupId)).map(toView), 201);
  })
  .patch('/:id', zValidator('json', pantryPatchSchema), async (c) => {
    const patch = c.req.valid('json');
    const name = patch.name === undefined ? undefined : normalizeIngredientName(patch.name);
    const res = await c.var.db
      .update(pantryItems)
      .set({
        ...patch,
        ...(name !== undefined && { name, section: sectionOf(name) ?? 'other' }),
        ...(patch.quantity === null && { unit: null }),
        updatedBy: c.var.user.id,
        updatedAt: Date.now(),
      })
      .where(and(eq(pantryItems.id, c.req.param('id')), eq(pantryItems.groupId, c.var.group.id)))
      .returning();
    if (!res.length) return c.json({ error: 'not_found' }, 404);
    notifyGroup(c, { type: 'pantry.updated', summary: `${res[0]!.name}の在庫を変更しました` });
    return c.json(toView(res[0]!));
  })
  .delete('/:id', async (c) => {
    const res = await c.var.db
      .delete(pantryItems)
      .where(and(eq(pantryItems.id, c.req.param('id')), eq(pantryItems.groupId, c.var.group.id)))
      .returning({ name: pantryItems.name });
    if (!res.length) return c.json({ error: 'not_found' }, 404);
    notifyGroup(c, { type: 'pantry.updated', summary: `${res[0]!.name}を在庫から外しました` });
    return c.json({ ok: true });
  })
  /** 買い物リストでかごに入れたもの（まだ在庫に入れていないもの）を在庫に入れる */
  .post('/from-shopping', zValidator('json', stockFromShoppingSchema), async (c) => {
    const db = c.var.db;
    const groupId = c.var.group.id;
    const { weekStart } = c.req.valid('json');
    const plan = await db
      .select({ id: mealPlans.id })
      .from(mealPlans)
      .where(and(eq(mealPlans.groupId, groupId), eq(mealPlans.weekStart, weekStart)))
      .get();
    if (!plan) return c.json({ error: 'no_plan' }, 404);
    const bought = await db
      .select()
      .from(shoppingItems)
      .where(
        and(
          eq(shoppingItems.planId, plan.id),
          eq(shoppingItems.checked, true),
          eq(shoppingItems.stocked, false),
        ),
      );
    if (!bought.length) return c.json({ added: 0 });
    const stmts = addStatements(
      db,
      groupId,
      c.var.user.id,
      await loadPantry(db, groupId),
      bought.map((b) => ({ ...boughtAmount(b), name: b.name, expiresOn: null })),
    );
    const [head, ...tail] = [
      ...chunk(
        bought.map((b) => b.id),
        90,
      ).map((ids) =>
        db
          .update(shoppingItems)
          .set({ stocked: true, updatedAt: Date.now() })
          .where(inArray(shoppingItems.id, ids)),
      ),
      ...stmts,
    ];
    await db.batch([head!, ...tail]);
    notifyGroup(c, {
      type: 'pantry.updated',
      summary: `買ったもの${bought.length}品を在庫に入れました`,
    });
    notifyGroup(c, { type: 'shopping.updated', weekStart, summary: '在庫に入れました' });
    return c.json({ added: bought.length });
  });
