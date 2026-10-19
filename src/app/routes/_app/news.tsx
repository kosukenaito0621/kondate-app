import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LATEST_NEWS_ID, NEWS, NEWS_KIND_LABEL, unreadNewsCount } from '../../../shared/news';
import type { Me } from '../../../shared/schemas';
import { api } from '../../api';
import { GlassCard } from '../../components/glass/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { meQuery } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { riseItem, staggerContainer } from '../../lib/motion';

export const Route = createFileRoute('/_app/news')({
  component: NewsPage,
});

const KIND_STYLE = {
  feature: 'bg-accent-soft text-accent-strong',
  improve: 'bg-sub-soft text-sub-ink',
  fix: 'bg-pill text-ink-soft',
} as const;

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** お知らせ：追加した機能・直したところ。開いたら既読にする */
function NewsPage() {
  const { data: me } = useQuery(meQuery);
  const queryClient = useQueryClient();
  // 開いたときの未読数（既読にしたあとも「NEW」を出し続けるため最初の値を使う）
  const [unread] = useState(() => (me ? unreadNewsCount(me.newsSeen) : 0));

  const markRead = useMutation({
    mutationFn: async () => {
      const res = await api.me.$patch({ json: { newsSeen: LATEST_NEWS_ID } });
      if (!res.ok) throw new Error('save failed');
      return (await res.json()) as Me;
    },
    onSuccess: (next) => queryClient.setQueryData(meQuery.queryKey, next),
  });

  const needsMark = !!me && me.newsSeen !== LATEST_NEWS_ID;
  const { mutate } = markRead;
  useEffect(() => {
    if (needsMark) mutate();
  }, [needsMark, mutate]);

  return (
    <>
      <PageHeader eyebrow="設定" title="お知らせ" />
      <motion.ol
        className="flex flex-col gap-3"
        variants={staggerContainer()}
        initial="initial"
        animate="animate"
      >
        {NEWS.map((n, i) => (
          <motion.li key={n.id} variants={riseItem} className="list-none">
            <GlassCard padding="lg">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('rounded-full px-2 py-0.5 font-bold', KIND_STYLE[n.kind])}>
                  {NEWS_KIND_LABEL[n.kind]}
                </span>
                <time dateTime={n.date} className="num text-ink-soft">
                  {md(n.date)}
                </time>
                {i < unread && (
                  <span className="rounded-full bg-danger px-2 py-0.5 font-bold text-white">
                    NEW
                  </span>
                )}
              </div>
              <h2 className="mt-2 font-bold leading-snug">{n.title}</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {n.body.map((b, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.li>
        ))}
      </motion.ol>
    </>
  );
}
