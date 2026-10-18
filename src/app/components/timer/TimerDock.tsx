import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { ClockIcon } from '../icons';
import { formatRemaining, useTimers } from './TimerProvider';

/** 動いているタイマーをタブバーの上に浮かべて表示 */
export function TimerDock() {
  const { timers, dismiss, now } = useTimers();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 1.75rem)' }}
      aria-live="polite"
    >
      <AnimatePresence>
        {timers.map((t) => {
          const remaining = t.endsAt - now;
          const progress = 1 - Math.max(0, remaining) / t.totalMs;
          const done = remaining <= 0;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: done ? [1, 1.06, 1] : 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              transition={done ? { duration: 0.6, repeat: Infinity } : spring.soft}
              className={cn(
                'glass glass--strong pointer-events-auto relative flex w-full max-w-[22rem] items-center gap-3 overflow-hidden rounded-full py-2 pl-4 pr-2',
                done && 'text-accent-strong',
              )}
              role="timer"
            >
              <span
                className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-300"
                style={{ width: `${progress * 100}%` }}
                aria-hidden="true"
              />
              <ClockIcon size={18} className="relative" />
              <span className="relative min-w-0 flex-1 truncate text-sm">
                {done ? `${t.label}：時間です！` : t.label}
              </span>
              <span className="num relative text-base font-bold">
                {done ? '0:00' : formatRemaining(remaining)}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="relative min-h-11 rounded-full px-3 text-xs font-bold text-ink-soft"
              >
                {done ? 'とめる' : 'キャンセル'}
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
