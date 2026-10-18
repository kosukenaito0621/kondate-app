import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../components/PageHeader';
import { ShoppingSkeleton } from '../../components/skeleton/Skeletons';

export const Route = createFileRoute('/_app/shopping')({
  component: () => (
    <>
      <PageHeader title="買い物リスト" />
      <ShoppingSkeleton />
    </>
  ),
});
