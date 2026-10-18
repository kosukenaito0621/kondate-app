import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { spring } from '../lib/motion';
import { clamp, cutsToRatio, moveCut, pickThumb, ratioToCuts, type GenreRatio } from '../lib/ratio';

const GENRES = [
  { key: 'wa', label: '和食', color: 'var(--wa)', soft: 'var(--wa-soft)', ink: 'var(--wa-ink)' },
  { key: 'yo', label: '洋食', color: 'var(--yo)', soft: 'var(--yo-soft)', ink: 'var(--yo-ink)' },
  {
    key: 'chu',
    label: '中華',
    color: 'var(--chu)',
    soft: 'var(--chu-soft)',
    ink: 'var(--chu-ink)',
  },
] as const;

const STEP = 5;

type Props = { value: GenreRatio; onChange: (value: GenreRatio) => void };

/**
 * 1本のトラックに2つのつまみ（和|洋|中 の3分割）。合計は常に100%。
 * ポインタ操作はトラックがまとめて受け、つまみはキーボード操作用の role="slider"。
 */
export function GenreRatioSlider({ value, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);
  const [focused, setFocused] = useState<0 | 1 | null>(null);
  const cuts = ratioToCuts(value);

  const pctFromEvent = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  const update = (thumb: 0 | 1, pct: number) => {
    const next = moveCut(cuts, thumb, pct, STEP);
    if (next[0] !== cuts[0] || next[1] !== cuts[1]) onChange(cutsToRatio(...next));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const pct = pctFromEvent(e);
    const thumb = pickThumb(cuts, pct);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(thumb);
    update(thumb, pct);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    update(dragging, pctFromEvent(e));
  };

  const endDrag = () => setDragging(null);

  const onKeyDown = (thumb: 0 | 1) => (e: React.KeyboardEvent) => {
    const big = STEP * 2;
    const delta: Record<string, number> = {
      ArrowRight: STEP,
      ArrowUp: STEP,
      ArrowLeft: -STEP,
      ArrowDown: -STEP,
      PageUp: big,
      PageDown: -big,
      Home: -100,
      End: 100,
    };
    const d = delta[e.key];
    if (d === undefined) return;
    e.preventDefault();
    update(thumb, cuts[thumb] + d);
  };

  const valueText = `和食${value.wa}%、洋食${value.yo}%、中華${value.chu}%`;
  const active = dragging ?? focused;

  return (
    <div className="select-none">
      {/* 割合バー（凡例） */}
      <div className="mb-4 grid grid-cols-3 gap-2" aria-hidden="true">
        {GENRES.map((g) => (
          <div key={g.key} className="rounded-2xl px-3 py-2" style={{ background: g.soft }}>
            <div className="text-[11px] font-medium" style={{ color: g.ink }}>
              {g.label}
            </div>
            <div className="num text-xl font-bold" style={{ color: g.ink }}>
              <AnimatedNumber value={value[g.key]} />
              <span className="ml-0.5 text-xs">%</span>
            </div>
          </div>
        ))}
      </div>

      <div
        ref={trackRef}
        className="relative h-12 touch-none cursor-pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* トラック（3色のセグメントが伸縮） */}
        <div className="absolute inset-x-0 top-1/2 flex h-3.5 -translate-y-1/2 overflow-hidden rounded-full groove">
          {GENRES.map((g) => (
            <motion.div
              key={g.key}
              className="h-full"
              style={{ background: g.color }}
              animate={{ width: `${value[g.key]}%` }}
              transition={spring.snappy}
            />
          ))}
        </div>

        {/* つまみ */}
        {([0, 1] as const).map((thumb) => {
          const pos = cuts[thumb];
          const left = GENRES[thumb]!;
          const right = GENRES[thumb + 1]!;
          return (
            <motion.div
              key={thumb}
              role="slider"
              tabIndex={0}
              aria-label={`${left.label}と${right.label}の境目`}
              aria-valuemin={thumb === 0 ? 0 : cuts[0]}
              aria-valuemax={thumb === 0 ? cuts[1] : 100}
              aria-valuenow={pos}
              aria-valuetext={valueText}
              onKeyDown={onKeyDown(thumb)}
              onFocus={() => setFocused(thumb)}
              onBlur={() => setFocused(null)}
              className={cn(
                'glass glass--strong absolute top-1/2 grid size-8 place-items-center rounded-full',
                'pointer-events-none focus-visible:outline-offset-2',
                active === thumb && 'z-10',
              )}
              style={{ left: `${pos}%`, x: '-50%', y: '-50%' }}
              animate={{ scale: dragging === thumb ? 1.18 : 1 }}
              transition={spring.snappy}
            >
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${left.color} 50%, ${right.color} 50%)`,
                }}
              />
              {/* つまみに追従する数値バッジ */}
              <AnimatePresence>
                {active === thumb && (
                  <motion.span
                    className={cn(
                      'num absolute bottom-full mb-2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-canvas shadow-lg',
                      // 端ではカードからはみ出さないよう内側に寄せる
                      pos > 75 ? 'right-0' : pos < 25 ? 'left-0' : '',
                    )}
                    initial={{ opacity: 0, y: 6, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    transition={spring.snappy}
                  >
                    {left.label.slice(0, 1)} {value[left.key]}% ・ {right.label.slice(0, 1)}{' '}
                    {value[right.key]}%
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {valueText}
      </p>
    </div>
  );
}

/** 数値がなめらかに切り替わる表示 */
function AnimatedNumber({ value }: { value: number }) {
  return (
    <span className="relative inline-block overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ y: '60%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-60%', opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
