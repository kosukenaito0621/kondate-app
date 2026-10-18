import type { Context } from 'hono';
import type { RealtimeEvent, RealtimeEventInput } from '../../shared/realtime';
import type { AppEnv } from '../types';

/**
 * グループのメンバーに変更を知らせる。応答を待たせないよう waitUntil で送り、
 * 失敗しても本処理には影響させない（画面側は定期的な読み直しでも追いつく）。
 */
export function notifyGroup(c: Context<AppEnv>, input: RealtimeEventInput, groupId = c.var.group.id) {
  const event = { ...input, by: { id: c.var.user.id, name: c.var.user.displayName } } as RealtimeEvent;
  const task = c.env.GROUP_ROOM.getByName(groupId)
    .broadcast(event)
    .catch((e: unknown) => console.warn('realtime broadcast failed', e));
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // テストなど executionCtx がない環境
  }
  return task;
}
