import { motion } from 'motion/react';
import { LEVEL_META, type CookingLevel } from '../../shared/levels';
import { cn } from '../lib/cn';

/** 🌱／🌾 のアイコンだけの小さなガラス調チップ。ふたばは芽がぴょこっと揺れる */
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
      role="img"
      aria-label={meta.name}
      title={meta.name}
      className={cn(
        'glass inline-grid shrink-0 place-items-center rounded-full',
        size === 'sm' ? 'size-7 text-[14px]' : 'size-9 text-[18px]',
        className,
      )}
    >
      <motion.span
        aria-hidden="true"
        className="inline-block origin-bottom leading-none"
        animate={level === 'futaba' ? { rotate: [0, -12, 10, -6, 0], y: [0, -1.5, 0] } : undefined}
        transition={
          level === 'futaba'
            ? { duration: 1.2, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }
            : undefined
        }
      >
        {meta.emoji}
      </motion.span>
    </span>
  );
}
