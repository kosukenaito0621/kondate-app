import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CreatedInvite } from '../src/shared/groups';
import type { PlanView } from '../src/shared/plan';
import type { RealtimeEvent } from '../src/shared/realtime';
import type { ShoppingListView } from '../src/shared/shopping';
import { api, BASE, login, type TestUser } from './helpers';

const json = async <T,>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';

async function connect(u: TestUser, groupId: string) {
  const res = await exports.default.fetch(`${BASE}/api/groups/${groupId}/live`, {
    headers: { upgrade: 'websocket', cookie: u.cookie, origin: BASE },
  });
  const ws = res.webSocket;
  if (!ws) return { status: res.status, ws: null, events: [] as RealtimeEvent[] };
  ws.accept();
  const events: RealtimeEvent[] = [];
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string' && e.data !== 'pong') events.push(JSON.parse(e.data));
  });
  return { status: res.status, ws, events };
}

const until = async (cond: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20));
};

async function household() {
  const owner = await login(`rt-owner-${crypto.randomUUID()}`, 'おーなー');
  const member = await login(`rt-member-${crypto.randomUUID()}`, 'めんばー');
  const inv = await json<CreatedInvite>(
    await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
  );
  await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });
  return { owner, member };
}

describe('リアルタイム同期', () => {
  it('メンバーの献立変更・買い物チェックが、ほかのメンバーにすぐ届く', async () => {
    const { owner, member } = await household();
    const live = await connect(owner, owner.groupId);
    expect(live.status).toBe(101);

    const plan = await json<PlanView>(
      await api(member, `/api/plans/${WEEK}/generate`, { method: 'POST', json: {} }),
    );
    await api(member, `/api/plans/${WEEK}/days/${plan.days[2]!.date}/regenerate`, {
      method: 'POST',
      json: { version: plan.version, slot: 'main' },
    });
    await until(() => live.events.length >= 2);
    expect(live.events[1]).toMatchObject({
      type: 'plan.updated',
      weekStart: WEEK,
      dates: [plan.days[2]!.date],
      summary: '水曜の主菜を変更しました',
      by: { name: 'めんばー' },
    });

    const shop = await json<ShoppingListView>(await api(member, `/api/shopping/${WEEK}`));
    const item = shop.items[0]!;
    await api(member, `/api/shopping/items/${item.id}`, { method: 'PATCH', json: { checked: true } });
    await until(() => live.events.some((e) => e.type === 'shopping.updated'));
    expect(live.events.find((e) => e.type === 'shopping.updated')).toMatchObject({
      weekStart: WEEK,
      summary: `${item.name}をかごに入れました`,
    });
    live.ws!.close();
  });

  it('ping に pong を返す', async () => {
    const { owner } = await household();
    const live = await connect(owner, owner.groupId);
    let pong = false;
    live.ws!.addEventListener('message', (e) => {
      if (e.data === 'pong') pong = true;
    });
    live.ws!.send('ping');
    await until(() => pong);
    expect(pong).toBe(true);
    live.ws!.close();
  });

  it('グループ外の人はつなげない・未ログインもつなげない', async () => {
    const { owner } = await household();
    const outsider = await login(`rt-out-${crypto.randomUUID()}`);
    expect((await connect(outsider, owner.groupId)).status).toBe(403);
    const anon = await exports.default.fetch(`${BASE}/api/groups/${owner.groupId}/live`, {
      headers: { upgrade: 'websocket' },
    });
    expect(anon.status).toBe(401);
  });

  it('ほかのグループの変更は届かない', async () => {
    const a = await household();
    const b = await household();
    const live = await connect(a.owner, a.owner.groupId);
    await api(b.member, `/api/plans/${WEEK}/generate`, { method: 'POST', json: {} });
    await new Promise((r) => setTimeout(r, 300));
    expect(live.events).toHaveLength(0);
    live.ws!.close();
  });

  it('グループから外されたら接続が切れる', async () => {
    const { owner, member } = await household();
    const live = await connect(member, owner.groupId);
    let closed = false;
    live.ws!.addEventListener('close', () => {
      closed = true;
    });
    await api(owner, `/api/groups/${owner.groupId}/members/${member.userId}`, { method: 'DELETE' });
    await until(() => closed);
    expect(closed).toBe(true);
  });
});
