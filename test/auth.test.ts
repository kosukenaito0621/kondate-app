import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getDb } from '../src/worker/db/client';
import { createSession, validateSession, SESSION_TTL_MS } from '../src/worker/lib/session';
import { upsertGoogleUser } from '../src/worker/routes/auth';

const BASE = 'http://localhost:5173';
const db = () => getDb(env.DB);

async function login(sub = 'google-sub-1') {
  const userId = await upsertGoogleUser(db(), { sub, email: `${sub}@example.com` });
  const { token } = await createSession(db(), userId);
  return { userId, cookie: `kd_session=${token}` };
}

describe('auth', () => {
  it('未ログインの /api/me は 401', async () => {
    const res = await exports.default.fetch(`${BASE}/api/me`);
    expect(res.status).toBe(401);
  });

  it('/api/auth/google は state と PKCE つきで Google へリダイレクト', async () => {
    const res = await exports.default.fetch(`${BASE}/api/auth/google`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://accounts.google.com');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('redirect_uri')).toBe(`${BASE}/api/auth/google/callback`);
    expect(res.headers.getSetCookie().join(';')).toContain('kd_oauth_state=');
  });

  it('callback で state が一致しなければログインしない', async () => {
    const res = await exports.default.fetch(
      `${BASE}/api/auth/google/callback?code=x&state=evil`,
      { redirect: 'manual', headers: { cookie: 'kd_oauth_state=good; kd_oauth_verifier=v' } },
    );
    expect(res.headers.get('location')).toBe('/login?error=invalid_state');
    expect(res.headers.getSetCookie().join(';')).not.toContain('kd_session=');
  });

  it('初回ユーザーは displayName 未設定 → PATCH で設定できる', async () => {
    const { cookie } = await login('new-user');
    const me = await exports.default.fetch(`${BASE}/api/me`, { headers: { cookie } });
    expect(await me.json()).toMatchObject({ displayName: null, email: 'new-user@example.com' });

    const patched = await exports.default.fetch(`${BASE}/api/me`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ displayName: '  こうすけ  ' }),
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ displayName: 'こうすけ' });
  });

  it('ユーザーネームは20文字まで', async () => {
    const { cookie } = await login('long-name');
    const res = await exports.default.fetch(`${BASE}/api/me`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ displayName: 'あ'.repeat(21) }),
    });
    expect(res.status).toBe(400);
  });

  it('同じ Google アカウントは同じユーザーになり、既定設定は7曜日分', async () => {
    const a = await upsertGoogleUser(db(), { sub: 'same', email: 'a@example.com' });
    const b = await upsertGoogleUser(db(), { sub: 'same', email: 'b@example.com' });
    expect(a).toBe(b);
    const days = await env.DB.prepare('select count(*) n from day_settings where user_id=?')
      .bind(a)
      .first<{ n: number }>();
    expect(days?.n).toBe(7);
  });

  it('セッションは期限切れで無効、残り半分未満で延長', async () => {
    const userId = await upsertGoogleUser(db(), { sub: 'ttl', email: 'ttl@example.com' });
    const t0 = 1_000_000_000_000;
    const { token } = await createSession(db(), userId, t0);
    const mid = await validateSession(db(), token, t0 + SESSION_TTL_MS * 0.6);
    expect(mid?.renewed).toBe(true);
    expect(await validateSession(db(), token, mid!.expiresAt + 1)).toBeNull();
  });

  it('ログアウトでセッションが消える', async () => {
    const { cookie } = await login('logout');
    const out = await exports.default.fetch(`${BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie, origin: BASE, 'content-type': 'application/json' },
    });
    expect(out.status).toBe(200);
    const me = await exports.default.fetch(`${BASE}/api/me`, { headers: { cookie } });
    expect(me.status).toBe(401);
  });
});
