import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { RecipeDetail, RecipeInput } from '../../../../shared/recipe';
import { api } from '../../../api';
import { GlassCard } from '../../../components/glass/GlassCard';
import { PageHeader } from '../../../components/PageHeader';
import { RecipeForm, toFormValue } from '../../../components/recipe/RecipeForm';
import { RecipeDetailSkeleton } from '../../../components/skeleton/Skeletons';
import { recipeQuery } from '../../../lib/recipes';

export const Route = createFileRoute('/_app/recipes/$id_/edit')({
  component: EditRecipe,
});

function EditRecipe() {
  const { id } = Route.useParams();
  const { data, isPending } = useQuery(recipeQuery(id));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const update = useMutation({
    mutationFn: async (input: RecipeInput) => {
      const res = await api.recipes[':id'].$put({ param: { id }, json: input });
      if (!res.ok) throw new Error('保存できませんでした。入力を確認してください');
      return (await res.json()) as RecipeDetail;
    },
    onSuccess: async (r) => {
      queryClient.setQueryData(['recipe', r.id], r);
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      navigate({ to: '/recipes/$id', params: { id: r.id }, replace: true });
    },
  });

  return (
    <>
      <PageHeader eyebrow="うちのレシピ" title="レシピを編集" />
      {isPending ? (
        <RecipeDetailSkeleton />
      ) : !data || data.isSystem ? (
        <GlassCard padding="lg">
          共通レシピは編集できません。「コピーしてアレンジする」を使ってください。
        </GlassCard>
      ) : (
        <RecipeForm
          key={data.id}
          initial={toFormValue(data)}
          submitLabel="変更を保存"
          saving={update.isPending}
          serverError={update.error?.message}
          onSubmit={(input) => update.mutate(input)}
        />
      )}
    </>
  );
}
