import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { riseItem, staggerContainer } from '../../lib/motion';
import { CheckDraw } from '../icons';

/** シマー付きのプレースホルダ */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

function SkeletonCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={riseItem}
      className={cn('glass rounded-[var(--radius-card)] p-4', className)}
    >
      {children}
    </motion.div>
  );
}

function Screen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="flex flex-col gap-3"
      variants={staggerContainer(0.05)}
      initial="initial"
      animate="animate"
    >
      {children}
    </motion.div>
  );
}

/** 料理カード1枚分（ホーム・週間で共通） */
function MealCardSkeleton({ big }: { big?: boolean }) {
  return (
    <SkeletonCard className="flex items-center gap-3">
      <Skeleton className={cn('shrink-0 rounded-2xl', big ? 'size-20' : 'size-14')} />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </SkeletonCard>
  );
}

export function HomeSkeleton() {
  return (
    <Screen label="今日の献立を読み込み中">
      <div className="mb-2 flex flex-col gap-2 px-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-44" />
      </div>
      <MealCardSkeleton big />
      <MealCardSkeleton big />
      <MealCardSkeleton big />
      {/* 今日のメモ */}
      <SkeletonCard>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </SkeletonCard>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <SkeletonCard>
          <Skeleton className="h-16" />
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-16" />
        </SkeletonCard>
      </div>
    </Screen>
  );
}

export function WeekSkeleton() {
  return (
    <Screen label="週間献立を読み込み中">
      <div className="mb-1 flex items-center justify-between px-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-11 w-24 rounded-full" />
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <SkeletonCard key={i} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-6" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="flex flex-col gap-2 pl-8">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3.5 w-2/5" />
          </div>
          {/* メモ欄 */}
          <Skeleton className="ml-8 h-6 w-28 rounded-full" />
        </SkeletonCard>
      ))}
    </Screen>
  );
}

export function ShoppingSkeleton() {
  return (
    <Screen label="買い物リストを読み込み中">
      <Skeleton className="mx-1 mb-1 h-7 w-32" />
      {[4, 3, 2].map((rows, g) => (
        <SkeletonCard key={g} className="flex flex-col gap-3">
          <Skeleton className="h-3.5 w-14" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </SkeletonCard>
      ))}
    </Screen>
  );
}

export function RecipeListSkeleton() {
  return (
    <Screen label="レシピを読み込み中">
      <Skeleton className="mx-1 h-7 w-28" />
      <Skeleton className="h-12 rounded-full" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <MealCardSkeleton key={i} />
      ))}
    </Screen>
  );
}

export function RecipeDetailSkeleton() {
  return (
    <Screen label="レシピを読み込み中">
      <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>
      <SkeletonCard className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-16" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        ))}
      </SkeletonCard>
      <SkeletonCard className="flex flex-col gap-3">
        <Skeleton className="h-4 w-16" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className="h-10 flex-1" />
          </div>
        ))}
      </SkeletonCard>
    </Screen>
  );
}

export function SettingsSkeleton() {
  return (
    <Screen label="設定を読み込み中">
      <Skeleton className="mx-1 h-7 w-20" />
      {[2, 7, 2].map((rows, g) => (
        <SkeletonCard key={g} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-full" />
          ))}
        </SkeletonCard>
      ))}
    </Screen>
  );
}

/** AI解析中：進行段階を表示 */
export function AiProgressSkeleton({ stages, current }: { stages: string[]; current: number }) {
  return (
    <Screen label="AIがレシピを読み取り中">
      <SkeletonCard className="flex flex-col gap-3">
        <ol className="flex flex-col gap-2.5">
          {stages.map((s, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <li
                key={s}
                className={cn(
                  'flex items-center gap-3 text-sm transition-opacity',
                  !done && !now && 'opacity-45',
                )}
                aria-current={now ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full',
                    done ? 'bg-success text-success-ink' : 'bg-pill',
                  )}
                >
                  {done ? (
                    <CheckDraw checked size={14} />
                  ) : now ? (
                    <span className="size-2 animate-pulse rounded-full bg-accent-strong motion-reduce:animate-none" />
                  ) : null}
                </span>
                <span className={cn(now && 'font-medium')}>
                  {s}
                  {now && '…'}
                </span>
              </li>
            );
          })}
        </ol>
      </SkeletonCard>
      <SkeletonCard className="flex flex-col gap-2.5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-4/6" />
      </SkeletonCard>
    </Screen>
  );
}
