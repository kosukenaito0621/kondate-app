import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { meQuery } from '../lib/auth';

/** ログイン済み・ユーザーネーム設定済みのみ入れるレイアウト（タブバーはフェーズ4） */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    if (!me.displayName) throw redirect({ to: '/onboarding' });
    return { me };
  },
  component: () => <Outlet />,
});
