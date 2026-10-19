import { motion } from 'motion/react';
import { LEVEL_META, type CookingLevel } from '../../shared/levels';
import { LEVEL_COLOR, LevelIcon } from './LevelIcon';
import { cn } from '../lib/cn';

/** わかば（双葉）／みのり（稲穂）のアイコンだけの小さなチップ。わかばは芽がぴょこっと揺れる */
export function LevelBadge({
  level,
  size = 'sm',
  className,
}: {
  level: CookingLevel;
  /** inline は時間・金額などの文字の並びに置く小さいサイズ（影なし） */
  size?: 'inline' | 'sm' | 'md';
  className?: string;
}) {
  const meta = LEVEL_META[level];
  return (
    <span
      role="img"
      aria-label={meta.name}
      title={meta.name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full',
        LEVEL_COLOR[level],
        size === 'inline'
          ? 'size-5 bg-pill text-[11px]'
          : size === 'sm'
            ? 'glass size-7 text-[14px]'
            : 'glass size-9 text-[18px]',
        className,
      )}
    >
      <motion.span
        aria-hidden="true"
        className="inline-grid origin-bottom leading-none"
        animate={level === 'futaba' ? { rotate: [0, -12, 10, -6, 0], y: [0, -1.5, 0] } : undefined}
        transition={
          level === 'futaba'
            ? { duration: 1.2, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }
            : undefined
        }
      >
        <LevelIcon level={level} size={size === 'inline' ? 14 : size === 'sm' ? 17 : 21} />
      </motion.span>
    </span>
  );
}
