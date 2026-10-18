import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
  it('D1 に接続できる', async () => {
    const res = await exports.default.fetch('http://example.com/api/health');
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; recipes: number }>();
    expect(body.ok).toBe(true);
    expect(body.recipes).toBe(0);
  });

  it('未定義の API は 404 JSON', async () => {
    const res = await exports.default.fetch('http://example.com/api/nope');
    expect(res.status).toBe(404);
  });
});
