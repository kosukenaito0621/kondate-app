import { motion } from 'motion/react';
import { LEVEL_META, type CookingLevel } from '../../shared/levels';
import { cn } from '../lib/cn';

/** 🌱ふたば／🌾みのり の小さなガラス調チップ。ふたばは芽がぴょこっと揺れる */
export function LevelBadge({
  level,
  size = 'sm',
  className,
}: {
  level: CookingLevel;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const meta = LEVEL_META[level];
  return (
    <span
      className={cn(
        'glass inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        level === 'futaba' ? 'text-success-ink' : 'text-sub-ink',
        className,
      )}
    >
      <motion.span
        aria-hidden="true"
        className="inline-block origin-bottom"
        animate={level === 'futaba' ? { rotate: [0, -12, 10, -6, 0], y: [0, -1.5, 0] } : undefined}
        transition={
          level === 'futaba'
            ? { duration: 1.2, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }
            : undefined
        }
      >
        {meta.emoji}
      </motion.span>
      {meta.name}
    </span>
  );
}
