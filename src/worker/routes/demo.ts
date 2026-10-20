import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { addDays, toJstDate, weekDates, weekStartOf } from '../../shared/date';
import type { PlanView } from '../../shared/plan';
import type { ShoppingListView } from '../../shared/shopping';
import type { Db } from '../db/client';
import { groupMembers, groups, sessions, userSettings, users } from '../db/schema';
import { createGroup } from '../lib/groups';
import { hitRateLimit } from '../lib/rate-limit';
import { createSession, invalidateSession, SESSION_COOKIE } from '../lib/session';
import { requireAuth, setSessionCookie } from '../middleware/auth';
import { requireGroup } from '../middleware/group';
import type { AppEnv } from '../types';

/**
 * ログインせずに試す（お試しモード）。
 * - 24時間だけ使える仮のユーザーと「おためしの食卓」を作り、献立・在庫・メモを入れた状態で始める
 * - AI 取り込み・写真・招待・共有リンクは使えない（forbidGuest）
 * - 期限が過ぎたら、毎日の定期処理（purgeGuests）でグループごと消す
 * - 「家族役を呼ぶ」で、架空の家族「はなこ」さんがメモ・献立・買い物リストを変え、リアルタイム共有を体験できる
 */
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
// 携帯回線は1つの IP アドレスを大勢で使うことがあるので、少し多めにしておく（全体の上限は別にある）
const GUEST_PER_IP_PER_HOUR = 10;
const GUEST_PER_DAY = 100;
const FAMILY_NAME = 'はなこ';

/** 自分の API を内側から呼ぶ（献立の作成などを、そのユーザーとして実行する） */
type SelfFetch = (req: Request, env: Env, ctx?: ExecutionContext) => Promise<Response>;
let selfFetch: SelfFetch | null = null;
export const setSelfFetch = (f: SelfFetch) => {
  selfFetch = f;
};

async function callAs(
  c: Context<AppEnv>,
  token: string,
  method: string,
  path: string,
  json?: unknown,
) {
  const origin = new URL(c.req.url).origin;
  const req = new Request(`${origin}/api${path}`, {
    method,
    headers: {
      cookie: `${SESSION_COOKIE}=${token}`,
      origin,
      ...(json === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  let ctx: ExecutionContext | undefined;
  try {
    ctx = c.executionCtx as unknown as ExecutionContext;
  } catch {
    // テストなど executionCtx がない環境
  }
  return selfFetch!(req, c.env, ctx);
}

async function createGuest(db: Db, name: string, expiresAt: number, groupId?: string) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(users).values({
      id,
      googleSub: `guest:${id}`,
      email: '',
      displayName: name,
      guestExpiresAt: expiresAt,
    }),
    // お試しは使い方ガイドを出さず、「やってみよう」で案内する
    db.insert(userSettings).values({ userId: id, cookingLevel: 'futaba', guideSeenAt: Date.now() }),
  ]);
  if (groupId) {
    await db.batch([
      db.insert(groupMembers).values({ groupId, userId: id, role: 'member' }),
      db.update(users).set({ currentGroupId: groupId }).where(eq(users.id, id)),
    ]);
  }
  return id;
}

/** 期限より先には延ばさないセッション */
async function guestSession(db: Db, userId: string, expiresAt: number) {
  const { token } = await createSession(db, userId);
  await db
    .update(sessions)
    .set({ expiresAt })
    .where(and(eq(sessions.userId, userId)));
  return token;
}

/** 期限の過ぎたお試しユーザーを、グループごと消す（Cron から呼ぶ） */
export async function purgeGuests(db: Db, now = Date.now()) {
  const expired = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.guestExpiresAt), lt(users.guestExpiresAt, now)));
  if (!expired.length) return 0;
  const ids = expired.map((u) => u.id);
  let removed = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    // お試しのグループ（メンバーがお試しユーザーだけ）を消すと、献立・在庫・メモなども消える
    const owned = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(inArray(groupMembers.userId, chunk), eq(groupMembers.role, 'owner')));
    const groupIds = [...new Set(owned.map((g) => g.groupId))];
    await db.batch([
      db.delete(users).where(inArray(users.id, chunk)),
      ...(groupIds.length ? [db.delete(groups).where(inArray(groups.id, groupIds))] : []),
    ]);
    removed += chunk.length;
  }
  return removed;
}

/** 献立のある日のうち、今日以降でいちばん近い日（家族役が変える日） */
function targetDay(plan: PlanView, today: string) {
  const days = plan.days.filter((d) => d.items.length > 0);
  return days.find((d) => d.date > today) ?? days.find((d) => d.date >= today) ?? days[0];
}

export const demoRoutes = new Hono<AppEnv>()
  /** お試しを始める（ログイン不要） */
  .post('/start', async (c) => {
    const db = c.var.db;
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    if (
      (await hitRateLimit(db, `guest-ip:${ip}`, GUEST_PER_IP_PER_HOUR, 3_600_000)) ||
      (await hitRateLimit(db, 'guest-all', GUEST_PER_DAY, 86_400_000))
    ) {
      return c.json(
        {
          error: 'rate_limited',
          message:
            'お試しを作れる回数の上限に達しました。1時間ほどおいてから、もう一度お試しください',
        },
        429,
      );
    }
    const now = Date.now();
    const expiresAt = now + GUEST_TTL_MS;
    const userId = await createGuest(db, 'おためし', expiresAt);
    const groupId = await createGroup(db, { ownerId: userId, name: 'おためし', level: 'futaba' });
    // 2人分で計算する（ひとり分だと分量が少なく、使い切りの表示が出にくい）
    await db.update(groups).set({ servings: 2 }).where(eq(groups.id, groupId));
    const token = await guestSession(db, userId, expiresAt);

    // 今週の献立・買い物リスト・在庫・メモを入れておく
    const today = toJstDate();
    const ws = weekStartOf(today);
    await callAs(c, token, 'POST', `/plans/${ws}/generate`, {});
    await callAs(c, token, 'GET', `/shopping/${ws}`);
    const stock = [
      { name: '玉ねぎ', quantity: 2, unit: '個', expiresOn: null },
      { name: 'にんじん', quantity: 1, unit: '本', expiresOn: null },
      { name: '豚こま切れ肉', quantity: 200, unit: 'g', expiresOn: addDays(today, 2) },
      { name: '卵', quantity: 4, unit: '個', expiresOn: addDays(today, 7) },
    ];
    for (const s of stock) await callAs(c, token, 'POST', '/pantry', s);
    await callAs(c, token, 'PUT', `/memos/${today}`, {
      body: 'お試しのメモです。タップして書きかえられます',
    });

    setSessionCookie(c, token, expiresAt);
    return c.json({ ok: true, expiresAt }, 201);
  })
  /**
   * 家族役（はなこさん）が1つ操作する。step 0〜2 を順に呼ぶ。
   * 0: 明日のメモを書く / 1: その日の副菜を変える / 2: 買い物リストを2品チェックし、在庫に牛乳を入れる
   */
  .post('/family/:step', requireAuth, requireGroup, async (c) => {
    if (c.var.user.guestExpiresAt === null) return c.json({ error: 'not_guest' }, 403);
    const step = Number(c.req.param('step'));
    if (![0, 1, 2].includes(step)) return c.json({ error: 'invalid_step' }, 400);
    const db = c.var.db;
    const groupId = c.var.group.id;
    const expiresAt = c.var.user.guestExpiresAt;

    // はなこさんがいなければ、同じグループに加える
    const existing = await db
      .select({ id: users.id })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), eq(users.displayName, FAMILY_NAME)))
      .get();
    const familyId = existing?.id ?? (await createGuest(db, FAMILY_NAME, expiresAt, groupId));
    const token = await guestSession(db, familyId, expiresAt);

    try {
      const today = toJstDate();
      const ws = weekStartOf(today);
      const plan = (await (await callAs(c, token, 'GET', `/plans/${ws}`)).json()) as PlanView;
      const day = targetDay(plan, today);
      if (step === 0) {
        const date =
          day && day.date > today ? day.date : (weekDates(ws).find((d) => d > today) ?? today);
        await callAs(c, token, 'PUT', `/memos/${date}`, { body: 'この日はお弁当もいるよ！' });
      } else if (step === 1 && day) {
        await callAs(c, token, 'POST', `/plans/${ws}/days/${day.date}/regenerate`, {
          version: plan.version,
          slot: 'side',
          memo: 'keep',
        });
      } else if (step === 2) {
        const list = (await (
          await callAs(c, token, 'GET', `/shopping/${ws}`)
        ).json()) as ShoppingListView;
        for (const item of list.items.filter((i) => !i.checked).slice(0, 2)) {
          await callAs(c, token, 'PATCH', `/shopping/items/${item.id}`, { checked: true });
        }
        await callAs(c, token, 'POST', '/pantry', {
          name: '牛乳',
          quantity: 1,
          unit: 'L',
          expiresOn: addDays(today, 5),
        });
      }
    } finally {
      await invalidateSession(db, token);
    }
    return c.json({ ok: true, next: step < 2 ? step + 1 : null });
  });
