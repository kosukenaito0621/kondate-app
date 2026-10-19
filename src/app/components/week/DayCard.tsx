import { motion, Reorder, useDragControls } from 'motion/react';
import { CATEGORY_LABEL, COST_LEVEL_LABEL, TIME_LEVEL_LABEL } from '../../../shared/constants';
import { WEEKDAY_LABELS } from '../../../shared/date';
import type { PlanDayView, PlanItemView } from '../../../shared/plan';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { GenreBadge } from '../GenreBadge';
import { CheckDraw, ClockIcon, GripIcon } from '../icons';
import { DAY_MODE_LABEL, isOffDay } from '../../../shared/plan';
import { DayModeIcon } from './DayModeIcon';
import { holidayName } from '../../../shared/holidays';
import { LevelBadge } from '../LevelBadge';

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export function MealRow({ item, onClick }: { item: PlanItemView; onClick: () => void }) {
  const r = item.recipe;
  return (
    <motion.button
      type="button"
      layout="position"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
      className="flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left hover:bg-pill"
    >
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
    </motion.button>
  );
}

/** 1日分のカード。つまみをドラッグすると持ち上がり、離すとバネで収まる */
export function DayCard({
  day,
  isToday,
  highlightAt,
  index,
  shuffle,
  onItem,
  onAddSlot,
  onMenu,
  onDragEnd,
}: {
  day: PlanDayView;
  isToday: boolean;
  /** ほかのメンバーが変えた時刻（変わるたびに光らせる） */
  highlightAt?: number;
  index: number;
  shuffle: number;
  onItem: (item: PlanItemView) => void;
  onAddSlot: (slot: 'main' | 'soup' | 'side') => void;
  onMenu: () => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  // 土曜は水色、日曜と祝日は赤（カレンダーと同じ）
  const holiday = holidayName(day.date);
  const tone = day.weekday === 6 || holiday ? 'sun' : day.weekday === 5 ? 'sat' : null;
  const missing = isOffDay(day.mode)
    ? []
    : (['main', 'soup'] as const).filter((s) => !day.items.some((i) => i.slot === s));
  // 生成のたびに、カードがシャッフルされて並ぶ演出（角度は日ごとに少しずつ変える）
  const tilt = ((index * 37) % 11) - 5;

  return (
    <Reorder.Item
      value={day.date}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{
        scale: 1.04,
        zIndex: 10,
        boxShadow: '0 30px 60px -20px rgb(var(--shadow-rgb) / 0.5)',
      }}
      transition={spring.settle}
      className="relative list-none rounded-[var(--radius-card)]"
    >
      <motion.article
        key={shuffle}
        initial={shuffle ? { opacity: 0, y: 40, rotate: tilt, scale: 0.9 } : false}
        animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
        transition={{ ...spring.soft, delay: shuffle ? index * 0.07 : 0 }}
        className={cn(
          'glass relative rounded-[var(--radius-card)] p-3',
          isToday && 'ring-2 ring-accent',
        )}
        aria-label={`${WEEKDAY_LABELS[day.weekday]}曜日 ${md(day.date)}${holiday ? ` ${holiday}` : ''}`}
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
            className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] ring-2 ring-accent bg-accent-soft"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: 'easeOut' }}
          />
        )}
        <header className="mb-1 flex items-center gap-2 px-1">
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            className="-ml-1 grid size-9 cursor-grab touch-none place-items-center rounded-full text-ink-faint active:cursor-grabbing"
            aria-label="ドラッグしてほかの曜日と入れ替え"
          >
            <GripIcon size={18} />
          </button>
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
            {WEEKDAY_LABELS[day.weekday]}
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
          {isOffDay(day.mode) ? (
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
            aria-label={`${WEEKDAY_LABELS[day.weekday]}曜日のメニュー`}
          >
            …
          </button>
        </header>
        {isOffDay(day.mode) ? (
          <button
            type="button"
            onClick={onMenu}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-sub-soft px-3 text-left text-sub-ink"
          >
            <DayModeIcon mode={day.mode} size={22} />
            <span className="flex-1">
              <span className="block font-bold">{DAY_MODE_LABEL[day.mode]}の日</span>
              <span className="block text-[11px]">料理はお休み。タップで予定を変えられます</span>
            </span>
          </button>
        ) : (
          <div className="flex flex-col">
            {day.items.map((item) => (
              <MealRow
                key={`${item.slot}-${item.recipe.id}`}
                item={item}
                onClick={() => onItem(item)}
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
      </motion.article>
    </Reorder.Item>
  );
}
