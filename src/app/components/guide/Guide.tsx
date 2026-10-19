import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Me } from '../../../shared/schemas';
import { api } from '../../api';
import { meQuery } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { GlassButton } from '../glass/GlassButton';
import { ChevronLeftIcon, ChevronRightIcon, CutleryIcon } from '../icons';
import { buildGuideSteps } from './guideSteps';

type GuideApi = { open: () => void };
const GuideContext = createContext<GuideApi>({ open: () => {} });

export function useGuide() {
  return useContext(GuideContext);
}

/**
 * 使い方ガイド。初めてログインしたとき（見終えていないとき）に自動で開き、
 * 設定の「使い方ガイド」からいつでも開ける。
 */
export function GuideProvider({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery(meQuery);
  const queryClient = useQueryClient();
  const [manual, setManual] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const markSeen = useMutation({
    mutationFn: async () => {
      const res = await api.me.$patch({ json: { guideSeen: true } });
      if (!res.ok) throw new Error('save failed');
      return (await res.json()) as Me;
    },
    onSuccess: (next) => queryClient.setQueryData(meQuery.queryKey, next),
  });

  const auto = !!me && !me.guideSeen && !dismissed;
  const isOpen = manual || auto;

  const close = useCallback(() => {
    setManual(false);
    setDismissed(true);
    if (me && !me.guideSeen) markSeen.mutate();
  }, [me, markSeen]);

  // 招待で参加した人（自分がオーナーではないグループにいる）には、最初に「参加しました」を出す
  const current = me?.groups.find((g) => g.id === me.currentGroupId);
  const joinedGroup = auto && current?.role === 'member' ? current.name : null;

  const value = useMemo(() => ({ open: () => setManual(true) }), []);
  return (
    <GuideContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {isOpen && <GuideOverlay key="guide" joinedGroup={joinedGroup} onClose={close} />}
      </AnimatePresence>
    </GuideContext.Provider>
  );
}

const SWIPE = 60;

function GuideOverlay({
  joinedGroup,
  onClose,
}: {
  joinedGroup: string | null;
  onClose: () => void;
}) {
  const steps = useMemo(() => buildGuideSteps({ joinedGroup }), [joinedGroup]);
  const [[index, dir], setPage] = useState<[number, number]>([0, 0]);
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= steps.length) return;
      setPage(([from]) => [to, to > from ? 1 : -1]);
    },
    [steps.length],
  );

  // 開いている間は後ろの画面をスクロールさせない。キーボードでも操作できるように
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [go, index, onClose]);

  // ページが変わったら見出しに読み上げの位置を移す
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [index]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE || info.velocity.x < -400) go(index + 1);
    else if (info.offset.x > SWIPE || info.velocity.x > 400) go(index - 1);
  };

  const finish = (to?: '/week') => {
    onClose();
    if (to) navigate({ to });
  };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="使い方ガイド"
      className="fixed inset-0 z-[70] flex flex-col bg-canvas/80 backdrop-blur-xl"
      style={{
        paddingTop: 'max(0.75rem, var(--safe-top))',
        paddingBottom: 'max(1rem, var(--safe-bottom))',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto flex w-full max-w-[var(--app-max-width)] flex-1 flex-col px-4">
        {/* 上：進み具合とスキップ */}
        <div className="flex min-h-12 items-center gap-3">
          <p className="num text-xs font-bold text-ink-soft" aria-live="polite">
            {index + 1} / {steps.length}
          </p>
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i <= index ? 'bg-accent' : 'bg-track',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full px-3 text-sm font-bold text-ink-soft"
          >
            {last ? '閉じる' : 'スキップ'}
          </button>
        </div>

        {/* 中：1枚ずつめくる */}
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.section
              key={step.id}
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d * 80, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -80, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring.soft}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.25}
              onDragEnd={onDragEnd}
              className="absolute inset-0 flex touch-pan-y flex-col overflow-y-auto pb-4 pt-3"
              aria-roledescription="スライド"
            >
              {step.art}
              <p className="mt-5 text-xs font-bold text-accent-strong">{step.eyebrow}</p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-[24px] font-bold leading-tight outline-none"
              >
                {step.title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed">{step.lead}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {step.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    <span className="[&_b]:font-bold [&_b]:text-ink">{p}</span>
                  </li>
                ))}
              </ul>
              {step.where && (
                <p className="mt-4 self-start rounded-full bg-pill px-3 py-1.5 text-xs font-bold">
                  場所：{step.where}
                </p>
              )}
            </motion.section>
          </AnimatePresence>
        </div>

        {/* 下：前へ・次へ */}
        <div className="flex items-center gap-2 pt-2">
          <GlassButton
            variant="ghost"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="前へ"
            icon={<ChevronLeftIcon size={20} />}
            className={cn(index === 0 && 'invisible')}
          >
            前へ
          </GlassButton>
          <div className="flex-1" />
          {last ? (
            <GlassButton
              variant="primary"
              size="lg"
              icon={<CutleryIcon size={20} />}
              onClick={() => finish('/week')}
            >
              献立を作ってみる
            </GlassButton>
          ) : (
            <GlassButton variant="primary" size="lg" onClick={() => go(index + 1)}>
              次へ
              <ChevronRightIcon size={20} />
            </GlassButton>
          )}
        </div>
      </div>
    </motion.div>
  );
}
