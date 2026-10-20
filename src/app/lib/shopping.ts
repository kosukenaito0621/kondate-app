import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShoppingListView } from '../../shared/shopping';
import { api } from '../api';
import { useToast } from '../components/toast/Toaster';
import { settingsQuery } from './plans';
import { ok } from './recipes';
import { markMission } from './tour';

export const shoppingQuery = (weekStart: string) =>
  queryOptions({
    queryKey: ['shopping', weekStart],
    queryFn: async () =>
      ok<ShoppingListView>(await api.shopping[':weekStart'].$get({ param: { weekStart } })),
    refetchOnWindowFocus: true,
  });

export function useShoppingActions(weekStart: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = shoppingQuery(weekStart).queryKey;
  const set = (v: ShoppingListView) => queryClient.setQueryData(key, v);

  /** チェックは押した瞬間に反映し、失敗したら戻す */
  const toggle = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const res = await api.shopping.items[':id'].$patch({ param: { id }, json: { checked } });
      if (!res.ok) throw new Error('更新できませんでした');
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ShoppingListView>(key);
      if (prev) {
        set({
          ...prev,
          items: prev.items.map((i) =>
            i.id === id ? { ...i, checked, checkedBy: checked ? i.checkedBy : null } : i,
          ),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) set(ctx.prev);
      toast(e.message, 'error');
    },
    onSuccess: (_d, v) => {
      if (v.checked) markMission('check');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.shopping.items[':id'].$delete({ param: { id } });
      if (!res.ok) throw new Error('削除できませんでした');
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ShoppingListView>(key);
      if (prev) set({ ...prev, items: prev.items.filter((i) => i.id !== id) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) set(ctx.prev);
      toast(e.message, 'error');
    },
  });

  const add = useMutation({
    mutationFn: async (input: { name: string; amount?: string }) =>
      ok<ShoppingListView>(
        await api.shopping[':weekStart'].items.$post({ param: { weekStart }, json: input }),
      ),
    onSuccess: set,
    onError: () => toast('追加できませんでした', 'error'),
  });

  const regenerate = useMutation({
    mutationFn: async () =>
      ok<ShoppingListView>(
        await api.shopping[':weekStart'].regenerate.$post({ param: { weekStart } }),
      ),
    onSuccess: (v) => {
      set(v);
      toast('献立に合わせてリストを更新しました');
    },
    onError: () => toast('更新できませんでした', 'error'),
  });

  /** 除外していた調味料を「買う」に追加して作り直す */
  const buySeasoning = useMutation({
    mutationFn: async (name: string) => {
      const settings = await queryClient.fetchQuery(settingsQuery);
      const res = await api.settings.$put({
        json: { buySeasonings: [...new Set([...settings.buySeasonings, name])] },
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey });
      return ok<ShoppingListView>(
        await api.shopping[':weekStart'].regenerate.$post({ param: { weekStart } }),
      );
    },
    onSuccess: set,
    onError: () => toast('追加できませんでした', 'error'),
  });

  return { toggle, remove, add, regenerate, buySeasoning };
}
