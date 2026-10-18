import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { meQuery } from '../lib/auth';

const ERRORS: Record<string, string> = {
  cancelled: 'ログインがキャンセルされました',
  invalid_state: 'ログインの有効期限が切れました。もう一度お試しください',
  google: 'Google との通信に失敗しました。時間をおいてお試しください',
};

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: '/' });
  },
  component: Login,
});

// デザインはフェーズ4でガラス調に作り込む
function Login() {
  const { error } = Route.useSearch();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">こんだて</h1>
        <p className="mt-2 text-sm opacity-70">1週間の献立と買い物を、ここでぜんぶ。</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {ERRORS[error] ?? 'ログインに失敗しました'}
        </p>
      )}
      <a
        href="/api/auth/google"
        className="flex min-h-11 items-center gap-3 rounded-full bg-white px-6 py-3 font-medium shadow"
      >
        Google でログイン
      </a>
    </main>
  );
}
