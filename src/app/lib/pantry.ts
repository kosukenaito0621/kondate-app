import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PantryInput, PantryItemView } from '../../shared/pantry';
import { api } from '../api';
import { useToast } from '../components/toast/Toaster';
import { ok } from './recipes';
import { markMission } from './tour';

export const pantryQuery = queryOptions({
  queryKey: ['pantry'],
  queryFn: async () => ok<PantryItemView[]>(await api.pantry.$get()),
  staleTime: 15_000,
});

/** 在庫の追加・変更・削除と、買い物リストからの取り込み */
export function usePantryActions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pantry'] });
    // 買い物リストの「在庫でまかなえる」や「在庫で探す」も変わる
    qc.invalidateQueries({ queryKey: ['shopping'] });
    qc.invalidateQueries({ queryKey: ['recipes'] });
  };
  const fail = () => toast('うまくいきませんでした。時間をおいてお試しください', 'error');

  const add = useMutation({
    mutationFn: async (input: PantryInput) =>
      ok<PantryItemView[]>(await api.pantry.$post({ json: input })),
    onSuccess: (rows) => {
      qc.setQueryData(['pantry'], rows);
      refresh();
      markMission('pantry');
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<PantryInput> & { id: string }) =>
      ok<PantryItemView>(await api.pantry[':id'].$patch({ param: { id }, json: patch })),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      ok<{ ok: true }>(await api.pantry[':id'].$delete({ param: { id } })),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['pantry'] });
      const prev = qc.getQueryData<PantryItemView[]>(['pantry']);
      qc.setQueryData<PantryItemView[]>(['pantry'], (rows) => rows?.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pantry'], ctx.prev);
      fail();
    },
    onSettled: refresh,
  });
  const fromShopping = useMutation({
    mutationFn: async (weekStart: string) =>
      ok<{ added: number }>(await api.pantry['from-shopping'].$post({ json: { weekStart } })),
    onSuccess: ({ added }) => {
      refresh();
      toast(added ? `${added}品を在庫に入れました` : '在庫に入れるものはありません');
    },
    onError: fail,
  });
  return { add, update, remove, fromShopping };
}
