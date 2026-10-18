import { describe, expect, it } from 'vitest';
import type { CreatedInvite } from '../src/shared/groups';
import type { PlanSettings, PlanView } from '../src/shared/plan';
import { api, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';
const ids = (v: PlanView) => v.days.flatMap((d) => d.items.map((i) => i.recipe.id));

async function generate(u: TestUser, version?: number) {
  const res = await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: { version } });
  expect(res.status).toBe(200);
  return json<PlanView>(res);
}

describe('設定API', () => {
  it('既定値を返し、週予算・割合・曜日設定を保存できる', async () => {
    const u = await login('settings-user');
    const s = await json<PlanSettings>(await api(u, '/api/settings'));
    expect(s).toMatchObject({
      weeklyBudget: 10000,
      ratio: { wa: 50, yo: 30, chu: 20 },
      servings: 1,
    });
    expect(s.days).toHaveLength(7);

    const days = s.days.map((d) => (d.weekday === 5 ? { ...d, level: 'futaba' as const } : d));
    const saved = await json<PlanSettings>(
      await api(u, '/api/settings', {
        method: 'PUT',
        json: { weeklyBudget: 8000, ratio: { wa: 20, yo: 40, chu: 40 }, days },
      }),
    );
    expect(saved).toMatchObject({ weeklyBudget: 8000, ratio: { wa: 20, yo: 40, chu: 40 } });
    expect(saved.days[5]!.level).toBe('futaba');
  });

  it('割合の合計が100でなければ 400', async () => {
    const u = await login('settings-bad');
    const res = await api(u, '/api/settings', {
      method: 'PUT',
      json: { ratio: { wa: 50, yo: 50, chu: 50 } },
    });
    expect(res.status).toBe(400);
  });
});

describe('献立API', () => {
  it('献立がない週は空、生成すると7日分が重複なく入る', async () => {
    const u = await login('plan-gen');
    const empty = await json<PlanView>(await api(u, `/api/plans/${WEEK}`));
    expect(empty).toMatchObject({ exists: false, version: 0 });
    expect(ids(empty)).toHaveLength(0);

    const v = await generate(u);
    expect(v.exists).toBe(true);
    expect(v.version).toBe(1);
    expect(
      v.days.every(
        (d) => d.items.some((i) => i.slot === 'main') && d.items.some((i) => i.slot === 'soup'),
      ),
    ).toBe(true);
    expect(new Set(ids(v)).size).toBe(ids(v).length);
    expect(v.estimatedCost).toBeGreaterThan(0);
  });

  it('週の開始日が月曜でなければ 400', async () => {
    const u = await login('plan-badweek');
    expect((await api(u, '/api/plans/2026-10-20')).status).toBe(400);
  });

  it('1日だけ作り直してもほかの日は変わらず、版番号が進む', async () => {
    const u = await login('plan-regen');
    const v1 = await generate(u);
    const date = v1.days[2]!.date;
    const res = await api(u, `/api/plans/${WEEK}/days/${date}/regenerate`, {
      method: 'POST',
      json: { version: v1.version },
    });
    const v2 = await json<PlanView>(res);
    expect(v2.version).toBe(2);
    const others = (v: PlanView) =>
      v.days.filter((d) => d.date !== date).map((d) => d.items.map((i) => i.recipe.id));
    expect(others(v2)).toEqual(others(v1));
    expect(v2.days[2]!.items.map((i) => i.recipe.id)).not.toEqual(
      v1.days[2]!.items.map((i) => i.recipe.id),
    );
  });

  it('古い版から保存しようとすると 409 で再読み込みを促す', async () => {
    const u = await login('plan-stale');
    const v1 = await generate(u);
    await generate(u, v1.version); // 版2
    const res = await api(u, `/api/plans/${WEEK}/days/${v1.days[0]!.date}/regenerate`, {
      method: 'POST',
      json: { version: v1.version },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'stale' });
  });

  it('レシピを手動で指定・外せる。カテゴリ違いや他グループのレシピは不可', async () => {
    const u = await login('plan-manual');
    const v1 = await generate(u);
    const date = v1.days[0]!.date;
    const put = (slot: string, recipeId: string | null, version: number) =>
      api(u, `/api/plans/${WEEK}/days/${date}/${slot}`, {
        method: 'PUT',
        json: { recipeId, version },
      });

    const v2 = await json<PlanView>(await put('main', 'sys-main-yo-01', v1.version));
    expect(v2.days[0]!.items.find((i) => i.slot === 'main')!.recipe.name).toBe('ハンバーグ');

    expect((await put('main', 'sys-soup-wa-01', v2.version)).status).toBe(400);
    expect((await put('main', 'no-such-recipe', v2.version)).status).toBe(404);

    const v3 = await json<PlanView>(await put('side', null, v2.version));
    expect(v3.days[0]!.items.some((i) => i.slot === 'side')).toBe(false);
  });

  it('曜日を入れ替えられる', async () => {
    const u = await login('plan-swap');
    const v1 = await generate(u);
    const [a, b] = [v1.days[0]!, v1.days[4]!];
    const v2 = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/swap`, {
        method: 'POST',
        json: { from: a.date, to: b.date, version: v1.version },
      }),
    );
    const itemIds = (d: PlanView['days'][number]) => d.items.map((i) => i.recipe.id);
    expect(itemIds(v2.days[0]!)).toEqual(itemIds(b));
    expect(itemIds(v2.days[4]!)).toEqual(itemIds(a));
  });

  it('ふたばの曜日は生成結果がふたばのレシピだけになる', async () => {
    const u = await login('plan-futaba');
    const s = await json<PlanSettings>(await api(u, '/api/settings'));
    await api(u, '/api/settings', {
      method: 'PUT',
      json: { days: s.days.map((d) => (d.weekday === 5 ? { ...d, level: 'futaba' } : d)) },
    });
    const v = await generate(u);
    const sat = v.days[5]!;
    expect(sat.level).toBe('futaba');
    expect(sat.items.length).toBeGreaterThan(0);
    expect(sat.items.every((i) => i.recipe.difficulty === 'futaba')).toBe(true);
  });

  it('同じグループのメンバーは同じ献立を見て編集でき、他のグループからは見えない', async () => {
    const owner = await login('plan-share-owner');
    const member = await login('plan-share-member');
    const outsider = await login('plan-share-outsider');
    const inv = await json<CreatedInvite>(
      await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
    );
    await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });

    const v1 = await generate(owner);
    const seen = await json<PlanView>(await api(member, `/api/plans/${WEEK}`));
    expect(ids(seen)).toEqual(ids(v1));

    const v2 = await json<PlanView>(
      await api(member, `/api/plans/${WEEK}/days/${v1.days[1]!.date}/regenerate`, {
        method: 'POST',
        json: { version: v1.version },
      }),
    );
    expect(v2.updatedBy?.name).toBe('plan-share-member');

    expect((await api(outsider, `/api/plans/${WEEK}`, { groupId: owner.groupId })).status).toBe(
      403,
    );
    const own = await json<PlanView>(await api(outsider, `/api/plans/${WEEK}`));
    expect(own.exists).toBe(false);
  });

  it('今日の献立を返す', async () => {
    const u = await login('plan-today');
    const res = await json<{ date: string; day: { items: unknown[] } }>(await api(u, '/api/today'));
    expect(res.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.day.items).toEqual([]);
  });
});
