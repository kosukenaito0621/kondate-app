import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { spring } from '../../lib/motion';
import { MISSIONS } from '../../lib/tour';
import { GlassButton } from '../glass/GlassButton';
import { CheckDraw } from '../icons';

/** お祝いの小さな光（中心から外へ広がる） */
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { x: Math.cos(a) * 70, y: Math.sin(a) * 70, d: 0.05 * i };
});

/**
 * 「やってみよう」をぜんぶ終えたときのお祝い。画面の真ん中に大きく出して、
 * 体験したことの一覧と、Google でログインして使い始める入口を見せる
 */
export function TourComplete({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/20 p-5 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-done-title"
            className="glass glass--strong relative w-full max-w-[24rem] rounded-[2rem] px-6 pb-6 pt-8 text-center"
            initial={{ y: 30, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mx-auto grid size-20 place-items-center" aria-hidden>
              {SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-2 rounded-full bg-accent"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                  transition={{ duration: 1.1, delay: 0.25 + s.d, ease: 'easeOut' }}
                />
              ))}
              <motion.span
                className="grid size-20 place-items-center rounded-full bg-success text-success-ink"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ ...spring.snappy, delay: 0.1 }}
              >
                <CheckDraw checked size={40} />
              </motion.span>
            </div>
            <h2 id="tour-done-title" className="mt-5 text-[22px] font-bold leading-snug">
              ぜんぶ体験できました！
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {MISSIONS.length}つの機能をひととおり試しました
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-left text-xs">
              {MISSIONS.map((m) => (
                <li key={m.id} className="flex items-center gap-1.5">
                  <span className="shrink-0 text-success-ink">
                    <CheckDraw checked size={13} />
                  </span>
                  <span className="truncate">{m.short}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed">
              気に入ったら Google でログインしてください。AI取り込み・写真・家族の招待も使えて、
              データもずっと残ります。
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <a
                href="/api/auth/google"
                className="btn-primary sheen flex min-h-12 items-center justify-center rounded-full px-6 font-bold"
              >
                Google でログインして使う
              </a>
              <GlassButton ref={closeRef} variant="ghost" onClick={onClose}>
                もう少し試す
              </GlassButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
