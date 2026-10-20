import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { groupMembers, recipeFavorites, users } from '../db/schema';

/** その人のお気に入りのレシピ */
export async function myFavoriteIds(db: Db, userId: string) {
  const rows = await db
    .select({ id: recipeFavorites.recipeId })
    .from(recipeFavorites)
    .where(eq(recipeFavorites.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/** 食卓のだれかのお気に入りのレシピ（献立で少し出やすくする・週間献立にハートを出す） */
export async function groupFavoriteIds(db: Db, groupId: string) {
  const rows = await db
    .selectDistinct({ id: recipeFavorites.recipeId })
    .from(recipeFavorites)
    .innerJoin(groupMembers, eq(groupMembers.userId, recipeFavorites.userId))
    .where(eq(groupMembers.groupId, groupId));
  return new Set(rows.map((r) => r.id));
}

/** そのレシピをお気に入りにしている、食卓のメンバー */
export async function favoritedBy(db: Db, groupId: string, recipeId: string) {
  return db
    .select({ id: users.id, name: users.displayName, avatarUrl: users.avatarUrl })
    .from(recipeFavorites)
    .innerJoin(users, eq(users.id, recipeFavorites.userId))
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.userId, recipeFavorites.userId), eq(groupMembers.groupId, groupId)),
    )
    .where(eq(recipeFavorites.recipeId, recipeId))
    .orderBy(recipeFavorites.createdAt);
}
