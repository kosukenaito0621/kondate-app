import { z } from 'zod';

/**
 * 日ごとメモ（グループ × 日付で1件）。その週だけ使う一言メモ。
 * 例:「この日のスープにはレタスも入れたい」「お弁当用に多めに作る」
 */
export const MEMO_MAX = 200;
/** これより前のメモは定期的に消す */
export const MEMO_KEEP_DAYS = 28;

export type DayMemo = {
  body: string;
  updatedBy: { id: string; name: string | null; avatarUrl: string | null } | null;
  updatedAt: number;
};

export const memoBodySchema = z.object({ body: z.string().max(MEMO_MAX) });

/** 曜日を入れ替えるときのメモの扱い */
export const SWAP_MEMO_CHOICES = ['swap', 'keep', 'clear'] as const;
export type SwapMemoChoice = (typeof SWAP_MEMO_CHOICES)[number];
/** レシピの差し替え・1日の作り直し・削除のときのメモの扱い */
export const EDIT_MEMO_CHOICES = ['keep', 'clear'] as const;
export type EditMemoChoice = (typeof EDIT_MEMO_CHOICES)[number];

export const SWAP_MEMO_LABEL: Record<SwapMemoChoice, string> = {
  swap: 'メモも一緒に入れ替える',
  keep: 'メモはその日に残す',
  clear: 'メモを消す',
};
export const EDIT_MEMO_LABEL: Record<EditMemoChoice, string> = {
  keep: 'メモを残す',
  clear: 'メモを消す',
};

/** 「次回から確認しない」で覚えた選択（null は毎回確認する） */
export type MemoChoices = { swap: SwapMemoChoice | null; edit: EditMemoChoice | null };

export const memoChoicesSchema = z
  .object({
    swap: z.enum(SWAP_MEMO_CHOICES).nullable(),
    edit: z.enum(EDIT_MEMO_CHOICES).nullable(),
  })
  .partial();

export type MemoAction = 'swap' | 'edit';

/**
 * 操作の前にメモの扱いを聞くかどうか。
 * - メモのない日なら聞かない（メモはそのまま＝何もしない）
 * - 覚えた選択があればそれを使う
 * - それ以外は確認シートを出す
 */
export function memoDecision<A extends MemoAction>(
  action: A,
  hasMemo: boolean,
  remembered: MemoChoices,
): { ask: false; choice: A extends 'swap' ? SwapMemoChoice : EditMemoChoice } | { ask: true } {
  type C = A extends 'swap' ? SwapMemoChoice : EditMemoChoice;
  if (!hasMemo) return { ask: false, choice: (action === 'swap' ? 'swap' : 'keep') as C };
  const r = remembered[action];
  return r ? { ask: false, choice: r as C } : { ask: true };
}

/**
 * 入れ替えたあとのメモ（日付 → 本文）。
 * swap: 両方にあれば交換、片方だけなら移動 / keep: そのまま / clear: 両日とも消す
 */
export function swapMemos(
  memos: { from: string | null; to: string | null },
  choice: SwapMemoChoice,
): { from: string | null; to: string | null } {
  if (choice === 'swap') return { from: memos.to, to: memos.from };
  if (choice === 'clear') return { from: null, to: null };
  return memos;
}
