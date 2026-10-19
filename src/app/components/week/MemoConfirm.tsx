import { useCallback, useEffect, useRef, useState } from 'react';
import { WEEKDAY_LABELS, weekdayIndex } from '../../../shared/date';
import {
  EDIT_MEMO_CHOICES,
  EDIT_MEMO_LABEL,
  memoDecision,
  SWAP_MEMO_CHOICES,
  SWAP_MEMO_LABEL,
  type EditMemoChoice,
  type MemoAction,
  type SwapMemoChoice,
} from '../../../shared/memo';
import { useMemoChoices } from '../../lib/memo';
import { GlassButton } from '../glass/GlassButton';
import { Sheet } from '../glass/Sheet';
import { MemoIcon } from '../icons';

type ChoiceOf<A extends MemoAction> = A extends 'swap' ? SwapMemoChoice : EditMemoChoice;
type DayNote = { date: string; body: string };

type Pending = {
  action: MemoAction;
  title: string;
  notes: DayNote[];
  resolve: (choice: SwapMemoChoice | EditMemoChoice | null) => void;
};

const dayLabel = (date: string) => `${WEEKDAY_LABELS[weekdayIndex(date)]}曜`;

/**
 * メモがある日のレシピを操作する前に、メモをどうするか聞く。
 * confirm は選んだ扱いを返す（閉じた・キャンセルなら null ＝操作自体をやめる）。
 * メモのない日や、「次回から確認しない」で覚えた選択があるときは聞かずに返す。
 */
export function useMemoConfirm() {
  const { choices, remember } = useMemoChoices();
  const [pending, setPending] = useState<Pending | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const confirm = useCallback(
    <A extends MemoAction>(
      action: A,
      title: string,
      notes: DayNote[],
    ): Promise<ChoiceOf<A> | null> => {
      const d = memoDecision(action, notes.length > 0, choices);
      if (!d.ask) return Promise.resolve(d.choice as ChoiceOf<A>);
      return new Promise((resolve) => {
        setDontAsk(false);
        setPending({
          action,
          title,
          notes,
          resolve: resolve as Pending['resolve'],
        });
      });
    },
    [choices],
  );

  const close = useCallback((choice: SwapMemoChoice | EditMemoChoice | null) => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    p.resolve(choice);
  }, []);

  const choose = (choice: SwapMemoChoice | EditMemoChoice) => {
    if (dontAsk && pending) void remember(pending.action, choice as never);
    close(choice);
  };

  const options = pending
    ? pending.action === 'swap'
      ? SWAP_MEMO_CHOICES.map((c) => ({ value: c, label: SWAP_MEMO_LABEL[c] }))
      : EDIT_MEMO_CHOICES.map((c) => ({ value: c, label: EDIT_MEMO_LABEL[c] }))
    : [];

  const element = (
    <Sheet open={pending !== null} title={pending?.title ?? ''} onClose={() => close(null)}>
      {pending && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {pending.notes.map((n) => (
              <li
                key={n.date}
                className="flex gap-2.5 rounded-2xl bg-memo px-3.5 py-3 text-sm text-memo-ink"
              >
                <MemoIcon size={18} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold opacity-80">
                    {dayLabel(n.date)}のメモ
                  </span>
                  <span className="block whitespace-pre-wrap break-words">{n.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <GlassButton
                key={o.value}
                variant={i === 0 ? 'primary' : o.value === 'clear' ? 'ghost' : 'glass'}
                onClick={() => choose(o.value)}
              >
                {o.label}
              </GlassButton>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2.5 px-1 text-sm">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="size-5 accent-[var(--accent)]"
            />
            次回から確認しない（この選択を使う）
          </label>
          <GlassButton variant="ghost" onClick={() => close(null)}>
            キャンセル
          </GlassButton>
        </div>
      )}
    </Sheet>
  );

  return { confirm, element };
}
