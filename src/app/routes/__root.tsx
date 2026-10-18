import { useQuery, type QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { Blobs } from '../components/glass/Blobs';
import { meQuery } from '../lib/auth';
import { applyTheme } from '../lib/theme';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
});

function Root() {
  // アカウントに保存されたテーマを反映（未ログイン時は端末に記憶したテーマのまま）
  const { data: me } = useQuery(meQuery);
  useEffect(() => {
    if (me?.theme) applyTheme(me.theme);
  }, [me?.theme]);

  return (
    // OS の「視差効果を減らす」設定に従ってアニメーションを控えめにする
    <MotionConfig reducedMotion="user">
      <Blobs />
      <div className="mx-auto min-h-dvh max-w-[var(--app-max-width)]">
        <Outlet />
      </div>
    </MotionConfig>
  );
}
