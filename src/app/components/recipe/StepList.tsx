import { motion } from 'motion/react';
import type { Step } from '../../../shared/recipe';
import { riseItem, spring, staggerContainer } from '../../lib/motion';
import { findMinutes } from '../../lib/recipes';
import { ClockIcon } from '../icons';
import { useTimers } from '../timer/TimerProvider';

/** コツの吹き出し */
export function TipBubble({ tip, large }: { tip: string; large?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.soft, delay: 0.15 }}
      className={`relative mt-2.5 inline-block rounded-2xl bg-accent-soft text-accent-strong ${
        large ? 'px-4 py-3 text-[15px]' : 'px-3 py-2 text-[13px]'
      }`}
    >
      {/* 吹き出しのしっぽ */}
      <span
        className="absolute -top-1.5 left-5 size-3 rotate-45 rounded-[2px] bg-accent-soft"
        aria-hidden="true"
      />
      <span className="relative">
        <span className="mr-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">
          コツ
        </span>
        {tip}
      </span>
    </motion.div>
  );
}

/** 「◯分」の手順に付くワンタップタイマー */
export function StepTimerButton({ text, label }: { text: string; label: string }) {
  const { start } = useTimers();
  const minutes = findMinutes(text);
  if (!minutes) return null;
  return (
    <motion.button
      type="button"
      onClick={() => start(label, minutes)}
      aria-label={`${minutes}分タイマーを開始`}
      whileTap={{ scale: 0.92 }}
      transition={spring.snappy}
      className="glass sheen mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold text-accent-strong"
    >
      <ClockIcon size={16} />
      <span className="num">{minutes}</span>分タイマー
    </motion.button>
  );
}

export function StepList({ steps, recipeName }: { steps: Step[]; recipeName: string }) {
  return (
    <motion.ol
      className="flex flex-col gap-4"
      variants={staggerContainer(0.06)}
      initial="initial"
      animate="animate"
    >
      {steps.map((s, i) => (
        <motion.li key={i} variants={riseItem} className="flex gap-3">
          <span className="btn-primary num grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="leading-relaxed">{s.text}</p>
            {s.tip && <TipBubble tip={s.tip} />}
            <div>
              <StepTimerButton text={s.text} label={`${recipeName} 手順${i + 1}`} />
            </div>
          </div>
        </motion.li>
      ))}
    </motion.ol>
  );
}
