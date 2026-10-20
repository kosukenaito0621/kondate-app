import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { costLevelFor } from '../../shared/constants';
import { normalizeIngredientName } from '../../shared/ingredients';
import {
  recipeInputSchema,
  recipeQuerySchema,
  shareBundleSchema,
  type CreatedShare,
  type RecipeDetail,
  type RecipeInput,
  type RecipeSummary,
} from '../../shared/recipe';
import { chunkRows } from '../db/chunk';
import type { Db } from '../db/client';
import {
  hiddenRecipes,
  recipeIngredients,
  recipes,
  recipeShareBundleItems,
  recipeShareBundles,
  recipeShares,
  recipeFavorites,
} from '../db/schema';
import { randomToken, sha256Hex } from '../lib/crypto';
import { isGroupImageKey } from '../lib/images';
import { hitRateLimit } from '../lib/rate-limit';
import { forbidGuest, requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import { deleteImage } from './images';
import { loadStockIndex } from './pantry';
import { favoritedBy, myFavoriteIds } from '../lib/favorites';
import { addDays, toJstDate } from '../../shared/date';

type RecipeRow = typeof recipes.$inferSelect;

/** 共有リンクの有効期限（30日）と、1人が1日に作れる数 */
const SHARE_TTL_MS = 30 * 86_400_000;
const SHARES_PER_DAY = 30;

export const toSummary = (r: RecipeRow): RecipeSummary => ({
  id: r.id,
  name: r.name,
  category: r.category,
  genre: r.genre,
  servings: r.servings,
  timeMinutes: r.timeMinutes,
  costYen: r.costYen,
  costLevel: r.costLevel,
  mainIngredient: r.mainIngredient,
  difficulty: r.difficulty,
  imageKey: r.imageKey,
  tags: r.tags,
  isSystem: r.groupId === null,
  seasons: r.seasons,
  seasonOnly: r.seasonOnly,
});

async function setFavorite(c: Context<AppEnv>, on: boolean) {
  const db = c.var.db;
  const row = await findVisible(db, c.var.group.id, c.req.param('id')!);
  if (!row) return c.json({ error: 'not_found' }, 404);
  const where = and(
    eq(recipeFavorites.userId, c.var.user.id),
    eq(recipeFavorites.recipeId, row.id),
  );
  if (on) {
    await db
      .insert(recipeFavorites)
      .values({ userId: c.var.user.id, recipeId: row.id })
      .onConflictDoNothing();
  } else {
    await db.delete(recipeFavorites).where(where);
  }
  // 週間献立のハートが変わるので、家族の画面にも知らせる
  notifyGroup(c, { type: 'recipes.updated' });
  return c.json({ favorite: on, favoritedBy: await favoritedBy(db, c.var.group.id, row.id) });
}

/** そのグループから見えるレシピ（システム共通＋自グループ） */
const visibleTo = (groupId: string) => or(isNull(recipes.groupId), eq(recipes.groupId, groupId))!;

async function findVisible(db: Db, groupId: string, id: string) {
  return db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), visibleTo(groupId)))
    .get();
}

export async function loadDetail(db: Db, row: RecipeRow): Promise<RecipeDetail> {
  const ingredients = await db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, row.id))
    .orderBy(asc(recipeIngredients.sort));
  return {
    ...toSummary(row),
    steps: row.steps,
    sourceUrl: row.sourceUrl,
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit as RecipeDetail['ingredients'][number]['unit'],
      amountText: i.amountText,
      section: i.section,
      group: i.groupLabel,
    })),
  };
}

function rowValues(input: RecipeInput) {
  return {
    name: input.name,
    category: input.category,
    genre: input.genre,
    servings: input.servings,
    timeMinutes: input.timeMinutes,
    costYen: input.costYen,
    costLevel: costLevelFor(input.category, input.costYen),
    mainIngredient: input.mainIngredient,
    difficulty: input.difficulty,
    steps: input.steps,
    tags: input.tags,
    imageKey: input.imageKey,
    sourceUrl: input.sourceUrl,
    seasons: input.seasons,
    seasonOnly: input.seasons.length > 0 && input.seasonOnly,
  };
}

/** recipe_ingredients に1行あたり入れる列の数（D1 の変数上限で分割するのに使う） */
const INGREDIENT_COLUMNS = 9;

function ingredientRows(recipeId: string, input: RecipeInput) {
  return input.ingredients.map((i, sort) => ({
    id: crypto.randomUUID(),
    recipeId,
    sort,
    name: normalizeIngredientName(i.name),
    quantity: i.quantity,
    unit: i.unit,
    amountText: i.amountText,
    groupLabel: i.group || null,
    section: i.section,
  }));
}

/** グループ独自のレシピだけを対象にする（システム共通は編集不可） */
const ownedBy = (groupId: string, id: string) =>
  and(eq(recipes.id, id), eq(recipes.groupId, groupId));

export const recipeRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  .get('/', zValidator('query', recipeQuerySchema), async (c) => {
    const { q, category, genre, difficulty, mine, season, stock, favorite } = c.req.valid('query');
    const groupId = c.var.group.id;
    const conds: SQL[] = [
      mine ? eq(recipes.groupId, groupId) : visibleTo(groupId),
      sql`${recipes.id} not in (select ${hiddenRecipes.recipeId} from ${hiddenRecipes} where ${hiddenRecipes.groupId} = ${groupId})`,
    ];
    if (category) conds.push(eq(recipes.category, category));
    if (genre) conds.push(eq(recipes.genre, genre));
    if (favorite) {
      conds.push(
        sql`${recipes.id} in (select ${recipeFavorites.recipeId} from ${recipeFavorites} where ${recipeFavorites.userId} = ${c.var.user.id})`,
      );
    }
    if (difficulty) conds.push(eq(recipes.difficulty, difficulty));
    if (season) {
      conds.push(sql`exists (select 1 from json_each(${recipes.seasons}) where value = ${season})`);
    }
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const ing = `%${normalizeIngredientName(q).replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conds.push(
        sql`(${recipes.name} like ${like} escape '\\' or exists (select 1 from ${recipeIngredients} i where i.recipe_id = ${recipes.id} and (i.name like ${like} escape '\\' or i.name like ${ing} escape '\\')))`,
      );
    }
    const rows = await c.var.db
      .select()
      .from(recipes)
      .where(and(...conds))
      .orderBy(
        sql`case when ${recipes.groupId} is null then 1 else 0 end`,
        sql`case ${recipes.category} when 'main' then 0 when 'soup' then 1 else 2 end`,
        asc(recipes.name),
      )
      .limit(500);
    const mineFav = await myFavoriteIds(c.var.db, c.var.user.id);
    const summary = (r: RecipeRow) => ({ ...toSummary(r), favorite: mineFav.has(r.id) });
    if (!stock) return c.json(rows.map(summary));
    // 在庫で探す：在庫の食材を使うものだけ。期限の近い食材を使うもの → 使う数の多いもの の順
    const index = await loadStockIndex(c.var.db, groupId);
    if (!index) return c.json([]);
    const soonLimit = addDays(toJstDate(), 3);
    const soonNames = new Set(
      index.items.filter((i) => i.expiresOn && i.expiresOn <= soonLimit).map((i) => i.name),
    );
    const matched = rows
      .map((r) => {
        const have = [...new Set(index.ingredients[r.id] ?? [])];
        return { ...summary(r), stock: { have, soon: have.some((n) => soonNames.has(n)) } };
      })
      .filter((r) => r.stock.have.length > 0);
    matched.sort(
      (a, b) =>
        Number(b.stock.soon) - Number(a.stock.soon) || b.stock.have.length - a.stock.have.length,
    );
    return c.json(matched);
  })
  .get('/:id', async (c) => {
    const row = await findVisible(c.var.db, c.var.group.id, c.req.param('id'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    const by = await favoritedBy(c.var.db, c.var.group.id, row.id);
    return c.json({
      ...(await loadDetail(c.var.db, row)),
      favorite: by.some((u) => u.id === c.var.user.id),
      favoritedBy: by,
    });
  })
  /** お気に入りに入れる・外す（自分の分だけ） */
  .put('/:id/favorite', async (c) => setFavorite(c, true))
  .delete('/:id/favorite', async (c) => setFavorite(c, false))
  .post('/', zValidator('json', recipeInputSchema), async (c) => {
    const input = c.req.valid('json');
    if (!isGroupImageKey(c.var.group.id, input.imageKey)) {
      return c.json({ error: 'invalid_image' }, 400);
    }
    const db = c.var.db;
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(recipes).values({
        id,
        groupId: c.var.group.id,
        createdBy: c.var.user.id,
        ...rowValues(input),
      }),
      ...chunkRows(ingredientRows(id, input), INGREDIENT_COLUMNS).map((chunk) =>
        db.insert(recipeIngredients).values(chunk),
      ),
    ]);
    const row = await findVisible(db, c.var.group.id, id);
    notifyGroup(c, { type: 'recipes.updated' });
    return c.json(await loadDetail(db, row!), 201);
  })
  .put('/:id', zValidator('json', recipeInputSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.var.db;
    const id = c.req.param('id');
    if (!isGroupImageKey(c.var.group.id, input.imageKey)) {
      return c.json({ error: 'invalid_image' }, 400);
    }
    const existing = await db
      .select({ id: recipes.id, imageKey: recipes.imageKey })
      .from(recipes)
      .where(ownedBy(c.var.group.id, id))
      .get();
    if (!existing) return c.json({ error: 'not_found_or_readonly' }, 404);
    await db.batch([
      db
        .update(recipes)
        .set({ ...rowValues(input), updatedAt: Date.now() })
        .where(ownedBy(c.var.group.id, id)),
      db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)),
      ...chunkRows(ingredientRows(id, input), INGREDIENT_COLUMNS).map((chunk) =>
        db.insert(recipeIngredients).values(chunk),
      ),
    ]);
    notifyGroup(c, { type: 'recipes.updated' });
    if (existing.imageKey !== input.imageKey)
      await deleteImage(db, c.env.IMAGES, existing.imageKey);
    const row = await findVisible(db, c.var.group.id, id);
    return c.json(await loadDetail(db, row!));
  })
  .delete('/:id', async (c) => {
    const res = await c.var.db
      .delete(recipes)
      .where(ownedBy(c.var.group.id, c.req.param('id')))
      .returning({ id: recipes.id, imageKey: recipes.imageKey });
    if (!res.length) return c.json({ error: 'not_found_or_readonly' }, 404);
    await deleteImage(c.var.db, c.env.IMAGES, res[0]!.imageKey);
    notifyGroup(c, { type: 'recipes.updated' });
    return c.json({ ok: true });
  })
  /** システム共通やグループのレシピを複製して、自グループのレシピにする（アレンジ用） */
  .post('/:id/copy', async (c) => {
    const db = c.var.db;
    const src = await findVisible(db, c.var.group.id, c.req.param('id'));
    if (!src) return c.json({ error: 'not_found' }, 404);
    const detail = await loadDetail(db, src);
    const id = await copyRecipeInto(db, detail, {
      groupId: c.var.group.id,
      userId: c.var.user.id,
      name: `${detail.name}（アレンジ）`,
    });
    notifyGroup(c, { type: 'recipes.updated' });
    return c.json({ id }, 201);
  })
  /** 共有リンクを作る（家族・友だちに送り、相手のグループのレシピとして保存してもらう） */
  .post('/:id/share', forbidGuest, async (c) => {
    const db = c.var.db;
    const src = await findVisible(db, c.var.group.id, c.req.param('id'));
    if (!src) return c.json({ error: 'not_found' }, 404);
    if (await hitRateLimit(db, `share:${c.var.user.id}`, SHARES_PER_DAY, 86_400_000)) {
      return c.json({ error: 'rate_limited', message: '今日はこれ以上リンクを作れません' }, 429);
    }
    const token = randomToken(18);
    const expiresAt = Date.now() + SHARE_TTL_MS;
    await db.insert(recipeShares).values({
      id: crypto.randomUUID(),
      tokenHash: await sha256Hex(token),
      recipeId: src.id,
      createdBy: c.var.user.id,
      expiresAt,
    });
    const url = new URL(`/r/${token}`, c.req.url).toString();
    return c.json({ token, url, expiresAt } satisfies CreatedShare, 201);
  })
  /** 複数のレシピをまとめて1つのリンクで送る（30品まで・題名は任意） */
  .post('/share-bundle', forbidGuest, zValidator('json', shareBundleSchema), async (c) => {
    const db = c.var.db;
    const { recipeIds, title } = c.req.valid('json');
    const visible = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(inArray(recipes.id, recipeIds), visibleTo(c.var.group.id)));
    if (visible.length !== recipeIds.length) return c.json({ error: 'not_found' }, 404);
    if (await hitRateLimit(db, `share:${c.var.user.id}`, SHARES_PER_DAY, 86_400_000)) {
      return c.json({ error: 'rate_limited', message: '今日はこれ以上リンクを作れません' }, 429);
    }
    const token = randomToken(18);
    const expiresAt = Date.now() + SHARE_TTL_MS;
    const bundleId = crypto.randomUUID();
    await db.batch([
      db.insert(recipeShareBundles).values({
        id: bundleId,
        tokenHash: await sha256Hex(token),
        title: title || null,
        createdBy: c.var.user.id,
        expiresAt,
      }),
      ...chunkRows(
        recipeIds.map((recipeId, sort) => ({ bundleId, recipeId, sort })),
        3,
      ).map((chunk) => db.insert(recipeShareBundleItems).values(chunk)),
    ]);
    const url = new URL(`/r/${token}`, c.req.url).toString();
    return c.json({ token, url, expiresAt } satisfies CreatedShare, 201);
  })
  .post('/:id/hide', zValidator('json', z.object({ hidden: z.boolean() })), async (c) => {
    const db = c.var.db;
    const groupId = c.var.group.id;
    const id = c.req.param('id');
    const src = await findVisible(db, groupId, id);
    if (!src) return c.json({ error: 'not_found' }, 404);
    if (c.req.valid('json').hidden) {
      await db.insert(hiddenRecipes).values({ groupId, recipeId: id }).onConflictDoNothing();
    } else {
      await db
        .delete(hiddenRecipes)
        .where(and(eq(hiddenRecipes.groupId, groupId), eq(hiddenRecipes.recipeId, id)));
    }
    return c.json({ ok: true });
  });

/** レシピ（材料つき）を、指定のグループのレシピとして複製する。写真は引き継がない */
export async function copyRecipeInto(
  db: Db,
  detail: RecipeDetail,
  to: { groupId: string; userId: string; name?: string },
) {
  const id = crypto.randomUUID();
  const input = recipeInputSchema.parse({
    ...detail,
    name: (to.name ?? detail.name).slice(0, 60),
    imageKey: null,
  });
  await db.batch([
    db
      .insert(recipes)
      .values({ id, groupId: to.groupId, createdBy: to.userId, ...rowValues(input) }),
    ...chunkRows(ingredientRows(id, input), INGREDIENT_COLUMNS).map((chunk) =>
      db.insert(recipeIngredients).values(chunk),
    ),
  ]);
  return id;
}
