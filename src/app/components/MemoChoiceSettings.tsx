import {
  EDIT_MEMO_LABEL,
  SWAP_MEMO_LABEL,
  type MemoAction,
  type MemoChoices,
} from '../../shared/memo';
import { useMemoChoices } from '../lib/memo';
import { GlassCard } from './glass/GlassCard';
import { riseItem } from '../lib/motion';

const ROWS: {
  action: MemoAction;
  title: string;
  label: (c: NonNullable<MemoChoices[MemoAction]>) => string;
}[] = [
  {
    action: 'swap',
    title: '曜日の入れ替え',
    label: (c) => SWAP_MEMO_LABEL[c as keyof typeof SWAP_MEMO_LABEL],
  },
  {
    action: 'edit',
    title: 'レシピの差し替え・作り直し・削除',
    label: (c) => EDIT_MEMO_LABEL[c as keyof typeof EDIT_MEMO_LABEL],
  },
];

/** 日ごとメモの確認で「次回から確認しない」にした選択を見て、毎回確認に戻す */
export function MemoChoiceSettings() {
  const { choices, remember, saving } = useMemoChoices();
  return (
    <GlassCard variants={riseItem} padding="lg">
      <h2 className="mb-1 text-sm font-bold">メモの確認</h2>
      <p className="mb-3 text-xs text-ink-soft">
        メモがある日の献立を変えるとき、メモをどうするか確認します
      </p>
      <ul className="flex flex-col gap-2">
        {ROWS.map(({ action, title, label }) => {
          const c = choices[action];
          return (
            <li key={action} className="groove flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{title}</span>
                <span className="block text-xs text-ink-soft">
                  {c ? `いつも「${label(c)}」` : '毎回確認する'}
                </span>
              </span>
              {c && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remember(action, null)}
                  className="min-h-10 shrink-0 rounded-full bg-pill px-3 text-xs font-bold text-accent-strong"
                >
                  毎回確認する
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
