import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { randomToken, sha256Hex } from './crypto';

export const SESSION_COOKIE = 'kd_session';
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
const RENEW_THRESHOLD_MS = 15 * DAY_MS;

export type SessionUser = typeof users.$inferSelect;

/** セッションを発行し、Cookie に入れる生トークンを返す（DBにはハッシュのみ保存） */
export async function createSession(db: Db, userId: string, now = Date.now()) {
  const token = randomToken();
  const expiresAt = now + SESSION_TTL_MS;
  await db.insert(sessions).values({ id: await sha256Hex(token), userId, expiresAt });
  return { token, expiresAt };
}

/**
 * トークンを検証。期限切れなら削除して null。
 * 残り期間が半分を切っていたら延長し、renewed=true を返す（スライディング）。
 */
export async function validateSession(db: Db, token: string, now = Date.now()) {
  const id = await sha256Hex(token);
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;

  const guestUntil = row.user.guestExpiresAt;
  if (row.session.expiresAt <= now || (guestUntil !== null && guestUntil <= now)) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  let expiresAt = row.session.expiresAt;
  // お試しユーザーは期限より先に延ばさない
  const renewed = guestUntil === null && expiresAt - now < RENEW_THRESHOLD_MS;
  if (renewed) {
    expiresAt = now + SESSION_TTL_MS;
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  }
  return { user: row.user, expiresAt, renewed };
}

export async function invalidateSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
}

export async function purgeExpiredSessions(db: Db, now = Date.now()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
