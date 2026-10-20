import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { meQuery } from '../lib/auth';
import { GlassButton } from './glass/GlassButton';
import { SparkleIcon } from './icons';
import { useToast } from './toast/Toaster';

/** 家族役の操作の間隔（画面の変化を追えるように少しあける） */
const STEP_DELAY = 2500;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function remaining(until: number, now: number) {
  const h = Math.max(0, Math.ceil((until - now) / 3_600_000));
  return h <= 1 ? 'まもなく' : `あと${h}時間で`;
}

/**
 * お試し中の帯。残り時間と、家族役（はなこさん）を呼ぶボタンを出す。
 * はなこさんがメモ・献立・買い物リストを変えると、ふつうの家族と同じくリアルタイムで届く
 */
export function GuestBanner() {
  const { data: me } = useQuery(meQuery);
  const { toast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!me?.guestUntil) return null;

  const callFamily = async () => {
    setCalling(true);
    toast('はなこさんを呼びました。週間献立や買い物リストを見ながら待ってみてください');
    try {
      for (const step of [0, 1, 2]) {
        await wait(STEP_DELAY);
        const res = await api.demo.family[':step'].$post({ param: { step: String(step) } });
        if (!res.ok) throw new Error();
      }
    } catch {
      toast('はなこさんが来られませんでした。もう一度お試しください', 'error');
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="glass mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">お試し中</p>
        <p className="text-xs text-ink-soft">
          {remaining(me.guestUntil, now)}消えます。AI取り込み・写真・招待はお休みです
        </p>
      </div>
      <GlassButton
        size="sm"
        variant="primary"
        icon={<SparkleIcon size={16} />}
        loading={calling}
        onClick={callFamily}
      >
        家族役を呼ぶ
      </GlassButton>
    </div>
  );
}
