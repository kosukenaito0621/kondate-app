import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CreatedShare, RecipeDetail, SharedRecipe } from '../src/shared/recipe';
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
