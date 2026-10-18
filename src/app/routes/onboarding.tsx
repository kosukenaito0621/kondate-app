import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { displayNameSchema } from '../../shared/schemas';
import { api } from '../api';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassCard } from '../components/glass/GlassCard';
import { meQuery } from '../lib/auth';
import { riseItem, staggerContainer } from '../lib/motion';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    if (me.displayName) throw redirect({ to: '/' });
  },
  component: Onboarding,
});

function Onboarding() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const save = useMutation({
    mutationFn: async (displayName: string) => {
      const res = await api.me.$patch({ json: { displayName } });
      if (!res.ok) throw new Error('保存に失敗しました');
      return res.json();
    },
    onSuccess: (me) => {
      queryClient.setQueryData(meQuery.queryKey, me);
      navigate({ to: '/' });
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? '入力を確認してください');
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <motion.div
        className="flex flex-col gap-5"
        variants={staggerContainer(0.08, 0.05)}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={riseItem} className="px-1">
          <p className="text-sm font-medium text-terracotta-600">ようこそ</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight">はじめまして</h1>
          <p className="mt-2 text-sm text-ink-soft">
            なんとお呼びしましょう？
            <br />
            あとで設定から変えられます。
          </p>
        </motion.div>

        <GlassCard variants={riseItem} strong padding="lg">
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <label htmlFor="displayName" className="text-sm font-bold">
              ユーザーネーム
            </label>
            <input
              id="displayName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="nickname"
              placeholder="例：こうすけ"
              aria-invalid={!!error}
              aria-describedby={error ? 'displayName-error' : undefined}
              className="min-h-12 rounded-2xl bg-white/80 px-4 shadow-[inset_0_1px_3px_rgb(92_64_40/0.15)] placeholder:text-ink-faint"
            />
            {error && (
              <p id="displayName-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              loading={save.isPending}
              className="mt-2"
            >
              はじめる
            </GlassButton>
          </form>
        </GlassCard>
      </motion.div>
    </main>
  );
}
