import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../components/PageHeader';
import { HomeSkeleton } from '../../components/skeleton/Skeletons';

export const Route = createFileRoute('/_app/')({
  component: Home,
});

// 仮のホーム。フェーズ7で「今日の献立」に置き換える
function Home() {
  const { me } = Route.useRouteContext();
  return (
    <>
      <PageHeader eyebrow="今日の献立" title={`こんにちは、${me.displayName}さん`} />
      <HomeSkeleton />
    </>
  );
}
