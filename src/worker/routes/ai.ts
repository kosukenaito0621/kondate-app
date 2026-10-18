import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { toRecipeDraft } from '../ai/draft';
import { ExtractError, extractRecipe } from '../ai/extract';
import { extractRecipeText } from '../lib/html-to-text';
import { groupOfImageKey } from '../lib/images';
import { hitRateLimit } from '../lib/rate-limit';
import { safeFetchHtml, UnsafeUrlError } from '../lib/safe-fetch';
import { requireAuth } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import type { AppEnv } from '../types';
import { deleteImage } from './images';

type Ctx = Context<AppEnv>;

/** ユーザーごとに1日あたりの AI 呼び出し回数を制限 */
async function overLimit(c: Ctx) {
  const limit = Number(c.env.AI_DAILY_LIMIT ?? 20);
  return hitRateLimit(c.var.db, `ai:${c.var.user.id}`, limit, 86_400_000);
}

function fail(c: Ctx, e: unknown) {
  if (e instanceof ExtractError)
    return c.json({ error: 'extract_failed', message: e.message }, 422);
  if (e instanceof UnsafeUrlError) return c.json({ error: 'unsafe_url', message: e.message }, 400);
  console.error('ai import failed', e);
  return c.json(
    { error: 'ai_unavailable', message: 'AIが混み合っています。時間をおいてお試しください' },
    502,
  );
}

export const aiRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireGroup)
  /** レシピ本の写真から下書きを作る（保存はしない。確認画面で直してから保存する） */
  .post(
    '/import-image',
    zValidator('json', z.object({ imageKey: z.string().max(200) })),
    async (c) => {
      const { imageKey } = c.req.valid('json');
      if (groupOfImageKey(imageKey) !== c.var.group.id)
        return c.json({ error: 'invalid_image' }, 400);
      if (await overLimit(c)) {
        return c.json(
          { error: 'rate_limited', message: '今日のAI読み取りの回数を使い切りました' },
          429,
        );
      }
      const obj = await c.env.IMAGES.get(imageKey);
      if (!obj) return c.json({ error: 'not_found' }, 404);
      try {
        const bytes = new Uint8Array(await obj.arrayBuffer());
        const ai = await extractRecipe(c.env.AI, {
          kind: 'image',
          bytes,
          contentType: obj.httpMetadata?.contentType ?? 'image/jpeg',
        });
        return c.json(toRecipeDraft(ai));
      } catch (e) {
        return fail(c, e);
      } finally {
        // 読み取り用の写真は残さない
        await deleteImage(c.var.db, c.env.IMAGES, imageKey);
      }
    },
  )
  /** レシピサイトの URL から下書きを作る */
  .post('/import-url', zValidator('json', z.object({ url: z.string().max(2000) })), async (c) => {
    const { url } = c.req.valid('json');
    if (await overLimit(c)) {
      return c.json(
        { error: 'rate_limited', message: '今日のAI読み取りの回数を使い切りました' },
        429,
      );
    }
    try {
      const page = await safeFetchHtml(url);
      const text = extractRecipeText(page.html);
      if (text.length < 30) throw new ExtractError('ページからレシピを見つけられませんでした');
      const ai = await extractRecipe(c.env.AI, { kind: 'text', text });
      return c.json(toRecipeDraft(ai, page.url));
    } catch (e) {
      return fail(c, e);
    }
  });
