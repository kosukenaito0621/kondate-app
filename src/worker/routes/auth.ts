import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client';
import { daySettings, userSettings, users } from '../db/schema';
import { randomToken } from '../lib/crypto';
import { buildAuthorizationUrl, exchangeCode, type GoogleProfile } from '../lib/google';
import { createSession, invalidateSession, SESSION_COOKIE } from '../lib/session';
import { setSessionCookie } from '../middleware/auth';
import type { AppEnv } from '../types';

const STATE_COOKIE = 'kd_oauth_state';
const VERIFIER_COOKIE = 'kd_oauth_verifier';
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

/** Google の sub でユーザーを探し、なければ既定設定つきで作成 */
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
    db.insert(daySettings).values(
      Array.from({ length: 7 }, (_, weekday) => ({
        userId: id,
        weekday,
        // 平日はふつう、土日はじっくり・ゆとりを初期値に
        timeLevel: weekday >= 5 ? ('slow' as const) : ('normal' as const),
        budgetLevel: weekday >= 5 ? ('rich' as const) : ('normal' as const),
      })),
    ),
  ]);
  return id;
}

export const authRoutes = new Hono<AppEnv>()
  .get('/google', async (c) => {
    const state = randomToken();
    const verifier = randomToken();
    setCookie(c, STATE_COOKIE, state, tempCookie);
    setCookie(c, VERIFIER_COOKIE, verifier, tempCookie);
    return c.redirect(await buildAuthorizationUrl(googleConfig(c.env), state, verifier));
  })
  .get('/google/callback', async (c) => {
    const { code, state, error } = c.req.query();
    const savedState = getCookie(c, STATE_COOKIE);
    const verifier = getCookie(c, VERIFIER_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: tempCookie.path });
    deleteCookie(c, VERIFIER_COOKIE, { path: tempCookie.path });

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
    return c.redirect('/');
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await invalidateSession(c.var.db, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
