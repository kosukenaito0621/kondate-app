import type { Transition, Variants } from 'motion/react';

// アニメーションの共通設定。transform / opacity のみを動かす
export const spring = {
  /** カードの着地など、少し弾む */
  soft: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 },
  /** ボタンの押下など、きびきび */
  snappy: { type: 'spring', stiffness: 600, damping: 35 },
  /** ドラッグ後に収まる */
  settle: { type: 'spring', stiffness: 500, damping: 28, mass: 1.1 },
} satisfies Record<string, Transition>;

export const ease = {
  outSoft: [0.16, 1, 0.3, 1],
} as const;

/** 画面遷移：スライド＋フェード */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: ease.outSoft } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

/** リスト：少しずつ遅らせて浮き上がる */
export const staggerContainer = (stagger = 0.06, delay = 0.04): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const riseItem: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.6, ease: ease.outSoft } },
};
