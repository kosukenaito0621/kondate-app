import { and, asc, eq, inArray } from 'drizzle-orm';
import { MEALS, type HostingView } from '../../shared/hosting';
import type { Db } from '../db/client';
import { hostingCourses, hostings, recipes } from '../db/schema';
import { toSummary } from '../routes/recipes';

/** 週の献立に属するもてなし（日付 → 昼・夜の順） */
export async function loadHostings(
  db: Db,
  planId: string,
  cooked: ReadonlyMap<string, string>,
  favorites: ReadonlySet<string>,
) {
  const heads = await db.select().from(hostings).where(eq(hostings.planId, planId));
  const byDate = new Map<string, HostingView[]>();
  if (!heads.length) return byDate;
  const rows = await db
    .select({ course: hostingCourses, recipe: recipes })
    .from(hostingCourses)
    .leftJoin(recipes, eq(recipes.id, hostingCourses.recipeId))
    .where(
      inArray(
        hostingCourses.hostingId,
        heads.map((h) => h.id),
      ),
    )
    .orderBy(asc(hostingCourses.position));
  const sorted = [...heads].sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  for (const h of sorted) {
    const view: HostingView = {
      id: h.id,
      date: h.date,
      meal: h.meal,
      servings: h.servings,
      courses: rows
        .filter((r) => r.course.hostingId === h.id)
        .map(({ course, recipe }) => ({
          id: course.id,
          label: course.label,
          category: course.category,
          recipe: recipe ? toSummary(recipe) : null,
          cookedLogId: recipe ? (cooked.get(`${h.date}|${recipe.id}`) ?? null) : null,
          favorite: recipe ? favorites.has(recipe.id) : false,
        })),
    };
    byDate.set(h.date, [...(byDate.get(h.date) ?? []), view]);
  }
  return byDate;
}

/** 夜のもてなしがある日 */
export async function dinnerHostedDates(db: Db, planId: string, dates?: string[]) {
  const rows = await db
    .select({ date: hostings.date })
    .from(hostings)
    .where(
      and(
        eq(hostings.planId, planId),
        eq(hostings.meal, 'dinner'),
        dates ? inArray(hostings.date, dates) : undefined,
      ),
    );
  return new Set(rows.map((r) => r.date));
}
