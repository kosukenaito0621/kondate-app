import { createMiddleware } from 'hono/factory';
import { ensureCurrentGroup, membership } from '../lib/groups';
import type { AppEnv } from '../types';

/**
 * 操作対象のグループを決め、メンバーであることを確認する（requireAuth の後に使う）。
 * X-Group-Id ヘッダーがあればそれを、なければ最後に使ったグループを使う。
 * メンバーでなければ 403。
 */
export const requireGroup = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  const requested = c.req.header('x-group-id');
  const groupId = requested ?? (await ensureCurrentGroup(c.var.db, user.id, user.displayName));
  const member = await membership(c.var.db, groupId, user.id);
  if (!member) return c.json({ error: 'forbidden' }, 403);
  c.set('group', { id: groupId, role: member.role });
  await next();
});

/** オーナーのみ（requireGroup の後に使う） */
export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.group.role !== 'owner') return c.json({ error: 'owner_only' }, 403);
  await next();
});
