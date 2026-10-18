import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type CookingTimer = {
  id: string;
  label: string;
  /** 終了時刻（ms） */
  endsAt: number;
  totalMs: number;
};

type TimerApi = {
  timers: CookingTimer[];
  start: (label: string, minutes: number) => void;
  dismiss: (id: string) => void;
  now: number;
};

const TimerContext = createContext<TimerApi | null>(null);

/** 終了時の通知音（Web Audio でやさしい2音）と振動 */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.25;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    // 音が出せない環境では振動だけ
  }
  navigator.vibrate?.([200, 100, 200]);
}

/** 調理タイマー。画面を移動しても動き続ける。終了したかどうかは時刻から判定する */
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<CookingTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef(new Set<string>());
  const timersRef = useRef(timers);
  const running = timers.some((t) => t.endsAt > now);

  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const finished = timersRef.current.filter(
        (x) => x.endsAt <= t && !notified.current.has(x.id),
      );
      if (finished.length) {
        finished.forEach((x) => notified.current.add(x.id));
        chime();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback((label: string, minutes: number) => {
    const totalMs = minutes * 60_000;
    const startAt = Date.now();
    setNow(startAt);
    setTimers((ts) => [
      ...ts,
      { id: crypto.randomUUID(), label, endsAt: startAt + totalMs, totalMs },
    ]);
  }, []);

  const dismiss = useCallback((id: string) => {
    notified.current.delete(id);
    setTimers((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ timers, start, dismiss, now }), [timers, start, dismiss, now]);
  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimers() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('TimerProvider がありません');
  return ctx;
}

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
