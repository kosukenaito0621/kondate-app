import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

/** 週の想定費用と予算のバー */
export function BudgetBar({
  cost,
  budget,
  servings,
}: {
  cost: number;
  budget: number;
  servings: number;
}) {
  const ratio = budget > 0 ? Math.min(1.15, cost / budget) : 0;
  const over = cost > budget;
  return (
    <div className="glass rounded-[var(--radius-card)] px-4 py-3">
      <div className="flex items-baseline justify-between text-xs text-ink-soft">
        <span>
          今週の想定費用<span className="ml-1">（{servings}人分）</span>
        </span>
        <span className={cn('num text-sm font-bold', over ? 'text-danger' : 'text-ink')}>
          {cost.toLocaleString()}
          <span className="font-normal text-ink-soft"> / {budget.toLocaleString()}円</span>
        </span>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={cost}
        aria-label="週の予算に対する想定費用"
      >
        <motion.div
          className={cn('h-full rounded-full', over ? 'bg-danger' : 'bg-accent')}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, ratio * 100)}%` }}
          transition={spring.soft}
        />
      </div>
      {over && (
        <p className="mt-1.5 text-xs font-bold text-danger">
          予算を{(cost - budget).toLocaleString()}円超えています
        </p>
      )}
    </div>
  );
}
