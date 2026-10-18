import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

type Option<T extends string> = { value: T; label: string; hint?: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
};

/** 3段階などの切り替え。選択中のつまみがバネで移動する */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: Props<T>) {
  const id = useId();

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(i + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex rounded-full bg-ivory-300/50 p-1 shadow-[inset_0_1px_2px_rgb(92_64_40/0.12)]"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 rounded-full font-medium transition-colors',
              size === 'sm' ? 'min-h-11 text-[13px]' : 'min-h-12 text-sm',
              selected ? 'text-ink' : 'text-ink-soft',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-white shadow-[inset_0_1px_0_white,0_3px_10px_-4px_rgb(92_64_40/0.35)]"
                transition={spring.soft}
              />
            )}
            <span className="relative flex flex-col leading-tight">
              {o.label}
              {o.hint && <span className="text-[10px] font-normal opacity-70">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
