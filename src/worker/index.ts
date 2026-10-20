import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { toJstDate } from '../shared/date';
import { getDb } from './db/client';
import { aiRoutes } from './routes/ai';
import { authRoutes } from './routes/auth';
import { groupRoutes, inviteRoutes } from './routes/groups';
import { imageRoutes } from './routes/images';
import { logRoutes } from './routes/logs';
import { pantryRoutes } from './routes/pantry';
import { meRoutes } from './routes/me';
import { memoRoutes, purgeOldMemos } from './routes/memos';
import { planRoutes, todayItems } from './routes/plans';
import { recipeShareRoutes } from './routes/recipe-shares';
import { recipeRoutes } from './routes/recipes';
import { settingsRoutes } from './routes/settings';
import { shoppingRoutes } from './routes/shopping';
import { requireAuth } from './middleware/auth';
import { requireGroup } from './middleware/group';
import type { AppEnv } from './types';

export type { AppEnv };
// Durable Object（wrangler.jsonc の class_name と一致させる）
export { GroupRoom } from './realtime/group-room';

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
  .route('/recipe-shares', recipeShareRoutes)
  .route('/groups', groupRoutes)
  .route('/invites', inviteRoutes)
  .route('/settings', settingsRoutes)
  .route('/plans', planRoutes)
  .route('/shopping', shoppingRoutes)
  .route('/logs', logRoutes)
  .route('/memos', memoRoutes)

  .route('/pantry', pantryRoutes)
  .route('/images', imageRoutes)
  .route('/ai', aiRoutes)
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

export default {
  fetch: api.fetch,
  /** 毎日の定期処理（wrangler.jsonc の triggers.crons）：古い日ごとメモを消す */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeOldMemos(getDb(env.DB)).then((n) => console.log(`purged ${n} old memos`)));
  },
} satisfies ExportedHandler<Env>;
