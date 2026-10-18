import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { RecipeDetail, RecipeInput } from '../../../../shared/recipe';
import { api } from '../../../api';
import { PageHeader } from '../../../components/PageHeader';
import { RecipeForm, toFormValue } from '../../../components/recipe/RecipeForm';

export const Route = createFileRoute('/_app/recipes/new')({
  component: NewRecipe,
});

function NewRecipe() {
  const [initial] = useState(() => toFormValue());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: async (input: RecipeInput) => {
      const res = await api.recipes.$post({ json: input });
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
      <PageHeader eyebrow="うちのレシピ" title="レシピを追加" />
      <RecipeForm
        initial={initial}
        submitLabel="保存する"
        saving={create.isPending}
        serverError={create.error?.message}
        onSubmit={(input) => create.mutate(input)}
      />
    </>
  );
}
