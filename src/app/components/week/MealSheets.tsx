import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, type Category } from '../../../shared/constants';
import { WEEKDAY_LABELS } from '../../../shared/date';
import type { PlanDayView, PlanItemView } from '../../../shared/plan';
import { cn } from '../../lib/cn';
import { recipesQuery } from '../../lib/recipes';
import { GenreBadge } from '../GenreBadge';
import { GlassButton } from '../glass/GlassButton';
import { Sheet } from '../glass/Sheet';
import { ClockIcon, SearchIcon, YenIcon } from '../icons';
import { LevelBadge } from '../LevelBadge';

export type MealTarget = { day: PlanDayView; slot: Category; item?: PlanItemView };

/** 品目の操作：レシピを見る／別のレシピに／一覧から選ぶ／外す */
export function MealSheet(props: {
  target: MealTarget | null;
  busy: boolean;
  onClose: () => void;
  onRegenerate: () => void;
  onPick: (recipeId: string) => void;
  onRemove: () => void;
}) {
  const { target, onClose } = props;
  const title = target
    ? `${WEEKDAY_LABELS[target.day.weekday]}曜日の${CATEGORY_LABEL[target.slot]}`
    : '';
  return (
    <Sheet open={target !== null} title={title} onClose={onClose}>
      {target && (
        <MealSheetBody key={`${target.day.date}-${target.slot}`} {...props} target={target} />
      )}
    </Sheet>
  );
}

function MealSheetBody({
  target,
  busy,
  onRegenerate,
  onPick,
  onRemove,
}: {
  target: MealTarget;
  busy: boolean;
  onRegenerate: () => void;
  onPick: (recipeId: string) => void;
  onRemove: () => void;
}) {
  // 空の枠をタップしたときは、最初から一覧を出す
  const [picking, setPicking] = useState(!target.item);
  if (picking || !target.item) {
    return (
      <RecipePicker
        category={target.slot}
        level={target.day.level}
        currentId={target.item?.recipe.id}
        onPick={onPick}
        onAuto={target.item ? undefined : onRegenerate}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Link
        to="/recipes/$id"
        params={{ id: target.item.recipe.id }}
        className="groove flex items-center gap-3 rounded-2xl p-3"
      >
        <GenreBadge genre={target.item.recipe.genre} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{target.item.recipe.name}</span>
          <span className="text-xs text-ink-soft">レシピを見る</span>
        </span>
        <LevelBadge level={target.item.recipe.difficulty} />
      </Link>
      <GlassButton variant="primary" loading={busy} onClick={onRegenerate}>
        別のレシピにする（おまかせ）
      </GlassButton>
      <GlassButton onClick={() => setPicking(true)}>レシピ一覧から選ぶ</GlassButton>
      <GlassButton variant="ghost" onClick={onRemove}>
        この{CATEGORY_LABEL[target.slot]}を外す
      </GlassButton>
    </div>
  );
}

function RecipePicker({
  category,
  level,
  currentId,
  onPick,
  onAuto,
}: {
  category: Category;
  level: 'futaba' | 'minori';
  currentId?: string;
  onPick: (id: string) => void;
  onAuto?: () => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const { data, isPending } = useQuery(
    recipesQuery({
      category,
      q: debounced || undefined,
      difficulty: level === 'futaba' ? 'futaba' : undefined,
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      {onAuto && (
        <GlassButton variant="primary" onClick={onAuto}>
          おまかせで選ぶ
        </GlassButton>
      )}
      <label className="groove flex min-h-11 items-center gap-2 rounded-full px-4">
        <SearchIcon size={16} className="text-ink-soft" />
        <span className="sr-only">レシピを検索</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="料理名・材料で検索"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-faint"
        />
      </label>
      {level === 'futaba' && (
        <p className="text-xs text-ink-soft">
          この日は🌱の日なので、🌱のレシピだけを表示しています
        </p>
      )}
      <ul className="-mx-1 flex max-h-[45dvh] flex-col gap-1 overflow-y-auto px-1">
        {isPending && <li className="p-3 text-sm text-ink-soft">読み込み中…</li>}
        {data?.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onPick(r.id)}
              disabled={r.id === currentId}
              className={cn(
                'flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left',
                r.id === currentId ? 'pill-active' : 'hover:bg-pill',
              )}
            >
              <GenreBadge genre={r.genre} className="size-5 text-[10px]" />
              <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink-soft">
                <span className="flex items-center gap-0.5">
                  <ClockIcon size={12} />
                  <span className="num">{r.timeMinutes}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <YenIcon size={12} />
                  <span className="num">{r.costYen}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
        {data?.length === 0 && <li className="p-3 text-sm text-ink-soft">見つかりませんでした</li>}
      </ul>
    </div>
  );
}

/** 曜日のメニュー：この日を作り直す／副菜を追加／ほかの曜日と入れ替える */
export function DaySheet({
  day,
  days,
  busy,
  onClose,
  onRegenerateDay,
  onAddSide,
  onSwap,
}: {
  day: PlanDayView | null;
  days: PlanDayView[];
  busy: boolean;
  onClose: () => void;
  onRegenerateDay: () => void;
  onAddSide: () => void;
  onSwap: (to: string) => void;
}) {
  return (
    <Sheet
      open={day !== null}
      title={day ? `${WEEKDAY_LABELS[day.weekday]}曜日` : ''}
      onClose={onClose}
    >
      {day && (
        <div className="flex flex-col gap-3">
          <GlassButton variant="primary" loading={busy} onClick={onRegenerateDay}>
            この日の献立を作り直す
          </GlassButton>
          {!day.items.some((i) => i.slot === 'side') && (
            <GlassButton onClick={onAddSide}>副菜を追加する</GlassButton>
          )}
          <div>
            <p className="mb-2 text-xs font-bold text-ink-soft">ほかの曜日と入れ替える</p>
            <div className="grid grid-cols-6 gap-1.5">
              {days
                .filter((d) => d.date !== day.date)
                .map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    disabled={busy}
                    onClick={() => onSwap(d.date)}
                    className="groove min-h-11 rounded-2xl text-sm font-bold"
                    aria-label={`${WEEKDAY_LABELS[d.weekday]}曜日と入れ替える`}
                  >
                    {WEEKDAY_LABELS[d.weekday]}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
