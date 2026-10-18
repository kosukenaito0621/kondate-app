import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../../components/PageHeader';
import { RecipeListSkeleton } from '../../../components/skeleton/Skeletons';

export const Route = createFileRoute('/_app/recipes/')({
  component: () => (
    <>
      <PageHeader title="レシピ" />
      <RecipeListSkeleton />
    </>
  ),
});
