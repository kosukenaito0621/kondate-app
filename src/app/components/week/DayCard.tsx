import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { CATEGORY_LABEL, COST_LEVEL_LABEL, TIME_LEVEL_LABEL } from '../../../shared/constants';
import { WEEKDAY_LABELS } from '../../../shared/date';
import { holidayName } from '../../../shared/holidays';
import {
  DAY_MODE_LABEL,
  isOffDay,
  type PlanDayView,
  type PlanItemView,
} from '../../../shared/plan';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { LONG_PRESS_MS, useLongPress } from '../../lib/useLongPress';
import { GenreBadge } from '../GenreBadge';
import { CheckDraw, ClockIcon, GripIcon, MemoIcon } from '../icons';
import { LevelBadge } from '../LevelBadge';
import { DayModeIcon } from './DayModeIcon';
import { MemoField } from './MemoField';

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/**
 * 献立の1品。タップでレシピへ、長押し（パソコンでは右クリック）で変更メニューを開く。
 * 長押し中は行の背景が左から満ちて、手ごたえを返す
 */
export function MealRow({ item, onLongPress }: { item: PlanItemView; onLongPress: () => void }) {
  const r = item.recipe;
  const { pressing, handlers } = useLongPress(onLongPress);
  return (
    <motion.div layout="position" transition={spring.snappy} className="relative">
      <Link
        to="/recipes/$id"
        params={{ id: r.id }}
        draggable={false}
        {...handlers}
        data-tour="meal-row"
        className="no-callout relative isolate flex min-h-12 w-full select-none items-center gap-2.5 overflow-hidden rounded-2xl px-2 py-1.5 text-left hover:bg-pill"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 origin-left bg-accent-soft"
          style={{
            transform: `scaleX(${pressing ? 1 : 0})`,
            opacity: pressing ? 1 : 0,
            transition: pressing
              ? `transform ${LONG_PRESS_MS}ms linear, opacity 120ms`
              : 'transform 160ms ease-out, opacity 160ms',
          }}
        />
        <span className="w-7 shrink-0 text-[11px] font-bold text-ink-soft">
          {CATEGORY_LABEL[item.slot]}
        </span>
        <GenreBadge genre={r.genre} className="size-5 text-[10px]" />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[15px] font-bold',
            item.cookedLogId && 'text-ink-soft',
          )}
        >
          {r.name}
        </span>
        {item.cookedLogId && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-success px-1.5 py-0.5 text-[10px] font-bold text-success-ink">
            <CheckDraw checked size={11} />
            作った
          </span>
        )}
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-ink-soft">
          <ClockIcon size={12} />
          <span className="num">{r.timeMinutes}</span>
        </span>
      </Link>
      {/* 長押しできない人（読み上げ・キーボード）向けの変更ボタン */}
      <button
        type="button"
        onClick={onLongPress}
        className="sr-only focus:not-sr-only focus:absolute focus:right-1 focus:top-1 focus:rounded-full focus:bg-pill focus:px-3 focus:py-1 focus:text-xs"
      >
        {r.name}を変更
      </button>
    </motion.div>
  );
}

/**
 * 1日分のカード。曜日の見出しはその場に残り、献立の部分（つまみで持つ）だけが
 * ほかの曜日へスライドする（動きは useSlideSwap が担当）
 */
export function DayCard({
  day,
  isToday,
  highlightAt,
  index,
  shuffle,
  editableMemo,
  bodyRef,
  onGrip,
  onItem,
  onAddSlot,
  onMenu,
}: {
  day: PlanDayView;
  isToday: boolean;
  /** 光らせた時刻（ほかのメンバーの変更・入れ替えのたびに光る） */
  highlightAt?: number;
  index: number;
  shuffle: number;
  /** メモを書けるか（過ぎた週は書けない） */
  editableMemo: boolean;
  bodyRef: (el: HTMLDivElement | null) => void;
  onGrip: (e: React.PointerEvent) => void;
  onItem: (item: PlanItemView) => void;
  onAddSlot: (slot: 'main' | 'soup' | 'side') => void;
  onMenu: () => void;
}) {
  // 土曜は水色、日曜と祝日は赤（カレンダーと同じ）
  const holiday = holidayName(day.date);
  const tone = day.weekday === 6 || holiday ? 'sun' : day.weekday === 5 ? 'sat' : null;
  const off = isOffDay(day.mode);
  const missing = off
    ? []
    : (['main', 'soup'] as const).filter((s) => !day.items.some((i) => i.slot === s));
  // 生成のたびに、カードがシャッフルされて並ぶ演出（角度は日ごとに少しずつ変える）
  const tilt = ((index * 37) % 11) - 5;
  const weekday = WEEKDAY_LABELS[day.weekday];

  return (
    <motion.article
      key={shuffle}
      initial={shuffle ? { opacity: 0, y: 40, rotate: tilt, scale: 0.9 } : false}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ ...spring.soft, delay: shuffle ? index * 0.07 : 0 }}
      className={cn(
        'glass relative rounded-[var(--radius-card)] p-3',
        isToday && 'ring-2 ring-accent',
      )}
      aria-label={`${weekday}曜日 ${md(day.date)}${holiday ? ` ${holiday}` : ''}`}
    >
      {tone && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 rounded-[var(--radius-card)]',
            tone === 'sun' ? 'bg-sun-soft' : 'bg-sat-soft',
          )}
        />
      )}
      {highlightAt && (
        <motion.span
          key={highlightAt}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] bg-accent-soft ring-2 ring-accent"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2.4, ease: 'easeOut' }}
        />
      )}
      <header className="mb-1 flex items-center gap-2 px-1">
        <span
          className={cn(
            'text-lg font-bold',
            tone === 'sun'
              ? 'text-sun'
              : tone === 'sat'
                ? 'text-sat'
                : isToday && 'text-accent-strong',
          )}
        >
          {weekday}
        </span>
        <span
          className={cn(
            'num text-xs',
            tone === 'sun' ? 'text-sun' : tone === 'sat' ? 'text-sat' : 'text-ink-soft',
          )}
        >
          {md(day.date)}
        </span>
        {holiday && (
          <span className="truncate rounded-full bg-sun-chip px-2 py-0.5 text-[10px] font-bold text-sun">
            {holiday}
          </span>
        )}
        {isToday && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">
            今日
          </span>
        )}
        {day.memo && (
          <span className="text-memo-ink" title="メモあり">
            <MemoIcon size={15} aria-label="メモあり" />
          </span>
        )}
        {off ? (
          <span className="ml-auto" />
        ) : (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-ink-soft">
            {TIME_LEVEL_LABEL[day.timeLevel]}・{COST_LEVEL_LABEL[day.budgetLevel]}
            <LevelBadge level={day.level} />
          </span>
        )}
        <button
          type="button"
          onClick={onMenu}
          className="grid size-9 place-items-center rounded-full text-lg font-bold text-ink-soft"
          aria-label={`${weekday}曜日のメニュー`}
        >
          …
        </button>
      </header>

      {/* 献立の部分。持ち上げているあいだは、元の場所に受け皿が見える */}
      <div className="slide-slot rounded-2xl">
        <div ref={bodyRef} className="slide-body flex gap-1 rounded-2xl">
          <button
            type="button"
            onPointerDown={onGrip}
            className="grid w-7 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-ink-faint active:cursor-grabbing"
            data-tour="day-grip"
            aria-label={`${weekday}曜の献立をほかの曜日へ移す`}
          >
            <GripIcon size={18} />
          </button>
          {off ? (
            <button
              type="button"
              onClick={onMenu}
              className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl bg-sub-soft px-3 text-left text-sub-ink"
            >
              <DayModeIcon mode={day.mode} size={22} />
              <span className="flex-1">
                <span className="block font-bold">{DAY_MODE_LABEL[day.mode]}の日</span>
                <span className="block text-[11px]">料理はお休み。タップで予定を変えられます</span>
              </span>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col">
              {day.items.map((item) => (
                <MealRow
                  key={`${item.slot}-${item.recipe.id}`}
                  item={item}
                  onLongPress={() => onItem(item)}
                />
              ))}
              {missing.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onAddSlot(slot)}
                  className="flex min-h-11 items-center gap-2.5 rounded-2xl px-2 text-left text-sm text-ink-faint"
                >
                  <span className="w-7 text-[11px] font-bold">{CATEGORY_LABEL[slot]}</span>＋ 選ぶ
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {editableMemo ? (
        <div className="pl-8">
          <MemoField date={day.date} memo={day.memo} dayLabel={`${weekday}曜`} />
        </div>
      ) : (
        day.memo && (
          <p className="ml-8 mt-1.5 flex gap-2 rounded-2xl bg-memo px-3 py-2 text-sm text-memo-ink">
            <MemoIcon size={16} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-wrap break-words">{day.memo.body}</span>
          </p>
        )
      )}
    </motion.article>
  );
}
