import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import type { InvitePreview } from '../../shared/groups';
import { api } from '../api';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassCard } from '../components/glass/GlassCard';
import { GroupDot } from '../components/GroupSwitcher';
import { Skeleton } from '../components/skeleton/Skeletons';
import { meQuery } from '../lib/auth';
import { riseItem, staggerContainer } from '../lib/motion';

export const Route = createFileRoute('/invite/$key')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    // 未ログインなら、ログイン後にこの画面へ戻ってくる
    if (!me) throw redirect({ to: '/login', search: { next: `/invite/${params.key}` } });
  },
  component: InvitePage,
});

const ERRORS: Record<number, string> = {
  404: 'この招待は使えません。期限切れか、取り消された可能性があります。',
  429: '確認の回数が多すぎます。しばらく時間をおいてお試しください。',
};

function InvitePage() {
  const { key } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ['invite', key],
    retry: false,
    queryFn: async () => {
      const res = await api.invites[':key'].$get({ param: { key } });
      if (!res.ok) throw Object.assign(new Error('invite'), { status: res.status });
      return (await res.json()) as InvitePreview;
    },
  });

  const accept = useMutation({
    mutationFn: async () => {
      const res = await api.invites[':key'].accept.$post({ param: { key } });
      if (!res.ok) throw new Error('参加できませんでした。招待が無効になった可能性があります。');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate({ to: '/', replace: true });
    },
  });

  const status = (preview.error as { status?: number } | null)?.status;

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <motion.div
        className="flex flex-col gap-5"
        variants={staggerContainer(0.08)}
        initial="initial"
        animate="animate"
      >
        <motion.p variants={riseItem} className="px-1 text-sm font-bold text-accent-strong">
          グループへの招待
        </motion.p>
        <GlassCard variants={riseItem} strong padding="lg" className="flex flex-col gap-4">
          {preview.isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="招待を確認中">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-12 rounded-full" />
            </div>
          ) : preview.isError ? (
            <>
              <p className="font-bold">招待を確認できませんでした</p>
              <p className="text-sm text-ink-soft">
                {ERRORS[status ?? 0] ?? '時間をおいてお試しください。'}
              </p>
              <Link
                to="/"
                className="glass flex min-h-12 items-center justify-center rounded-full font-bold"
              >
                ホームへ
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <GroupDot color={preview.data.color} size={18} />
                <h1 className="text-2xl font-bold">{preview.data.groupName}</h1>
              </div>
              <p className="text-sm text-ink-soft">
                {preview.data.inviterName ?? 'メンバー'}さんから招待されています。
                <br />
                いまのメンバーは<span className="num font-bold">{preview.data.memberCount}</span>
                人です。参加すると、献立・買い物リスト・レシピを一緒に使えます。
              </p>
              {preview.data.alreadyMember ? (
                <GlassButton
                  variant="primary"
                  size="lg"
                  onClick={() => accept.mutate()}
                  loading={accept.isPending}
                >
                  すでに参加しています。このグループを開く
                </GlassButton>
              ) : (
                <GlassButton
                  variant="primary"
                  size="lg"
                  onClick={() => accept.mutate()}
                  loading={accept.isPending}
                >
                  参加する
                </GlassButton>
              )}
              <Link to="/" className="min-h-11 text-center text-sm font-bold text-ink-soft">
                参加しない
              </Link>
              {accept.isError && (
                <p role="alert" className="text-sm text-danger">
                  {accept.error.message}
                </p>
              )}
            </>
          )}
        </GlassCard>
      </motion.div>
    </main>
  );
}
