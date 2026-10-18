import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

type Variant = 'primary' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = HTMLMotionProps<'button'> & {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
  block?: boolean;
};

const variants: Record<Variant, string> = {
  primary:
    'bg-terracotta-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_8px_20px_-8px_rgb(169_87_58/0.6)]',
  glass: 'glass text-ink',
  ghost: 'text-ink-soft hover:bg-white/40',
  danger: 'glass text-danger',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-4 text-sm gap-1.5', // タップ領域 44px 以上
  md: 'min-h-12 px-5 text-[15px] gap-2',
  lg: 'min-h-14 px-6 text-base gap-2.5',
};

export const GlassButton = forwardRef<HTMLButtonElement, Props>(function GlassButton(
  {
    variant = 'glass',
    size = 'md',
    icon,
    loading,
    block,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'sheen inline-flex items-center justify-center rounded-full font-medium',
        'transition-[opacity,background-color] disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      whileTap={disabled || loading ? undefined : { scale: 0.95 }}
      transition={spring.snappy}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children as React.ReactNode}
    </motion.button>
  );
});

function Spinner() {
  return (
    <span
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}
