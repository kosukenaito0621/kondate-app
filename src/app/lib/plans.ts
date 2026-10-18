import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Slot } from '../../shared/planner';
import type { PlanSettings, PlanView } from '../../shared/plan';
import { api } from '../api';
import { useToast } from '../components/toast/Toaster';
import { ok } from './recipes';

export const planQuery = (weekStart: string) =>
  queryOptions({
    queryKey: ['plan', weekStart],
    queryFn: async () => ok<PlanView>(await api.plans[':weekStart'].$get({ param: { weekStart } })),
    staleTime: 15_000,
  });

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: async () => ok<PlanSettings>(await api.settings.$get()),
  staleTime: 60_000,
});

export class StaleError extends Error {}

export type PlanAction =
  | { type: 'generate' }
  | { type: 'regenerate'; date: string; slot?: Slot }
  | { type: 'set'; date: string; slot: Slot; recipeId: string | null }
  | { type: 'swap'; from: string; to: string };

/**
 * 献立の変更。版番号を付けて送り、古ければ（409）最新を読み直して知らせる。
 * 警告（候補不足など）はトーストで表示する。
 */
export function usePlanMutation(weekStart: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (action: PlanAction) => {
      const version = queryClient.getQueryData<PlanView>(['plan', weekStart])?.version;
      const param = { weekStart };
      const res =
        action.type === 'generate'
          ? await api.plans[':weekStart'].generate.$post({ param, json: { version } })
          : action.type === 'regenerate'
            ? await api.plans[':weekStart'].days[':date'].regenerate.$post({
                param: { ...param, date: action.date },
                json: { version, slot: action.slot },
              })
            : action.type === 'set'
              ? await api.plans[':weekStart'].days[':date'][':slot'].$put({
                  param: { ...param, date: action.date, slot: action.slot },
                  json: { version, recipeId: action.recipeId },
                })
              : await api.plans[':weekStart'].swap.$post({
                  param,
                  json: { version, from: action.from, to: action.to },
                });
      if (res.status === 409) throw new StaleError();
      return ok<PlanView>(res);
    },
    onSuccess: (view) => {
      queryClient.setQueryData(['plan', weekStart], view);
      queryClient.invalidateQueries({ queryKey: ['today'] });
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
      for (const w of view.warnings) toast(w, 'warn');
      if (view.overBudget)
        toast('週の予算を超えています。安いレシピに差し替えるか、予算を見直してください', 'warn');
    },
    onError: async (e) => {
      if (e instanceof StaleError) {
        await queryClient.invalidateQueries({ queryKey: ['plan', weekStart] });
        toast('ほかのメンバーが献立を更新していました。最新の内容を表示しています', 'warn');
      } else {
        toast('うまくいきませんでした。時間をおいてお試しください', 'error');
      }
    },
  });
}
