import { zValidator } from '@hono/zod-validator';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  createGroupSchema,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_MS,
  normalizeInviteCode,
  updateGroupSchema,
  type CreatedInvite,
  type GroupDetail,
  type InvitePreview,
  type InviteSummary,
} from '../../shared/groups';
import type { Db } from '../db/client';
import { groupInvites, groupMembers, groups, userSettings, users } from '../db/schema';
import { randomToken, sha256Hex } from '../lib/crypto';
import {
  createGroup,
  deleteGroup,
  ensureCurrentGroup,
  listGroupsOf,
  memberCount,
  membership,
} from '../lib/groups';
import { hitRateLimit } from '../lib/rate-limit';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

type Ctx = Context<AppEnv>;

/** パスの :id のグループのメンバーか確認。オーナー限定なら ownerOnly */
async function guard(c: Ctx, ownerOnly = false) {
  const groupId = c.req.param('id')!;
  const m = await membership(c.var.db, groupId, c.var.user.id);
  if (!m) return { error: c.json({ error: 'forbidden' }, 403) } as const;
  if (ownerOnly && m.role !== 'owner')
    return { error: c.json({ error: 'owner_only' }, 403) } as const;
  return { groupId, role: m.role } as const;
}

async function loadGroup(db: Db, groupId: string, me: string): Promise<GroupDetail> {
  const g = await db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!g) throw new Error('group not found');
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt);
  const members = rows.map((r) => ({ ...r, isMe: r.userId === me }));
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    defaultLevel: g.defaultLevel,
    servings: g.servings,
    effectiveServings: g.servings ?? Math.max(1, members.length),
    role: members.find((m) => m.isMe)?.role ?? 'member',
    members,
  };
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  return [...bytes].map((b) => INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length]).join('');
}

/** 招待をコード（6文字）またはリンクのトークンで探す。有効なものだけ */
async function findInvite(db: Db, key: string, now = Date.now()) {
  const code = normalizeInviteCode(key);
  const cond = code
    ? eq(groupInvites.code, code)
    : eq(groupInvites.tokenHash, await sha256Hex(key));
  return db
    .select()
    .from(groupInvites)
    .where(and(cond, isNull(groupInvites.revokedAt), gt(groupInvites.expiresAt, now)))
    .get();
}

const INVITE_LOOKUP_LIMIT = 20; // 1時間あたり

export const groupRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => c.json(await listGroupsOf(c.var.db, c.var.user.id)))
  .post('/', zValidator('json', createGroupSchema), async (c) => {
    const { name, color } = c.req.valid('json');
    const level = await c.var.db
      .select({ level: userSettings.cookingLevel })
      .from(userSettings)
      .where(eq(userSettings.userId, c.var.user.id))
      .get();
    const id = await createGroup(c.var.db, {
      ownerId: c.var.user.id,
      name,
      color,
      level: level?.level ?? 'minori',
    });
    return c.json(await loadGroup(c.var.db, id, c.var.user.id), 201);
  })
  /** いま使っているグループの詳細 */
  .get('/current', async (c) => {
    const id = await ensureCurrentGroup(c.var.db, c.var.user.id, c.var.user.displayName);
    return c.json(await loadGroup(c.var.db, id, c.var.user.id));
  })
  .get('/:id', async (c) => {
    const g = await guard(c);
    if ('error' in g) return g.error;
    return c.json(await loadGroup(c.var.db, g.groupId, c.var.user.id));
  })
  .patch('/:id', zValidator('json', updateGroupSchema), async (c) => {
    const g = await guard(c);
    if ('error' in g) return g.error;
    const patch = c.req.valid('json');
    if (Object.keys(patch).length) {
      await c.var.db.update(groups).set(patch).where(eq(groups.id, g.groupId));
    }
    return c.json(await loadGroup(c.var.db, g.groupId, c.var.user.id));
  })
  .delete('/:id', async (c) => {
    const g = await guard(c, true);
    if ('error' in g) return g.error;
    const mine = await listGroupsOf(c.var.db, c.var.user.id);
    if (mine.length <= 1) {
      return c.json({ error: 'last_group', message: '最後のグループは削除できません' }, 409);
    }
    await deleteGroup(c.var.db, g.groupId);
    await ensureCurrentGroup(c.var.db, c.var.user.id, c.var.user.displayName);
    return c.json({ ok: true });
  })
  .post('/:id/switch', async (c) => {
    const g = await guard(c);
    if ('error' in g) return g.error;
    await c.var.db
      .update(users)
      .set({ currentGroupId: g.groupId })
      .where(eq(users.id, c.var.user.id));
    return c.json({ ok: true, currentGroupId: g.groupId });
  })
  /** メンバーの除外（オーナー）または自分の退出 */
  .delete('/:id/members/:userId', async (c) => {
    const g = await guard(c);
    if ('error' in g) return g.error;
    const target = c.req.param('userId');
    const self = target === c.var.user.id;
    if (!self && g.role !== 'owner') return c.json({ error: 'owner_only' }, 403);
    const targetMember = await membership(c.var.db, g.groupId, target);
    if (!targetMember) return c.json({ error: 'not_found' }, 404);
    if (targetMember.role === 'owner') {
      return c.json(
        { error: 'owner_must_transfer', message: 'オーナーは権限を譲ってから退出してください' },
        409,
      );
    }
    await c.var.db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, g.groupId), eq(groupMembers.userId, target)));
    // 抜けた人の「いまのグループ」を付け直す（所属がなくなれば1人グループを作る）
    const left = await c.var.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, target))
      .get();
    await ensureCurrentGroup(c.var.db, target, left?.displayName ?? null);
    return c.json({ ok: true });
  })
  .post('/:id/transfer', zValidator('json', z.object({ userId: z.string() })), async (c) => {
    const g = await guard(c, true);
    if ('error' in g) return g.error;
    const { userId } = c.req.valid('json');
    if (userId === c.var.user.id) return c.json({ error: 'already_owner' }, 400);
    if (!(await membership(c.var.db, g.groupId, userId)))
      return c.json({ error: 'not_found' }, 404);
    const db = c.var.db;
    await db.batch([
      db
        .update(groupMembers)
        .set({ role: 'owner' })
        .where(and(eq(groupMembers.groupId, g.groupId), eq(groupMembers.userId, userId))),
      db
        .update(groupMembers)
        .set({ role: 'member' })
        .where(and(eq(groupMembers.groupId, g.groupId), eq(groupMembers.userId, c.var.user.id))),
    ]);
    return c.json(await loadGroup(db, g.groupId, c.var.user.id));
  })
  // ===== 招待（オーナーのみ） =====
  .get('/:id/invites', async (c) => {
    const g = await guard(c, true);
    if ('error' in g) return g.error;
    const rows = await c.var.db
      .select({
        id: groupInvites.id,
        code: groupInvites.code,
        expiresAt: groupInvites.expiresAt,
        createdAt: groupInvites.createdAt,
      })
      .from(groupInvites)
      .where(
        and(
          eq(groupInvites.groupId, g.groupId),
          isNull(groupInvites.revokedAt),
          gt(groupInvites.expiresAt, Date.now()),
        ),
      )
      .orderBy(groupInvites.createdAt);
    return c.json(rows satisfies InviteSummary[]);
  })
  .post('/:id/invites', async (c) => {
    const g = await guard(c, true);
    if ('error' in g) return g.error;
    const token = randomToken(24);
    const tokenHash = await sha256Hex(token);
    const expiresAt = Date.now() + INVITE_TTL_MS;
    // コードが偶然重なったら作り直す
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        const row = await c.var.db
          .insert(groupInvites)
          .values({
            id: crypto.randomUUID(),
            groupId: g.groupId,
            code,
            tokenHash,
            createdBy: c.var.user.id,
            expiresAt,
          })
          .returning()
          .get();
        const created: CreatedInvite = {
          id: row.id,
          code: row.code,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
          token,
        };
        return c.json(created, 201);
      } catch (e) {
        if (!String(e).includes('UNIQUE')) throw e;
      }
    }
    return c.json({ error: 'try_again' }, 503);
  })
  .delete('/:id/invites/:inviteId', async (c) => {
    const g = await guard(c, true);
    if ('error' in g) return g.error;
    const res = await c.var.db
      .update(groupInvites)
      .set({ revokedAt: Date.now() })
      .where(and(eq(groupInvites.id, c.req.param('inviteId')), eq(groupInvites.groupId, g.groupId)))
      .returning({ id: groupInvites.id });
    if (!res.length) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

/** 招待を受ける側（コード／リンクのトークン） */
export const inviteRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    if (await hitRateLimit(c.var.db, `invite:${c.var.user.id}`, INVITE_LOOKUP_LIMIT, 3_600_000)) {
      return c.json({ error: 'rate_limited', message: 'しばらく時間をおいてお試しください' }, 429);
    }
    await next();
  })
  .get('/:key', async (c) => {
    const db = c.var.db;
    const invite = await findInvite(db, c.req.param('key'));
    if (!invite) return c.json({ error: 'invalid_invite' }, 404);
    const g = await db.select().from(groups).where(eq(groups.id, invite.groupId)).get();
    const inviter = await db
      .select({ name: users.displayName })
      .from(users)
      .where(eq(users.id, invite.createdBy))
      .get();
    const preview: InvitePreview = {
      groupName: g!.name,
      color: g!.color,
      inviterName: inviter?.name ?? null,
      memberCount: await memberCount(db, invite.groupId),
      alreadyMember: !!(await membership(db, invite.groupId, c.var.user.id)),
      expiresAt: invite.expiresAt,
    };
    return c.json(preview);
  })
  .post('/:key/accept', async (c) => {
    const db = c.var.db;
    const invite = await findInvite(db, c.req.param('key'));
    if (!invite) return c.json({ error: 'invalid_invite' }, 404);
    const userId = c.var.user.id;
    await db.batch([
      db
        .insert(groupMembers)
        .values({ groupId: invite.groupId, userId, role: 'member' })
        .onConflictDoNothing(),
      db.update(users).set({ currentGroupId: invite.groupId }).where(eq(users.id, userId)),
    ]);
    return c.json({ ok: true, groupId: invite.groupId });
  });
