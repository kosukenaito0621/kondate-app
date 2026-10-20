import { describe, expect, it } from 'vitest';
import type { CreatedInvite } from '../src/shared/groups';
import type { PlanView } from '../src/shared/plan';
import type { RecipeDetail, RecipeSummary } from '../src/shared/recipe';
import { api, login } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const ID = 'sys-main-wa-01';

describe('お気に入り', () => {
  it('人ごとに入れて外せ、一覧で絞り込める', async () => {
    const u = await login('fav-basic');
    expect((await json<RecipeDetail>(await api(u, `/api/recipes/${ID}`))).favorite).toBe(false);

    const on = await api(u, `/api/recipes/${ID}/favorite`, { method: 'PUT' });
    expect(on.status).toBe(200);
    // 2回押しても1件
    await api(u, `/api/recipes/${ID}/favorite`, { method: 'PUT' });
    const detail = await json<RecipeDetail>(await api(u, `/api/recipes/${ID}`));
    expect(detail).toMatchObject({ favorite: true, favoritedBy: [{ id: u.userId }] });

    const favs = await json<RecipeSummary[]>(await api(u, '/api/recipes?favorite=1'));
    expect(favs.map((r) => r.id)).toEqual([ID]);
    const all = await json<RecipeSummary[]>(await api(u, '/api/recipes'));
    expect(all.find((r) => r.id === ID)!.favorite).toBe(true);
    expect(all.filter((r) => r.favorite)).toHaveLength(1);

    await api(u, `/api/recipes/${ID}/favorite`, { method: 'DELETE' });
    expect(await json<RecipeSummary[]>(await api(u, '/api/recipes?favorite=1'))).toEqual([]);
  });

  it('家族のお気に入りは自分の印にはならないが、だれが入れたかは見え、献立にハートが付く', async () => {
    const owner = await login('fav-owner', 'オーナー');
    const member = await login('fav-member', 'はなこ');
    const inv = await json<CreatedInvite>(
      await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
    );
    await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });

    const plan = await json<PlanView>(
      await api(owner, '/api/plans/2026-10-19/generate', { method: 'POST', json: {} }),
    );
    const target = plan.days[0]!.items[0]!.recipe.id;
    await api(member, `/api/recipes/${target}/favorite`, { method: 'PUT' });

    const detail = await json<RecipeDetail>(await api(owner, `/api/recipes/${target}`));
    expect(detail.favorite).toBe(false);
    expect(detail.favoritedBy?.map((u) => u.name)).toEqual(['はなこ']);

    const after = await json<PlanView>(await api(owner, '/api/plans/2026-10-19'));
    const items = after.days.flatMap((d) => d.items);
    expect(items.find((i) => i.recipe.id === target)!.favorite).toBe(true);
    expect(items.filter((i) => i.recipe.id !== target).every((i) => !i.favorite)).toBe(true);
  });

  it('見えないレシピはお気に入りにできない', async () => {
    const u = await login('fav-missing');
    expect((await api(u, '/api/recipes/nope/favorite', { method: 'PUT' })).status).toBe(404);
  });
});
