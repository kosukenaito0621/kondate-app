import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { spring } from '../../lib/motion';
import { GlassButton } from './GlassButton';

/** ガラス調の確認ダイアログ */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="glass glass--strong w-full max-w-sm rounded-[var(--radius-card)] p-6"
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-bold">
              {title}
            </h2>
            {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
            <div className="mt-6 flex gap-3">
              <GlassButton ref={cancelRef} block onClick={onCancel}>
                やめる
              </GlassButton>
              <GlassButton
                block
                variant={danger ? 'danger' : 'primary'}
                loading={loading}
                onClick={onConfirm}
              >
                {confirmLabel}
              </GlassButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
