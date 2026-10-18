import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Step } from '../../../shared/recipe';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { StepTimerButton, TipBubble } from './StepList';

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0, scale: 0.96 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0, scale: 0.96 }),
};

/**
 * ゆっくりモード：手順を1つずつ大きく表示。左右スワイプ・矢印キー・ボタンで移動。
 */
export function SlowMode({
  steps,
  recipeName,
  onClose,
}: {
  steps: Step[];
  recipeName: string;
  onClose: () => void;
}) {
  const [[index, dir], setPage] = useState<[number, number]>([0, 0]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= steps.length) return;
    setPage([next, delta]);
  };

  // 開いたとき：フォーカスを移し、背面のスクロールを止める
  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe < -80) go(1);
    else if (swipe > 80) go(-1);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${recipeName} ゆっくりモード`}
      className="fixed inset-0 z-50 flex justify-center bg-canvas/70 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="flex w-full max-w-[var(--app-max-width)] flex-col px-5"
        style={{
          paddingTop: 'max(1rem, var(--safe-top))',
          paddingBottom: 'max(1.25rem, var(--safe-bottom))',
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink-soft">
            ゆっくりモード
            <span className="num ml-2">
              {index + 1} / {steps.length}
            </span>
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="glass min-h-11 rounded-full px-4 text-sm font-bold"
          >
            とじる
          </button>
        </div>

        {/* 進み具合 */}
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <motion.span
              key={i}
              className={cn('h-1.5 flex-1 rounded-full', i <= index ? 'bg-accent' : 'bg-track')}
              animate={{ scaleY: i === index ? 1.6 : 1 }}
              transition={spring.snappy}
            />
          ))}
        </div>

        <div className="relative mt-6 flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.section
              key={index}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring.soft}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={onDragEnd}
              className="glass glass--strong absolute inset-0 flex cursor-grab flex-col overflow-y-auto rounded-[2rem] p-6 active:cursor-grabbing"
              aria-live="polite"
            >
              <span className="btn-primary num grid size-12 place-items-center rounded-full text-2xl font-bold">
                {index + 1}
              </span>
              <p className="mt-5 text-[22px] font-bold leading-relaxed">{step.text}</p>
              {step.tip && (
                <div>
                  <TipBubble tip={step.tip} large />
                </div>
              )}
              <div>
                <StepTimerButton text={step.text} label={`${recipeName} 手順${index + 1}`} />
              </div>
              {last && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-auto pt-6 text-center text-lg font-bold text-accent-strong"
                >
                  できあがり！🎉
                </motion.p>
              )}
            </motion.section>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="glass flex min-h-14 flex-1 items-center justify-center gap-1 rounded-full font-bold disabled:opacity-40"
          >
            <ChevronLeftIcon size={20} />
            まえへ
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : go(1))}
            className="btn-primary flex min-h-14 flex-[1.4] items-center justify-center gap-1 rounded-full font-bold"
          >
            {last ? 'おわり' : 'つぎへ'}
            {!last && <ChevronRightIcon size={20} />}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-ink-soft">左右にスワイプでも進めます</p>
      </div>
    </motion.div>
  );
}
