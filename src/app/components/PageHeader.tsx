import { motion } from 'motion/react';
import { fadeIn } from '../lib/motion';

type Props = { title: string; eyebrow?: string; action?: React.ReactNode };

export function PageHeader({ title, eyebrow, action }: Props) {
  return (
    <motion.header
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="mb-4 flex items-end justify-between gap-3 px-1"
    >
      <div>
        {eyebrow && <p className="text-xs font-medium text-ink-soft">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
      </div>
      {action}
    </motion.header>
  );
}
