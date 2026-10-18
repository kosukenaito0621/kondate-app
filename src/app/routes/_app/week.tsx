import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { addDays, isIsoDate, toJstDate, weekStartOf } from '../../../shared/date';
import type { PlanDayView } from '../../../shared/plan';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { ChevronLeftIcon, ChevronRightIcon, GearIcon, CutleryIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { WeekSkeleton } from '../../components/skeleton/Skeletons';
import { BudgetBar } from '../../components/week/BudgetBar';
import { DayCard } from '../../components/week/DayCard';
import { DaySheet, MealSheet, type MealTarget } from '../../components/week/MealSheets';
import { planQuery, usePlanMutation } from '../../lib/plans';
import { spring } from '../../lib/motion';

export const Route = createFileRoute('/_app/week')({
  validateSearch: z.object({ w: z.string().refine(isIsoDate).optional() }),
  component: WeekPage,
});

const label = (ws: string) => {
  const end = addDays(ws, 6);
  const f = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${f(ws)} 〜 ${f(end)}`;
};

function WeekPage() {
  const { w } = Route.useSearch();
  const today = toJstDate();
  const weekStart = weekStartOf(w ?? today);
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: plan, isPending } = useQuery(planQuery(weekStart));
  const mutation = usePlanMutation(weekStart);

  const [shuffle, setShuffle] = useState(0);
  const [meal, setMeal] = useState<MealTarget | null>(null);
  const [daySheet, setDaySheet] = useState<PlanDayView | null>(null);

  // ドラッグ中の並び（離したら入れ替えを送り、元の日付順に戻す）
  const dates = useMemo(() => plan?.days.map((d) => d.date) ?? [], [plan]);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const order = dragOrder ?? dates;
  const dragging = dragOrder !== null;

  const go = (delta: number) =>
    navigate({ search: { w: addDays(weekStart, delta * 7) }, replace: true });

  const generate = () =>
    mutation.mutate({ type: 'generate' }, { onSuccess: () => setShuffle((n) => n + 1) });

  const onDragEnd = (date: string) => {
    const target = dates[order.indexOf(date)];
    setDragOrder(null);
    if (target && target !== date) mutation.mutate({ type: 'swap', from: date, to: target });
  };

  const byDate = new Map(plan?.days.map((d) => [d.date, d]));
  const isEmpty = plan && plan.days.every((d) => d.items.length === 0);

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

          <Reorder.Group
            axis="y"
            values={order}
            onReorder={setDragOrder}
            className="flex flex-col gap-3"
            aria-label="曜日ごとの献立"
          >
            {order.map((date, i) => {
              const day = byDate.get(date);
              if (!day) return null;
              return (
                <DayCard
                  key={date}
                  day={day}
                  index={i}
                  shuffle={shuffle}
                  isToday={date === today}
                  onItem={(item) => setMeal({ day, slot: item.slot, item })}
                  onAddSlot={(slot) => setMeal({ day, slot })}
                  onMenu={() => setDaySheet(day)}
                  onDragEnd={() => onDragEnd(date)}
                />
              );
            })}
          </Reorder.Group>
          <AnimatePresence>
            {dragging && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-xs text-ink-soft"
              >
                離した場所の曜日と入れ替えます
              </motion.p>
            )}
          </AnimatePresence>

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
        onRegenerate={() =>
          meal &&
          mutation.mutate(
            { type: 'regenerate', date: meal.day.date, slot: meal.slot },
            { onSuccess: () => setMeal(null) },
          )
        }
        onPick={(recipeId) =>
          meal &&
          mutation.mutate(
            { type: 'set', date: meal.day.date, slot: meal.slot, recipeId },
            { onSuccess: () => setMeal(null) },
          )
        }
        onRemove={() =>
          meal &&
          mutation.mutate(
            { type: 'set', date: meal.day.date, slot: meal.slot, recipeId: null },
            { onSuccess: () => setMeal(null) },
          )
        }
      />
      <DaySheet
        day={daySheet}
        days={plan?.days ?? []}
        busy={mutation.isPending}
        onClose={() => setDaySheet(null)}
        onRegenerateDay={() =>
          daySheet &&
          mutation.mutate(
            { type: 'regenerate', date: daySheet.date },
            { onSuccess: () => setDaySheet(null) },
          )
        }
        onAddSide={() =>
          daySheet &&
          mutation.mutate(
            { type: 'regenerate', date: daySheet.date, slot: 'side' },
            { onSuccess: () => setDaySheet(null) },
          )
        }
        onSwap={(to) =>
          daySheet &&
          mutation.mutate(
            { type: 'swap', from: daySheet.date, to },
            { onSuccess: () => setDaySheet(null) },
          )
        }
      />
    </>
  );
}
