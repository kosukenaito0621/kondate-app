import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { toJstDate } from '../shared/date';
import { getDb } from './db/client';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { recipeRoutes } from './routes/recipes';
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
  .route('/recipes', recipeRoutes);

api.notFound((c) => c.json({ error: 'not_found' }, 404));
api.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export type AppType = typeof api;

export default api satisfies ExportedHandler<Env>;
