import { and, eq, gt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { SharedRecipe } from '../../shared/recipe';
import { recipes, recipeShares, users } from '../db/schema';
import { sha256Hex } from '../lib/crypto';
import { hitRateLimit } from '../lib/rate-limit';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import { copyRecipeInto, loadDetail } from './recipes';

/** 共有リンクを確かめる回数（1時間あたり）。トークンの総当たりを防ぐ */
const LOOKUPS_PER_HOUR = 60;

async function findShare(c: Context<AppEnv>, token: string) {
  const row = await c.var.db
    .select({ recipe: recipes, sharedBy: users.displayName, expiresAt: recipeShares.expiresAt })
    .from(recipeShares)
    .innerJoin(recipes, eq(recipes.id, recipeShares.recipeId))
    .innerJoin(users, eq(users.id, recipeShares.createdBy))
    .where(
      and(
        eq(recipeShares.tokenHash, await sha256Hex(token)),
        gt(recipeShares.expiresAt, Date.now()),
      ),
    )
    .get();
  return row ?? null;
}

export const recipeShareRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    if (await hitRateLimit(c.var.db, `share-open:${c.var.user.id}`, LOOKUPS_PER_HOUR, 3_600_000)) {
      return c.json({ error: 'rate_limited', message: 'しばらく時間をおいてお試しください' }, 429);
    }
    await next();
  })
  /** 共有されたレシピを見る（ログインしていれば、どのグループの人でも） */
  .get('/:token', async (c) => {
    const share = await findShare(c, c.req.param('token'));
    if (!share) return c.json({ error: 'not_found' }, 404);
    const recipe = await loadDetail(c.var.db, share.recipe);
    return c.json({
      recipe: { ...recipe, imageKey: null },
      sharedBy: share.sharedBy,
      expiresAt: share.expiresAt,
    } satisfies SharedRecipe);
  })
  /** いまのグループのレシピとして保存する（複製なので、元のレシピとは別になる） */
  .post('/:token/save', requireGroup, async (c) => {
    const share = await findShare(c, c.req.param('token'));
    if (!share) return c.json({ error: 'not_found' }, 404);
    const detail = await loadDetail(c.var.db, share.recipe);
    const id = await copyRecipeInto(c.var.db, detail, {
      groupId: c.var.group.id,
      userId: c.var.user.id,
    });
    notifyGroup(c, { type: 'recipes.updated' });
    return c.json({ id }, 201);
  });
