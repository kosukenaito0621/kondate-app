import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { api } from '../api';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.health.$get()).json(),
  });

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">こんだて</h1>
      <p className="mt-2 text-sm opacity-70">
        {health.data
          ? `API OK / 今日: ${health.data.today} / レシピ ${health.data.recipes}件`
          : '接続確認中…'}
      </p>
    </main>
  );
}
