import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: 'info' | 'warn' | 'error'; action?: ToastAction };
type ToastOptions = { action?: ToastAction; duration?: number };
type ToastApi = {
  toast: (message: string, tone?: Toast['tone'], options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** 画面上部に出るガラス調のトースト */
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback(
    (message: string, tone: Toast['tone'] = 'info', options: ToastOptions = {}) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts.slice(-2), { id, message, tone, action: options.action }]);
      window.setTimeout(
        () => setToasts((ts) => ts.filter((t) => t.id !== id)),
        options.duration ?? (tone === 'info' ? 3500 : 6000),
      );
    },
    [],
  );

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
              {t.action ? (
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">{t.message}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      t.action!.onClick();
                      setToasts((ts) => ts.filter((x) => x.id !== t.id));
                    }}
                    className="-my-1 min-h-9 shrink-0 rounded-full bg-pill px-3 text-accent-strong"
                  >
                    {t.action.label}
                  </button>
                </span>
              ) : (
                t.message
              )}
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
