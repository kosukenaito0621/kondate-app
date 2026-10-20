import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { meQuery } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { MISSIONS, setTourUser, showSpot, useTour, type Mission } from '../../lib/tour';
import { Sheet } from '../glass/Sheet';
import { CheckDraw, ChevronRightIcon, SparkleIcon } from '../icons';

/**
 * お試し中だけ出る「やってみよう」。画面の右下に進み具合を出し、
 * 押すとミッションの一覧が開く。「やってみる」でその画面へ移り、押す場所を光らせる
 */
export function TourBar() {
  const { data: me } = useQuery(meQuery);
  const guest = me?.guestUntil != null;
  const { done } = useTour();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setTourUser(guest && me ? me.id : null);
  }, [guest, me]);

  if (!guest) return null;
  const count = MISSIONS.filter((m) => done.has(m.id)).length;
  const all = count === MISSIONS.length;

  const go = (m: Mission) => {
    setOpen(false);
    navigate({ to: m.to }).then(() => showSpot(m));
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.95 }}
        transition={spring.snappy}
        className="glass glass--strong fixed right-4 z-40 flex min-h-11 items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-sm font-bold"
        style={{
          bottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 0.75rem)',
          right: 'max(1rem, var(--safe-right, 0px))',
        }}
        aria-label={`やってみよう ${count}/${MISSIONS.length}`}
      >
        <SparkleIcon size={16} className="text-accent-strong" />
        {all ? 'ぜんぶできました' : 'やってみよう'}
        <span className="num rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">
          {count}/{MISSIONS.length}
        </span>
      </motion.button>

      <Sheet open={open} title="やってみよう" onClose={() => setOpen(false)}>
        <div className="flex max-h-[65dvh] flex-col gap-3 overflow-y-auto pb-1">
          {all ? (
            <div className="rounded-2xl bg-accent-soft px-4 py-3 text-sm">
              <p className="font-bold">ぜんぶ体験できました！</p>
              <p className="mt-1 text-ink-soft">
                気に入ったら Google でログインすると、AI取り込み・写真・家族の招待も使えます。
              </p>
              <a
                href="/api/auth/google"
                className="mt-2 inline-flex min-h-11 items-center font-bold text-accent-strong"
              >
                Google でログインする
              </a>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              気になるものから順にどうぞ。やってみると自動でチェックが付きます。
            </p>
          )}
          <div className="h-2 overflow-hidden rounded-full bg-track" aria-hidden>
            <motion.div
              className="h-full rounded-full bg-success"
              initial={false}
              animate={{ width: `${(count / MISSIONS.length) * 100}%` }}
              transition={spring.soft}
            />
          </div>
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
