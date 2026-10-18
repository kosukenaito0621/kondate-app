import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, isNull, like, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  createLogSchema,
  monthParam,
  streakDays,
  type CookLogMonth,
  type RecipeCookStats,
} from '../../shared/cooklog';
import { addDays, toJstDate } from '../../shared/date';
import type { Db } from '../db/client';
import { cookLogs, recipes, users } from '../db/schema';
import { isGroupImageKey } from '../lib/images';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import { deleteImage } from './images';
import { toSummary } from './recipes';

async function loadMonth(db: Db, groupId: string, month: string): Promise<CookLogMonth> {
  const rows = await db
    .select({ log: cookLogs, recipe: recipes, user: users })
    .from(cookLogs)
    .innerJoin(recipes, eq(recipes.id, cookLogs.recipeId))
    .leftJoin(users, eq(users.id, cookLogs.userId))
    .where(and(eq(cookLogs.groupId, groupId), like(cookLogs.date, `${month}-%`)))
    .orderBy(desc(cookLogs.date), desc(cookLogs.createdAt));

  const today = toJstDate();
  const recent = await db
    .selectDistinct({ date: cookLogs.date })
    .from(cookLogs)
    .where(and(eq(cookLogs.groupId, groupId), gte(cookLogs.date, addDays(today, -400))));

  return {
    month,
    entries: rows.map((r) => ({
      id: r.log.id,
      date: r.log.date,
      imageKey: r.log.imageKey,
      recipe: toSummary(r.recipe),
      cookedBy: r.user
        ? { id: r.user.id, name: r.user.displayName, avatarUrl: r.user.avatarUrl }
        : null,
    })),
    stats: {
      count: rows.length,
      days: new Set(rows.map((r) => r.log.date)).size,
      streak: streakDays(
        recent.map((r) => r.date),
        today,
      ),
      distinctRecipes: new Set(rows.map((r) => r.recipe.id)).size,
    },
  };
}

export async function recipeCookStats(
  db: Db,
  groupId: string,
  recipeId: string,
): Promise<RecipeCookStats> {
  const row = await db
    .select({ count: sql<number>`count(*)`, last: sql<string | null>`max(${cookLogs.date})` })
    .from(cookLogs)
    .where(and(eq(cookLogs.groupId, groupId), eq(cookLogs.recipeId, recipeId)))
    .get();
  const photos = await db
    .select({ id: cookLogs.id, date: cookLogs.date, imageKey: cookLogs.imageKey })
    .from(cookLogs)
    .where(
      and(
        eq(cookLogs.groupId, groupId),
        eq(cookLogs.recipeId, recipeId),
        sql`${cookLogs.imageKey} is not null`,
      ),
    )
    .orderBy(desc(cookLogs.date))
    .limit(6);
  const today = await db
    .select({ id: cookLogs.id, imageKey: cookLogs.imageKey })
    .from(cookLogs)
    .where(
      and(
        eq(cookLogs.groupId, groupId),
        eq(cookLogs.recipeId, recipeId),
        eq(cookLogs.date, toJstDate()),
      ),
    )
    .get();
  return {
    count: row?.count ?? 0,
    lastDate: row?.last ?? null,
    cookedToday: !!today,
    todayLogId: today?.id ?? null,
    photos: photos.map((p) => ({ logId: p.id, date: p.date, imageKey: p.imageKey! })),
  };
}

const monthQuery = z.object({ month: monthParam.optional() });

export const logRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  .get('/', zValidator('query', monthQuery), async (c) => {
    const month = c.req.valid('query').month ?? toJstDate().slice(0, 7);
    return c.json(await loadMonth(c.var.db, c.var.group.id, month));
  })
  /** 今日記録したレシピ（ホームの「作った」表示用） */
  .get('/today', async (c) => {
    const rows = await c.var.db
      .select({ id: cookLogs.id, recipeId: cookLogs.recipeId })
      .from(cookLogs)
      .where(and(eq(cookLogs.groupId, c.var.group.id), eq(cookLogs.date, toJstDate())));
    return c.json(rows);
  })
  .get('/recipe/:recipeId', async (c) =>
    c.json(await recipeCookStats(c.var.db, c.var.group.id, c.req.param('recipeId'))),
  )
  .post('/', zValidator('json', createLogSchema), async (c) => {
    const { recipeId, date } = c.req.valid('json');
    const db = c.var.db;
    const groupId = c.var.group.id;
    // 見えるレシピ（システム共通か自グループ）だけ記録できる
    const visible = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(eq(recipes.id, recipeId), or(isNull(recipes.groupId), eq(recipes.groupId, groupId))),
      )
      .get();
    if (!visible) return c.json({ error: 'recipe_not_found' }, 404);
    const day = date ?? toJstDate();
    if (day > toJstDate()) return c.json({ error: 'future_date' }, 400);
    await db
      .insert(cookLogs)
      .values({ id: crypto.randomUUID(), groupId, userId: c.var.user.id, recipeId, date: day })
      .onConflictDoNothing();
    const row = await db
      .select({ id: cookLogs.id })
      .from(cookLogs)
      .where(
        and(eq(cookLogs.groupId, groupId), eq(cookLogs.recipeId, recipeId), eq(cookLogs.date, day)),
      )
      .get();
    notifyGroup(c, { type: 'logs.updated' });
    return c.json({ id: row!.id, date: day }, 201);
  })
  /** 写真を付ける・差し替える・外す（null） */
  .patch(
    '/:id',
    zValidator('json', z.object({ imageKey: z.string().max(200).nullable() })),
    async (c) => {
      const { imageKey } = c.req.valid('json');
      const groupId = c.var.group.id;
      if (!isGroupImageKey(groupId, imageKey)) return c.json({ error: 'invalid_image' }, 400);
      const where = and(eq(cookLogs.id, c.req.param('id')), eq(cookLogs.groupId, groupId));
      const before = await c.var.db
        .select({ imageKey: cookLogs.imageKey })
        .from(cookLogs)
        .where(where)
        .get();
      if (!before) return c.json({ error: 'not_found' }, 404);
      await c.var.db.update(cookLogs).set({ imageKey }).where(where);
      if (before.imageKey && before.imageKey !== imageKey)
        await deleteImage(c.var.db, c.env.IMAGES, before.imageKey);
      notifyGroup(c, { type: 'logs.updated' });
      return c.json({ ok: true, imageKey });
    },
  )
  .delete('/:id', async (c) => {
    const res = await c.var.db
      .delete(cookLogs)
      .where(and(eq(cookLogs.id, c.req.param('id')), eq(cookLogs.groupId, c.var.group.id)))
      .returning({ id: cookLogs.id, imageKey: cookLogs.imageKey });
    if (!res.length) return c.json({ error: 'not_found' }, 404);
    await deleteImage(c.var.db, c.env.IMAGES, res[0]!.imageKey);
    notifyGroup(c, { type: 'logs.updated' });
    return c.json({ ok: true });
  });
