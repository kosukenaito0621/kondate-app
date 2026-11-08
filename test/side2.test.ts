import { describe, expect, it } from 'vitest';
import type { PlanView } from '../src/shared/plan';
import type { RecipeSummary } from '../src/shared/recipe';
import type { ShoppingListView } from '../src/shared/shopping';
import { api, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;
const WEEK = '2026-10-19';
const generate = async (u: TestUser, version?: number) =>
  json<PlanView>(
    await api(u, `/api/plans/${WEEK}/generate`, { method: 'POST', json: { version } }),
  );
const setSlot = (
  u: TestUser,
  date: string,
  slot: string,
  version: number,
  recipeId: string | null,
) =>
  api(u, `/api/plans/${WEEK}/days/${date}/${slot}`, {
    method: 'PUT',
    json: { version, recipeId },
  });
const recipeOf = (v: PlanView, date: string, slot: string) =>
  v.days.find((d) => d.date === date)!.items.find((i) => i.slot === slot)?.recipe.id;
const sides = async (u: TestUser) =>
  (await json<RecipeSummary[]>(await api(u, '/api/recipes?category=side'))).map((r) => r.id);

/** 副菜がある日を探す（1品目と違う副菜も返す） */
async function dayWithSide(u: TestUser, v: PlanView) {
  const day = v.days.find((d) => d.items.some((i) => i.slot === 'side'));
  if (day) {
    const first = recipeOf(v, day.date, 'side')!;
    const other = (await sides(u)).find(
      (id) => !v.days.some((d) => d.items.some((i) => i.recipe.id === id)),
    )!;
    return { date: day.date, first, other, view: v };
  }
  // 自動で副菜が入らなかったときは、1品目を手で入れる
  const date = v.days[0]!.date;
  const [first, other] = await sides(u);
  const view = await json<PlanView>(await setSlot(u, date, 'side', v.version, first!));
  return { date, first: first!, other: other!, view };
}

async function withSecondSide(sub: string) {
  const u = await login(sub);
  const a = await generate(u);
  const { date, first, other, view } = await dayWithSide(u, a);
  const res = await setSlot(u, date, 'side2', view.version, other);
  expect(res.status).toBe(200);
  return { u, date, first, other, view: await json<PlanView>(res) };
}

describe('副菜の2品目', () => {
  it('2品目を足すと、1品目のすぐ後ろに並ぶ', async () => {
    const { date, first, other, view } = await withSecondSide('side2-add');
    const slots = view.days.find((d) => d.date === date)!.items.map((i) => i.slot);
    expect(slots.indexOf('side2')).toBe(slots.indexOf('side') + 1);
    expect(recipeOf(view, date, 'side')).toBe(first);
    expect(recipeOf(view, date, 'side2')).toBe(other);
  });

  it('1品目と同じレシピは 400 duplicate_side', async () => {
    const u = await login('side2-dup');
    const a = await generate(u);
    const { date, first, view } = await dayWithSide(u, a);
    const res = await setSlot(u, date, 'side2', view.version, first);
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'duplicate_side' });
  });

  it('1品目を2品目と同じレシピにはできない', async () => {
    const { u, date, other, view } = await withSecondSide('side2-dup-first');
    const res = await setSlot(u, date, 'side', view.version, other);
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'duplicate_side' });
  });

  it('副菜以外の分類は 400 category_mismatch', async () => {
    const u = await login('side2-cat');
    const a = await generate(u);
    const { date, view } = await dayWithSide(u, a);
    const res = await setSlot(u, date, 'side2', view.version, 'sys-main-wa-01');
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'category_mismatch' });
  });

  it('1品目を外すと2品目が繰り上がる', async () => {
    const { u, date, other, view } = await withSecondSide('side2-promote');
    const after = await json<PlanView>(await setSlot(u, date, 'side', view.version, null));
    expect(recipeOf(after, date, 'side')).toBe(other);
    expect(recipeOf(after, date, 'side2')).toBeUndefined();
  });

  it('おまかせ作成では2品目を作らない', async () => {
    const u = await login('side2-auto');
    const a = await generate(u);
    expect(a.days.flatMap((d) => d.items).some((i) => i.slot === 'side2')).toBe(false);
  });

  it('1週間作り直すと対象の日の2品目は消える', async () => {
    const { u, date, view } = await withSecondSide('side2-regen-week');
    const after = await generate(u, view.version);
    expect(recipeOf(after, date, 'side2')).toBeUndefined();
  });

  it('1週間作り直しても「作った」日の2品目は残る', async () => {
    const { u, date, first, other, view } = await withSecondSide('side2-keep-cooked');
    await api(u, '/api/logs', { method: 'POST', json: { recipeId: first, date } });
    const after = await generate(u, view.version);
    expect(recipeOf(after, date, 'side2')).toBe(other);
  });

  it('1日だけ作り直すと2品目も消える', async () => {
    const { u, date, view } = await withSecondSide('side2-regen-day');
    const after = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/days/${date}/regenerate`, {
        method: 'POST',
        json: { version: view.version },
      }),
    );
    expect(recipeOf(after, date, 'side2')).toBeUndefined();
  });

  it('副菜だけ作り直すと、2品目は残り、1品目は2品目と同じにならない', async () => {
    const { u, date, first, other, view } = await withSecondSide('side2-regen-side');
    const after = await json<PlanView>(
      await api(u, `/api/plans/${WEEK}/days/${date}/regenerate`, {
        method: 'POST',
        json: { version: view.version, slot: 'side' },
      }),
    );
    expect(recipeOf(after, date, 'side2')).toBe(other);
    expect(recipeOf(after, date, 'side')).not.toBe(other);
    expect(recipeOf(after, date, 'side')).not.toBe(first);
  });

  it('買い物リストに2品目の材料が入る', async () => {
    const { u, other } = await withSecondSide('side2-shop');
    const recipe = await json<RecipeSummary>(await api(u, `/api/recipes/${other}`));
    const list = await json<ShoppingListView>(await api(u, `/api/shopping/${WEEK}`));
    expect(list.items.some((i) => i.sources.includes(recipe.name))).toBe(true);
  });

  it('作り直しの指定に side2 は使えない', async () => {
    const { u, date, view } = await withSecondSide('side2-no-auto');
    const res = await api(u, `/api/plans/${WEEK}/days/${date}/regenerate`, {
      method: 'POST',
      json: { version: view.version, slot: 'side2' },
    });
    expect(res.status).toBe(400);
  });
});
