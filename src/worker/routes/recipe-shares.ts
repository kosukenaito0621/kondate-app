import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, gt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { saveSharedSchema, type ShareView } from '../../shared/recipe';
import {
  recipes,
  recipeShareBundleItems,
  recipeShareBundles,
  recipeShares,
  users,
} from '../db/schema';
import { sha256Hex } from '../lib/crypto';
import { hitRateLimit } from '../lib/rate-limit';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import { notifyGroup } from '../realtime/notify';
import type { AppEnv } from '../types';
import { copyRecipeInto, loadDetail } from './recipes';

/** 共有リンクを確かめる回数（1時間あたり）。トークンの総当たりを防ぐ */
const LOOKUPS_PER_HOUR = 60;

type RecipeRow = typeof recipes.$inferSelect;
type Found =
  | { kind: 'single'; sharedBy: string | null; expiresAt: number; rows: RecipeRow[] }
  | {
      kind: 'bundle';
      title: string | null;
      sharedBy: string | null;
      expiresAt: number;
      rows: RecipeRow[];
    };

/** トークンから共有を探す（1品のリンク → まとめたリンクの順） */
async function findShare(c: Context<AppEnv>, token: string): Promise<Found | null> {
  const db = c.var.db;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const single = await db
    .select({ recipe: recipes, sharedBy: users.displayName, expiresAt: recipeShares.expiresAt })
    .from(recipeShares)
    .innerJoin(recipes, eq(recipes.id, recipeShares.recipeId))
    .innerJoin(users, eq(users.id, recipeShares.createdBy))
    .where(and(eq(recipeShares.tokenHash, hash), gt(recipeShares.expiresAt, now)))
    .get();
  if (single) {
    return {
      kind: 'single',
      sharedBy: single.sharedBy,
      expiresAt: single.expiresAt,
      rows: [single.recipe],
    };
  }
  const bundle = await db
    .select({ b: recipeShareBundles, sharedBy: users.displayName })
    .from(recipeShareBundles)
    .innerJoin(users, eq(users.id, recipeShareBundles.createdBy))
    .where(and(eq(recipeShareBundles.tokenHash, hash), gt(recipeShareBundles.expiresAt, now)))
    .get();
  if (!bundle) return null;
  // 削除されたレシピは外れる（残りだけを見せる）
  const rows = await db
    .select({ recipe: recipes })
    .from(recipeShareBundleItems)
    .innerJoin(recipes, eq(recipes.id, recipeShareBundleItems.recipeId))
    .where(eq(recipeShareBundleItems.bundleId, bundle.b.id))
    .orderBy(asc(recipeShareBundleItems.sort));
  if (rows.length === 0) return null;
  return {
    kind: 'bundle',
    title: bundle.b.title,
    sharedBy: bundle.sharedBy,
    expiresAt: bundle.b.expiresAt,
    rows: rows.map((r) => r.recipe),
  };
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
    const details = await Promise.all(share.rows.map((r) => loadDetail(c.var.db, r)));
    const list = details.map((d) => ({ ...d, imageKey: null }));
    const view: ShareView =
      share.kind === 'single'
        ? { kind: 'single', recipe: list[0]!, sharedBy: share.sharedBy, expiresAt: share.expiresAt }
        : {
            kind: 'bundle',
            title: share.title,
            sharedBy: share.sharedBy,
            expiresAt: share.expiresAt,
            recipes: list,
          };
    return c.json(view);
  })
  /**
   * いまのグループのレシピとして保存する（複製なので、元のレシピとは別になる）。
   * まとめて送られたときは recipeIds で選んだものだけ（省略時はすべて）
   */
  .post('/:token/save', requireGroup, zValidator('json', saveSharedSchema), async (c) => {
    const share = await findShare(c, c.req.param('token'));
    if (!share) return c.json({ error: 'not_found' }, 404);
    const pick = c.req.valid('json').recipeIds;
    const rows = pick ? share.rows.filter((r) => pick.includes(r.id)) : share.rows;
    if (rows.length === 0) return c.json({ error: 'nothing_selected' }, 400);
    const ids: string[] = [];
    for (const r of rows) {
      const detail = await loadDetail(c.var.db, r);
      ids.push(
        await copyRecipeInto(c.var.db, detail, { groupId: c.var.group.id, userId: c.var.user.id }),
      );
    }
    notifyGroup(c, { type: 'recipes.updated' });
    return c.json({ id: ids[0]!, ids }, 201);
  });
