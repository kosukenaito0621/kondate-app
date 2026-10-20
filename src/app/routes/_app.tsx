import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { TabBar } from '../components/glass/TabBar';
import { GuestBanner } from '../components/GuestBanner';
import { Spotlight } from '../components/tour/Spotlight';
import { TourBar } from '../components/tour/TourBar';
import { LiveProvider } from '../components/live/LiveProvider';
import { TimerDock } from '../components/timer/TimerDock';
import { TimerProvider } from '../components/timer/TimerProvider';
import { meQuery, useIsGuest } from '../lib/auth';
import { GuideProvider } from '../components/guide/Guide';
import { pageVariants } from '../lib/motion';

/** ログイン済み・ユーザーネーム設定済みのみ入れるレイアウト */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    if (!me.displayName || !me.cookingLevel) throw redirect({ to: '/onboarding' });
    return { me };
  },
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const guest = useIsGuest();
  return (
    <LiveProvider>
      <GuideProvider>
        <TimerProvider>
          <motion.main
            key={pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            className="px-4"
            style={{
              paddingTop: 'max(1.25rem, calc(var(--safe-top) + 0.75rem))',
              // お試し中は右下の「やってみよう」の分もあける
              paddingBottom: `calc(var(--tabbar-height) + var(--safe-bottom) + ${guest ? '9rem' : '2rem'})`,
            }}
          >
            <GuestBanner />
            <Outlet />
          </motion.main>
          <TimerDock />
          <TourBar />
          <Spotlight />
          <TabBar />
        </TimerProvider>
      </GuideProvider>
    </LiveProvider>
  );
}
