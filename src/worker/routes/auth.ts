import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client';
import { userSettings, users } from '../db/schema';
import { randomToken } from '../lib/crypto';
import { buildAuthorizationUrl, exchangeCode, type GoogleProfile } from '../lib/google';
import { createGroup, defaultGroupName } from '../lib/groups';
import { createSession, invalidateSession, SESSION_COOKIE } from '../lib/session';
import { setSessionCookie } from '../middleware/auth';
import type { AppEnv } from '../types';

const STATE_COOKIE = 'kd_oauth_state';
const VERIFIER_COOKIE = 'kd_oauth_verifier';
const NEXT_COOKIE = 'kd_oauth_next';

/** ログイン後の戻り先。アプリ内の相対パスだけ許可（オープンリダイレクト対策） */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next.length > 200 ? '/' : next;
}
const tempCookie = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/api/auth',
  maxAge: 600,
} as const;

function googleConfig(env: Env) {
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: new URL('/api/auth/google/callback', env.APP_URL).toString(),
  };
}

/**
 * Google の sub でユーザーを探し、なければ作成する。
 * 新規ユーザーには「自分だけのグループ」を自動で作る（1人でもグループとして扱う）。
 */
export async function upsertGoogleUser(db: Db, profile: GoogleProfile) {
  const existing = await db.select().from(users).where(eq(users.googleSub, profile.sub)).get();
  if (existing) {
    await db
      .update(users)
      .set({ email: profile.email, avatarUrl: profile.picture ?? existing.avatarUrl })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.batch([
    db.insert(users).values({
      id,
      googleSub: profile.sub,
      email: profile.email,
      avatarUrl: profile.picture ?? null,
    }),
    db.insert(userSettings).values({ userId: id }),
  ]);
  await createGroup(db, { ownerId: id, name: defaultGroupName(null) });
  return id;
}

export const authRoutes = new Hono<AppEnv>()
  .get('/google', async (c) => {
    const state = randomToken();
    const verifier = randomToken();
    setCookie(c, STATE_COOKIE, state, tempCookie);
    setCookie(c, VERIFIER_COOKIE, verifier, tempCookie);
    setCookie(c, NEXT_COOKIE, safeNext(c.req.query('next')), tempCookie);
    return c.redirect(await buildAuthorizationUrl(googleConfig(c.env), state, verifier));
  })
  .get('/google/callback', async (c) => {
    const { code, state, error } = c.req.query();
    const savedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);
    const next = safeNext(getCookie(c, NEXT_COOKIE));
    deleteCookie(c, STATE_COOKIE, { path: tempCookie.path });
    deleteCookie(c, VERIFIER_COOKIE, { path: tempCookie.path });
    deleteCookie(c, NEXT_COOKIE, { path: tempCookie.path });

    if (error) return c.redirect('/login?error=cancelled');
    if (!code || !state || !savedState || !verifier || state !== savedState) {
      return c.redirect('/login?error=invalid_state');
    }

    let profile: GoogleProfile;
    try {
      profile = await exchangeCode(googleConfig(c.env), code, verifier);
    } catch (e) {
      console.error(e);
      return c.redirect('/login?error=google');
    }

    const userId = await upsertGoogleUser(c.var.db, profile);
    const session = await createSession(c.var.db, userId);
    setSessionCookie(c, session.token, session.expiresAt);
    return c.redirect(next);
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await invalidateSession(c.var.db, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
