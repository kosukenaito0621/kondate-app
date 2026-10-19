import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { RecipeCookStats } from '../src/shared/cooklog';
import type { RecipeInput } from '../src/shared/recipe';
import { api, BASE, login, type TestUser } from './helpers';

// 先頭が JPEG の署名になっている小さなバイト列
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1,
]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function upload(u: TestUser, bytes: Uint8Array, type = 'image/jpeg', name = 'photo.jpg') {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type }));
  return exports.default.fetch(`${BASE}/api/images`, {
    method: 'POST',
    headers: { cookie: u.cookie, origin: BASE },
    body: form,
  });
}

const json = async <T>(res: Response) => (await res.json()) as T;

describe('写真', () => {
  it('JPEG・PNG はアップロードでき、同じグループのメンバーは取得できる', async () => {
    const u = await login('img-ok');
    const res = await upload(u, JPEG);
    expect(res.status).toBe(201);
    const { key } = await json<{ key: string }>(res);
    expect(key).toMatch(new RegExp(`^groups/${u.groupId}/[0-9a-f-]{36}\\.jpg$`));

    const got = await api(u, `/api/images/${key}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(JPEG);

    expect((await upload(u, PNG, 'image/png', 'a.png')).status).toBe(201);
  });

  it('中身が画像でなければ拒否する（拡張子や Content-Type をごまかしても不可）', async () => {
    const u = await login('img-bad');
    const html = new TextEncoder().encode('<script>alert(1)</script>');
    expect((await upload(u, html, 'image/jpeg', 'evil.jpg')).status).toBe(415);
  });

  it('5MB を超える画像は拒否する', async () => {
    const u = await login('img-big');
    const big = new Uint8Array(5 * 1024 * 1024 + 10);
    big.set(JPEG);
    expect((await upload(u, big)).status).toBe(413);
  });

  it('他のグループの写真は見られず、レシピにも付けられない', async () => {
    const owner = await login('img-owner');
    const other = await login('img-other');
    const { key } = await json<{ key: string }>(await upload(owner, JPEG));

    expect((await api(other, `/api/images/${key}`)).status).toBe(403);
    expect((await api(null, `/api/images/${key}`)).status).toBe(401);

    const recipe: RecipeInput = {
      name: '写真つき',
      category: 'side',
      genre: 'wa',
      servings: 2,
      timeMinutes: 5,
      costYen: 100,
      mainIngredient: 'veg',
      difficulty: 'futaba',
      ingredients: [
        { name: 'きゅうり', quantity: 1, unit: '本', amountText: null, section: 'veg' },
      ],
      steps: [{ text: '切る', tip: '薄く' }],
      tags: [],
      imageKey: key,
      sourceUrl: null,
      seasons: [],
      seasonOnly: false,
    };
    expect((await api(other, '/api/recipes', { method: 'POST', json: recipe })).status).toBe(400);
    expect((await api(owner, '/api/recipes', { method: 'POST', json: recipe })).status).toBe(201);
  });

  it('自炊記録に写真を付け・外すことができ、外した写真は削除される', async () => {
    const u = await login('img-log');
    const { id } = await json<{ id: string }>(
      await api(u, '/api/logs', { method: 'POST', json: { recipeId: 'sys-main-wa-02' } }),
    );
    const { key } = await json<{ key: string }>(await upload(u, JPEG));

    const set = await api(u, `/api/logs/${id}`, { method: 'PATCH', json: { imageKey: key } });
    expect(set.status).toBe(200);
    const stats = await json<RecipeCookStats>(await api(u, '/api/logs/recipe/sys-main-wa-02'));
    expect(stats.photos).toEqual([{ logId: id, date: expect.any(String), imageKey: key }]);
    expect(stats.todayLogId).toBe(id);

    await api(u, `/api/logs/${id}`, { method: 'PATCH', json: { imageKey: null } });
    expect(await env.IMAGES.get(key)).toBeNull();
  });
});
