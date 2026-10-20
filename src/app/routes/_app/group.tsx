import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsGuest } from '../../lib/auth';
import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import {
  groupNameSchema,
  type CreatedInvite,
  type GroupDetail,
  type GroupMember,
} from '../../../shared/groups';
import { COOKING_LEVELS, LEVEL_META } from '../../../shared/levels';
import { api } from '../../api';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/glass/ConfirmDialog';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { Segmented } from '../../components/glass/Segmented';
import { ColorPicker, GroupSwitcher } from '../../components/GroupSwitcher';
import { PageHeader } from '../../components/PageHeader';
import { SettingsSkeleton } from '../../components/skeleton/Skeletons';
import { currentGroupQuery, invitesQuery, inviteUrl } from '../../lib/groups';
import { GroupNameField } from '../../components/GroupNameField';
import { LevelIcon } from '../../components/LevelIcon';
import { riseItem, spring, staggerContainer } from '../../lib/motion';

export const Route = createFileRoute('/_app/group')({
  component: GroupPage,
});

function GroupPage() {
  const { data: group, isPending } = useQuery(currentGroupQuery);
  return (
    <>
      <PageHeader eyebrow="設定" title="グループ" action={<GroupSwitcher />} />
      {isPending || !group ? <SettingsSkeleton /> : <GroupBody key={group.id} group={group} />}
    </>
  );
}

type Confirm =
  | { kind: 'remove'; member: GroupMember }
  | { kind: 'transfer'; member: GroupMember }
  | { kind: 'leave' }
  | { kind: 'delete' };

function useGroupMutation<T>(
  fn: (input: T) => Promise<Response | { ok: boolean; json(): Promise<unknown> }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      const res = await fn(input);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'うまくいきませんでした。時間をおいてお試しください');
      }
      return res;
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

function GroupBody({ group }: { group: GroupDetail }) {
  const id = group.id;
  const owner = group.role === 'owner';
  const guest = useIsGuest();
  const [name, setName] = useState(group.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const update = useGroupMutation(
    (json: Parameters<(typeof api.groups)[':id']['$patch']>[0]['json']) =>
      api.groups[':id'].$patch({ param: { id }, json }),
  );
  const removeMember = useGroupMutation((userId: string) =>
    api.groups[':id'].members[':userId'].$delete({ param: { id, userId } }),
  );
  const transfer = useGroupMutation((userId: string) =>
    api.groups[':id'].transfer.$post({ param: { id }, json: { userId } }),
  );
  const remove = useGroupMutation(() => api.groups[':id'].$delete({ param: { id } }));

  const me = group.members.find((m) => m.isMe)!;
  const busy = removeMember.isPending || transfer.isPending || remove.isPending;
  const actionError = removeMember.error ?? transfer.error ?? remove.error ?? update.error;

  const runConfirm = () => {
    if (!confirm) return;
    const done = { onSuccess: () => setConfirm(null) };
    if (confirm.kind === 'remove') removeMember.mutate(confirm.member.userId, done);
    if (confirm.kind === 'transfer') transfer.mutate(confirm.member.userId, done);
    if (confirm.kind === 'leave') removeMember.mutate(me.userId, done);
    if (confirm.kind === 'delete') remove.mutate(undefined, done);
  };

  return (
    <motion.div
      className="flex flex-col gap-4"
      variants={staggerContainer()}
      initial="initial"
      animate="animate"
    >
      <GlassCard variants={riseItem} padding="lg" className="flex flex-col gap-5">
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = groupNameSchema.safeParse(name);
            if (!parsed.success) return setNameError(parsed.error.issues[0]?.message ?? '');
            setNameError(null);
            update.mutate({ name: parsed.data });
          }}
        >
          <label htmlFor="group-name" className="text-xs font-bold text-ink-soft">
            グループ名
          </label>
          <div className="flex gap-2">
            <GroupNameField id="group-name" value={name} onChange={setName} className="flex-1" />
            <GlassButton
              type="submit"
              variant="primary"
              disabled={name.trim() === group.name}
              loading={update.isPending}
            >
              保存
            </GlassButton>
          </div>
          {nameError && (
            <p role="alert" className="text-sm text-danger">
              {nameError}
            </p>
          )}
        </form>

        <ColorPicker value={group.color} onChange={(color) => update.mutate({ color })} />

        <div>
          <p className="mb-2 text-xs font-bold text-ink-soft">いつもの料理レベル</p>
          <Segmented
            label="いつもの料理レベル"
            value={group.defaultLevel}
            onChange={(defaultLevel) => update.mutate({ defaultLevel })}
            options={COOKING_LEVELS.map((l) => ({
              value: l,
              label: (
                <span className={`inline-flex`}>
                  <LevelIcon level={l} size={22} />
                </span>
              ),
              ariaLabel: LEVEL_META[l].name,
            }))}
          />
          <p className="mt-1.5 text-xs text-ink-soft">
            {LEVEL_META[group.defaultLevel].description}。曜日ごとの設定で上書きできます。
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-ink-soft">分量の人数</p>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={group.servings === null}
                onChange={(e) =>
                  update.mutate({ servings: e.target.checked ? null : group.effectiveServings })
                }
                className="size-5 accent-[var(--accent-strong)]"
              />
              メンバー数に合わせる
            </label>
            <div
              className="groove flex items-center gap-1 rounded-full p-1"
              role="group"
              aria-label="人数"
            >
              <button
                type="button"
                disabled={group.servings === null || group.effectiveServings <= 1}
                onClick={() => update.mutate({ servings: group.effectiveServings - 1 })}
                className="grid size-9 place-items-center rounded-full text-lg font-bold disabled:opacity-30"
                aria-label="1人減らす"
              >
                −
              </button>
              <span className="num min-w-10 text-center text-sm font-bold" aria-live="polite">
                {group.effectiveServings}人
              </span>
              <button
                type="button"
                disabled={group.servings === null || group.effectiveServings >= 12}
                onClick={() => update.mutate({ servings: group.effectiveServings + 1 })}
                className="grid size-9 place-items-center rounded-full text-lg font-bold disabled:opacity-30"
                aria-label="1人増やす"
              >
                ＋
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard variants={riseItem} padding="lg">
        <h2 className="font-bold">
          メンバー<span className="num ml-1.5 text-sm text-ink-soft">{group.members.length}人</span>
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {group.members.map((m) => (
              <motion.li
                key={m.userId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={spring.soft}
                className="groove flex items-center gap-3 rounded-2xl p-2.5"
              >
                <Avatar name={m.displayName} url={m.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {m.displayName ?? '（未設定）'}
                    {m.isMe && (
                      <span className="ml-1 text-xs font-normal text-ink-soft">あなた</span>
                    )}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {m.role === 'owner' ? 'オーナー' : 'メンバー'}
                  </span>
                </span>
                {owner && !m.isMe && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirm({ kind: 'transfer', member: m })}
                      className="min-h-11 rounded-full px-2.5 text-xs font-bold text-accent-strong"
                    >
                      オーナーにする
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm({ kind: 'remove', member: m })}
                      className="min-h-11 rounded-full px-2.5 text-xs font-bold text-danger"
                    >
                      外す
                    </button>
                  </span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </GlassCard>

      {owner && !guest && <InviteCard groupId={id} />}
      {guest && (
        <GlassCard padding="md" className="text-sm text-ink-soft">
          お試しでは家族の招待はお休みです。家族の動きは、上の「家族役を呼ぶ」で体験できます。
        </GlassCard>
      )}

      <motion.div variants={riseItem} className="flex flex-col gap-2">
        {actionError && (
          <p role="alert" className="text-center text-sm text-danger">
            {actionError.message}
          </p>
        )}
        {owner ? (
          <GlassButton variant="danger" block onClick={() => setConfirm({ kind: 'delete' })}>
            このグループを削除
          </GlassButton>
        ) : (
          <GlassButton variant="danger" block onClick={() => setConfirm({ kind: 'leave' })}>
            このグループから抜ける
          </GlassButton>
        )}
      </motion.div>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'remove'
            ? `${confirm.member.displayName ?? 'このメンバー'}さんを外しますか？`
            : confirm?.kind === 'transfer'
              ? `${confirm.member.displayName ?? 'このメンバー'}さんをオーナーにしますか？`
              : confirm?.kind === 'leave'
                ? 'このグループから抜けますか？'
                : 'グループを削除しますか？'
        }
        message={
          confirm?.kind === 'transfer'
            ? 'あなたはメンバーになります。招待やメンバーの管理はできなくなります。'
            : confirm?.kind === 'delete'
              ? '献立・買い物リスト・このグループのレシピがすべて消えます。元に戻せません。'
              : confirm?.kind === 'leave'
                ? 'もう一度参加するには、招待してもらう必要があります。'
                : undefined
        }
        confirmLabel={
          confirm?.kind === 'transfer'
            ? 'オーナーにする'
            : confirm?.kind === 'delete'
              ? '削除する'
              : confirm?.kind === 'leave'
                ? '抜ける'
                : '外す'
        }
        danger={confirm?.kind !== 'transfer'}
        loading={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </motion.div>
  );
}

function InviteCard({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const { data: invites } = useQuery(invitesQuery(groupId));
  const [fresh, setFresh] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.groups[':id'].invites.$post({ param: { id: groupId } });
      if (!res.ok) throw new Error('招待を作れませんでした');
      return (await res.json()) as CreatedInvite;
    },
    onSuccess: (inv) => {
      setFresh(inv);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'invites'] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await api.groups[':id'].invites[':inviteId'].$delete({
        param: { id: groupId, inviteId },
      });
      if (!res.ok) throw new Error('取り消せませんでした');
    },
    onSuccess: (_, inviteId) => {
      if (fresh?.id === inviteId) setFresh(null);
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'invites'] });
    },
  });

  const share = async (inv: CreatedInvite) => {
    const url = inviteUrl(inv.token);
    const text = `献立アプリ「今日のごはん」に招待します。リンクを開くか、招待コード ${inv.code} を入力してください。`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '「今日のごはん」への招待', text, url });
        return;
      } catch {
        // キャンセル時はコピーにフォールバックしない
        return;
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
  };

  const expires = (ms: number) =>
    new Date(ms).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <GlassCard variants={riseItem} padding="lg">
      <h2 className="font-bold">家族を招待</h2>
      <p className="mt-1 text-xs text-ink-soft">
        招待リンクを送るか、6文字のコードを伝えてください。72時間有効です。
      </p>

      <AnimatePresence mode="popLayout">
        {fresh ? (
          <motion.div
            key={fresh.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.soft}
            className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-accent-soft p-5 text-center"
          >
            <span className="text-xs font-bold text-accent-strong">招待コード</span>
            <span className="num text-4xl font-bold tracking-[0.25em] text-ink select-all">
              {fresh.code}
            </span>
            <span className="text-xs text-ink-soft">{expires(fresh.expiresAt)} まで</span>
            <GlassButton variant="primary" block onClick={() => share(fresh)}>
              {copied ? 'コピーしました' : 'リンクを送る'}
            </GlassButton>
          </motion.div>
        ) : (
          <motion.div key="new" className="mt-4">
            <GlassButton
              variant="primary"
              block
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              招待を作る
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>

      {invites && invites.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-ink-soft">有効な招待</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {invites.map((inv) => (
              <li key={inv.id} className="groove flex items-center gap-3 rounded-2xl px-3 py-1.5">
                <span className="num font-bold tracking-widest">{inv.code}</span>
                <span className="flex-1 text-xs text-ink-soft">{expires(inv.expiresAt)} まで</span>
                <button
                  type="button"
                  onClick={() => revoke.mutate(inv.id)}
                  className="min-h-11 px-2 text-xs font-bold text-danger"
                >
                  取り消す
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(create.error ?? revoke.error) && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {(create.error ?? revoke.error)!.message}
        </p>
      )}
    </GlassCard>
  );
}
