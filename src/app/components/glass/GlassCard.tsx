import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Props = HTMLMotionProps<'div'> & {
  strong?: boolean;
  /** 押せるカード（縮む＋光る） */
  pressable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' };

export const GlassCard = forwardRef<HTMLDivElement, Props>(function GlassCard(
  { strong, pressable, padding = 'md', className, children, ...props },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      className={cn(
        'glass rounded-[var(--radius-card)]',
        strong && 'glass--strong',
        pressable && 'sheen cursor-pointer select-none',
        paddings[padding],
        className,
      )}
      whileTap={pressable ? { scale: 0.975 } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 35 }}
      {...props}
    >
      {children}
    </motion.div>
  );
});
