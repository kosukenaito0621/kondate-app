import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
  it('ok を返す', async () => {
    const res = await exports.default.fetch('http://example.com/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('未定義の API は 404 JSON', async () => {
    const res = await exports.default.fetch('http://example.com/api/nope');
    expect(res.status).toBe(404);
  });
});
