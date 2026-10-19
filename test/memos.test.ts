import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { addDays, toJstDate, weekDates, weekStartOf } from '../src/shared/date';
import type { CreatedInvite } from '../src/shared/groups';
import type { DayMemo } from '../src/shared/memo';
import type { PlanView } from '../src/shared/plan';
import type { Me } from '../src/shared/schemas';
import { purgeOldMemos } from '../src/worker/routes/memos';
import { api, db, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
// メモは過ぎた週には書けないので、今週を使う
const WEEK = weekStartOf(toJstDate());
const [MON, TUE, WED] = weekDates(WEEK) as [string, string, string];

const putMemo = (u: TestUser, date: string, body: string) =>
  api(u, `/api/memos/${date}`, { method: 'PUT', json: { body } });
const plan = async (u: TestUser) => json<PlanView>(await api(u, `/api/plans/${WEEK}`));
const memoOf = (v: PlanView, date: string) => v.days.find((d) => d.date === date)!.memo?.body;

async function generate(u: TestUser) {
  return json<PlanView>(await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: {} }));
}

describe('日ごとメモ', () => {
  it('保存すると献立の日に付き、空にすると消える', async () => {
    const u = await login('memo-basic', 'メモさん');
    const res = await putMemo(u, MON, '  スープにレタスも入れたい ');
    expect(res.status).toBe(200);
    const saved = await json<{ memo: DayMemo }>(res);
    expect(saved.memo).toMatchObject({
      body: 'スープにレタスも入れたい',
      updatedBy: { id: u.userId, name: 'メモさん' },
    });
    expect(memoOf(await plan(u), MON)).toBe('スープにレタスも入れたい');

    await putMemo(u, MON, '');
    expect(memoOf(await plan(u), MON)).toBeUndefined();
  });

  it('翌週の同じ曜日には出ない（日付で持つ）', async () => {
    const u = await login('memo-nextweek');
    await putMemo(u, MON, '今週だけ');
    const next = await json<PlanView>(await api(u, `/api/plans/${addDays(WEEK, 7)}`));
    expect(next.days.every((d) => d.memo === null)).toBe(true);
  });

  it('過ぎた週の日付・長すぎる本文は 400', async () => {
    const u = await login('memo-invalid');
    expect((await putMemo(u, addDays(WEEK, -1), 'むかし')).status).toBe(400);
    expect((await putMemo(u, MON, 'あ'.repeat(201))).status).toBe(400);
  });

  it('グループのメンバーにも見え、ほかのグループには見えない', async () => {
    const owner = await login('memo-owner', 'オーナー');
    const member = await login('memo-member');
    const outsider = await login('memo-outsider');
    const inv = await json<CreatedInvite>(
      await api(owner, `/api/groups/${owner.groupId}/invites`, { method: 'POST' }),
    );
    await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });

    await putMemo(owner, TUE, 'お弁当用に多めに');
    const seen = await plan(member);
    expect(seen.days.find((d) => d.date === TUE)!.memo).toMatchObject({
      body: 'お弁当用に多めに',
      updatedBy: { name: 'オーナー' },
    });
    expect(memoOf(await plan(outsider), TUE)).toBeUndefined();

    // メンバーが書き換えると更新者が変わる
    await putMemo(member, TUE, 'お弁当用に多めに作る');
    const after = await plan(owner);
    expect(after.days.find((d) => d.date === TUE)!.memo?.updatedBy?.id).toBe(member.userId);
  });

  it('ホームの今日の献立にもメモが付く', async () => {
    const u = await login('memo-today');
    await putMemo(u, toJstDate(), '夜は外食かも');
    const today = await json<{ day: { memo: DayMemo | null } }>(await api(u, '/api/today'));
    expect(today.day.memo?.body).toBe('夜は外食かも');
  });

  it('古いメモは定期処理で消える', async () => {
    const u = await login('memo-purge');
    const old = addDays(toJstDate(), -40);
    await env.DB.prepare('insert into day_memos (group_id, date, body) values (?, ?, ?)')
      .bind(u.groupId, old, '古いメモ')
      .run();
    await putMemo(u, MON, '残る');
    expect(await purgeOldMemos(db())).toBeGreaterThanOrEqual(1);
    const rows = await env.DB.prepare('select date from day_memos where group_id = ?')
      .bind(u.groupId)
      .all<{ date: string }>();
    expect(rows.results.map((r) => r.date)).toEqual([MON]);
  });
});

describe('献立の操作とメモ', () => {
  it('入れ替え：一緒に入れ替える（両方にあれば交換）', async () => {
    const u = await login('memo-swap-both');
    const v = await generate(u);
    await putMemo(u, MON, '月のメモ');
    await putMemo(u, WED, '水のメモ');
    const after = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/swap`, {
        method: 'POST',
        json: { from: MON, to: WED, version: v.version, memo: 'swap' },
      }),
    );
    expect(memoOf(after, MON)).toBe('水のメモ');
    expect(memoOf(after, WED)).toBe('月のメモ');
  });

  it('入れ替え：片方にしかなければメモが移動する', async () => {
    const u = await login('memo-swap-move');
    const v = await generate(u);
    await putMemo(u, MON, '移るメモ');
    const after = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/swap`, {
        method: 'POST',
        json: { from: MON, to: TUE, version: v.version, memo: 'swap' },
      }),
    );
    expect(memoOf(after, MON)).toBeUndefined();
    expect(memoOf(after, TUE)).toBe('移るメモ');
  });

  it('入れ替え：その日に残す・消す', async () => {
    const u = await login('memo-swap-keep');
    let v = await generate(u);
    await putMemo(u, MON, '残るメモ');
    v = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/swap`, {
        method: 'POST',
        json: { from: MON, to: TUE, version: v.version, memo: 'keep' },
      }),
    );
    expect(memoOf(v, MON)).toBe('残るメモ');
    expect(memoOf(v, TUE)).toBeUndefined();

    v = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/swap`, {
        method: 'POST',
        json: { from: MON, to: TUE, version: v.version, memo: 'clear' },
      }),
    );
    expect(memoOf(v, MON)).toBeUndefined();
    expect(memoOf(v, TUE)).toBeUndefined();
  });

  it('差し替え・作り直し・削除：残す／消す', async () => {
    const u = await login('memo-edit');
    let v = await generate(u);
    await putMemo(u, MON, 'メモ');

    // 1日の作り直し（残す）
    v = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/days/${MON}/regenerate`, {
        method: 'POST',
        json: { version: v.version, memo: 'keep' },
      }),
    );
    expect(memoOf(v, MON)).toBe('メモ');

    // 削除（残す）
    v = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/days/${MON}/side`, {
        method: 'PUT',
        json: { version: v.version, recipeId: null, memo: 'keep' },
      }),
    );
    expect(memoOf(v, MON)).toBe('メモ');

    // 差し替え（消す）
    v = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/days/${MON}/regenerate`, {
        method: 'POST',
        json: { version: v.version, slot: 'main', memo: 'clear' },
      }),
    );
    expect(memoOf(v, MON)).toBeUndefined();
  });

  it('古い版からの操作（409）ではメモも変わらない', async () => {
    const u = await login('memo-stale');
    const v = await generate(u);
    await putMemo(u, MON, '消えないメモ');
    const res = await api(u, `/api/plans/${WEEK}/days/${MON}/regenerate`, {
      method: 'POST',
      json: { version: v.version - 1, memo: 'clear' },
    });
    expect(res.status).toBe(409);
    expect(memoOf(await plan(u), MON)).toBe('消えないメモ');
  });
});

describe('メモの確認で覚えた選択', () => {
  it('種類ごとに保存でき、「毎回確認する」に戻せる', async () => {
    const u = await login('memo-choices');
    const me0 = await json<Me>(await api(u, '/api/me'));
    expect(me0.memoChoices).toEqual({ swap: null, edit: null });

    const me1 = await json<Me>(
      await api(u, '/api/me', { method: 'PATCH', json: { memoChoices: { swap: 'keep' } } }),
    );
    expect(me1.memoChoices).toEqual({ swap: 'keep', edit: null });
    const me2 = await json<Me>(
      await api(u, '/api/me', { method: 'PATCH', json: { memoChoices: { edit: 'clear' } } }),
    );
    expect(me2.memoChoices).toEqual({ swap: 'keep', edit: 'clear' });

    const me3 = await json<Me>(
      await api(u, '/api/me', {
        method: 'PATCH',
        json: { memoChoices: { swap: null, edit: null } },
      }),
    );
    expect(me3.memoChoices).toEqual({ swap: null, edit: null });
  });

  it('入れ替えでは「残す（edit 用）」以外の値を受け付けない', async () => {
    const u = await login('memo-choices-bad');
    const res = await api(u, '/api/me', {
      method: 'PATCH',
      json: { memoChoices: { edit: 'swap' } },
    });
    expect(res.status).toBe(400);
  });
});
