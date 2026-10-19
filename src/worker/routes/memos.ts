import { zValidator } from '@hono/zod-validator';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  addDays,
  isIsoDate,
  toJstDate,
  weekStartOf,
  WEEKDAY_LABELS,
  weekdayIndex,
} from '../../shared/date';
import { MEMO_KEEP_DAYS, memoBodySchema, type DayMemo } from '../../shared/memo';
import type { Db } from '../db/client';
import { dayMemos, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';

/** 指定した日付のメモ（日付 → メモ） */
export async function loadMemos(db: Db, groupId: string, dates: string[]) {
  const rows = await db
    .select({ memo: dayMemos, user: users })
    .from(dayMemos)
    .leftJoin(users, eq(users.id, dayMemos.updatedBy))
    .where(and(eq(dayMemos.groupId, groupId), inArray(dayMemos.date, dates)));
  return new Map<string, DayMemo>(
    rows.map(({ memo, user }) => [
      memo.date,
      {
        body: memo.body,
        updatedBy: user ? { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl } : null,
        updatedAt: memo.updatedAt,
      },
    ]),
  );
}

/** メモを書き換える文（空なら消す）。献立の変更と同じ batch に入れて使う */
export function memoStatement(
  db: Db,
  groupId: string,
  userId: string,
  date: string,
  body: string | null,
) {
  const text = body?.trim() ?? '';
  if (!text)
    return db.delete(dayMemos).where(and(eq(dayMemos.groupId, groupId), eq(dayMemos.date, date)));
  const now = Date.now();
  return db
    .insert(dayMemos)
    .values({ groupId, date, body: text, updatedBy: userId, updatedAt: now })
    .onConflictDoUpdate({
      target: [dayMemos.groupId, dayMemos.date],
      set: { body: text, updatedBy: userId, updatedAt: now },
    });
}

/** 古いメモを消す（Cron から呼ぶ） */
export async function purgeOldMemos(db: Db, today = toJstDate()) {
  const res = await db
    .delete(dayMemos)
    .where(lt(dayMemos.date, addDays(today, -MEMO_KEEP_DAYS)))
    .returning({ date: dayMemos.date });
  return res.length;
}

export const memoRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  /** その日のメモを保存する（空にすると消す）。過ぎた週のメモは変えられない */
  .put('/:date', zValidator('json', memoBodySchema), async (c) => {
    const date = c.req.param('date');
    if (!isIsoDate(date) || weekStartOf(date) < weekStartOf(toJstDate())) {
      return c.json({ error: 'invalid_date' }, 400);
    }
    const { body } = c.req.valid('json');
    const db = c.var.db;
    const groupId = c.var.group.id;
    await memoStatement(db, groupId, c.var.user.id, date, body);
    const memo = (await loadMemos(db, groupId, [date])).get(date) ?? null;
    notifyGroup(c, {
      type: 'memo.updated',
      weekStart: weekStartOf(date),
      date,
      summary: `${WEEKDAY_LABELS[weekdayIndex(date)]}曜のメモを${memo ? '更新' : '消'}しました`,
    });
    return c.json({ date, memo });
  });
