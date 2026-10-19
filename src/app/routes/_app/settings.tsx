import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { displayNameSchema } from '../../../shared/schemas';
import { api } from '../../api';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { GroupDot } from '../../components/GroupSwitcher';
import { BookIcon, ChevronRightIcon } from '../../components/icons';
import { useGuide } from '../../components/guide/Guide';
import { PageHeader } from '../../components/PageHeader';
import { ThemePicker } from '../../components/ThemePicker';
import { logout, meQuery } from '../../lib/auth';
import { groupDisplayName } from '../../../shared/groups';
import { riseItem, staggerContainer } from '../../lib/motion';

export const Route = createFileRoute('/_app/settings')({
  component: Settings,
});

function Settings() {
  const { me: initialMe } = Route.useRouteContext();
  const me = useQuery(meQuery).data ?? initialMe;
  const guide = useGuide();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(me.displayName ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: async (displayName: string) => {
      const res = await api.me.$patch({ json: { displayName } });
      if (!res.ok) throw new Error('保存に失敗しました');
      return res.json();
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(meQuery.queryKey, updated);
      await router.invalidate();
      setMessage({ ok: true, text: '保存しました' });
    },
    onError: (e) => setMessage({ ok: false, text: e.message }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      return setMessage({
        ok: false,
        text: parsed.error.issues[0]?.message ?? '入力を確認してください',
      });
    }
    save.mutate(parsed.data);
  };

  return (
    <>
      <PageHeader title="設定" />
      <motion.div
        className="flex flex-col gap-4"
        variants={staggerContainer()}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={riseItem}>
          <Link
            to="/group"
            className="glass sheen flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] px-5"
          >
            <GroupDot
              color={me.groups.find((g) => g.id === me.currentGroupId)?.color ?? 'rose'}
              size={14}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-soft">グループ・家族の招待</span>
              <span className="block truncate font-bold">
                {groupDisplayName(me.groups.find((g) => g.id === me.currentGroupId)?.name ?? '')}
              </span>
            </span>
            <ChevronRightIcon size={18} className="text-ink-soft" />
          </Link>
        </motion.div>

        <motion.div variants={riseItem}>
          <button
            type="button"
            onClick={guide.open}
            className="glass sheen flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-card)] px-5 text-left"
          >
            <BookIcon size={20} className="text-accent-strong" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-soft">機能の紹介をもう一度見る</span>
              <span className="block font-bold">使い方ガイド</span>
            </span>
            <ChevronRightIcon size={18} className="text-ink-soft" />
          </button>
        </motion.div>

        <GlassCard variants={riseItem} padding="lg">
          <h2 className="mb-1 text-sm font-bold">テーマカラー</h2>
          <p className="mb-4 text-xs text-ink-soft">その日の気分で選べます</p>
          <ThemePicker value={me.theme} />
        </GlassCard>

        <GlassCard variants={riseItem} padding="lg">
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <label htmlFor="displayName" className="text-sm font-bold">
              ユーザーネーム
            </label>
            <input
              id="displayName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setMessage(null);
              }}
              maxLength={20}
              autoComplete="nickname"
              aria-invalid={message?.ok === false}
              aria-describedby="displayName-msg"
              className="field min-h-12 rounded-2xl px-4"
            />
            <p
              id="displayName-msg"
              role="status"
              className={message?.ok === false ? 'text-sm text-danger' : 'text-sm text-success-ink'}
            >
              {message?.text}
            </p>
            <GlassButton type="submit" variant="primary" loading={save.isPending}>
              保存する
            </GlassButton>
          </form>
        </GlassCard>

        <GlassCard variants={riseItem} padding="lg" className="text-sm text-ink-soft">
          <p className="font-bold text-ink">アカウント</p>
          <p className="mt-1">{me.email}</p>
          <GlassButton variant="danger" className="mt-4" block onClick={logout}>
            ログアウト
          </GlassButton>
        </GlassCard>
      </motion.div>
    </>
  );
}
