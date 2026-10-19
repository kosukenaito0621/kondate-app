import { useCallback, useEffect, useRef, useState } from 'react';

/** 長押しと判定するまでの時間 */
export const LONG_PRESS_MS = 450;
/** これ以上指が動いたらスクロールとみなして取り消す */
const MOVE_TOLERANCE = 8;

/**
 * 長押しを検出する。押している間は pressing が true（手ごたえの表示用）。
 * 長押しが成立したあとの click は打ち消すので、タップの処理と両立できる。
 * パソコンでは右クリック（contextmenu）でも長押しと同じ扱いにする。
 */
export function useLongPress(onLongPress: () => void) {
  const [pressing, setPressing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cb = useRef(onLongPress);
  useEffect(() => {
    cb.current = onLongPress;
  }, [onLongPress]);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
    setPressing(false);
  }, []);
  useEffect(() => cancel, [cancel]);

  const fire = () => {
    fired.current = true;
    cancel();
    navigator.vibrate?.(12);
    cb.current();
  };

  return {
    pressing,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        setPressing(true);
        timer.current = window.setTimeout(fire, LONG_PRESS_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        if (!fired.current) fire();
      },
      onClickCapture: (e: React.MouseEvent) => {
        // 長押しが成立したあとの指を離した click は、タップとして扱わない
        if (fired.current) {
          e.preventDefault();
          e.stopPropagation();
          fired.current = false;
        }
      },
    },
  };
}
