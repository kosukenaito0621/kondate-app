import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../components/PageHeader';
import { WeekSkeleton } from '../../components/skeleton/Skeletons';

export const Route = createFileRoute('/_app/week')({
  component: () => (
    <>
      <PageHeader title="週間献立" />
      <WeekSkeleton />
    </>
  ),
});
