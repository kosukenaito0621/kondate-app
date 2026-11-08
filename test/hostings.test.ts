import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { PlanView } from '../src/shared/plan';
import type { RecipeDetail, RecipeInput } from '../src/shared/recipe';
import type { ShoppingListView } from '../src/shared/shopping';
import { hostingCourses, hostings, mealPlans } from '../src/worker/db/schema';
import { api, BASE, db, login, type TestUser } from './helpers';
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

const base = `/api/hostings/${WEEK}`;
const add = (u: TestUser, date: string, meal: string, servings: number, version?: number) =>
  api(u, `${base}/days/${date}`, { method: 'POST', json: { version, meal, servings } });
const created = async (u: TestUser, date = MON, meal = 'lunch', servings = 6, version?: number) => {
  const res = await add(u, date, meal, servings, version);
  expect(res.status).toBe(200);
  const view = await json<PlanView>(res);
  const hosting = view.days.find((d) => d.date === date)!.hostings.find((h) => h.meal === meal)!;
  return { view, hosting };
};
const save = (u: TestUser, id: string, courses: unknown[], version?: number) =>
  api(u, `${base}/${id}/courses`, { method: 'PUT', json: { version, courses } });
const course = (label: string, category: string, recipeId: string | null = null) => ({
  label,
  category,
  recipeId,
});

describe('もてなしのAPI', () => {
  it('昼のもてなしは4枠が順に並び、その日のふだんの献立は残る', async () => {
    const u = await login('host-lunch');
    const a = await generate(u);
    const { view, hosting } = await created(u, MON, 'lunch', 6, a.version);
    expect(hosting.servings).toBe(6);
    expect(hosting.courses.map((c) => [c.label, c.category])).toEqual([
      ['前菜', 'side'],
      ['汁物', 'soup'],
      ['主菜', 'main'],
      ['デザート', 'dessert'],
    ]);
    expect(view.days[0]!.items.length).toBe(a.days[0]!.items.length);
    expect(view.version).toBe(a.version + 1);
  });

  it('夜のもてなしを作ると、その日のふだんの料理が外れる', async () => {
    const u = await login('host-dinner');
    const a = await generate(u);
    const { view } = await created(u, MON, 'dinner', 4, a.version);
    expect(view.days[0]!.items).toEqual([]);
    expect(view.days[1]!.items.length).toBe(a.days[1]!.items.length);
  });

  it('同じ日の昼と夜は両方作れて、昼夜の順に並ぶ', async () => {
    const u = await login('host-both');
    await created(u, MON, 'dinner', 4);
    const { view } = await created(u, MON, 'lunch', 6);
    expect(view.days[0]!.hostings.map((h) => h.meal)).toEqual(['lunch', 'dinner']);
  });

  it('同じ時間帯の2件目は 409 hosting_exists で、版は進まない', async () => {
    const u = await login('host-dup');
    const { view } = await created(u);
    const res = await add(u, MON, 'lunch', 2, view.version);
    expect(res.status).toBe(409);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'hosting_exists' });
    expect((await planOf(u)).version).toBe(view.version);
  });

  it('枠の追加・削除・並べ替えを保存でき、未定の枠も残せる', async () => {
    const u = await login('host-courses');
    const { view, hosting } = await created(u);
    const res = await save(
      u,
      hosting.id,
      [course('肉', 'main', 'sys-main-wa-01'), course('魚', 'main'), course('お吸い物', 'soup')],
      view.version,
    );
    expect(res.status).toBe(200);
    const h = (await json<PlanView>(res)).days[0]!.hostings[0]!;
    expect(h.courses.map((c) => c.label)).toEqual(['肉', '魚', 'お吸い物']);
    expect(h.courses[0]!.recipe?.id).toBe('sys-main-wa-01');
    expect(h.courses[1]!.recipe).toBeNull();
  });

  it('人数を変えられる', async () => {
    const u = await login('host-servings');
    const { view, hosting } = await created(u);
    const res = await api(u, `${base}/${hosting.id}`, {
      method: 'PATCH',
      json: { version: view.version, servings: 8 },
    });
    expect((await json<PlanView>(res)).days[0]!.hostings[0]!.servings).toBe(8);
  });

  it.each([0, 31, 1.5])('人数 %s は 400', async (servings) => {
    const u = await login(`host-bad-servings-${servings}`);
    expect((await add(u, MON, 'lunch', servings)).status).toBe(400);
  });

  it('枠が0個・13個、名前が21文字は 400', async () => {
    const u = await login('host-bad-courses');
    const { hosting } = await created(u);
    expect((await save(u, hosting.id, [])).status).toBe(400);
    expect((await save(u, hosting.id, Array(13).fill(course('枠', 'main')))).status).toBe(400);
    expect((await save(u, hosting.id, [course('あ'.repeat(21), 'main')])).status).toBe(400);
  });

  it('枠の分類と違うレシピは 400 category_mismatch', async () => {
    const u = await login('host-mismatch');
    const { hosting } = await created(u);
    const res = await save(u, hosting.id, [course('前菜', 'side', 'sys-main-wa-01')]);
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'category_mismatch' });
  });

  it('ほかの食卓のもてなしは 404', async () => {
    const owner = await login('host-owner');
    const other = await login('host-other');
    const { hosting } = await created(owner);
    await generate(other);
    expect((await save(other, hosting.id, [course('前菜', 'side')])).status).toBe(404);
    expect((await api(other, `${base}/${hosting.id}`, { method: 'DELETE', json: {} })).status).toBe(
      404,
    );
    expect((await planOf(owner)).days[0]!.hostings).toHaveLength(1);
  });

  it('ほかの食卓のレシピは 404', async () => {
    const owner = await login('host-recipe-owner');
    const other = await login('host-recipe-other');
    const recipe = await json<RecipeDetail>(
      await api(owner, '/api/recipes', { method: 'POST', json: dessert }),
    );
    const { hosting } = await created(other);
    const res = await save(other, hosting.id, [course('デザート', 'dessert', recipe.id)]);
    expect(res.status).toBe(404);
  });

  it('週の外の日付は 400', async () => {
    const u = await login('host-outside');
    expect((await add(u, '2026-10-26', 'lunch', 4)).status).toBe(400);
  });

  it('古い版からの保存は 409', async () => {
    const u = await login('host-stale');
    const { view, hosting } = await created(u);
    expect((await save(u, hosting.id, [course('前菜', 'side')], view.version - 1)).status).toBe(
      409,
    );
  });

  it('消すと週間献立から消え、夜を消してもその日は空のまま', async () => {
    const u = await login('host-delete');
    const a = await generate(u);
    const { view, hosting } = await created(u, MON, 'dinner', 4, a.version);
    const res = await api(u, `${base}/${hosting.id}`, {
      method: 'DELETE',
      json: { version: view.version },
    });
    expect(res.status).toBe(200);
    const after = await json<PlanView>(res);
    expect(after.days[0]!.hostings).toEqual([]);
    expect(after.days[0]!.items).toEqual([]);
  });

  it('お試し版は 403 guest_forbidden', async () => {
    const started = await exports.default.fetch(`${BASE}/api/demo/start`, {
      method: 'POST',
      headers: { origin: BASE, 'cf-connecting-ip': '10.9.9.1' },
    });
    const cookie = started.headers.get('set-cookie')!.split(';')[0]!;
    const res = await add({ cookie, userId: '', groupId: '' }, MON, 'lunch', 4);
    expect(res.status).toBe(403);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'guest_forbidden' });
  });
});
