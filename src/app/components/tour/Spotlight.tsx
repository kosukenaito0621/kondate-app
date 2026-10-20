import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { spring } from '../../lib/motion';
import { showSpot, useTour } from '../../lib/tour';

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
/** 光らせる場所が画面に出てくるのを待つ時間 */
const FIND_TIMEOUT = 4000;

/**
 * ミッションの「押す場所」を光る枠で囲み、吹き出しで一言添える。
 * まわりは暗くせず、重ねた層は押せないようにしてあるので、画面はふだんどおり使える。
 * 光らせた場所に触れると消える
 */
export function Spotlight() {
  const { spot } = useTour();
  // どの場所の位置か（別の場所に切り替わったら、古い位置は使わない）
  const [found, setFound] = useState<{ key: string; rect: Rect } | null>(null);
  const key = spot ? `${spot.id}:${spot.spot}` : '';
  const rect = found?.key === key ? found.rect : null;

  useEffect(() => {
    if (!spot) return;
    const k = `${spot.id}:${spot.spot}`;
    let el: Element | null = null;
    let raf = 0;
    let scrolled = false;
    const started = Date.now();
    const tick = () => {
      // 画面が変わって要素が消えたら探し直す
      if (el && !el.isConnected) el = null;
      el ??=
        [...document.querySelectorAll(`[data-tour="${spot.spot}"]`)].find(
          (e) => e.getClientRects().length > 0,
        ) ?? null;
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        setFound((prev) =>
          prev &&
          prev.key === k &&
          Math.abs(prev.rect.top - r.top) < 0.5 &&
          Math.abs(prev.rect.left - r.left) < 0.5 &&
          prev.rect.width === r.width &&
          prev.rect.height === r.height
            ? prev
            : { key: k, rect: { top: r.top, left: r.left, width: r.width, height: r.height } },
        );
      } else if (Date.now() - started > FIND_TIMEOUT) {
        showSpot(null);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // 光らせた場所に触れたら、案内は役目を終えたので消す（ドラッグなどの邪魔をしない）
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      // 位置を測る前でも、光らせる場所そのものに触れたかで判断する
      if (!e.target.closest(`[data-tour="${spot.spot}"]`)) return;
      showSpot(spot.then ? { ...spot, ...spot.then, then: undefined } : null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [spot]);

  const below = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : true;
  // 吹き出しは画面の幅に収め、しっぽを押す場所の真上（真下）に向ける
  const vw = typeof window === 'undefined' ? 400 : window.innerWidth;
  const bubbleW = Math.min(vw - 32, 384);
  const centerX = rect ? rect.left + rect.width / 2 : vw / 2;
  const bubbleLeft = Math.min(Math.max(centerX - bubbleW / 2, 16), vw - 16 - bubbleW);
  const tailX = Math.min(Math.max(centerX - bubbleLeft, 22), bubbleW - 22);

  return (
    // 消すときは動きを待たずにすぐ消す（光らせた場所に触れたら、すぐ操作できるように）
    <>
      {spot && rect && (
        <motion.div
          key={spot.id}
          className="pointer-events-none fixed inset-0 z-[55]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* 押す場所を囲む光る枠 */}
          <div
            className="spot-hole absolute rounded-2xl"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
          {/* 押す場所の真ん中に広がる波紋（「ここ」） */}
          <span
            aria-hidden
            className="spot-ripple absolute"
            style={{ top: rect.top + rect.height / 2, left: centerX }}
          />
          <motion.div
            role="status"
            initial={{ opacity: 0, y: below ? -8 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className="spot-bubble pointer-events-auto absolute flex items-start gap-3 rounded-2xl px-4 py-3 text-sm"
            data-below={below ? '' : undefined}
            style={{
              left: bubbleLeft,
              width: bubbleW,
              ['--tail-x' as string]: `${tailX}px`,
              ...(below
                ? { top: rect.top + rect.height + PAD + 14 }
                : { bottom: window.innerHeight - rect.top + PAD + 14 }),
            }}
          >
            <p className="min-w-0 flex-1">
              <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold text-accent-strong">
                <span className="rounded-full bg-accent px-2 py-0.5 text-accent-ink">
                  ここを{spot.gesture}
                </span>
                {spot.title}
              </span>
              {spot.hint}
            </p>
            <button
              type="button"
              onClick={() => showSpot(null)}
              className="-my-1 min-h-9 shrink-0 rounded-full px-2 text-xs font-bold text-ink-soft"
            >
              とじる
            </button>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
