import { createFileRoute, redirect } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { z } from 'zod';
import { GlassCard } from '../components/glass/GlassCard';
import { GoogleLogo } from '../components/icons';
import { meQuery } from '../lib/auth';
import { riseItem, spring, staggerContainer } from '../lib/motion';

/** アプリ内の相対パスだけを戻り先にする */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const ERRORS: Record<string, string> = {
  cancelled: 'ログインがキャンセルされました',
  invalid_state: 'ログインの有効期限が切れました。もう一度お試しください',
  google: 'Google との通信に失敗しました。時間をおいてお試しください',
};

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ error: z.string().optional(), next: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ href: safeNext(search.next) });
  },
  component: Login,
});

function Login() {
  const { error, next } = Route.useSearch();
  const loginHref = `/api/auth/google${next ? `?next=${encodeURIComponent(safeNext(next))}` : ''}`;
  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <motion.div
        className="flex flex-col gap-6"
        variants={staggerContainer(0.09, 0.1)}
        initial="initial"
        animate="animate"
      >
        <GlassCard variants={riseItem} strong padding="lg" className="px-6 py-8 text-center">
          <h1 className="text-[32px] font-bold tracking-tight">こんだて</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            1週間の献立と買い物リストを、
            <br />
            ひらいた瞬間に。
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-2xl bg-chu-soft px-4 py-3 text-sm text-chu-ink">
              {ERRORS[error] ?? 'ログインに失敗しました'}
            </p>
          )}

          <motion.a
            href={loginHref}
            className="sheen mt-7 flex min-h-14 items-center justify-center gap-3 rounded-full px-6 font-bold pill-active"
            whileTap={{ scale: 0.96 }}
            transition={spring.snappy}
          >
            <GoogleLogo />
            Google でログイン
          </motion.a>
        </GlassCard>

        <motion.p variants={riseItem} className="text-center text-xs text-ink-soft">
          ログインすると、献立とレシピがあなた専用に保存されます
        </motion.p>
      </motion.div>
    </main>
  );
}
