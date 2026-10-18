import { describe, expect, it } from 'vitest';
import type { CreatedInvite } from '../src/shared/groups';
import type { PlanView } from '../src/shared/plan';
import type { ShoppingListView } from '../src/shared/shopping';
import { api, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';

async function generate(u: TestUser) {
  return json<PlanView>(await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: {} }));
}
const list = async (u: TestUser) => json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));

describe('買い物リストAPI', () => {
  it('献立がなければ空', async () => {
    const u = await login('shop-empty');
    expect(await list(u)).toMatchObject({ exists: false, items: [] });
  });

  it('献立から自動で作られ、調味料は含まれず、除外した調味料が分かる', async () => {
    const u = await login('shop-gen');
    await generate(u);
    const l = await list(u);
    expect(l.exists).toBe(true);
    expect(l.items.length).toBeGreaterThan(5);
    expect(l.items.some((i) => ['しょうゆ', '塩', 'サラダ油', '水'].includes(i.name))).toBe(false);
    expect(l.excludedSeasonings.length).toBeGreaterThan(0);
    expect(l.outdated).toBe(false);
    expect(new Set(l.items.map((i) => i.name)).size).toBe(l.items.length);
  });

  it('チェックするとチェックした人が記録され、外せる', async () => {
    const u = await login('shop-check', 'かいもの');
    await generate(u);
    const item = (await list(u)).items[0]!;
    await api(u, `/api/shopping/items/${item.id}`, { method: 'PATCH', json: { checked: true } });
    const after = (await list(u)).items.find((i) => i.id === item.id)!;
    expect(after).toMatchObject({ checked: true, checkedBy: { name: 'かいもの' } });
    await api(u, `/api/shopping/items/${item.id}`, { method: 'PATCH', json: { checked: false } });
    expect((await list(u)).items.find((i) => i.id === item.id)!.checked).toBe(false);
  });

  it('献立を変えると「古い」と分かり、作り直してもチェックと手動の項目は残る', async () => {
    const u = await login('shop-regen');
    const plan = await generate(u);
    const before = await list(u);
    const keep = before.items[0]!;
    await api(u, `/api/shopping/items/${keep.id}`, { method: 'PATCH', json: { checked: true } });
    await api(u, `/api/shopping/${WEEK}/items`, {
      method: 'POST',
      json: { name: 'ミルク', amount: '1本' },
    });

    // 1日分の献立を変える
    await api(u, `/api/plans/${WEEK}/days/${plan.days[3]!.date}/regenerate`, {
      method: 'POST',
      json: { version: plan.version },
    });
    const stale = await list(u);
    expect(stale.outdated).toBe(true);

    const regen = await json<ShoppingListView>(
      await api(u, `/api/shopping/${WEEK}/regenerate`, { method: 'POST' }),
    );
    expect(regen.outdated).toBe(false);
    const manual = regen.items.find((i) => i.isManual)!;
    expect(manual).toMatchObject({ name: '牛乳', section: 'dairy_egg', quantity: 1, unit: '本' });
    const kept = regen.items.find((i) => i.name === keep.name);
    if (kept) expect(kept.checked).toBe(true);
  });

  it('調味料を「買う」に指定すると、作り直したリストに入る', async () => {
    const u = await login('shop-buy');
    await generate(u);
    const l = await list(u);
    const seasoning = l.excludedSeasonings[0]!;
    await api(u, '/api/settings', { method: 'PUT', json: { buySeasonings: [seasoning] } });
    const regen = await json<ShoppingListView>(
      await api(u, `/api/shopping/${WEEK}/regenerate`, { method: 'POST' }),
    );
    expect(regen.items.map((i) => i.name)).toContain(seasoning);
    expect(regen.excludedSeasonings).not.toContain(seasoning);
  });

  it('同じグループで共有され、他のグループの項目はチェック・削除できない', async () => {
    const owner = await login('shop-owner');
    const member = await login('shop-member');
    const outsider = await login('shop-outsider');
    const inv = await json<CreatedInvite>(
      await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
    );
    await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });
    await generate(owner);
    const item = (await list(owner)).items[0]!;

    await api(member, `/api/shopping/items/${item.id}`, {
      method: 'PATCH',
      json: { checked: true },
    });
    expect((await list(owner)).items.find((i) => i.id === item.id)!.checked).toBe(true);

    expect(
      (
        await api(outsider, `/api/shopping/items/${item.id}`, {
          method: 'PATCH',
          json: { checked: false },
        })
      ).status,
    ).toBe(404);
    expect(
      (await api(outsider, `/api/shopping/items/${item.id}`, { method: 'DELETE' })).status,
    ).toBe(404);
    expect((await api(outsider, `/api/shopping/${WEEK}`, { groupId: owner.groupId })).status).toBe(
      403,
    );
  });

  it('削除できる', async () => {
    const u = await login('shop-delete');
    await generate(u);
    const item = (await list(u)).items[0]!;
    expect((await api(u, `/api/shopping/items/${item.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await list(u)).items.some((i) => i.id === item.id)).toBe(false);
  });
});
