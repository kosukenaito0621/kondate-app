import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { PlanView } from '../src/shared/plan';
import { purgePlanUndo } from '../src/worker/routes/plans';
import { api, db, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';
const ids = (v: PlanView) => v.days.flatMap((d) => d.items.map((i) => `${i.slot}:${i.recipe.id}`));
const generate = async (u: TestUser, version?: number) =>
  json<PlanView>(
    await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: { version } }),
  );
const undo = (u: TestUser, version?: number) =>
  api(u, `/api/plans/${WEEK}/undo`, { method: 'POST', json: { version } });

describe('1週間まるごと作り直す → 元に戻す', () => {
  it('初めて作ったときは戻す先がない', async () => {
    const u = await login('undo-first');
    const v = await generate(u);
    expect(v.undoAt).toBeNull();
    expect((await undo(u, v.version)).status).toBe(404);
  });

  it('作り直すと直前の献立に戻せ、戻したら戻す先はなくなる', async () => {
    const u = await login('undo-basic');
    const first = await generate(u);
    const second = await generate(u, first.version);
    expect(second.undoAt).not.toBeNull();
    expect(ids(second)).not.toEqual(ids(first));

    const res = await undo(u, second.version);
    expect(res.status).toBe(200);
    const back = await json<PlanView>(res);
    expect(ids(back).sort()).toEqual(ids(first).sort());
    expect(back.undoAt).toBeNull();
    expect(back.version).toBe(second.version + 1);
    expect((await undo(u, back.version)).status).toBe(404);
  });

  it('戻せるのは直前の1回分（2回作り直したら、2回目の直前に戻る）', async () => {
    const u = await login('undo-twice');
    const a = await generate(u);
    const b = await generate(u, a.version);
    const c = await generate(u, b.version);
    const back = await json<PlanView>(await undo(u, c.version));
    expect(ids(back).sort()).toEqual(ids(b).sort());
  });

  it('古い版からは戻せない（409）', async () => {
    const u = await login('undo-stale');
    const a = await generate(u);
    const b = await generate(u, a.version);
    expect((await undo(u, a.version)).status).toBe(409);
    expect((await json<PlanView>(await api(u, `/api/plans/${WEEK}`))).version).toBe(b.version);
  });

  it('3日たつと戻せず、定期処理で消える', async () => {
    const u = await login('undo-old');
    const a = await generate(u);
    const b = await generate(u, a.version);
    await env.DB.prepare(
      'update plan_undo set created_at = ? where plan_id = (select id from meal_plans where group_id = ?)',
    )
      .bind(Date.now() - 4 * 86_400_000, u.groupId)
      .run();
    const v = await json<PlanView>(await api(u, `/api/plans/${WEEK}`));
    expect(v.undoAt).toBeNull();
    expect((await undo(u, b.version)).status).toBe(404);
    expect(await purgePlanUndo(db())).toBeGreaterThanOrEqual(1);
  });
});
