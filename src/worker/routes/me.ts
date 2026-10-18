import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { updateMeSchema, type Me } from '../../shared/schemas';
import { users } from '../db/schema';
import type { SessionUser } from '../lib/session';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

const toMe = (u: SessionUser): Me => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
});

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', (c) => c.json(toMe(c.var.user)))
  .patch('/', zValidator('json', updateMeSchema), async (c) => {
    const { displayName } = c.req.valid('json');
    const updated = await c.var.db
      .update(users)
      .set({ displayName })
      .where(eq(users.id, c.var.user.id))
      .returning()
      .get();
    return c.json(toMe(updated));
  });
