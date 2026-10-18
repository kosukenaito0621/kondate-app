import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { getDb } from '../src/worker/db/client';
import { createSession } from '../src/worker/lib/session';
import { upsertGoogleUser } from '../src/worker/routes/auth';

export const BASE = 'http://localhost:5173';
export const db = () => getDb(env.DB);

export type TestUser = { userId: string; cookie: string; groupId: string };

/** テストユーザーを作ってログイン済みの Cookie を返す */
export async function login(sub: string, displayName = sub): Promise<TestUser> {
  const userId = await upsertGoogleUser(db(), { sub, email: `${sub}@example.com` });
  await env.DB.prepare('update users set display_name = ? where id = ?')
    .bind(displayName, userId)
    .run();
  const { token } = await createSession(db(), userId);
  const row = await env.DB.prepare('select current_group_id g from users where id = ?')
    .bind(userId)
    .first<{ g: string }>();
  return { userId, cookie: `kd_session=${token}`, groupId: row!.g };
}

/** ログイン済みユーザーとして API を呼ぶ */
export function api(
  user: TestUser | null,
  path: string,
  init: { method?: string; json?: unknown; groupId?: string } = {},
) {
  const headers: Record<string, string> = { origin: BASE };
  if (user) headers.cookie = user.cookie;
  if (init.groupId) headers['x-group-id'] = init.groupId;
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  return exports.default.fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
    redirect: 'manual',
  });
}
