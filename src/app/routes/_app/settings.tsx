import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { displayNameSchema } from '../../../shared/schemas';
import { api } from '../../api';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { logout, meQuery } from '../../lib/auth';
import { riseItem, staggerContainer } from '../../lib/motion';

export const Route = createFileRoute('/_app/settings')({
  component: Settings,
});

function Settings() {
  const { me } = Route.useRouteContext();
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
              className="min-h-12 rounded-2xl bg-white/80 px-4 shadow-[inset_0_1px_3px_rgb(92_64_40/0.15)]"
            />
            <p
              id="displayName-msg"
              role="status"
              className={message?.ok === false ? 'text-sm text-danger' : 'text-sm text-olive'}
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
