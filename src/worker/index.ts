import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { toJstDate } from '../shared/date';
import { getDb } from './db/client';
import { authRoutes } from './routes/auth';
import { groupRoutes, inviteRoutes } from './routes/groups';
import { imageRoutes } from './routes/images';
import { logRoutes } from './routes/logs';
import { meRoutes } from './routes/me';
import { planRoutes, todayItems } from './routes/plans';
import { recipeRoutes } from './routes/recipes';
import { settingsRoutes } from './routes/settings';
import { requireAuth } from './middleware/auth';
import { requireGroup } from './middleware/group';
import type { AppEnv } from './types';

export type { AppEnv };

const api = new Hono<AppEnv>()
  .basePath('/api')
  .use(secureHeaders())
  .use(csrf())
  .use(async (c, next) => {
    c.set('db', getDb(c.env.DB));
    await next();
  })
  .get('/health', (c) => c.json({ ok: true, today: toJstDate() }))
  .route('/auth', authRoutes)
  .route('/me', meRoutes)
  .route('/recipes', recipeRoutes)
  .route('/groups', groupRoutes)
  .route('/invites', inviteRoutes)
  .route('/settings', settingsRoutes)
  .route('/plans', planRoutes)
  .route('/logs', logRoutes)
  .route('/images', imageRoutes)
  .get('/today', requireAuth, requireGroup, async (c) => {
    const { view, day } = await todayItems(c.var.db, c.var.group.id, toJstDate());
    return c.json({
      date: day.date,
      day,
      weekStart: view.weekStart,
      version: view.version,
      exists: view.exists,
    });
  });

api.notFound((c) => c.json({ error: 'not_found' }, 404));
api.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export type AppType = typeof api;

export default api satisfies ExportedHandler<Env>;
