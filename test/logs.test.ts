import { describe, expect, it } from 'vitest';
import type { CookLogMonth, RecipeCookStats } from '../src/shared/cooklog';
import { addDays, toJstDate } from '../src/shared/date';
import type { CreatedInvite } from '../src/shared/groups';
import { api, login } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;

describe('自炊記録API', () => {
  it('今日作った料理を記録でき、同じ日に2回押しても1件のまま', async () => {
    const u = await login('log-basic');
    const first = await api(u, '/api/logs', {
      method: 'POST',
      json: { recipeId: 'sys-main-wa-01' },
    });
    expect(first.status).toBe(201);
    await api(u, '/api/logs', { method: 'POST', json: { recipeId: 'sys-main-wa-01' } });

    const month = await json<CookLogMonth>(await api(u, '/api/logs'));
    expect(month.entries).toHaveLength(1);
    expect(month.entries[0]).toMatchObject({ date: toJstDate(), recipe: { name: '鶏の照り焼き' } });
    expect(month.entries[0]!.cookedBy?.name).toBe('log-basic');

    const stats = await json<RecipeCookStats>(await api(u, '/api/logs/recipe/sys-main-wa-01'));
    expect(stats).toMatchObject({ count: 1, cookedToday: true, lastDate: toJstDate() });
  });

  it('過去の日付も記録でき、連続日数を数える。未来の日付は不可', async () => {
    const u = await login('log-streak');
    const today = toJstDate();
    for (const d of [today, addDays(today, -1), addDays(today, -2)]) {
      await api(u, '/api/logs', { method: 'POST', json: { recipeId: 'sys-soup-wa-01', date: d } });
    }
    const month = await json<CookLogMonth>(await api(u, `/api/logs?month=${today.slice(0, 7)}`));
    expect(month.stats.streak).toBe(3);
    const future = await api(u, '/api/logs', {
      method: 'POST',
      json: { recipeId: 'sys-soup-wa-01', date: addDays(today, 1) },
    });
    expect(future.status).toBe(400);
  });

  it('取り消せる', async () => {
    const u = await login('log-delete');
    const { id } = await json<{ id: string }>(
      await api(u, '/api/logs', { method: 'POST', json: { recipeId: 'sys-side-wa-01' } }),
    );
    expect((await api(u, `/api/logs/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await json<CookLogMonth>(await api(u, '/api/logs'))).entries).toHaveLength(0);
  });

  it('記録はグループで共有され、他のグループからは見えず消せない', async () => {
    const owner = await login('log-owner');
    const member = await login('log-member');
    const outsider = await login('log-outsider');
    const inv = await json<CreatedInvite>(
      await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
    );
    await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });

    const { id } = await json<{ id: string }>(
      await api(member, '/api/logs', { method: 'POST', json: { recipeId: 'sys-main-yo-01' } }),
    );
    const seen = await json<CookLogMonth>(await api(owner, '/api/logs'));
    expect(seen.entries.map((e) => e.cookedBy?.name)).toEqual(['log-member']);

    expect((await json<CookLogMonth>(await api(outsider, '/api/logs'))).entries).toHaveLength(0);
    expect((await api(outsider, `/api/logs/${id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('見えないレシピ（他グループの独自レシピ）は記録できない', async () => {
    const u = await login('log-invisible');
    const res = await api(u, '/api/logs', { method: 'POST', json: { recipeId: 'no-such' } });
    expect(res.status).toBe(404);
  });
});
