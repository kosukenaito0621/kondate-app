import { describe, expect, it } from 'vitest';
import { api, login } from './helpers';

describe('AI取り込みAPI（AI を呼ばない範囲）', () => {
  it('他のグループの画像キーは使えない', async () => {
    const owner = await login('ai-owner');
    const other = await login('ai-other');
    const key = `groups/${owner.groupId}/00000000-0000-4000-8000-000000000000.jpg`;
    const res = await api(other, '/api/ai/import-image', {
      method: 'POST',
      json: { imageKey: key },
    });
    expect(res.status).toBe(400);
  });

  it('内部向けの URL は取得しない（SSRF 対策）', async () => {
    const u = await login('ai-ssrf');
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:8787/',
      'file:///etc/passwd',
    ]) {
      const res = await api(u, '/api/ai/import-url', { method: 'POST', json: { url } });
      expect(res.status, url).toBe(400);
    }
  });

  it('1日の回数を超えると 429', async () => {
    const u = await login('ai-limit');
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (
        await api(u, '/api/ai/import-url', { method: 'POST', json: { url: 'http://localhost/' } })
      ).status;
    }
    expect(last).toBe(429);
  });

  it('未ログインは 401', async () => {
    expect(
      (
        await api(null, '/api/ai/import-url', {
          method: 'POST',
          json: { url: 'https://example.com' },
        })
      ).status,
    ).toBe(401);
  });
});
