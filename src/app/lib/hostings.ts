import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Category } from '../../shared/constants';
import type { Meal } from '../../shared/hosting';
import type { PlanView } from '../../shared/plan';
import { api } from '../api';
import { useToast } from '../components/toast/Toaster';
import { StaleError } from './plans';
import { ok } from './recipes';

export type CourseInput = { label: string; category: Category; recipeId: string | null };

export type HostingAction =
  | { type: 'create'; date: string; meal: Meal; servings: number }
  | { type: 'servings'; id: string; servings: number }
  | { type: 'courses'; id: string; courses: CourseInput[] }
  | { type: 'delete'; id: string };

/** もてなしの変更。献立と同じく版番号を付けて送り、古ければ（409）最新を読み直す */
export function useHostingMutation(weekStart: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (action: HostingAction) => {
      const version = queryClient.getQueryData<PlanView>(['plan', weekStart])?.version;
      const hostings = api.hostings[':weekStart'];
      const res =
        action.type === 'create'
          ? await hostings.days[':date'].$post({
              param: { weekStart, date: action.date },
              json: { version, meal: action.meal, servings: action.servings },
            })
          : action.type === 'servings'
            ? await hostings[':id'].$patch({
                param: { weekStart, id: action.id },
                json: { version, servings: action.servings },
              })
            : action.type === 'courses'
              ? await hostings[':id'].courses.$put({
                  param: { weekStart, id: action.id },
                  json: { version, courses: action.courses },
                })
              : await hostings[':id'].$delete({
                  param: { weekStart, id: action.id },
                  json: { version },
                });
      if (res.status === 409) throw new StaleError();
      return ok<PlanView>(res);
    },
    onSuccess: (view) => {
      queryClient.setQueryData(['plan', weekStart], view);
      queryClient.invalidateQueries({ queryKey: ['today'] });
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
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
