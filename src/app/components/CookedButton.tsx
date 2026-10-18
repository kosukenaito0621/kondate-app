import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { todayLogsQuery, useCookToggle } from '../lib/cooklog';
import { cn } from '../lib/cn';
import { spring } from '../lib/motion';
import { CheckDraw } from './icons';

/** 今日「作った」を記録するボタン。押すとチェックが描かれ、ふわっと弾む */
export function CookedButton({
  recipeId,
  recipeName,
  size = 'md',
}: {
  recipeId: string;
  recipeName: string;
  size?: 'md' | 'lg';
}) {
  const { data: logs } = useQuery(todayLogsQuery);
  const toggle = useCookToggle();
  const log = logs?.find((l) => l.recipeId === recipeId);
  const done = !!log;

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ recipeId, logId: log && !log.id.startsWith('tmp-') ? log.id : undefined });
      }}
      disabled={toggle.isPending || (done && log.id.startsWith('tmp-'))}
      aria-pressed={done}
      aria-label={done ? `${recipeName}の「作った」を取り消す` : `${recipeName}を作ったと記録する`}
      whileTap={{ scale: 0.88 }}
      transition={spring.snappy}
      className={cn(
        'relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl font-bold transition-colors',
        size === 'lg' ? 'min-h-14 min-w-28 px-4 text-sm' : 'size-14 text-[10px]',
        done ? 'btn-primary' : 'groove text-ink-soft',
      )}
    >
      <span
        className={cn(
          'grid place-items-center rounded-full border-2',
          size === 'lg' ? 'size-6' : 'size-6',
          done ? 'border-accent-ink/40 bg-white/40' : 'border-ink-faint/50',
        )}
      >
        <CheckDraw checked={done} size={14} />
      </span>
      {done ? '作った！' : '作った'}
      <AnimatePresence>
        {done && (
          <motion.span
            key="burst"
            className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-accent"
            initial={{ opacity: 0.9, scale: 1 }}
            animate={{ opacity: 0, scale: 1.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}
