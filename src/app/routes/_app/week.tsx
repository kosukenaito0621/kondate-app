import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { CATEGORY_LABEL } from '../../../shared/constants';
import {
  addDays,
  isIsoDate,
  toJstDate,
  WEEKDAY_LABELS,
  weekdayIndex,
  weekStartOf,
} from '../../../shared/date';
import { swapMemos, type EditMemoChoice, type SwapMemoChoice } from '../../../shared/memo';
import type { PlanDayView } from '../../../shared/plan';
import type { Slot } from '../../../shared/planner';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { ChevronLeftIcon, ChevronRightIcon, CutleryIcon, GearIcon } from '../../components/icons';
import { useFallbackRefetch, useLive } from '../../components/live/LiveProvider';
import { PageHeader } from '../../components/PageHeader';
import { WeekSkeleton } from '../../components/skeleton/Skeletons';
import { useToast } from '../../components/toast/Toaster';
import { BudgetBar } from '../../components/week/BudgetBar';
import { DayCard } from '../../components/week/DayCard';
import { DaySheet, MealSheet, type MealTarget } from '../../components/week/MealSheets';
import { useMemoConfirm } from '../../components/week/MemoConfirm';
import { useRestoreMemos } from '../../lib/memo';
import { spring } from '../../lib/motion';
import { planQuery, usePlanMutation, type PlanAction } from '../../lib/plans';
import { compact, optString } from '../../lib/search';
import { useSlideSwap } from '../../lib/useSlideSwap';

export const Route = createFileRoute('/_app/week')({
  validateSearch: (s: Record<string, unknown>) =>
    compact({ w: [optString(s.w)].find((w) => w !== undefined && isIsoDate(w)) }),
  component: WeekPage,
});

const label = (ws: string) => {
  const end = addDays(ws, 6);
  const f = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${f(ws)} 〜 ${f(end)}`;
};
const dayName = (date: string) => `${WEEKDAY_LABELS[weekdayIndex(date)]}曜`;

/** 一度だけ出す「長押しで変更できます」の案内（端末ごと） */
const HINT_KEY = 'kd-hint-longpress';

/** 入れ替えを送ってから結果が届くまで、手元で入れ替えて見せる */
type PendingSwap = { from: string; to: string; memo: SwapMemoChoice; version: number };

function applySwap(days: PlanDayView[], s: PendingSwap): PlanDayView[] {
  const a = days.find((d) => d.date === s.from);
  const b = days.find((d) => d.date === s.to);
  if (!a || !b) return days;
  const memos = swapMemos({ from: a.memo?.body ?? null, to: b.memo?.body ?? null }, s.memo);
  const memoOf = (body: string | null) =>
    body === a.memo?.body ? a.memo : body === b.memo?.body ? b.memo : null;
  return days.map((d) =>
    d.date === s.from
      ? { ...d, items: b.items, mode: b.mode, memo: memoOf(memos.from) }
      : d.date === s.to
        ? { ...d, items: a.items, mode: a.mode, memo: memoOf(memos.to) }
        : d,
  );
}

function WeekPage() {
  const { w } = Route.useSearch();
  const today = toJstDate();
  const weekStart = weekStartOf(w ?? today);
  const navigate = useNavigate({ from: Route.fullPath });
  const refetchInterval = useFallbackRefetch();
  const { highlights } = useLive();
  const { data: plan, isPending } = useQuery({ ...planQuery(weekStart), refetchInterval });
  const mutation = usePlanMutation(weekStart);
  const { toast } = useToast();
  const memoConfirm = useMemoConfirm();
  const restoreMemos = useRestoreMemos();

  const [shuffle, setShuffle] = useState(0);
  const [meal, setMeal] = useState<MealTarget | null>(null);
  const [daySheet, setDaySheet] = useState<PlanDayView | null>(null);
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);
  const [flashes, setFlashes] = useState<Record<string, number>>({});

  // 結果が届いたら（版が進んだら）手元の入れ替えは使わない
  const days = useMemo(() => {
    const ds = plan?.days ?? [];
    return pendingSwap && plan?.version === pendingSwap.version ? applySwap(ds, pendingSwap) : ds;
  }, [plan, pendingSwap]);
  const editableMemo = weekStart >= weekStartOf(today);
  const isEmpty = plan && plan.days.every((d) => d.items.length === 0);

  useEffect(() => {
    if (!plan || isEmpty) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      return;
    }
    toast('料理名をタップでレシピ、長押しで変更できます');
  }, [plan, isEmpty, toast]);

  const flash = (...dates: string[]) => {
    const now = Date.now();
    setFlashes((f) => ({ ...f, ...Object.fromEntries(dates.map((d) => [d, now])) }));
  };

  const go = (delta: number) =>
    navigate({ search: { w: addDays(weekStart, delta * 7) }, replace: true });

  const generate = () =>
    mutation.mutate({ type: 'generate' }, { onSuccess: () => setShuffle((n) => n + 1) });

  const memoNote = (date: string) => {
    const m = plan?.days.find((d) => d.date === date)?.memo;
    return m ? [{ date, body: m.body }] : [];
  };

  /**
   * 差し替え・1日の作り直し・削除。メモがある日は、先にメモをどうするか聞く。
   * キャンセルなら何もしない。「メモを消す」なら、元に戻せるトーストを出す
   */
  const editDay = async (
    action: Extract<PlanAction, { type: 'regenerate' | 'set' }>,
    title: string,
  ) => {
    const notes = memoNote(action.date);
    const choice = await memoConfirm.confirm('edit', title, notes);
    if (!choice) return;
    try {
      await mutation.mutateAsync({ ...action, memo: choice as EditMemoChoice });
    } catch {
      return; // エラーの表示は usePlanMutation が行う
    }
    if (choice === 'clear' && notes.length) {
      toast(`${dayName(action.date)}のメモを消しました`, 'info', {
        duration: 6000,
        action: { label: '元に戻す', onClick: () => void restoreMemos(notes) },
      });
    }
  };

  /** 2日の献立を入れ替える（animated：スライドで入れ替えたとき。表示を先に入れ替える） */
  const swapDays = async (from: string, to: string, animated: boolean) => {
    if (!plan) return false;
    const notes = [...memoNote(from), ...memoNote(to)];
    const choice = (await memoConfirm.confirm(
      'swap',
      `${dayName(from)}と${dayName(to)}を入れ替えます`,
      notes,
    )) as SwapMemoChoice | null;
    if (!choice) return false;
    if (animated) {
      flushSync(() => setPendingSwap({ from, to, memo: choice, version: plan.version }));
    }
    mutation.mutate(
      { type: 'swap', from, to, memo: choice },
      {
        onSuccess: () => {
          setPendingSwap(null);
          flash(from, to);
          const cleared = choice === 'clear' ? notes : [];
          toast(
            `${dayName(from)}と${dayName(to)}の献立を入れ替えました${cleared.length ? '（メモは消しました）' : ''}`,
            'info',
            {
              duration: 5000,
              action: {
                label: '元に戻す',
                onClick: () => {
                  // 入れ替えをもう一度行えば元どおり。消したメモは書き戻す
                  mutation.mutate(
                    { type: 'swap', from, to, memo: choice === 'clear' ? 'keep' : choice },
                    {
                      onSuccess: () => {
                        flash(from, to);
                        if (cleared.length) void restoreMemos(cleared);
                      },
                    },
                  );
                },
              },
            },
          );
        },
        onError: () => setPendingSwap(null),
      },
    );
    return true;
  };

  const slide = useSlideSwap((from, to) => swapDays(from, to, true));

  return (
    <>
      <PageHeader
        title="週間献立"
        eyebrow={label(weekStart)}
        action={
          <Link
            to="/week/settings"
            className="glass grid size-11 place-items-center rounded-full"
            aria-label="献立の設定"
          >
            <GearIcon size={20} />
          </Link>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          className="glass grid size-11 place-items-center rounded-full"
          aria-label="前の週"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <button
          type="button"
          onClick={() => navigate({ search: {}, replace: true })}
          disabled={weekStart === weekStartOf(today)}
          className="glass min-h-11 flex-1 rounded-full text-sm font-bold disabled:opacity-60"
        >
          {weekStart === weekStartOf(today) ? '今週' : '今週にもどる'}
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          className="glass grid size-11 place-items-center rounded-full"
          aria-label="次の週"
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      {isPending || !plan ? (
        <WeekSkeleton />
      ) : isEmpty ? (
        <GlassCard padding="lg" className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-lg font-bold">まだ献立がありません</p>
          <p className="text-sm text-ink-soft">
            曜日ごとの予算・時間・料理レベルに合わせて、
            <br />
            1週間分をまとめて作ります。
          </p>
          <GlassButton
            variant="primary"
            size="lg"
            icon={<CutleryIcon size={20} />}
            loading={mutation.isPending}
            onClick={generate}
          >
            1週間の献立をつくる
          </GlassButton>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          <BudgetBar
            cost={plan.estimatedCost}
            budget={plan.weeklyBudget}
            servings={plan.servings}
          />

          <ul className="flex flex-col gap-3" aria-label="曜日ごとの献立">
            {days.map((day, i) => (
              <li key={day.date} className="list-none">
                <DayCard
                  day={day}
                  index={i}
                  shuffle={shuffle}
                  isToday={day.date === today}
                  editableMemo={editableMemo}
                  highlightAt={
                    Math.max(highlights[day.date] ?? 0, flashes[day.date] ?? 0) || undefined
                  }
                  bodyRef={slide.register(day.date)}
                  onGrip={slide.grip(day.date)}
                  onItem={(item) => setMeal({ day, slot: item.slot, item })}
                  onAddSlot={(slot) => setMeal({ day, slot })}
                  onMenu={() => setDaySheet(day)}
                />
              </li>
            ))}
          </ul>

          <motion.div layout transition={spring.soft} className="mt-2">
            <GlassButton
              block
              icon={<CutleryIcon size={18} />}
              loading={mutation.isPending && mutation.variables?.type === 'generate'}
              onClick={generate}
            >
              1週間まるごと作り直す
            </GlassButton>
          </motion.div>
          {plan.updatedBy && (
            <p className="text-center text-xs text-ink-soft">
              最終更新：{plan.updatedBy.name ?? 'メンバー'}さん
            </p>
          )}
        </div>
      )}

      <MealSheet
        target={meal}
        busy={mutation.isPending}
        onClose={() => setMeal(null)}
        onRegenerate={() => {
          if (!meal) return;
          setMeal(null);
          const action = { type: 'regenerate' as const, date: meal.day.date, slot: meal.slot };
          // 空の枠に「おまかせ」で入れるのは差し替えではないので、メモは聞かない
          if (!meal.item) return mutation.mutate(action);
          void editDay(action, `${dayName(meal.day.date)}の${CATEGORY_LABEL[meal.slot]}を変えます`);
        }}
        onPick={(recipeId) => {
          if (!meal) return;
          setMeal(null);
          const action = {
            type: 'set' as const,
            date: meal.day.date,
            slot: meal.slot as Slot,
            recipeId,
          };
          if (!meal.item) return mutation.mutate(action);
          void editDay(action, `${dayName(meal.day.date)}の${CATEGORY_LABEL[meal.slot]}を変えます`);
        }}
        onRemove={() => {
          if (!meal) return;
          setMeal(null);
          void editDay(
            { type: 'set', date: meal.day.date, slot: meal.slot, recipeId: null },
            `${dayName(meal.day.date)}の${CATEGORY_LABEL[meal.slot]}を外します`,
          );
        }}
      />
      <DaySheet
        day={daySheet}
        days={days}
        busy={mutation.isPending}
        onClose={() => setDaySheet(null)}
        onMode={(mode) =>
          daySheet &&
          mutation.mutate(
            { type: 'mode', date: daySheet.date, mode },
            { onSuccess: () => setDaySheet(null) },
          )
        }
        onRegenerateDay={() => {
          if (!daySheet) return;
          setDaySheet(null);
          void editDay(
            { type: 'regenerate', date: daySheet.date },
            `${dayName(daySheet.date)}の献立を作り直します`,
          );
        }}
        onAddSide={() =>
          daySheet &&
          mutation.mutate(
            { type: 'regenerate', date: daySheet.date, slot: 'side' },
            { onSuccess: () => setDaySheet(null) },
          )
        }
        onSwap={(to) => {
          if (!daySheet) return;
          setDaySheet(null);
          void swapDays(daySheet.date, to, false);
        }}
      />
      {memoConfirm.element}
    </>
  );
}
