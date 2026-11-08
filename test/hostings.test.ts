import { describe, expect, it } from 'vitest';
import type { PlanView } from '../src/shared/plan';
import type { RecipeDetail, RecipeInput } from '../src/shared/recipe';
import type { ShoppingListView } from '../src/shared/shopping';
import { hostingCourses, hostings, mealPlans } from '../src/worker/db/schema';
import { api, db, login, type TestUser } from './helpers';
import { eq } from 'drizzle-orm';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';
const MON = '2026-10-19';
const planOf = async (u: TestUser) => json<PlanView>(await api(u, `/api/plans/${WEEK}`));
const generate = async (u: TestUser, version?: number) =>
  json<PlanView>(
    await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: { version } }),
  );

const dessert: RecipeInput = {
  name: 'テストのプリン',
  category: 'dessert',
  genre: 'yo',
  servings: 2,
  timeMinutes: 30,
  costYen: 200,
  mainIngredient: 'other',
  difficulty: 'futaba',
  ingredients: [{ name: '卵', quantity: 2, unit: '個', amountText: '2個', section: 'dairy_egg' }],
  steps: [{ text: '混ぜて冷やす' }],
  tags: [],
  imageKey: null,
  sourceUrl: null,
  seasons: [],
  seasonOnly: false,
};

describe('もてなしの表示', () => {
  it('もてなしがない週は hostings が空', async () => {
    const u = await login('host-empty');
    const v = await generate(u);
    expect(v.days.every((d) => d.hostings.length === 0)).toBe(true);
  });

  it('コースのレシピが消えても、枠は未定に戻り、献立と買い物リストは壊れない', async () => {
    const u = await login('host-recipe-gone');
    await generate(u);
    const recipe = await json<RecipeDetail>(
      await api(u, '/api/recipes', { method: 'POST', json: dessert }),
    );
    const plan = (await db()
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.groupId, u.groupId))
      .get())!;
    await db().insert(hostings).values({
      id: 'h1',
      planId: plan.id,
      date: MON,
      meal: 'lunch',
      servings: 6,
    });
    await db().insert(hostingCourses).values({
      id: 'c1',
      hostingId: 'h1',
      position: 0,
      label: 'デザート',
      category: 'dessert',
      recipeId: recipe.id,
    });
    expect((await planOf(u)).days[0]!.hostings[0]!.courses[0]!.recipe?.id).toBe(recipe.id);

    expect((await api(u, `/api/recipes/${recipe.id}`, { method: 'DELETE' })).status).toBe(200);
    const after = await planOf(u);
    expect(after.days[0]!.hostings[0]!.courses[0]!.recipe).toBeNull();
    const list = await api(u, `/api/shopping/${WEEK}`);
    expect(list.status).toBe(200);
    expect((await json<ShoppingListView>(list)).exists).toBe(true);
  });
});
