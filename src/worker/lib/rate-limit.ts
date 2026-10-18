import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { rateLimits } from '../db/schema';

/**
 * キーごとに、時間枠（例: 1時間）あたり limit 回まで許可する。
 * 加算してから判定するので、同時に来ても上限を超えにくい。
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const window = String(Math.floor(now / windowMs));
  const row = await db
    .insert(rateLimits)
    .values({ key, window, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.window],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })
    .get();
  return row.count > limit;
}
