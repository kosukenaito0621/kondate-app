import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CookingLevel } from '../../shared/levels';
import type { Db } from '../db/client';
import { daySettings, groupMembers, groups, mealPlans, recipes, users } from '../db/schema';

export type GroupRole = 'owner' | 'member';

/** 新しいグループを作り、作成者をオーナーにして既定の曜日設定を入れる */
export async function createGroup(
  db: Db,
  opts: { ownerId: string; name: string; icon?: string; color?: string; level?: CookingLevel },
) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(groups).values({
      id,
      name: opts.name,
      icon: opts.icon ?? '🏠',
      color: opts.color ?? 'rose',
      defaultLevel: opts.level ?? 'minori',
    }),
    db.insert(groupMembers).values({ groupId: id, userId: opts.ownerId, role: 'owner' }),
    db.insert(daySettings).values(
      Array.from({ length: 7 }, (_, weekday) => ({
        groupId: id,
        weekday,
        // 平日はふつう、土日はじっくり・ゆとりを初期値に
        timeLevel: weekday >= 5 ? ('slow' as const) : ('normal' as const),
        budgetLevel: weekday >= 5 ? ('rich' as const) : ('normal' as const),
      })),
    ),
    db.update(users).set({ currentGroupId: id }).where(eq(users.id, opts.ownerId)),
  ]);
  return id;
}

export async function membership(db: Db, groupId: string, userId: string) {
  return db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .get();
}

/** 所属グループ（作成日順） */
export async function listGroupsOf(db: Db, userId: string) {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      icon: groups.icon,
      color: groups.color,
      role: groupMembers.role,
      memberCount: sql<number>`(select count(*) from group_members m2 where m2.group_id = ${groups.id})`,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(groupMembers.joinedAt);
}

/**
 * グループを削除する。meal_plans / recipes は旧テーブルへの列追加で作ったため
 * DB 側の ON DELETE CASCADE が効かない。子データを先に消してからグループを消す。
 */
export async function deleteGroup(db: Db, groupId: string) {
  const memberIds = (
    await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
  ).map((m) => m.userId);
  await db.batch([
    db.delete(mealPlans).where(eq(mealPlans.groupId, groupId)),
    db.delete(recipes).where(eq(recipes.groupId, groupId)),
    db.update(users).set({ currentGroupId: null }).where(eq(users.currentGroupId, groupId)),
    db.delete(groups).where(eq(groups.id, groupId)),
  ]);
  return memberIds;
}

/** current_group_id が空・無効なら、所属している最初のグループに直す（なければ作る） */
export async function ensureCurrentGroup(db: Db, userId: string, displayName: string | null) {
  const user = await db
    .select({ current: users.currentGroupId })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (user?.current && (await membership(db, user.current, userId))) return user.current;

  const first = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .orderBy(groupMembers.joinedAt)
    .get();
  if (first) {
    await db.update(users).set({ currentGroupId: first.groupId }).where(eq(users.id, userId));
    return first.groupId;
  }
  return createGroup(db, { ownerId: userId, name: defaultGroupName(displayName) });
}

export function defaultGroupName(displayName: string | null) {
  return `${displayName ?? 'わたし'}の家`;
}

export async function memberCount(db: Db, groupId: string) {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .get();
  return row?.n ?? 0;
}

export async function usersByIds(db: Db, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, ids));
}
