import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { SESSION_COOKIE, validateSession } from '../lib/session';
import type { AppEnv } from '../types';

export function setSessionCookie(c: Context, token: string, expiresAt: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

/** お試しユーザーには使わせない機能（AI・写真・招待・共有リンク など） */
export const forbidGuest = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.user.guestExpiresAt !== null) {
    return c.json(
      {
        error: 'guest_forbidden',
        message: 'お試しでは使えません。Google でログインすると使えます',
      },
      403,
    );
  }
  await next();
});

/** ログイン必須。c.var.user にユーザーを入れる */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const result = token ? await validateSession(c.var.db, token) : null;
  if (!token || !result) return c.json({ error: 'unauthorized' }, 401);
  if (result.renewed) setSessionCookie(c, token, result.expiresAt);
  c.set('user', result.user);
  await next();
});
