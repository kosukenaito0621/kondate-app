import { describe, expect, it } from 'vitest';
import { toJstDate } from '../src/shared/date';
import type { CreatedInvite } from '../src/shared/groups';
import type { PantryItemView } from '../src/shared/pantry';
import type { PlanView } from '../src/shared/plan';
import type { ShoppingListView } from '../src/shared/shopping';
import { api, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';
// 豚の生姜焼き（2人分）：豚ロース肉 250g・玉ねぎ 1/2個 …
const GINGER_PORK = 'sys-main-wa-02';

const pantry = async (u: TestUser) => json<PantryItemView[]>(await api(u, '/api/pantry'));
const add = (u: TestUser, body: Partial<PantryItemView> & { name: string }) =>
  api(u, '/api/pantry', {
    method: 'POST',
    json: { quantity: null, unit: null, expiresOn: null, ...body },
  });

describe('在庫API', () => {
  it('追加・変更・削除ができ、同じ食材・同じ期限は合わせる', async () => {
    const u = await login('pantry-crud');
    expect(await pantry(u)).toEqual([]);
    expect((await add(u, { name: 'タマネギ', quantity: 2, unit: '個' })).status).toBe(201);
    await add(u, { name: '玉ねぎ', quantity: 1, unit: '個' });
    // 単位がちがう・期限がちがうものは別の行
    await add(u, { name: '玉ねぎ', quantity: 200, unit: 'g' });
    await add(u, { name: '鶏もも肉', quantity: 300, unit: 'g', expiresOn: '2026-10-22' });
    const rows = await pantry(u);
    expect(rows.map((r) => [r.name, r.quantity, r.unit])).toEqual([
      ['玉ねぎ', 3, '個'],
      ['玉ねぎ', 200, 'g'],
      ['鶏もも肉', 300, 'g'],
    ]);
    expect(rows.find((r) => r.name === '鶏もも肉')).toMatchObject({
      section: 'meat',
      expiresOn: '2026-10-22',
    });

    const id = rows[0]!.id;
    const patched = await json<PantryItemView>(
      await api(u, `/api/pantry/${id}`, { method: 'PATCH', json: { quantity: null } }),
    );
    expect(patched).toMatchObject({ quantity: null, unit: null });
    expect((await api(u, `/api/pantry/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await pantry(u)).toHaveLength(2);
  });

  it('ほかのグループの在庫は見えず、変えられない', async () => {
    const a = await login('pantry-a');
    const b = await login('pantry-b');
    await add(a, { name: 'にんじん', quantity: 2, unit: '本' });
    const [row] = await pantry(a);
    expect(await pantry(b)).toEqual([]);
    expect(
      (await api(b, `/api/pantry/${row!.id}`, { method: 'PATCH', json: { quantity: 1 } })).status,
    ).toBe(404);
    expect((await api(b, `/api/pantry/${row!.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('グループのメンバーで共有する', async () => {
    const owner = await login('pantry-owner');
    const member = await login('pantry-member');
    const inv = await json<CreatedInvite>(
      await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
    );
    await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });
    await add(owner, { name: '豆腐', quantity: 1, unit: '丁' });
    expect((await pantry(member)).map((r) => r.name)).toEqual(['豆腐']);
  });

  it('入力の誤りは 400', async () => {
    const u = await login('pantry-bad');
    expect((await add(u, { name: '' })).status).toBe(400);
    expect((await add(u, { name: '卵', quantity: -1, unit: '個' })).status).toBe(400);
    expect((await add(u, { name: '卵', expiresOn: '10/22' })).status).toBe(400);
  });
});

describe('買い物リストと在庫', () => {
  async function setup(sub: string) {
    const u = await login(sub);
    await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: {} });
    const l = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    return { u, l };
  }

  it('在庫で足りるもの・一部足りるものが分かる', async () => {
    const { u, l } = await setup('pantry-shop');
    const gram = l.items.find((i) => i.unit === 'g' && (i.quantity ?? 0) > 10)!;
    const other = l.items.find((i) => i !== gram && i.quantity !== null)!;
    // 半分だけある・数量の分からない在庫がある
    await add(u, { name: gram.name, quantity: gram.quantity! / 2, unit: 'g' });
    await add(u, { name: other.name });
    const after = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    const g = after.items.find((i) => i.id === gram.id)!;
    expect(g.stock).toMatchObject({ status: 'partial' });
    expect(g.stock!.remaining).toMatch(/g$/);
    expect(after.items.find((i) => i.id === other.id)!.stock).toMatchObject({
      status: 'covered',
      have: 'あり',
    });
    // 在庫にないものは null
    expect(after.items.filter((i) => i.stock === null).length).toBeGreaterThan(0);
  });

  it('かごに入れたものを在庫に入れる。2回目は入らない', async () => {
    const { u, l } = await setup('pantry-from-shop');
    const picked = l.items.filter((i) => i.quantity !== null).slice(0, 3);
    for (const i of picked)
      await api(u, `/api/shopping/items/${i.id}`, { method: 'PATCH', json: { checked: true } });

    const res = await json<{ added: number }>(
      await api(u, '/api/pantry/from-shopping', { method: 'POST', json: { weekStart: WEEK } }),
    );
    expect(res.added).toBe(3);
    const rows = await pantry(u);
    for (const i of picked)
      expect(rows.find((r) => r.name === i.name)).toMatchObject({
        quantity: i.quantity,
        unit: i.unit,
      });
    const view = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    expect(
      view.items
        .filter((i) => i.stocked)
        .map((i) => i.id)
        .sort(),
    ).toEqual(picked.map((i) => i.id).sort());
    // かごに入れた項目は在庫とくらべない
    expect(view.items.filter((i) => i.checked).every((i) => i.stock === null)).toBe(true);

    const again = await json<{ added: number }>(
      await api(u, '/api/pantry/from-shopping', { method: 'POST', json: { weekStart: WEEK } }),
    );
    expect(again.added).toBe(0);
  });
});

describe('作ったら在庫から減らす', () => {
  it('人数に合わせて減らし、記録を消すと戻す', async () => {
    // テストユーザーは1人グループ（1人分）なので、2人分のレシピの半分を使う
    const u = await login('pantry-cook');
    await add(u, { name: '豚ロース肉', quantity: 300, unit: 'g', expiresOn: '2026-10-25' });
    await add(u, { name: '玉ねぎ', quantity: 2, unit: '個' });
    await add(u, { name: 'しょうが' }); // 数量の分からない在庫は減らさない

    const res = await api(u, '/api/logs', { method: 'POST', json: { recipeId: GINGER_PORK } });
    expect(res.status).toBe(201);
    const log = await json<{ id: string; pantryUsed: string[] }>(res);
    expect(log.pantryUsed).toEqual(['豚ロース肉 125g', '玉ねぎ 1/4個']);
    const used = await pantry(u);
    expect(used.map((r) => [r.name, r.quantity, r.unit])).toEqual([
      ['しょうが', null, null],
      ['玉ねぎ', 1.75, '個'],
      ['豚ロース肉', 175, 'g'],
    ]);

    // 同じ日にもう一度押しても二重には減らさない
    await api(u, '/api/logs', { method: 'POST', json: { recipeId: GINGER_PORK } });
    expect((await pantry(u)).find((r) => r.name === '豚ロース肉')!.quantity).toBe(175);

    await api(u, `/api/logs/${log.id}`, { method: 'DELETE' });
    const restored = await pantry(u);
    expect(restored.find((r) => r.name === '豚ロース肉')).toMatchObject({
      quantity: 300,
      expiresOn: '2026-10-25',
    });
    expect(restored.find((r) => r.name === '玉ねぎ')!.quantity).toBe(2);
  });

  it('使い切った在庫は消え、取り消すと期限ごと戻る', async () => {
    const u = await login('pantry-cook-all');
    await add(u, { name: '豚ロース肉', quantity: 100, unit: 'g', expiresOn: '2026-10-21' });
    const log = await json<{ id: string }>(
      await api(u, '/api/logs', { method: 'POST', json: { recipeId: GINGER_PORK } }),
    );
    expect(await pantry(u)).toEqual([]);
    await api(u, `/api/logs/${log.id}`, { method: 'DELETE' });
    expect(await pantry(u)).toMatchObject([
      { name: '豚ロース肉', quantity: 100, unit: 'g', expiresOn: '2026-10-21' },
    ]);
  });

  it('在庫がなければ何も変わらない', async () => {
    const u = await login('pantry-cook-none');
    const log = await json<{ pantryUsed: string[]; date: string }>(
      await api(u, '/api/logs', { method: 'POST', json: { recipeId: GINGER_PORK } }),
    );
    expect(log).toMatchObject({ pantryUsed: [], date: toJstDate() });
  });
});

describe('献立と在庫', () => {
  it('在庫があっても献立は作れる（在庫を使う料理が選ばれやすくなるだけ）', async () => {
    const u = await login('pantry-plan');
    await add(u, { name: '鶏もも肉', quantity: 600, unit: 'g', expiresOn: '2026-10-21' });
    const v = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: {} }),
    );
    expect(v.days.every((d) => d.items.some((i) => i.slot === 'main'))).toBe(true);
  });
});
