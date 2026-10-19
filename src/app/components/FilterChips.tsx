import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { spring } from '../lib/motion';

type Option<T extends string> = {
  value: T | undefined;
  label: React.ReactNode;
  ariaLabel?: string;
};

/** 横スクロールの絞り込みチップ（1つ選択） */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <motion.button
            key={o.value ?? 'all'}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            title={o.ariaLabel}
            onClick={() => onChange(o.value)}
            whileTap={{ scale: 0.94 }}
            transition={spring.snappy}
            className={cn(
              'min-h-11 shrink-0 rounded-full px-4 text-[13px] whitespace-nowrap transition-colors',
              selected ? 'btn-primary font-bold' : 'glass text-ink-soft',
            )}
          >
            {o.label}
          </motion.button>
        );
      })}
    </div>
  );
}
