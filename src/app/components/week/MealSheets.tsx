import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { SLOT_LABEL, slotCategory, type Category, type Slot } from '../../../shared/constants';
import { WEEKDAY_LABELS } from '../../../shared/date';
import { isDinnerHosted, MEALS } from '../../../shared/hosting';
import type { PlanDayView, PlanItemView } from '../../../shared/plan';
import type { RecipeSummary } from '../../../shared/recipe';
import { cn } from '../../lib/cn';
import { recipesQuery } from '../../lib/recipes';
import { GenreBadge } from '../GenreBadge';
import { GlassButton } from '../glass/GlassButton';
import { Sheet } from '../glass/Sheet';
import { ClockIcon, SearchIcon, YenIcon } from '../icons';
import { DAY_MODE_LABEL, DAY_MODES, isOffDay, type DayMode } from '../../../shared/plan';
import { DayModeIcon } from './DayModeIcon';
import { toJstDate } from '../../../shared/date';
import { useCookOnDate } from '../../lib/cooklog';
import { CheckDraw } from '../icons';
import { LevelBadge } from '../LevelBadge';

export type MealTarget = { day: PlanDayView; slot: Slot; item?: PlanItemView };

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
    ? `${WEEKDAY_LABELS[target.day.weekday]}曜日の${SLOT_LABEL[target.slot]}`
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
  // 2品目はおまかせで選ばない
  const auto = target.slot !== 'side2';
  // 副菜の1品目と2品目は同じレシピにしない
  const pair = target.slot === 'side' ? 'side2' : target.slot === 'side2' ? 'side' : null;
  const pairId = target.day.items.find((i) => i.slot === pair)?.recipe.id;
  if (picking || !target.item) {
    return (
      <RecipePicker
        category={slotCategory(target.slot)}
        level={target.day.level}
        currentId={target.item?.recipe.id}
        onPick={onPick}
        excludeIds={pairId ? [pairId] : undefined}
        onAuto={target.item || !auto ? undefined : onRegenerate}
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
      <CookOnDateButton
        recipeId={target.item.recipe.id}
        date={target.day.date}
        logId={target.item.cookedLogId}
      />
      {auto && (
        <GlassButton variant="primary" loading={busy} onClick={onRegenerate}>
          別のレシピにする（おまかせ）
        </GlassButton>
      )}
      <GlassButton onClick={() => setPicking(true)}>レシピ一覧から選ぶ</GlassButton>
      <GlassButton variant="ghost" onClick={onRemove}>
        この{SLOT_LABEL[target.slot]}を外す
      </GlassButton>
    </div>
  );
}

export function RecipePicker({
  hosting,
  category,
  level,
  currentId,
  excludeIds,
  onPick,
  onAuto,
}: {
  /** もてなしの候補（「おもてなし」の印、お気に入りの順に上へ） */
  hosting?: boolean;
  category: Category;
  level: 'futaba' | 'minori';
  currentId?: string;
  excludeIds?: string[];
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

  const rank = (r: RecipeSummary) => (r.tags.includes('おもてなし') ? 2 : 0) + (r.favorite ? 1 : 0);
  const visible = data?.filter((r) => !excludeIds?.includes(r.id));
  const list = hosting ? visible && [...visible].sort((a, b) => rank(b) - rank(a)) : visible;

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
          この日はわかばの日なので、わかばのレシピだけを表示しています
        </p>
      )}
      <ul className="-mx-1 flex max-h-[45dvh] flex-col gap-1 overflow-y-auto px-1">
        {isPending && <li className="p-3 text-sm text-ink-soft">読み込み中…</li>}
        {list?.map((r) => (
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
        {list?.length === 0 && <li className="p-3 text-sm text-ink-soft">見つかりませんでした</li>}
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
  onMode,
  onAddHosting,
}: {
  day: PlanDayView | null;
  days: PlanDayView[];
  busy: boolean;
  onClose: () => void;
  onRegenerateDay: () => void;
  onAddSide: () => void;
  onSwap: (to: string) => void;
  onMode: (mode: DayMode) => void;
  /** お試し版では渡さない（もてなしの入口を出さない） */
  onAddHosting?: () => void;
}) {
  const dinner = day ? isDinnerHosted(day) : false;
  return (
    <Sheet
      open={day !== null}
      title={day ? `${WEEKDAY_LABELS[day.weekday]}曜日` : ''}
      onClose={onClose}
    >
      {day && (
        <div className="flex flex-col gap-3">
          {onAddHosting && day.hostings.length < MEALS.length && (
            <GlassButton onClick={onAddHosting}>もてなしを追加</GlassButton>
          )}
          {dinner && (
            <p className="text-xs text-ink-soft">
              夜のもてなしがあるので、この日のふだんの献立はお休みです。
            </p>
          )}
          {!dinner && (
            <div>
              <p className="mb-2 text-xs font-bold text-ink-soft">この日の予定</p>
              <div className="grid grid-cols-3 gap-1.5">
                {DAY_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy || day.mode === m}
                    aria-pressed={day.mode === m}
                    onClick={() => onMode(m)}
                    className={cn(
                      'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-bold',
                      day.mode === m ? 'bg-accent text-accent-ink' : 'groove',
                    )}
                  >
                    <DayModeIcon mode={m} size={18} />
                    {DAY_MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              {day.mode !== day.modeSetting && (
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  いつもは「{DAY_MODE_LABEL[day.modeSetting]}」の曜日です（今週だけ変更中）
                </p>
              )}
            </div>
          )}
          {!dinner && !isOffDay(day.mode) && (
            <>
              <GlassButton variant="primary" loading={busy} onClick={onRegenerateDay}>
                この日の献立を作り直す
              </GlassButton>
              {!day.items.some((i) => i.slot === 'side') && (
                <GlassButton onClick={onAddSide}>副菜を追加する</GlassButton>
              )}
            </>
          )}
          {!dinner && (
            <div>
              <p className="mb-2 text-xs font-bold text-ink-soft">ほかの曜日と入れ替える</p>
              <div className="grid grid-cols-6 gap-1.5">
                {days
                  .filter((d) => d.date !== day.date && !isDinnerHosted(d))
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
          )}
        </div>
      )}
    </Sheet>
  );
}

/** その日に「作った」を記録・取り消す（未来の日は出さない） */
export function CookOnDateButton({
  recipeId,
  date,
  logId,
  hostingCourseId,
}: {
  recipeId: string;
  date: string;
  logId: string | null;
  hostingCourseId?: string;
}) {
  const cook = useCookOnDate();
  // 押した直後の表示（読み直しが届くまでのあいだ）
  const [done, setDone] = useState(!!logId);
  if (date > toJstDate()) return null;
  return (
    <GlassButton
      variant={done ? 'ghost' : 'glass'}
      icon={<CheckDraw checked={done} size={16} />}
      loading={cook.isPending}
      onClick={() =>
        cook.mutate(
          { recipeId, date, logId: done ? logId : null, hostingCourseId },
          { onSuccess: () => setDone((d) => !d) },
        )
      }
    >
      {done ? '記録を取り消す' : '作ったと記録'}
    </GlassButton>
  );
}
