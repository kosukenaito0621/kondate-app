import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CookLogMonth, RecipeCookStats } from '../../shared/cooklog';
import { api } from '../api';
import { useToast } from '../components/toast/Toaster';
import { ok } from './recipes';

type TodayLog = { id: string; recipeId: string };

export const todayLogsQuery = queryOptions({
  queryKey: ['logs', 'today'],
  queryFn: async () => ok<TodayLog[]>(await api.logs.today.$get()),
});

export const monthLogsQuery = (month: string) =>
  queryOptions({
    queryKey: ['logs', 'month', month],
    queryFn: async () => ok<CookLogMonth>(await api.logs.$get({ query: { month } })),
    placeholderData: (prev) => prev,
  });

export const recipeCookQuery = (recipeId: string) =>
  queryOptions({
    queryKey: ['logs', 'recipe', recipeId],
    queryFn: async () =>
      ok<RecipeCookStats>(await api.logs.recipe[':recipeId'].$get({ param: { recipeId } })),
  });

/**
 * 今日「作った」の記録・取り消し。押した瞬間に表示を切り替え（楽観的更新）、
 * 失敗したら元に戻す。
 */
export function useCookToggle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ recipeId, logId }: { recipeId: string; logId?: string }) => {
      if (logId) {
        const res = await api.logs[':id'].$delete({ param: { id: logId } });
        if (!res.ok) throw new Error('取り消せませんでした');
        return null;
      }
      return ok<{ id: string }>(await api.logs.$post({ json: { recipeId } }));
    },
    onMutate: async ({ recipeId, logId }) => {
      await queryClient.cancelQueries({ queryKey: todayLogsQuery.queryKey });
      const prev = queryClient.getQueryData<TodayLog[]>(todayLogsQuery.queryKey);
      queryClient.setQueryData<TodayLog[]>(todayLogsQuery.queryKey, (list = []) =>
        logId ? list.filter((l) => l.id !== logId) : [...list, { id: `tmp-${recipeId}`, recipeId }],
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      queryClient.setQueryData(todayLogsQuery.queryKey, ctx?.prev);
      toast(e.message || '記録できませんでした', 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['logs'] }),
  });
}
