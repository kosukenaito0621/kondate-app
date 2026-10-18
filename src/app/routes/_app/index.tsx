import { createFileRoute } from '@tanstack/react-router';
import { logout } from '../../lib/auth';

export const Route = createFileRoute('/_app/')({
  component: Home,
});

// 仮のホーム。フェーズ7で「今日の献立」に置き換える
function Home() {
  const { me } = Route.useRouteContext();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">こんにちは、{me.displayName}さん</h1>
      <button onClick={logout} className="mt-6 min-h-11 text-sm underline">
        ログアウト
      </button>
    </main>
  );
}
