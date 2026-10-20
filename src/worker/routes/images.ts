import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { cookLogs, recipes } from '../db/schema';
import { membership } from '../lib/groups';
import { groupImagePrefix, groupOfImageKey, MAX_IMAGE_BYTES, sniffImage } from '../lib/images';
import { hitRateLimit } from '../lib/rate-limit';
import { forbidGuest, requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import type { AppEnv } from '../types';

const UPLOADS_PER_DAY = 60;

export const imageRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  /** 画像のアップロード（multipart の file）。グループの領域に保存してキーを返す */
  .post('/', forbidGuest, requireGroup, async (c) => {
    if (await hitRateLimit(c.var.db, `upload:${c.var.user.id}`, UPLOADS_PER_DAY, 86_400_000)) {
      return c.json(
        { error: 'rate_limited', message: '今日はこれ以上アップロードできません' },
        429,
      );
    }
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > MAX_IMAGE_BYTES + 64 * 1024) return c.json({ error: 'too_large' }, 413);

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: 'no_file' }, 400);
    if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'too_large' }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind)
      return c.json(
        { error: 'unsupported_type', message: 'JPEG・PNG・WebP の画像を選んでください' },
        415,
      );

    const key = `${groupImagePrefix(c.var.group.id)}${crypto.randomUUID()}.${kind.ext}`;
    await c.env.IMAGES.put(key, bytes, {
      httpMetadata: {
        contentType: kind.type,
        cacheControl: 'private, max-age=31536000, immutable',
      },
      customMetadata: { uploadedBy: c.var.user.id },
    });
    return c.json({ key }, 201);
  })
  /** 画像の配信。そのグループのメンバーだけが見られる */
  .get('/*', async (c) => {
    const key = c.req.path.replace(/^\/api\/images\//, '');
    const groupId = groupOfImageKey(key);
    if (!groupId) return c.json({ error: 'not_found' }, 404);
    if (!(await membership(c.var.db, groupId, c.var.user.id)))
      return c.json({ error: 'forbidden' }, 403);
    const obj = await c.env.IMAGES.get(key);
    if (!obj) return c.json({ error: 'not_found' }, 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('x-content-type-options', 'nosniff');
    return new Response(obj.body, { headers });
  });

/** どこからも使われなくなった画像を消す（レシピの複製で共有されることがある）。失敗しても止めない */
export async function deleteImage(db: Db, bucket: R2Bucket, key: string | null | undefined) {
  if (!key) return;
  try {
    const [r, l] = await Promise.all([
      db.select({ id: recipes.id }).from(recipes).where(eq(recipes.imageKey, key)).get(),
      db.select({ id: cookLogs.id }).from(cookLogs).where(eq(cookLogs.imageKey, key)).get(),
    ]);
    if (!r && !l) await bucket.delete(key);
  } catch (e) {
    console.error('image delete failed', e);
  }
}
