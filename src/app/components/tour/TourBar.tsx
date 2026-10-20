import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { meQuery } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import {
  dismissCleared,
  MISSIONS,
  nextMission,
  setTourUser,
  showSpot,
  useTour,
  type Mission,
} from '../../lib/tour';
import { Sheet } from '../glass/Sheet';
import { CheckDraw, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon, SparkleIcon } from '../icons';
import { TourComplete } from './TourComplete';

/**
 * お試しのコーチ。画面の下（タブの上）に、いまのミッションを1つずつ出して伴走する。
 * - 「やってみる」でその画面へ移り、押す場所を光らせる
 * - クリアすると「クリア！次は…」に変わり、「次へ」で次のミッションへ
 * - たたむと小さなボタンになる。一覧から好きなミッションを選ぶこともできる
 */
export function TourBar() {
  const { data: me } = useQuery(meQuery);
  const guest = me?.guestUntil != null;
  const { done, spot, cleared } = useTour();
  const [list, setList] = useState(false);
  const [folded, setFolded] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setTourUser(guest && me ? me.id : null);
  }, [guest, me]);

  const count = MISSIONS.filter((m) => done.has(m.id)).length;
  const all = count === MISSIONS.length;
  const next = nextMission(done);

  // ぜんぶ終えたら、一度だけ画面の真ん中でお祝いする
  useEffect(() => {
    if (!guest || !all || !me) return;
    const key = `kd-tour-done:${me.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      // 保存できなくても表示はする
    }
    const t = window.setTimeout(() => setCelebrate(true), 900);
    return () => window.clearTimeout(t);
  }, [guest, all, me]);

  if (!guest) return null;

  const go = (m: Mission) => {
    setList(false);
    setFolded(false);
    navigate({ to: m.to }).then(() => showSpot(m));
  };
  const clearedMission = cleared ? MISSIONS.find((m) => m.id === cleared) : null;
  // 光らせている間は、案内の吹き出しに任せてコーチは小さくする
  const small = folded || (!!spot && !clearedMission);

  return (
    <>
      <div
        className="fixed inset-x-0 z-40 flex justify-center"
        style={{
          bottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 0.75rem)',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* 中身は入れ替わった瞬間に差し替え、新しい中身だけを動かす（退場の動きを待つと止まることがあるため） */}
        {small ? (
          <motion.button
            key="pill"
            type="button"
            onClick={() => (all ? setCelebrate(true) : setFolded(false))}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className={cn(
              'ml-auto flex min-h-11 items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-sm font-bold',
              all ? 'btn-primary sheen pr-3' : 'glass glass--strong',
            )}
            aria-label={all ? 'ぜんぶできました' : `やってみよう ${count}/${MISSIONS.length}`}
          >
            <SparkleIcon size={16} className={all ? undefined : 'text-accent-strong'} />
            {all ? 'ぜんぶできました！' : 'やってみよう'}
            {!all && (
              <span className="num rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">
                {count}/{MISSIONS.length}
              </span>
            )}
            {!all && <ChevronUpIcon size={16} className="text-ink-soft" />}
          </motion.button>
        ) : (
          <motion.section
            key={clearedMission ? `clear-${clearedMission.id}` : `step-${next?.id ?? 'all'}`}
            aria-label="やってみよう"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring.soft}
            className="glass glass--strong w-full max-w-[var(--app-max-width)] rounded-[1.6rem] px-4 pb-3.5 pt-3"
          >
            <div className="flex items-center gap-2 text-[11px] font-bold text-ink-soft">
              <SparkleIcon size={14} className="text-accent-strong" />
              <span>やってみよう</span>
              <span className="num">
                {count}/{MISSIONS.length}
              </span>
              <span className="flex flex-1 gap-0.5" aria-hidden>
                {MISSIONS.map((m) => (
                  <span
                    key={m.id}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      done.has(m.id) ? 'bg-success' : m.id === next?.id ? 'bg-accent' : 'bg-track',
                    )}
                  />
                ))}
              </span>
              <button
                type="button"
                onClick={() => setList(true)}
                className="-my-1 min-h-8 rounded-full px-2 text-accent-strong"
              >
                一覧
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissCleared();
                  setFolded(true);
                }}
                className="-my-1 -mr-1 grid size-8 place-items-center rounded-full"
                aria-label="小さくする"
              >
                <ChevronDownIcon size={16} />
              </button>
            </div>

            {clearedMission ? (
              <div className="mt-2 flex items-center gap-3">
                <motion.span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-success-ink"
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  transition={spring.snappy}
                >
                  <CheckDraw checked size={20} />
                </motion.span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">クリア！</p>
                  <p className="truncate text-xs text-ink-soft">
                    {next ? `次は「${next.title}」` : 'ぜんぶ体験できました'}
                  </p>
                </div>
                {next ? (
                  <button
                    type="button"
                    onClick={() => go(next)}
                    className="btn-primary sheen flex min-h-11 shrink-0 items-center gap-1 rounded-full pl-4 pr-3 text-sm font-bold"
                  >
                    次へ
                    <ChevronRightIcon size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCelebrate(true)}
                    className="btn-primary sheen min-h-11 shrink-0 rounded-full px-4 text-sm font-bold"
                  >
                    見る
                  </button>
                )}
              </div>
            ) : next ? (
              <div className="mt-2 flex items-center gap-3">
                <span className="num grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-strong">
                  {MISSIONS.indexOf(next) + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-snug">{next.title}</p>
                  <p className="text-xs text-ink-soft">{next.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => go(next)}
                  className="btn-primary sheen flex min-h-11 shrink-0 items-center gap-1 rounded-full pl-4 pr-3 text-sm font-bold"
                >
                  やってみる
                  <ChevronRightIcon size={16} />
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-3">
                <p className="min-w-0 flex-1 font-bold">ぜんぶ体験できました！</p>
                <button
                  type="button"
                  onClick={() => setCelebrate(true)}
                  className="btn-primary sheen min-h-11 shrink-0 rounded-full px-4 text-sm font-bold"
                >
                  見る
                </button>
              </div>
            )}
          </motion.section>
        )}
      </div>

      <TourComplete open={celebrate} onClose={() => setCelebrate(false)} />
      <Sheet open={list} title="やってみよう" onClose={() => setList(false)}>
        <div className="flex max-h-[65dvh] flex-col gap-3 overflow-y-auto pb-1">
          <p className="text-sm text-ink-soft">
            上から順にどうぞ。好きなものから選ぶこともできます。
          </p>
          <ol className="flex flex-col gap-2">
            {MISSIONS.map((m, i) => {
              const ok = done.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => go(m)}
                    className={cn(
                      'groove flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left',
                      ok && 'opacity-70',
                      m.id === next?.id && 'ring-2 ring-accent',
                    )}
                  >
                    <span
                      className={cn(
                        'num grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                        ok ? 'bg-success text-success-ink' : 'bg-accent-soft text-accent-strong',
                      )}
                    >
                      {ok ? <CheckDraw checked size={14} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{m.title}</span>
                      <span className="block text-xs text-ink-soft">{m.desc}</span>
                    </span>
                    <span className="flex shrink-0 items-center text-xs font-bold text-accent-strong">
                      {ok ? 'もう一度' : 'やってみる'}
                      <ChevronRightIcon size={14} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </Sheet>
    </>
  );
}
