import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { toJstDate } from '../shared/date';

export type AppEnv = { Bindings: Env };

const api = new Hono<AppEnv>()
  .basePath('/api')
  .use(secureHeaders())
  .get('/health', async (c) => {
    const row = await c.env.DB.prepare('select count(*) as n from recipes').first<{ n: number }>();
    return c.json({ ok: true, today: toJstDate(), recipes: row?.n ?? 0 });
  });

api.notFound((c) => c.json({ error: 'not_found' }, 404));
api.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export type AppType = typeof api;

export default api satisfies ExportedHandler<Env>;
