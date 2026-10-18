import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { CATEGORY_LABEL } from '../../../shared/constants';
import { jstHour, toJstDate, weekdayIndex, WEEKDAY_LABELS } from '../../../shared/date';
import type { PlanDayView, PlanItemView } from '../../../shared/plan';
import { api } from '../../api';
import { CookedButton } from '../../components/CookedButton';
import { GenreBadge } from '../../components/GenreBadge';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { GroupSwitcher } from '../../components/GroupSwitcher';
import {
  BookIcon,
  CalendarIcon,
  CartIcon,
  ClockIcon,
  CutleryIcon,
  YenIcon,
} from '../../components/icons';
import { LevelBadge } from '../../components/LevelBadge';
import { HomeSkeleton } from '../../components/skeleton/Skeletons';
import { greeting } from '../../lib/greeting';
import { fadeIn, riseItem, spring, staggerContainer } from '../../lib/motion';
import { usePlanMutation } from '../../lib/plans';
import { ok } from '../../lib/recipes';

type Today = {
  date: string;
  day: PlanDayView;
  weekStart: string;
  version: number;
  exists: boolean;
};

export const todayQuery = queryOptions({
  queryKey: ['today'],
  queryFn: async () => ok<Today>(await api.today.$get()),
  staleTime: 30_000,
});

export const Route = createFileRoute('/_app/')({
  component: Home,
});

const stripe = { wa: 'bg-wa', yo: 'bg-yo', chu: 'bg-chu' } as const;

function Home() {
  const { me } = Route.useRouteContext();
  const { data, isPending } = useQuery(todayQuery);
  const date = toJstDate();
  const weekday = weekdayIndex(date);
  const hour = jstHour();
  const mainDish = data?.day.items.find((i) => i.slot === 'main')?.recipe.name;

  const g = useMemo(
    () =>
      greeting({
        name: me.displayName ?? '',
        hour,
        weekday,
        hasPlan: !!data?.day.items.length,
        mainDish,
        timeLevel: data?.day.timeLevel,
        budgetLevel: data?.day.budgetLevel,
        level: data?.day.level,
        // 同じ日・同じ時間帯は同じ文言（再描画でちらつかないように）
        seed: Number(date.replaceAll('-', '')) * 10 + Math.floor(hour / 6),
      }),
    [me.displayName, hour, weekday, data, mainDish, date],
  );

  const [, mm, dd] = date.split('-');

  return (
    <>
      <div className="mb-4">
        <GroupSwitcher />
      </div>

      <motion.header variants={fadeIn} initial="initial" animate="animate" className="mb-5 px-1">
        <p className="text-xs font-bold text-accent-strong">
          {Number(mm)}月{Number(dd)}日（{WEEKDAY_LABELS[weekday]}）の献立
        </p>
        <h1 className="mt-1 text-[24px] font-bold leading-snug">{g.title}</h1>
        {data && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="mt-1.5 text-sm text-ink-soft"
          >
            {g.line}
          </motion.p>
        )}
      </motion.header>

      {isPending || !data ? (
        <HomeSkeleton />
      ) : data.day.items.length === 0 ? (
        <EmptyToday weekStart={data.weekStart} />
      ) : (
        <motion.div
          className="flex flex-col gap-3"
          variants={staggerContainer(0.08, 0.1)}
          initial="initial"
          animate="animate"
        >
          {data.day.items.map((item) => (
            <MealHero key={item.slot} item={item} />
          ))}
          <motion.div variants={riseItem} className="mt-2 grid grid-cols-3 gap-3">
            <QuickLink
              to="/week"
              label="今週の献立"
              sub="見る・変える"
              icon={<CalendarIcon size={22} />}
            />
            <QuickLink
              to="/shopping"
              label="買い物リスト"
              sub="今週の材料"
              icon={<CartIcon size={22} />}
            />
            <QuickLink to="/log" label="自炊記録" sub="作った料理" icon={<BookIcon size={22} />} />
          </motion.div>
        </motion.div>
      )}
    </>
  );
}

function MealHero({ item }: { item: PlanItemView }) {
  const r = item.recipe;
  return (
    <motion.div
      variants={riseItem}
      className="glass flex items-center gap-2 rounded-[var(--radius-card)] p-2 pr-3"
    >
      <Link
        to="/recipes/$id"
        params={{ id: r.id }}
        className="block min-w-0 flex-1 rounded-[calc(var(--radius-card)-0.5rem)]"
      >
        <motion.div
          whileTap={{ scale: 0.975 }}
          transition={spring.snappy}
          className="sheen flex items-stretch gap-4 rounded-[calc(var(--radius-card)-0.5rem)] p-2"
        >
          <span className={`w-1.5 shrink-0 rounded-full ${stripe[r.genre]}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <span className="font-bold text-accent-strong">{CATEGORY_LABEL[item.slot]}</span>
              <GenreBadge genre={r.genre} className="size-5 text-[10px]" />
            </div>
            <motion.p
              layoutId={`recipe-title-${r.id}`}
              transition={spring.soft}
              className="mt-1 text-xl font-bold leading-snug"
            >
              {r.name}
            </motion.p>
            <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft">
              <span className="flex items-center gap-1">
                <ClockIcon size={14} />
                <span className="num">{r.timeMinutes}</span>分
              </span>
              <span className="flex items-center gap-1">
                <YenIcon size={14} />
                <span className="num">{r.costYen}</span>円
              </span>
              <LevelBadge level={r.difficulty} className="ml-auto" />
            </div>
          </div>
        </motion.div>
      </Link>
      <CookedButton recipeId={r.id} recipeName={r.name} />
    </motion.div>
  );
}

function QuickLink({
  to,
  label,
  sub,
  icon,
}: {
  to: '/week' | '/shopping' | '/log';
  label: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <Link to={to} className="block rounded-[var(--radius-card)]">
      <motion.div
        whileTap={{ scale: 0.96 }}
        transition={spring.snappy}
        className="glass sheen flex h-full flex-col gap-1.5 rounded-[var(--radius-card)] px-3 py-3.5"
      >
        <span className="text-accent-strong">{icon}</span>
        <span className="text-[13px] font-bold leading-tight whitespace-nowrap">{label}</span>
        <span className="text-[11px] text-ink-soft">{sub}</span>
      </motion.div>
    </Link>
  );
}

function EmptyToday({ weekStart }: { weekStart: string }) {
  const mutation = usePlanMutation(weekStart);
  const queryClient = useQueryClient();
  return (
    <GlassCard
      variants={riseItem}
      initial="initial"
      animate="animate"
      padding="lg"
      className="flex flex-col items-center gap-4 py-10 text-center"
    >
      <p className="text-lg font-bold">今日の献立はまだありません</p>
      <p className="text-sm text-ink-soft">
        曜日ごとの設定に合わせて、
        <br />
        今週の献立をまとめて作れます。
      </p>
      <GlassButton
        variant="primary"
        size="lg"
        icon={<CutleryIcon size={20} />}
        loading={mutation.isPending}
        onClick={() =>
          mutation.mutate(
            { type: 'generate' },
            { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['today'] }) },
          )
        }
      >
        今週の献立をつくる
      </GlassButton>
      <Link to="/week" className="min-h-11 text-sm font-bold text-accent-strong">
        週間献立を見る
      </Link>
    </GlassCard>
  );
}
