import { motion } from 'motion/react';
import { LEVEL_META, type CookingLevel } from '../../shared/levels';
import { cn } from '../lib/cn';
import { LevelIcon } from './LevelIcon';

const SIZE = { inline: 20, sm: 26, md: 32 } as const;

/** 料理レベルのバッジ（色付きの丸に白い線画）。わかばは芽がぴょこっと揺れる */
export function LevelBadge({
  level,
  size = 'sm',
  className,
}: {
  level: CookingLevel;
  /** inline は時間・金額などの文字の並びに置く小さいサイズ */
  size?: 'inline' | 'sm' | 'md';
  className?: string;
}) {
  const meta = LEVEL_META[level];
  return (
    <motion.span
      role="img"
      aria-label={meta.name}
      title={meta.name}
      className={cn('inline-grid shrink-0 origin-bottom', className)}
      animate={level === 'futaba' ? { rotate: [0, -8, 6, -4, 0] } : undefined}
      transition={
        level === 'futaba'
          ? { duration: 1.2, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }
          : undefined
      }
    >
      <LevelIcon level={level} size={SIZE[size]} />
    </motion.span>
  );
}
