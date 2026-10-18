import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { updateMeSchema, type Me } from '../../shared/schemas';
import { DEFAULT_THEME, isThemeId } from '../../shared/themes';
import type { Db } from '../db/client';
import { userSettings, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

async function loadMe(db: Db, userId: string): Promise<Me> {
  const row = await db
    .select({ user: users, theme: userSettings.theme })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId))
    .get();
  if (!row) throw new Error('user not found');
  const { user, theme } = row;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    theme: isThemeId(theme) ? theme : DEFAULT_THEME,
  };
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await loadMe(c.var.db, c.var.user.id)))
  .patch('/', zValidator('json', updateMeSchema), async (c) => {
    const { displayName, theme } = c.req.valid('json');
    const db = c.var.db;
    const userId = c.var.user.id;
    if (displayName !== undefined) {
      await db.update(users).set({ displayName }).where(eq(users.id, userId));
    }
    if (theme !== undefined) {
      await db
        .insert(userSettings)
        .values({ userId, theme })
        .onConflictDoUpdate({ target: userSettings.userId, set: { theme } });
    }
    return c.json(await loadMe(db, userId));
  });
