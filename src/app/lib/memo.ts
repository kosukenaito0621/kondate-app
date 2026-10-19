import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { weekStartOf } from '../../shared/date';
import type { DayMemo, MemoAction, MemoChoices } from '../../shared/memo';
import type { PlanView } from '../../shared/plan';
import type { Me } from '../../shared/schemas';
import { api } from '../api';
import { meQuery } from './auth';
import { ok } from './recipes';

type TodayData = { date: string; day: { memo: DayMemo | null } };

/** 手元の献立・今日のデータにあるメモを書き換える（保存後や、元に戻すとき） */
export function setMemoInCache(qc: QueryClient, date: string, memo: DayMemo | null) {
  qc.setQueryData<PlanView>(
    ['plan', weekStartOf(date)],
    (v) => v && { ...v, days: v.days.map((d) => (d.date === date ? { ...d, memo } : d)) },
  );
  qc.setQueryData<TodayData>(['today'], (t) =>
    t && t.date === date ? { ...t, day: { ...t.day, memo } } : t,
  );
}

export async function putMemo(date: string, body: string) {
  return ok<{ date: string; memo: DayMemo | null }>(
    await api.memos[':date'].$put({ param: { date }, json: { body } }),
  );
}

/** メモの保存（入力が止まったら呼ぶ） */
export function useSaveMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: string }) => putMemo(date, body),
    onSuccess: ({ date, memo }) => setMemoInCache(qc, date, memo),
  });
}

/** 消したメモを書き戻す（「元に戻す」） */
export function useRestoreMemos() {
  const qc = useQueryClient();
  return useCallback(
    async (memos: { date: string; body: string }[]) => {
      for (const m of memos) {
        const res = await putMemo(m.date, m.body);
        setMemoInCache(qc, res.date, res.memo);
      }
    },
    [qc],
  );
}

/** 「次回から確認しない」で覚えた選択 */
export function useMemoChoices() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const choices: MemoChoices = me?.memoChoices ?? { swap: null, edit: null };
  const save = useMutation({
    mutationFn: async (patch: Partial<MemoChoices>) =>
      ok<Me>(await api.me.$patch({ json: { memoChoices: patch } })),
    onSuccess: (next) => qc.setQueryData(['me'], next),
  });
  const remember = useCallback(
    <A extends MemoAction>(action: A, choice: MemoChoices[A]) =>
      save.mutateAsync({ [action]: choice }),
    [save],
  );
  return { choices, remember, saving: save.isPending };
}
