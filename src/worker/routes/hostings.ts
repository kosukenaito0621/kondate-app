import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { weekdayIndex, WEEKDAY_LABELS } from '../../shared/date';
import {
  createHostingSchema,
  DEFAULT_COURSES,
  MEAL_LABEL,
  saveCoursesSchema,
  updateHostingSchema,
} from '../../shared/hosting';
import { versionSchema } from '../../shared/plan';
import { chunkRows } from '../db/chunk';
import { hostingCourses, hostings, mealPlans, recipes } from '../db/schema';
import { forbidGuest, requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import {
  bumpVersion,
  buildPlanView,
  inWeek,
  replaceItems,
  saveCost,
  stale,
  validWeekStart,
  type Ctx,
} from './plans';

const dayName = (date: string) => `${WEEKDAY_LABELS[weekdayIndex(date)]}曜`;

/** その週の、自分の食卓のもてなし */
async function findHosting(c: Ctx, weekStart: string, id: string) {
  const row = await c.var.db
    .select({ hosting: hostings })
    .from(hostings)
    .innerJoin(mealPlans, eq(mealPlans.id, hostings.planId))
    .where(
      and(
        eq(hostings.id, id),
        eq(mealPlans.groupId, c.var.group.id),
        eq(mealPlans.weekStart, weekStart),
      ),
    )
    .get();
  return row?.hosting ?? null;
}

const touch = (c: Ctx, id: string) =>
  c.var.db
    .update(hostings)
    .set({ updatedBy: c.var.user.id, updatedAt: Date.now() })
    .where(eq(hostings.id, id));

export const hostingRoutes = new Hono<AppEnv>()
  .use(requireAuth, forbidGuest, requireGroup)
  /** もてなしを追加（初期の枠が並ぶ）。夜ならその日のふだんの料理を外す */
  .post('/:weekStart/days/:date', zValidator('json', createHostingSchema), async (c) => {
    const ws = validWeekStart(c);
    const date = c.req.param('date');
    if (!ws || !inWeek(ws, date)) return c.json({ error: 'invalid_date' }, 400);
    const { version, meal, servings } = c.req.valid('json');
    const db = c.var.db;
    // 版を進める前に確かめる（失敗で版が進まないように）
    const exists = await db
      .select({ id: hostings.id })
      .from(hostings)
      .innerJoin(mealPlans, eq(mealPlans.id, hostings.planId))
      .where(
        and(
          eq(mealPlans.groupId, c.var.group.id),
          eq(mealPlans.weekStart, ws),
          eq(hostings.date, date),
          eq(hostings.meal, meal),
        ),
      )
      .get();
    if (exists) return c.json({ error: 'hosting_exists' }, 409);
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    const id = crypto.randomUUID();
    const inserts = [
      db.insert(hostings).values({
        id,
        planId: plan.id,
        date,
        meal,
        servings,
        updatedBy: c.var.user.id,
        updatedAt: Date.now(),
      }),
      ...chunkRows(
        DEFAULT_COURSES.map((course, position) => ({
          id: crypto.randomUUID(),
          hostingId: id,
          position,
          label: course.label,
          category: course.category,
          recipeId: null,
        })),
        6,
      ).map((chunk) => db.insert(hostingCourses).values(chunk)),
    ];
    if (meal === 'dinner') {
      await replaceItems(c, plan.id, [], { date }, inserts);
      await saveCost(db, c.var.group.id, plan.id, ws);
    } else {
      await db.batch([inserts[0]!, ...inserts.slice(1)]);
    }
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [date],
      summary: `${dayName(date)}の${MEAL_LABEL[meal]}にもてなしを追加しました`,
    });
    return c.json(await buildPlanView(db, c.var.group.id, ws));
  })
  /** 人数を変える */
  .patch('/:weekStart/:id', zValidator('json', updateHostingSchema), async (c) => {
    const ws = validWeekStart(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    const hosting = await findHosting(c, ws, c.req.param('id'));
    if (!hosting) return c.json({ error: 'not_found' }, 404);
    const { version, servings } = c.req.valid('json');
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    await c.var.db
      .update(hostings)
      .set({ servings, updatedBy: c.var.user.id, updatedAt: Date.now() })
      .where(eq(hostings.id, hosting.id));
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [hosting.date],
      summary: `${dayName(hosting.date)}のもてなしの人数を変更しました`,
    });
    return c.json(await buildPlanView(c.var.db, c.var.group.id, ws));
  })
  /** コースの枠をまとめて保存する（追加・削除・並べ替え・レシピの指定） */
  .put('/:weekStart/:id/courses', zValidator('json', saveCoursesSchema), async (c) => {
    const ws = validWeekStart(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    const hosting = await findHosting(c, ws, c.req.param('id'));
    if (!hosting) return c.json({ error: 'not_found' }, 404);
    const { version, courses } = c.req.valid('json');
    const db = c.var.db;
    const ids = [...new Set(courses.flatMap((x) => (x.recipeId ? [x.recipeId] : [])))];
    if (ids.length) {
      // 見えるレシピ（システム共通か自分の食卓）だけ選べる
      const visible = await db
        .select({ id: recipes.id, category: recipes.category })
        .from(recipes)
        .where(
          and(
            inArray(recipes.id, ids),
            or(isNull(recipes.groupId), eq(recipes.groupId, c.var.group.id)),
          ),
        );
      const categoryOf = new Map(visible.map((r) => [r.id, r.category]));
      if (ids.some((id) => !categoryOf.has(id))) {
        return c.json({ error: 'recipe_not_found' }, 404);
      }
      // すでに入っている枠はそのまま通す（あとからレシピの分類が変わっても、ほかの枠を保存できるように）
      const saved = await db
        .select({ recipeId: hostingCourses.recipeId, category: hostingCourses.category })
        .from(hostingCourses)
        .where(eq(hostingCourses.hostingId, hosting.id));
      const kept = new Set(saved.map((x) => `${x.category}|${x.recipeId}`));
      const mismatch = (x: (typeof courses)[number]) =>
        x.recipeId &&
        categoryOf.get(x.recipeId) !== x.category &&
        !kept.has(`${x.category}|${x.recipeId}`);
      if (courses.some(mismatch)) {
        return c.json({ error: 'category_mismatch' }, 400);
      }
    }
    const plan = await bumpVersion(c, ws, version);
    if (!plan) return stale(c);
    const rows = courses.map((course, position) => ({
      id: crypto.randomUUID(),
      hostingId: hosting.id,
      position,
      label: course.label,
      category: course.category,
      recipeId: course.recipeId,
    }));
    await db.batch([
      db.delete(hostingCourses).where(eq(hostingCourses.hostingId, hosting.id)),
      touch(c, hosting.id),
      ...chunkRows(rows, 6).map((chunk) => db.insert(hostingCourses).values(chunk)),
    ]);
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [hosting.date],
      summary: `${dayName(hosting.date)}のもてなしのコースを変更しました`,
    });
    return c.json(await buildPlanView(db, c.var.group.id, ws));
  })
  /** もてなしを消す（夜を消しても、その日のふだんの献立は自動では埋めない） */
  .delete('/:weekStart/:id', zValidator('json', versionSchema), async (c) => {
    const ws = validWeekStart(c);
    if (!ws) return c.json({ error: 'invalid_week' }, 400);
    const hosting = await findHosting(c, ws, c.req.param('id'));
    if (!hosting) return c.json({ error: 'not_found' }, 404);
    const plan = await bumpVersion(c, ws, c.req.valid('json').version);
    if (!plan) return stale(c);
    await c.var.db.delete(hostings).where(eq(hostings.id, hosting.id));
    notifyGroup(c, {
      type: 'plan.updated',
      weekStart: ws,
      dates: [hosting.date],
      summary: `${dayName(hosting.date)}のもてなしを消しました`,
    });
    return c.json(await buildPlanView(c.var.db, c.var.group.id, ws));
  });
