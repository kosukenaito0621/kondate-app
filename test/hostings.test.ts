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

  it('レシピの分類があとから変わっても、そのコースの並べ替えや保存はできる', async () => {
    const u = await login('host-recat');
    const recipe = await json<RecipeDetail>(
      await api(u, '/api/recipes', { method: 'POST', json: dessert }),
    );
    const { view, hosting } = await created(u);
    const first = [course('デザート', 'dessert', recipe.id), course('汁物', 'soup')];
    const saved = await json<PlanView>(await save(u, hosting.id, first, view.version));
    const edited = await api(u, `/api/recipes/${recipe.id}`, {
      method: 'PUT',
      json: { ...dessert, category: 'side' },
    });
    expect(edited.status).toBe(200);
    const res = await save(u, hosting.id, [...first].reverse(), saved.version);
    expect(res.status).toBe(200);
    expect((await json<PlanView>(res)).days[0]!.hostings[0]!.courses[1]!.recipe?.id).toBe(
      recipe.id,
    );
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

// 豚の生姜焼き（2人分）：豚ロース肉 250g ほか
const GINGER_PORK = 'sys-main-wa-02';
const withMain = (u: TestUser, id: string, version: number) =>
  save(u, id, [course('主菜', 'main', GINGER_PORK)], version);

describe('ふだんの献立との関係', () => {
  it('おまかせ作成は夜のもてなしの日を埋めず、昼のもてなしの日は埋める', async () => {
    const u = await login('host-gen');
    await created(u, MON, 'dinner', 4);
    const { view } = await created(u, '2026-10-20', 'lunch', 4);
    const after = await generate(u, view.version);
    expect(after.days[0]!.items).toEqual([]);
    expect(after.days[1]!.items.length).toBeGreaterThan(0);
  });

  it('作り直しても、もてなしは変わらない', async () => {
    const u = await login('host-regen');
    const a = await generate(u);
    const { view, hosting } = await created(u, MON, 'lunch', 6, a.version);
    const saved = await json<PlanView>(await withMain(u, hosting.id, view.version));
    const after = await generate(u, saved.version);
    expect(after.days[0]!.hostings[0]!.courses[0]!.recipe?.id).toBe(GINGER_PORK);
  });

  it('元に戻しても、もてなしは変わらず、夜のもてなしの日にふだんの料理は戻らない', async () => {
    const u = await login('host-undo');
    const a = await generate(u);
    const b = await generate(u, a.version);
    const { view } = await created(u, MON, 'dinner', 4, b.version);
    const back = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/undo`, { method: 'POST', json: { version: view.version } }),
    );
    expect(back.days[0]!.hostings).toHaveLength(1);
    expect(back.days[0]!.items).toEqual([]);
    expect(back.days[1]!.items.length).toBeGreaterThan(0);
  });

  it('夜のもてなしの日のふだんの献立の操作は 400 hosting_day で、版が進まない', async () => {
    const u = await login('host-guard');
    const a = await generate(u);
    const { view } = await created(u, MON, 'dinner', 4, a.version);
    const tue = '2026-10-20';
    const version = view.version;
    const calls = [
      api(u, `/api/plans/${WEEK}/days/${MON}/regenerate`, { method: 'POST', json: { version } }),
      api(u, `/api/plans/${WEEK}/days/${MON}/mode`, {
        method: 'PUT',
        json: { version, mode: 'eat_out' },
      }),
      api(u, `/api/plans/${WEEK}/days/${MON}/main`, {
        method: 'PUT',
        json: { version, recipeId: GINGER_PORK },
      }),
      api(u, `/api/plans/${WEEK}/swap`, { method: 'POST', json: { version, from: MON, to: tue } }),
      api(u, `/api/plans/${WEEK}/swap`, { method: 'POST', json: { version, from: tue, to: MON } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(400);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'hosting_day' });
    }
    expect((await planOf(u)).version).toBe(version);
  });

  it('昼のもてなしの日は、日を入れ替えてももてなしは動かない', async () => {
    const u = await login('host-swap');
    const a = await generate(u);
    const { view } = await created(u, MON, 'lunch', 4, a.version);
    const after = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/swap`, {
        method: 'POST',
        json: { version: view.version, from: MON, to: '2026-10-20' },
      }),
    );
    expect(after.days[0]!.hostings).toHaveLength(1);
    expect(after.days[1]!.hostings).toHaveLength(0);
  });
});

describe('買い物リスト・費用・在庫', () => {
  const pork = (l: ShoppingListView) => l.items.find((i) => i.name === '豚ロース肉');

  it('買い物リストにもてなしの人数分で入る', async () => {
    const u = await login('host-shop');
    const { view, hosting } = await created(u, MON, 'lunch', 6);
    await withMain(u, hosting.id, view.version);
    const list = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    expect(pork(list)).toMatchObject({ quantity: 750, unit: 'g' });
  });

  it('未定の枠は買い物リストに影響しない', async () => {
    const u = await login('host-shop-empty');
    await created(u, MON, 'lunch', 6);
    const res = await api(u, `/api/shopping/${WEEK}`);
    expect(res.status).toBe(200);
    expect((await json<ShoppingListView>(res)).items).toEqual([]);
  });

  it('もてなしを変えると買い物リストが古いと分かる', async () => {
    const u = await login('host-shop-stale');
    const { view, hosting } = await created(u, MON, 'lunch', 6);
    const saved = await json<PlanView>(await withMain(u, hosting.id, view.version));
    await api(u, `/api/shopping/${WEEK}`);
    await api(u, `${base}/${hosting.id}`, {
      method: 'PATCH',
      json: { version: saved.version, servings: 8 },
    });
    expect((await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`))).outdated).toBe(
      true,
    );
  });

  it('費用の目安にもてなしは含まれない', async () => {
    const u = await login('host-cost');
    const a = await generate(u);
    const { view, hosting } = await created(u, '2026-10-20', 'lunch', 6, a.version);
    const saved = await json<PlanView>(await withMain(u, hosting.id, view.version));
    expect(saved.estimatedCost).toBe(a.estimatedCost);
  });

  const stockOfPork = async (u: TestUser) =>
    (await json<{ name: string; quantity: number }[]>(await api(u, '/api/pantry'))).find(
      (i) => i.name === '豚ロース肉',
    )?.quantity;
  const addPork = (u: TestUser) =>
    api(u, '/api/pantry', {
      method: 'POST',
      json: { name: '豚ロース肉', quantity: 1000, unit: 'g', expiresOn: null },
    });

  it('「作った」でもてなしの人数分が在庫から引かれる', async () => {
    const u = await login('host-cook');
    await addPork(u);
    const { view, hosting } = await created(u, MON, 'lunch', 6);
    const saved = await json<PlanView>(await withMain(u, hosting.id, view.version));
    const courseId = saved.days[0]!.hostings[0]!.courses[0]!.id;
    const res = await api(u, '/api/logs', {
      method: 'POST',
      json: { recipeId: GINGER_PORK, date: MON, hostingCourseId: courseId },
    });
    expect(res.status).toBe(201);
    expect(await stockOfPork(u)).toBe(250);
  });

  it('ほかの食卓の hostingCourseId は 404', async () => {
    const owner = await login('host-cook-owner');
    const other = await login('host-cook-other');
    const { view, hosting } = await created(owner, MON, 'lunch', 6);
    const saved = await json<PlanView>(await withMain(owner, hosting.id, view.version));
    const res = await api(other, '/api/logs', {
      method: 'POST',
      json: {
        recipeId: GINGER_PORK,
        date: MON,
        hostingCourseId: saved.days[0]!.hostings[0]!.courses[0]!.id,
      },
    });
    expect(res.status).toBe(404);
  });

  it('もてなしとふだんの献立で同じレシピを同じ日に使うと、両方に印が付き、在庫は1回だけ引かれる', async () => {
    const u = await login('host-cook-both');
    await addPork(u);
    const { view, hosting } = await created(u, MON, 'lunch', 6);
    const saved = await json<PlanView>(await withMain(u, hosting.id, view.version));
    await api(u, `/api/plans/${WEEK}/days/${MON}/main`, {
      method: 'PUT',
      json: { version: saved.version, recipeId: GINGER_PORK },
    });
    const courseId = saved.days[0]!.hostings[0]!.courses[0]!.id;
    await api(u, '/api/logs', {
      method: 'POST',
      json: { recipeId: GINGER_PORK, date: MON, hostingCourseId: courseId },
    });
    await api(u, '/api/logs', { method: 'POST', json: { recipeId: GINGER_PORK, date: MON } });
    const after = (await planOf(u)).days[0]!;
    expect(after.items.find((i) => i.slot === 'main')!.cookedLogId).not.toBeNull();
    expect(after.hostings[0]!.courses[0]!.cookedLogId).not.toBeNull();
    expect(await stockOfPork(u)).toBe(250);
  });
});
