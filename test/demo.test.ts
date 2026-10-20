import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { toJstDate, weekStartOf } from '../src/shared/date';
import type { PantryItemView } from '../src/shared/pantry';
import type { PlanView } from '../src/shared/plan';
import type { Me } from '../src/shared/schemas';
import type { ShoppingListView } from '../src/shared/shopping';
import { purgeGuests } from '../src/worker/routes/demo';
import { BASE, db, type TestUser } from './helpers';
import { api } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = weekStartOf(toJstDate());

async function start(ip: string) {
  return exports.default.fetch(`${BASE}/api/demo/start`, {
    method: 'POST',
    headers: { origin: BASE, 'cf-connecting-ip': ip },
  });
}

/** お試しを始めて、そのユーザーとして API を呼べるようにする */
async function guest(ip: string): Promise<TestUser> {
  const res = await start(ip);
  expect(res.status).toBe(201);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = await json<Me>(await api({ cookie, userId: '', groupId: '' }, '/api/me'));
  return { cookie, userId: me.id, groupId: me.currentGroupId };
}

describe('お試しモード', () => {
  it('ログインせずに始められ、献立・買い物リスト・在庫・メモが入っている', async () => {
    const u = await guest('10.0.0.1');
    const me = await json<Me>(await api(u, '/api/me'));
    expect(me).toMatchObject({ displayName: 'おためし', email: '', cookingLevel: 'futaba' });
    expect(me.guestUntil! - Date.now()).toBeGreaterThan(23 * 3_600_000);
    expect(me.groups[0]!.name).toBe('おためし');

    const plan = await json<PlanView>(await api(u, `/api/plans/${WEEK}`));
    expect(plan.exists).toBe(true);
    expect(plan.days.some((d) => d.items.length > 0)).toBe(true);
    expect(plan.days.find((d) => d.date === toJstDate())!.memo?.body).toContain('お試し');
    const list = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    expect(list.items.length).toBeGreaterThan(5);
    expect(await json<PantryItemView[]>(await api(u, '/api/pantry'))).toHaveLength(4);
  });

  it('AI取り込み・写真・招待・グループ作成・共有リンクは使えない', async () => {
    const u = await guest('10.0.0.2');
    const forbidden = [
      api(u, '/api/ai/import-url', { method: 'POST', json: { url: 'https://example.com' } }),
      api(u, `/api/groups/${u.groupId}/invites`, { method: 'POST' }),
      api(u, '/api/groups', { method: 'POST', json: { name: 'べつ' } }),
      api(u, '/api/invites/ABCDEF'),
      api(u, '/api/recipes/sys-main-wa-01/share', { method: 'POST' }),
      api(u, '/api/recipes/share-bundle', {
        method: 'POST',
        json: { recipeIds: ['sys-main-wa-01'] },
      }),
    ];
    for (const res of await Promise.all(forbidden)) {
      expect(res.status).toBe(403);
      expect(await json<{ error: string }>(res)).toMatchObject({ error: 'guest_forbidden' });
    }
  });

  it('同じ接続元からは1時間に3回まで', async () => {
    for (let i = 0; i < 3; i++) expect((await start('10.0.0.3')).status).toBe(201);
    expect((await start('10.0.0.3')).status).toBe(429);
  });

  it('家族役（はなこさん）がメモ・献立・買い物リスト・在庫を変える', async () => {
    const u = await guest('10.0.0.4');
    const before = await json<PlanView>(await api(u, `/api/plans/${WEEK}`));

    const r0 = await json<{ next: number }>(await api(u, '/api/demo/family/0', { method: 'POST' }));
    expect(r0.next).toBe(1);
    const p0 = await json<PlanView>(await api(u, `/api/plans/${WEEK}`));
    const memo = p0.days.find((d) => d.memo?.body.includes('お弁当'));
    // 日曜は翌日が来週になるので、今週のどこかに書く
    if (memo) expect(memo.memo!.updatedBy!.name).toBe('はなこ');

    await api(u, '/api/demo/family/1', { method: 'POST' });
    const p1 = await json<PlanView>(await api(u, `/api/plans/${WEEK}`));
    expect(p1.version).toBe(before.version + 1);
    expect(p1.updatedBy?.name).toBe('はなこ');

    const r2 = await json<{ next: number | null }>(
      await api(u, '/api/demo/family/2', { method: 'POST' }),
    );
    expect(r2.next).toBeNull();
    const list = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    expect(list.items.filter((i) => i.checkedBy?.name === 'はなこ')).toHaveLength(2);
    const stock = await json<PantryItemView[]>(await api(u, '/api/pantry'));
    expect(stock.some((s) => s.name === '牛乳')).toBe(true);

    // はなこさんは2回呼んでも1人だけ
    await api(u, '/api/demo/family/0', { method: 'POST' });
    const members = await env.DB.prepare('select count(*) n from group_members where group_id = ?')
      .bind(u.groupId)
      .first<{ n: number }>();
    expect(members!.n).toBe(2);
  });

  it('ふつうのユーザーは家族役を呼べない', async () => {
    const { login } = await import('./helpers');
    const u = await login('demo-normal');
    expect((await api(u, '/api/demo/family/0', { method: 'POST' })).status).toBe(403);
  });

  it('期限が過ぎるとログインできなくなり、定期処理でグループごと消える', async () => {
    const u = await guest('10.0.0.5');
    await api(u, '/api/demo/family/0', { method: 'POST' });
    await env.DB.prepare('update users set guest_expires_at = ? where id = ?')
      .bind(Date.now() - 1000, u.userId)
      .run();
    expect((await api(u, '/api/me')).status).toBe(401);

    await env.DB.prepare(
      'update users set guest_expires_at = ? where id in (select user_id from group_members where group_id = ?)',
    )
      .bind(Date.now() - 1000, u.groupId)
      .run();
    expect(await purgeGuests(db())).toBeGreaterThanOrEqual(2);
    const left = await env.DB.prepare(
      'select (select count(*) from groups where id = ?1) g, (select count(*) from pantry_items where group_id = ?1) p, (select count(*) from users where id = ?2) u',
    )
      .bind(u.groupId, u.userId)
      .first<{ g: number; p: number; u: number }>();
    expect(left).toEqual({ g: 0, p: 0, u: 0 });
  });
});
