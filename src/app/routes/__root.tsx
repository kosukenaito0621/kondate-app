import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { Blobs } from '../components/glass/Blobs';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    // OS の「視差効果を減らす」設定に従ってアニメーションを控えめにする
    <MotionConfig reducedMotion="user">
      <Blobs />
      <div className="mx-auto min-h-dvh max-w-[var(--app-max-width)]">
        <Outlet />
      </div>
    </MotionConfig>
  ),
});
