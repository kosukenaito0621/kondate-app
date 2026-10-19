import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { CreatedInvite, GroupDetail, InvitePreview } from '../src/shared/groups';
import type { RecipeDetail, RecipeInput } from '../src/shared/recipe';
import type { GroupSummary, Me } from '../src/shared/schemas';
import { api, login, type TestUser } from './helpers';

const json = async <T>(res: Response) => (await res.json()) as T;

const recipe: RecipeInput = {
  name: '家族のカレー',
  category: 'main',
  genre: 'yo',
  servings: 4,
  timeMinutes: 40,
  costYen: 800,
  mainIngredient: 'pork',
  difficulty: 'minori',
  ingredients: [{ name: '豚こま', quantity: 300, unit: 'g', amountText: null, section: 'meat' }],
  steps: [{ text: '煮込む' }],
  tags: [],
  imageKey: null,
  sourceUrl: null,
  seasons: [],
  seasonOnly: false,
};

async function invite(owner: TestUser, groupId = owner.groupId) {
  const res = await api(owner, `/api/groups/${groupId}/invites`, { method: 'POST' });
  expect(res.status).toBe(201);
  return json<CreatedInvite>(res);
}

describe('グループ', () => {
  it('作成すると自分がオーナーになり、使うグループが切り替わる。切り替えも戻せる', async () => {
    const u = await login('g-create');
    const created = await json<GroupDetail>(
      await api(u, '/api/groups', { method: 'POST', json: { name: '実家', color: 'mint' } }),
    );
    expect(created).toMatchObject({
      name: '実家',
      color: 'mint',
      role: 'owner',
      effectiveServings: 1,
    });

    const me = await json<Me>(await api(u, '/api/me'));
    expect(me.currentGroupId).toBe(created.id);
    expect(me.groups.map((g: GroupSummary) => g.name).sort()).toEqual(['わたし', '実家'].sort());

    await api(u, `/api/groups/${u.groupId}/switch`, { method: 'POST' });
    expect((await json<Me>(await api(u, '/api/me'))).currentGroupId).toBe(u.groupId);
  });

  it('名前・色・既定レベル・人数を変更でき、人数は空ならメンバー数', async () => {
    const u = await login('g-update');
    const g = await json<GroupDetail>(
      await api(u, `/api/groups/${u.groupId}`, {
        method: 'PATCH',
        json: { name: 'うち', defaultLevel: 'futaba', servings: 3 },
      }),
    );
    expect(g).toMatchObject({
      name: 'うち',
      defaultLevel: 'futaba',
      servings: 3,
      effectiveServings: 3,
    });
    const reset = await json<GroupDetail>(
      await api(u, `/api/groups/${u.groupId}`, { method: 'PATCH', json: { servings: null } }),
    );
    expect(reset.effectiveServings).toBe(1);
  });

  describe('招待', () => {
    it('コードでもリンクでも参加でき、参加後は同じレシピが見える', async () => {
      const owner = await login('inv-owner', 'おーなー');
      const viaCode = await login('inv-code');
      const viaLink = await login('inv-link');
      const r = await json<RecipeDetail>(
        await api(owner, '/api/recipes', { method: 'POST', json: recipe }),
      );
      const inv = await invite(owner);
      expect(inv.code).toMatch(/^[A-Z2-9]{6}$/);

      const preview = await json<InvitePreview>(
        await api(viaCode, `/api/invites/${inv.code.toLowerCase()}`),
      );
      expect(preview).toMatchObject({
        inviterName: 'おーなー',
        memberCount: 1,
        alreadyMember: false,
      });

      expect(
        (await api(viaCode, `/api/invites/${inv.code}/accept`, { method: 'POST' })).status,
      ).toBe(200);
      expect(
        (await api(viaLink, `/api/invites/${inv.token}/accept`, { method: 'POST' })).status,
      ).toBe(200);

      // 参加した人は招待されたグループが「いまのグループ」になり、共有レシピが見える
      expect((await api(viaCode, `/api/recipes/${r.id}`)).status).toBe(200);
      const g = await json<GroupDetail>(await api(owner, `/api/groups/${owner.groupId}`));
      expect(g.members).toHaveLength(3);
      expect(g.effectiveServings).toBe(3);

      // 2回参加しても重複しない
      await api(viaCode, `/api/invites/${inv.code}/accept`, { method: 'POST' });
      expect(
        (await json<GroupDetail>(await api(owner, `/api/groups/${owner.groupId}`))).members,
      ).toHaveLength(3);
    });

    it('取り消した招待・期限切れの招待・でたらめなコードでは参加できない', async () => {
      const owner = await login('inv-revoke-owner');
      const guest = await login('inv-revoke-guest');
      const inv = await invite(owner);
      await api(owner, `/api/groups/${owner.groupId}/invites/${inv.id}`, { method: 'DELETE' });
      expect((await api(guest, `/api/invites/${inv.code}/accept`, { method: 'POST' })).status).toBe(
        404,
      );

      const inv2 = await invite(owner);
      await env.DB.prepare('update group_invites set expires_at = ? where id = ?')
        .bind(Date.now() - 1, inv2.id)
        .run();
      expect((await api(guest, `/api/invites/${inv2.token}`)).status).toBe(404);

      expect((await api(guest, '/api/invites/ZZZZZZ')).status).toBe(404);
      expect((await api(guest, `/api/groups/${owner.groupId}`)).status).toBe(403);
    });

    it('招待の発行・一覧・取り消しはオーナーだけ', async () => {
      const owner = await login('inv-perm-owner');
      const member = await login('inv-perm-member');
      const inv = await invite(owner);
      await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });

      expect(
        (await api(member, `/api/groups/${owner.groupId}/invites`, { method: 'POST' })).status,
      ).toBe(403);
      expect((await api(member, `/api/groups/${owner.groupId}/invites`)).status).toBe(403);
      expect(
        (await api(member, `/api/groups/${owner.groupId}/invites/${inv.id}`, { method: 'DELETE' }))
          .status,
      ).toBe(403);
    });

    it('コードの総当たりは回数制限される', async () => {
      const u = await login('inv-brute');
      let last = 0;
      for (let i = 0; i < 22; i++) last = (await api(u, '/api/invites/AAAAAA')).status;
      expect(last).toBe(429);
    });
  });

  describe('メンバー管理', () => {
    async function household() {
      const owner = await login(`hh-owner-${crypto.randomUUID()}`);
      const member = await login(`hh-member-${crypto.randomUUID()}`);
      const inv = await invite(owner);
      await api(member, `/api/invites/${inv.code}/accept`, { method: 'POST' });
      return { owner, member };
    }

    it('退出すると共有データにアクセスできなくなり、自分の元のグループに戻る', async () => {
      const { owner, member } = await household();
      const r = await json<RecipeDetail>(
        await api(owner, '/api/recipes', { method: 'POST', json: recipe }),
      );
      expect((await api(member, `/api/recipes/${r.id}`)).status).toBe(200);

      expect(
        (
          await api(member, `/api/groups/${owner.groupId}/members/${member.userId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(200);
      expect((await api(member, `/api/recipes/${r.id}`)).status).toBe(404);
      expect((await api(member, `/api/groups/${owner.groupId}`)).status).toBe(403);
      expect((await json<Me>(await api(member, '/api/me'))).currentGroupId).toBe(member.groupId);
    });

    it('メンバーは他人を除外できない。オーナーは除外できる', async () => {
      const { owner, member } = await household();
      expect(
        (
          await api(member, `/api/groups/${owner.groupId}/members/${owner.userId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await api(owner, `/api/groups/${owner.groupId}/members/${member.userId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(200);
    });

    it('オーナーは譲渡してから退出する', async () => {
      const { owner, member } = await household();
      expect(
        (
          await api(owner, `/api/groups/${owner.groupId}/members/${owner.userId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(409);
      const after = await json<GroupDetail>(
        await api(owner, `/api/groups/${owner.groupId}/transfer`, {
          method: 'POST',
          json: { userId: member.userId },
        }),
      );
      expect(after.role).toBe('member');
      expect(
        (
          await api(owner, `/api/groups/${owner.groupId}/members/${owner.userId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(200);
    });

    it('グループ削除はオーナーのみ。削除するとレシピも消え、メンバーは自分のグループに戻る', async () => {
      const { owner, member } = await household();
      // オーナーに2つ目のグループを作っておく（最後のグループは削除できない）
      await api(owner, '/api/groups', { method: 'POST', json: { name: '別' } });
      const r = await json<RecipeDetail>(
        await api(owner, '/api/recipes', { method: 'POST', json: recipe, groupId: owner.groupId }),
      );
      expect((await api(member, `/api/groups/${owner.groupId}`, { method: 'DELETE' })).status).toBe(
        403,
      );
      expect((await api(owner, `/api/groups/${owner.groupId}`, { method: 'DELETE' })).status).toBe(
        200,
      );

      const left = await env.DB.prepare('select count(*) n from recipes where id = ?')
        .bind(r.id)
        .first<{ n: number }>();
      expect(left?.n).toBe(0);
      expect((await json<Me>(await api(member, '/api/me'))).currentGroupId).toBe(member.groupId);
    });

    it('最後のグループは削除できない', async () => {
      const solo = await login('g-last');
      expect((await api(solo, `/api/groups/${solo.groupId}`, { method: 'DELETE' })).status).toBe(
        409,
      );
    });
  });
});
