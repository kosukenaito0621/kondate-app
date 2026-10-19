import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { updateMeSchema, type Me } from '../../shared/schemas';
import { DEFAULT_THEME, isThemeId } from '../../shared/themes';
import type { Db } from '../db/client';
import { groups, userSettings, users } from '../db/schema';
import { defaultGroupName, ensureCurrentGroup, listGroupsOf } from '../lib/groups';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

export async function loadMe(db: Db, userId: string): Promise<Me> {
  const row = await db
    .select({ user: users, theme: userSettings.theme, level: userSettings.cookingLevel })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId))
    .get();
  if (!row) throw new Error('user not found');
  const { user, theme, level } = row;
  const currentGroupId = await ensureCurrentGroup(db, user.id, user.displayName);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    theme: isThemeId(theme) ? theme : DEFAULT_THEME,
    cookingLevel: level ?? null,
    currentGroupId,
    groups: await listGroupsOf(db, user.id),
  };
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await loadMe(c.var.db, c.var.user.id)))
  .patch('/', zValidator('json', updateMeSchema), async (c) => {
    const { displayName, theme, cookingLevel } = c.req.valid('json');
    const db = c.var.db;
    const user = c.var.user;

    if (displayName !== undefined) {
      await db.update(users).set({ displayName }).where(eq(users.id, user.id));
      // 自動で付けた「わたしの食卓」は、名前が決まったら「◯◯の食卓」にする
      if (user.displayName === null) {
        await db
          .update(groups)
          .set({ name: defaultGroupName(displayName) })
          .where(
            and(
              eq(groups.name, defaultGroupName(null)),
              eq(groups.id, await ensureCurrentGroup(db, user.id, null)),
            ),
          );
      }
    }
    if (cookingLevel !== undefined) {
      // 初めてレベルを選んだときは、自分がオーナーの現在グループ（自動作成した1人グループ）の既定にも使う
      const prev = await db
        .select({ level: userSettings.cookingLevel })
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .get();
      if (!prev?.level) {
        const groupId = await ensureCurrentGroup(db, user.id, user.displayName);
        const mine = (await listGroupsOf(db, user.id)).find((g) => g.id === groupId);
        if (mine?.role === 'owner' && mine.memberCount === 1) {
          await db.update(groups).set({ defaultLevel: cookingLevel }).where(eq(groups.id, groupId));
        }
      }
    }
    if (theme !== undefined || cookingLevel !== undefined) {
      const set = { ...(theme && { theme }), ...(cookingLevel && { cookingLevel }) };
      await db
        .insert(userSettings)
        .values({ userId: user.id, ...set })
        .onConflictDoUpdate({ target: userSettings.userId, set });
    }
    return c.json(await loadMe(db, user.id));
  });
