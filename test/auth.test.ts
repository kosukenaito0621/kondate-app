import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getDb } from '../src/worker/db/client';
import { createSession, validateSession, SESSION_TTL_MS } from '../src/worker/lib/session';
import { safeNext, upsertGoogleUser } from '../src/worker/routes/auth';

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
    const res = await exports.default.fetch(`${BASE}/api/auth/google/callback?code=x&state=evil`, {
      redirect: 'manual',
      headers: { cookie: 'kd_oauth_state=good; kd_oauth_verifier=v' },
    });
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

  it('テーマは既定でいちごミルク、選んだテーマが保存される', async () => {
    const { cookie } = await login('theme-user');
    const me = await exports.default.fetch(`${BASE}/api/me`, { headers: { cookie } });
    expect(await me.json()).toMatchObject({ theme: 'ichigo' });

    const patch = (body: unknown) =>
      exports.default.fetch(`${BASE}/api/me`, {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json', origin: BASE },
        body: JSON.stringify(body),
      });

    const ok = await patch({ theme: 'midnight' });
    expect(await ok.json()).toMatchObject({ theme: 'midnight' });
    expect((await patch({ theme: 'rainbow' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
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

  it('同じ Google アカウントは同じユーザーになり、自分だけのグループ（曜日設定7件）が1つ作られる', async () => {
    const a = await upsertGoogleUser(db(), { sub: 'same', email: 'a@example.com' });
    const b = await upsertGoogleUser(db(), { sub: 'same', email: 'b@example.com' });
    expect(a).toBe(b);
    const groups = await env.DB.prepare(
      `select m.group_id, m.role, g.name, (select count(*) from day_settings d where d.group_id = m.group_id) days
       from group_members m join groups g on g.id = m.group_id where m.user_id = ?`,
    )
      .bind(a)
      .all<{ group_id: string; role: string; name: string; days: number }>();
    expect(groups.results).toHaveLength(1);
    expect(groups.results[0]).toMatchObject({ role: 'owner', name: 'わたしの家', days: 7 });
  });

  it('ユーザーネームを決めると「わたしの家」が「◯◯の家」になり、初回のレベル選択がグループ既定になる', async () => {
    const { cookie } = await login('naming');
    await env.DB.prepare('update users set display_name = null where google_sub = ?')
      .bind('naming')
      .run();
    const patch = (json: unknown) =>
      exports.default.fetch(`${BASE}/api/me`, {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json', origin: BASE },
        body: JSON.stringify(json),
      });
    const me = await (
      await patch({ displayName: 'はなこ' })
    ).json<{ groups: { name: string }[]; cookingLevel: null }>();
    expect(me.groups[0]?.name).toBe('はなこの家');
    expect(me.cookingLevel).toBeNull();

    await patch({ cookingLevel: 'futaba' });
    const level = await env.DB.prepare(
      `select g.default_level from groups g join group_members m on m.group_id = g.id join users u on u.id = m.user_id where u.google_sub = 'naming'`,
    ).first<{ default_level: string }>();
    expect(level?.default_level).toBe('futaba');
  });

  it('ログイン後の戻り先はアプリ内のパスだけ', () => {
    expect(safeNext('/invite/abc')).toBe('/invite/abc');
    expect(safeNext('//evil.example.com')).toBe('/');
    expect(safeNext('https://evil.example.com')).toBe('/');
    expect(safeNext('/\\evil.example.com')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
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
