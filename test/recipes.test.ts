import { describe, expect, it } from 'vitest';
import type { RecipeDetail, RecipeInput, RecipeSummary } from '../src/shared/recipe';
import { api, login } from './helpers';

const sample: RecipeInput = {
  name: 'うちの肉じゃが',
  category: 'main',
  genre: 'wa',
  servings: 2,
  timeMinutes: 30,
  costYen: 500,
  mainIngredient: 'pork',
  difficulty: 'futaba',
  ingredients: [
    { name: 'タマネギ', quantity: 1, unit: '個', amountText: null, section: 'veg' },
    { name: '豚こま', quantity: 200, unit: 'g', amountText: null, section: 'meat' },
  ],
  steps: [{ text: '切る', tip: '大きさをそろえる' }, { text: '煮る' }],
  tags: ['家庭の味'],
  imageKey: null,
  sourceUrl: null,
};

describe('レシピAPI', () => {
  it('初期レシピ110件が見える（ふたば・カテゴリで絞り込める）', async () => {
    const u = await login('recipe-list');
    const all = (await (await api(u, '/api/recipes')).json()) as RecipeSummary[];
    expect(all).toHaveLength(110);
    expect(all.every((r) => r.isSystem)).toBe(true);

    const futabaMain = (await (
      await api(u, '/api/recipes?category=main&difficulty=futaba')
    ).json()) as RecipeSummary[];
    expect(futabaMain.length).toBe(30);
    expect(futabaMain.every((r) => r.category === 'main' && r.difficulty === 'futaba')).toBe(true);
  });

  it('料理名と材料名（表記ゆれ込み）で検索できる', async () => {
    const u = await login('recipe-search');
    const byName = (await (await api(u, '/api/recipes?q=照り焼き')).json()) as RecipeSummary[];
    expect(byName.map((r) => r.name)).toContain('鶏の照り焼き');

    const byIngredient = (await (
      await api(u, `/api/recipes?q=${encodeURIComponent('ナス')}`)
    ).json()) as RecipeSummary[];
    expect(byIngredient.map((r) => r.name)).toEqual(
      expect.arrayContaining(['麻婆なす', 'ラタトゥイユ']),
    );
  });

  it('詳細には材料と手順（コツ付き）が入る', async () => {
    const u = await login('recipe-detail');
    const res = await api(u, '/api/recipes/sys-main-wa-01');
    const r = (await res.json()) as RecipeDetail;
    expect(r.name).toBe('鶏の照り焼き');
    expect(r.ingredients[0]).toMatchObject({ name: '鶏もも肉', quantity: 1, unit: '枚' });
    expect(r.steps.every((s) => s.tip)).toBe(true);
  });

  it('材料のグループ（A・B）を保存し、同じ調味料も別々に返す', async () => {
    const u = await login('recipe-ing-group');
    const res = await api(u, '/api/recipes', {
      method: 'POST',
      json: {
        ...sample,
        ingredients: [
          ...sample.ingredients,
          {
            name: 'しょうゆ',
            quantity: 1,
            unit: '大さじ',
            amountText: null,
            section: 'seasoning',
            group: 'A（たれ）',
          },
          {
            name: 'しょうゆ',
            quantity: 1,
            unit: '小さじ',
            amountText: null,
            section: 'seasoning',
            group: 'B',
          },
        ],
      },
    });
    const r = (await res.json()) as RecipeDetail;
    expect(r.ingredients.map((i) => [i.name, i.group])).toEqual([
      ['玉ねぎ', null],
      ['豚こま切れ肉', null],
      ['しょうゆ', 'A（たれ）'],
      ['しょうゆ', 'B'],
    ]);
  });

  it('グループのレシピを作成・編集・削除できる（材料名は正規化、費用段階は自動）', async () => {
    const u = await login('recipe-crud');
    const created = await api(u, '/api/recipes', { method: 'POST', json: sample });
    expect(created.status).toBe(201);
    const r = (await created.json()) as RecipeDetail;
    expect(r.isSystem).toBe(false);
    expect(r.costLevel).toBe('normal');
    expect(r.ingredients.map((i) => i.name)).toEqual(['玉ねぎ', '豚こま切れ肉']);

    const updated = await api(u, `/api/recipes/${r.id}`, {
      method: 'PUT',
      json: { ...sample, name: 'うちの肉じゃが改', costYen: 300 },
    });
    expect(await updated.json()).toMatchObject({ name: 'うちの肉じゃが改', costLevel: 'save' });

    const mine = (await (await api(u, '/api/recipes?mine=1')).json()) as RecipeSummary[];
    expect(mine.map((x) => x.id)).toEqual([r.id]);

    expect((await api(u, `/api/recipes/${r.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await api(u, `/api/recipes/${r.id}`)).status).toBe(404);
  });

  it('システム共通レシピは編集・削除できないが、複製・非表示はできる', async () => {
    const u = await login('recipe-system');
    expect(
      (await api(u, '/api/recipes/sys-main-wa-01', { method: 'PUT', json: sample })).status,
    ).toBe(404);
    expect((await api(u, '/api/recipes/sys-main-wa-01', { method: 'DELETE' })).status).toBe(404);

    const copy = await api(u, '/api/recipes/sys-main-wa-01/copy', { method: 'POST' });
    const { id } = (await copy.json()) as { id: string };
    const copied = (await (await api(u, `/api/recipes/${id}`)).json()) as RecipeDetail;
    expect(copied).toMatchObject({ name: '鶏の照り焼き（アレンジ）', isSystem: false });

    await api(u, '/api/recipes/sys-main-wa-02/hide', { method: 'POST', json: { hidden: true } });
    const list = (await (await api(u, '/api/recipes')).json()) as RecipeSummary[];
    expect(list.map((x) => x.id)).not.toContain('sys-main-wa-02');
    await api(u, '/api/recipes/sys-main-wa-02/hide', { method: 'POST', json: { hidden: false } });
    const again = (await (await api(u, '/api/recipes')).json()) as RecipeSummary[];
    expect(again.map((x) => x.id)).toContain('sys-main-wa-02');
  });

  it('材料が多いレシピも保存できる（D1 の変数上限を超えない）', async () => {
    const u = await login('recipe-many');
    const ingredients = Array.from({ length: 30 }, (_, i) => ({
      name: `材料${i + 1}`,
      quantity: i + 1,
      unit: 'g' as const,
      amountText: null,
      section: 'other' as const,
    }));
    const res = await api(u, '/api/recipes', { method: 'POST', json: { ...sample, ingredients } });
    expect(res.status).toBe(201);
    expect(((await res.json()) as RecipeDetail).ingredients).toHaveLength(30);
  });

  it('ふたばのレシピなど入力が不正なら 400', async () => {
    const u = await login('recipe-invalid');
    const bad = await api(u, '/api/recipes', {
      method: 'POST',
      json: { ...sample, ingredients: [] },
    });
    expect(bad.status).toBe(400);
  });

  describe('グループ間のデータ遮断', () => {
    it('他のグループのレシピは見えず、編集・削除・複製もできない', async () => {
      const alice = await login('alice-r');
      const bob = await login('bob-r');
      const r = (await (
        await api(alice, '/api/recipes', { method: 'POST', json: sample })
      ).json()) as RecipeDetail;

      expect((await api(bob, `/api/recipes/${r.id}`)).status).toBe(404);
      expect((await api(bob, `/api/recipes/${r.id}`, { method: 'PUT', json: sample })).status).toBe(
        404,
      );
      expect((await api(bob, `/api/recipes/${r.id}`, { method: 'DELETE' })).status).toBe(404);
      expect((await api(bob, `/api/recipes/${r.id}/copy`, { method: 'POST' })).status).toBe(404);
      const list = (await (await api(bob, '/api/recipes?mine=1')).json()) as RecipeSummary[];
      expect(list).toHaveLength(0);
      // alice 側では残っている
      expect((await api(alice, `/api/recipes/${r.id}`)).status).toBe(200);
    });

    it('所属していないグループを X-Group-Id で指定すると 403', async () => {
      const alice = await login('alice-g');
      const bob = await login('bob-g');
      const res = await api(bob, '/api/recipes', { groupId: alice.groupId });
      expect(res.status).toBe(403);
      const post = await api(bob, '/api/recipes', {
        method: 'POST',
        json: sample,
        groupId: alice.groupId,
      });
      expect(post.status).toBe(403);
    });

    it('未ログインは 401', async () => {
      expect((await api(null, '/api/recipes')).status).toBe(401);
    });
  });
});
