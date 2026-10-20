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

type LogCreated = { id: string; date: string; pantryUsed: string[] };

/** 作ったときに在庫から差し引いた分を知らせる（例：在庫から 豚ロース肉 125g ほか1品を使いました） */
function toastPantryUsed(toast: (m: string) => void, res: LogCreated | null) {
  if (!res?.pantryUsed.length) return;
  const [first, ...rest] = res.pantryUsed;
  toast(`在庫から ${first}${rest.length ? ` ほか${rest.length}品` : ''}を使いました`);
}

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
      return ok<LogCreated>(await api.logs.$post({ json: { recipeId } }));
    },
    onSuccess: (res) => toastPantryUsed(toast, res),
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      // 作った・取り消しで在庫が増減する
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
  });
}

/**
 * 週間献立から、その日に「作った」を記録・取り消す（過去の日も可）。
 * 記録は自炊記録・ホームの「作った」と同じもの。
 */
export function useCookOnDate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: { recipeId: string; date: string; logId: string | null }) => {
      if (v.logId) {
        const res = await api.logs[':id'].$delete({ param: { id: v.logId } });
        if (!res.ok) throw new Error('取り消せませんでした');
        return null;
      }
      const res = await api.logs.$post({ json: { recipeId: v.recipeId, date: v.date } });
      if (!res.ok) throw new Error('記録できませんでした');
      return (await res.json()) as LogCreated;
    },
    onSuccess: (res, v) => {
      if (res?.pantryUsed.length) toastPantryUsed(toast, res);
      else toast(v.logId ? '記録を取り消しました' : '作ったと記録しました');
    },
    onError: (e) => toast(e.message, 'error'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['plan'] });
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
  });
}
