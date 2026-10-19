import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CreatedShare, RecipeDetail, SharedRecipe, ShareView } from '../src/shared/recipe';
import { api, BASE, login } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;

const sample = {
  name: '母さんの筑前煮',
  category: 'main',
  genre: 'wa',
  servings: 2,
  timeMinutes: 40,
  costYen: 500,
  mainIngredient: 'chicken',
  difficulty: 'minori',
  ingredients: [
    { name: '鶏もも肉', quantity: 1, unit: '枚', amountText: null, section: 'meat' },
    {
      name: 'しょうゆ',
      quantity: 2,
      unit: '大さじ',
      amountText: null,
      section: 'seasoning',
      group: 'A',
    },
  ],
  steps: [{ text: '炒めて煮る', tip: 'じっくり' }],
  tags: [],
  imageKey: null,
  sourceUrl: null,
  seasons: ['autumn'],
  seasonOnly: false,
};

describe('レシピの共有', () => {
  it('別の家庭の人が共有リンクから見て、自分のレシピとして保存できる', async () => {
    const me = await login(`share-a-${crypto.randomUUID()}`, 'こうすけ');
    const mom = await login(`share-b-${crypto.randomUUID()}`, 'はは');
    const mine = await json<RecipeDetail>(
      await api(me, '/api/recipes', { method: 'POST', json: sample }),
    );

    const created = await api(me, `/api/recipes/${mine.id}/share`, { method: 'POST' });
    expect(created.status).toBe(201);
    const share = await json<CreatedShare>(created);
    expect(share.url).toBe(`${BASE}/r/${share.token}`);

    // 母は別のグループなので、元のレシピは直接は見えない
    expect((await api(mom, `/api/recipes/${mine.id}`)).status).toBe(404);

    const preview = await json<SharedRecipe>(await api(mom, `/api/recipe-shares/${share.token}`));
    expect(preview.sharedBy).toBe('こうすけ');
    expect(preview.recipe.name).toBe('母さんの筑前煮');
    expect(preview.recipe.ingredients.map((i) => [i.name, i.group])).toEqual([
      ['鶏もも肉', null],
      ['しょうゆ', 'A'],
    ]);

    const saved = await api(mom, `/api/recipe-shares/${share.token}/save`, { method: 'POST' });
    expect(saved.status).toBe(201);
    const { id } = await json<{ id: string }>(saved);
    const copy = await json<RecipeDetail>(await api(mom, `/api/recipes/${id}`));
    expect(copy).toMatchObject({ name: '母さんの筑前煮', isSystem: false, seasons: ['autumn'] });
    expect(copy.steps).toEqual([{ text: '炒めて煮る', tip: 'じっくり' }]);

    // 複製なので、元を消しても母のレシピは残る
    await api(me, `/api/recipes/${mine.id}`, { method: 'DELETE' });
    expect((await api(mom, `/api/recipes/${id}`)).status).toBe(200);
    // 元のレシピが消えたリンクは使えない
    expect((await api(mom, `/api/recipe-shares/${share.token}`)).status).toBe(404);
  });

  it('初期レシピも共有できる。未ログイン・でたらめなリンクは使えない', async () => {
    const me = await login(`share-c-${crypto.randomUUID()}`);
    const share = await json<CreatedShare>(
      await api(me, '/api/recipes/sys-main-wa-01/share', { method: 'POST' }),
    );
    const anon = await exports.default.fetch(`${BASE}/api/recipe-shares/${share.token}`);
    expect(anon.status).toBe(401);
    expect((await api(me, '/api/recipe-shares/not-a-real-token')).status).toBe(404);
  });

  it('見えないレシピの共有リンクは作れない', async () => {
    const a = await login(`share-d-${crypto.randomUUID()}`);
    const b = await login(`share-e-${crypto.randomUUID()}`);
    const r = await json<RecipeDetail>(
      await api(a, '/api/recipes', { method: 'POST', json: sample }),
    );
    expect((await api(b, `/api/recipes/${r.id}/share`, { method: 'POST' })).status).toBe(404);
  });
});

describe('レシピをまとめて送る', () => {
  it('選んだレシピを1つのリンクで送り、受け取った人は選んだものだけ保存できる', async () => {
    const me = await login(`bundle-a-${crypto.randomUUID()}`, 'こうすけ');
    const mom = await login(`bundle-b-${crypto.randomUUID()}`, 'はは');
    const a = await json<RecipeDetail>(
      await api(me, '/api/recipes', { method: 'POST', json: { ...sample, name: '母の煮物' } }),
    );
    const b = await json<RecipeDetail>(
      await api(me, '/api/recipes', { method: 'POST', json: { ...sample, name: '母の卵焼き' } }),
    );
    const created = await api(me, '/api/recipes/share-bundle', {
      method: 'POST',
      json: { recipeIds: [a.id, 'sys-main-wa-01', b.id], title: '実家の味' },
    });
    expect(created.status).toBe(201);
    const { token } = await json<CreatedShare>(created);

    const view = await json<ShareView>(await api(mom, `/api/recipe-shares/${token}`));
    expect(view.kind).toBe('bundle');
    if (view.kind !== 'bundle') return;
    expect(view.title).toBe('実家の味');
    expect(view.sharedBy).toBe('こうすけ');
    expect(view.recipes.map((r) => r.name)).toEqual(['母の煮物', '鶏の照り焼き', '母の卵焼き']);

    const saved = await json<{ ids: string[] }>(
      await api(mom, `/api/recipe-shares/${token}/save`, {
        method: 'POST',
        json: { recipeIds: [a.id, b.id] },
      }),
    );
    expect(saved.ids).toHaveLength(2);
    const mine = await json<{ name: string }[]>(await api(mom, '/api/recipes?mine=1'));
    expect(mine.map((r) => r.name).sort()).toEqual(['母の卵焼き', '母の煮物']);

    // 元のレシピを1品消すと、残りだけが見える
    await api(me, `/api/recipes/${a.id}`, { method: 'DELETE' });
    const after = await json<ShareView>(await api(mom, `/api/recipe-shares/${token}`));
    expect(after.kind === 'bundle' && after.recipes.map((r) => r.name)).toEqual([
      '鶏の照り焼き',
      '母の卵焼き',
    ]);
  });

  it('見えないレシピ・31品以上・重複はリンクにできない', async () => {
    const a = await login(`bundle-c-${crypto.randomUUID()}`);
    const b = await login(`bundle-d-${crypto.randomUUID()}`);
    const r = await json<RecipeDetail>(
      await api(a, '/api/recipes', { method: 'POST', json: sample }),
    );
    const post = (u: typeof a, recipeIds: string[]) =>
      api(u, '/api/recipes/share-bundle', { method: 'POST', json: { recipeIds } });
    expect((await post(b, [r.id, 'sys-main-wa-01'])).status).toBe(404);
    const many = Array.from(
      { length: 31 },
      (_, i) => `sys-main-wa-${String(i + 1).padStart(2, '0')}`,
    );
    expect((await post(a, many)).status).toBe(400);
    expect((await post(a, ['sys-main-wa-01', 'sys-main-wa-01'])).status).toBe(400);
  });
});
