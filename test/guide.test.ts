import { describe, expect, it } from 'vitest';
import type { Me } from '../src/shared/schemas';
import { api, login } from './helpers';

describe('使い方ガイド', () => {
  it('初回は未表示で、見終えたら記録される（ほかの端末でも出ない）', async () => {
    const u = await login(`guide-${crypto.randomUUID()}`, 'がいど');
    const before = (await (await api(u, '/api/me')).json()) as Me;
    expect(before.guideSeen).toBe(false);

    const res = await api(u, '/api/me', { method: 'PATCH', json: { guideSeen: true } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Me).guideSeen).toBe(true);
    // テーマなど、ほかの設定は変わらない
    expect(((await (await api(u, '/api/me')).json()) as Me).theme).toBe(before.theme);
  });

  it('false は受け付けない', async () => {
    const u = await login(`guide-ng-${crypto.randomUUID()}`);
    const res = await api(u, '/api/me', { method: 'PATCH', json: { guideSeen: false } });
    expect(res.status).toBe(400);
  });
});

describe('お知らせ', () => {
  it('どこまで読んだかを記録できる', async () => {
    const u = await login(`news-${crypto.randomUUID()}`);
    expect(((await (await api(u, '/api/me')).json()) as Me).newsSeen).toBeNull();
    const res = await api(u, '/api/me', {
      method: 'PATCH',
      json: { newsSeen: '2026-10-19-share' },
    });
    expect(((await res.json()) as Me).newsSeen).toBe('2026-10-19-share');
  });
});
