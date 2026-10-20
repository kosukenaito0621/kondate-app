import { motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MEMO_MAX, type DayMemo } from '../../../shared/memo';
import { cn } from '../../lib/cn';
import { useSaveMemo } from '../../lib/memo';
import { spring } from '../../lib/motion';
import { Avatar } from '../Avatar';
import { CheckDraw, MemoIcon, PlusIcon } from '../icons';

/** 入力が止まってから保存するまでの時間 */
const SAVE_DELAY = 800;

/**
 * 日ごとメモの入力欄。入力が止まったら自動で保存し、小さなチェックで知らせる。
 * - card：週間献立のカード内（空なら「＋ メモを追加」だけ）
 * - sticky：ホームの付箋（メモがある日だけ置く）
 */
export function MemoField({
  date,
  memo,
  dayLabel,
  variant = 'card',
}: {
  date: string;
  memo: DayMemo | null;
  /** 読み上げ用（例: 月曜） */
  dayLabel: string;
  variant?: 'card' | 'sticky';
}) {
  const save = useSaveMemo();
  const remote = memo?.body ?? '';
  const [draft, setDraft] = useState(remote);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const draftRef = useRef(remote);
  const sentRef = useRef(remote);
  const timer = useRef<number | undefined>(undefined);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // ほかのメンバーの更新を反映する（自分が入力中のときは上書きしない）
  useEffect(() => {
    if (focused || timer.current !== undefined) return;
    setDraft(remote);
    draftRef.current = remote;
    sentRef.current = remote;
  }, [remote, focused]);

  // 内容に合わせて高さを伸び縮みさせる
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, open]);

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const body = draftRef.current.trim();
    if (body === sentRef.current.trim()) return;
    sentRef.current = body;
    save.mutate({ date, body }, { onSuccess: () => setSavedAt(Date.now()) });
  };
  // 画面を離れるときに書きかけを保存する
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(0), 1600);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const onChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  };

  const expanded = open || draft.trim() !== '' || focused;

  // 「＋ メモを追加」を押したら、そのまま入力できるようにする
  useEffect(() => {
    if (open) areaRef.current?.focus();
  }, [open]);
  const sticky = variant === 'sticky';

  return (
    <motion.div layout="position" transition={spring.soft}>
      {/* 開閉は高さで伸び縮みさせる（外しても中身は残し、古い表示が取り残されないようにする） */}
      <motion.div
        initial={false}
        animate={expanded ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={spring.soft}
        className="overflow-hidden"
        inert={!expanded}
      >
        <div
          className={cn(
            'flex items-start gap-2 text-memo-ink focus-within:ring-2 focus-within:ring-memo-ink/25',
            sticky
              ? 'glass glass--strong relative rounded-[1.4rem] px-4 py-3.5'
              : 'mt-1.5 rounded-2xl bg-memo px-3 py-2',
          )}
        >
          {sticky && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-[1.4rem] bg-memo"
            />
          )}
          <MemoIcon size={sticky ? 20 : 16} className="mt-1 shrink-0 opacity-80" />
          <div className="min-w-0 flex-1">
            {sticky && <p className="text-[11px] font-bold opacity-75">今日のメモ</p>}
            <textarea
              ref={areaRef}
              value={draft}
              rows={1}
              maxLength={MEMO_MAX}
              data-tour="memo"
              aria-label={`${dayLabel}のメモ`}
              placeholder="例：スープにレタスも入れたい"
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                flush();
                if (!draftRef.current.trim()) setOpen(false);
              }}
              className={cn(
                'block w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-memo-ink/50 focus-visible:outline-none',
                sticky ? 'text-[15px]' : 'text-sm',
              )}
            />
            {focused && draft.length > MEMO_MAX - 40 && (
              <p className="num text-right text-[10px] opacity-70">
                {draft.length}/{MEMO_MAX}
              </p>
            )}
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-1">
            {savedAt > 0 && (
              <motion.span
                key={savedAt}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring.snappy}
                className="text-success-ink"
                role="status"
                aria-label="保存しました"
              >
                <CheckDraw checked size={14} />
              </motion.span>
            )}
            {memo?.updatedBy && !focused && (
              <span title={`${memo.updatedBy.name ?? 'メンバー'}さんが更新`}>
                <Avatar name={memo.updatedBy.name} url={memo.updatedBy.avatarUrl} size={18} />
              </span>
            )}
          </span>
        </div>
      </motion.div>
      {!expanded && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-0.5 flex min-h-9 items-center gap-1 rounded-full px-2 text-xs text-ink-soft hover:bg-pill"
          data-tour="memo"
          aria-label={`${dayLabel}のメモを追加`}
        >
          <PlusIcon size={13} />
          メモを追加
        </button>
      )}
    </motion.div>
  );
}
