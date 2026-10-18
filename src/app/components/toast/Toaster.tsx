import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

type Toast = { id: number; message: string; tone: 'info' | 'warn' | 'error' };
type ToastApi = { toast: (message: string, tone?: Toast['tone']) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** 画面上部に出るガラス調のトースト */
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-2), { id, message, tone }]);
    window.setTimeout(
      () => setToasts((ts) => ts.filter((t) => t.id !== id)),
      tone === 'info' ? 3500 : 6000,
    );
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ paddingTop: 'max(0.75rem, var(--safe-top))' }}
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={spring.soft}
              className={cn(
                'glass glass--strong pointer-events-auto w-full max-w-[24rem] rounded-2xl px-4 py-3 text-sm font-bold',
                t.tone === 'warn' && 'text-sub-ink',
                t.tone === 'error' && 'text-danger',
              )}
              onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('Toaster がありません');
  return ctx;
}
