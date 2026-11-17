import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { CookLogEntry } from '../../../shared/cooklog';
import { toJstDate, weekdayIndex, WEEKDAY_LABELS } from '../../../shared/date';
import { api } from '../../api';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { Sheet } from '../../components/glass/Sheet';
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { Photo, PhotoPicker } from '../../components/PhotoPicker';
import { RecipeListSkeleton } from '../../components/skeleton/Skeletons';
import { useToast } from '../../components/toast/Toaster';
import { monthLogsQuery } from '../../lib/cooklog';
import { imageUrl } from '../../lib/images';
import { compact, optMatch } from '../../lib/search';
import { riseItem, spring, staggerContainer } from '../../lib/motion';

export const Route = createFileRoute('/_app/log')({
  validateSearch: (s: Record<string, unknown>) => compact({ m: optMatch(s.m, /^\d{4}-\d{2}$/) }),
  component: LogPage,
});

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function LogPage() {
  const { m } = Route.useSearch();
  const thisMonth = toJstDate().slice(0, 7);
  const month = m ?? thisMonth;
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, isPending } = useQuery(monthLogsQuery(month));
  const [y, mm] = month.split('-');

  // 詳細シートはカードの外に1つだけ置く（ガラスのカードの中だと画面全体に出せないため）
  const [openId, setOpenId] = useState<string | null>(null);
  const openEntry = data?.entries.find((e) => e.id === openId) ?? null;

  const byDate = new Map<string, CookLogEntry[]>();
  for (const e of data?.entries ?? []) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  return (
    <>
      <PageHeader title="自炊記録" eyebrow="グループで共有されます" />

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ search: { m: shiftMonth(month, -1) }, replace: true })}
          className="glass grid size-11 place-items-center rounded-full"
          aria-label="前の月"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <p className="glass flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-bold">
          {y}年{Number(mm)}月
        </p>
        <button
          type="button"
          disabled={month >= thisMonth}
          onClick={() => navigate({ search: { m: shiftMonth(month, 1) }, replace: true })}
          className="glass grid size-11 place-items-center rounded-full disabled:opacity-40"
          aria-label="次の月"
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      {isPending || !data ? (
        <RecipeListSkeleton />
      ) : (
        <motion.div
          key={month}
          className="flex flex-col gap-3"
          variants={staggerContainer(0.05)}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={riseItem} className="grid grid-cols-3 gap-2.5">
            <Stat label="作った料理" value={data.stats.count} unit="品" />
            <Stat label="自炊した日" value={data.stats.days} unit="日" />
            <Stat
              label="連続"
              value={data.stats.streak}
              unit="日"
              highlight={data.stats.streak >= 3}
            />
          </motion.div>

          {data.entries.length === 0 ? (
            <GlassCard variants={riseItem} padding="lg" className="text-center">
              <p className="font-bold">まだ記録がありません</p>
              <p className="mt-1 text-sm text-ink-soft">
                ホームの今日の献立や、レシピの画面で「作った」を押すと記録されます。
              </p>
            </GlassCard>
          ) : (
            [...byDate.entries()].map(([date, entries]) => (
              <GlassCard key={date} variants={riseItem} padding="md">
                <h2 className="mb-1 px-1 text-sm font-bold">
                  {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}
                  <span className="ml-1 text-xs font-normal text-ink-soft">
                    （{WEEKDAY_LABELS[weekdayIndex(date)]}）
                  </span>
                </h2>
                <ul className="grid grid-cols-2 gap-2.5">
                  <AnimatePresence initial={false}>
                    {entries.map((e) => (
                      <LogTile key={e.id} entry={e} onOpen={() => setOpenId(e.id)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </GlassCard>
            ))
          )}
        </motion.div>
      )}
      <LogSheet entry={openEntry} onClose={() => setOpenId(null)} />
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass rounded-2xl px-3 py-3 text-center ${highlight ? 'ring-2 ring-accent' : ''}`}
    >
      <p className="text-[11px] text-ink-soft">{label}</p>
      <p className="mt-0.5">
        <span className="num text-2xl font-bold">{value}</span>
        <span className="ml-0.5 text-xs text-ink-soft">{unit}</span>
      </p>
    </div>
  );
}

/** 自炊記録の写真を付け替える（どの記録かは呼ぶ時点で渡す。途中でシートを替えても取り違えない） */
function useLogPhoto() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, imageKey }: { id: string; imageKey: string | null }) => {
      const res = await api.logs[':id'].$patch({ param: { id }, json: { imageKey } });
      if (!res.ok) throw new Error('写真を保存できませんでした');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs'] }),
    onError: (e) => toast(e.message, 'error'),
  });
}

/** 自炊記録のタイル（写真を主役に、料理名は小さく） */
function LogTile({ entry, onOpen }: { entry: CookLogEntry; onOpen: () => void }) {
  const photo = useLogPhoto();
  const name = entry.recipe.name;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={spring.soft}
      className="min-w-0"
    >
      <div className="aspect-square">
        {entry.imageKey ? (
          <button
            type="button"
            onClick={onOpen}
            className="block size-full rounded-2xl"
            aria-label={`${name}の写真を見る`}
          >
            <Photo src={imageUrl(entry.imageKey)} alt="" className="size-full rounded-2xl" />
          </button>
        ) : (
          <PhotoPicker
            label="写真を追加"
            ariaLabel={`${name}の写真を追加`}
            className="size-full! rounded-2xl! flex-col border-[1.5px] border-dashed border-ink-faint/40"
            onUploaded={(key) => photo.mutateAsync({ id: entry.id, imageKey: key })}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 block min-h-8 w-full truncate px-1 text-left text-xs text-ink-soft"
      >
        {name}
      </button>
    </motion.li>
  );
}

/** タイルを押したときの詳細（大きな写真・写真の変更・記録の取り消し） */
function LogSheet({ entry, onClose }: { entry: CookLogEntry | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const photo = useLogPhoto();
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.logs[':id'].$delete({ param: { id } });
      if (!res.ok) throw new Error('取り消せませんでした');
    },
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      toast('記録を取り消しました');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Sheet open={!!entry} title={entry?.recipe.name ?? ''} onClose={onClose}>
      {entry && (
        <div className="flex flex-col gap-3">
          {entry.imageKey ? (
            <>
              <Photo
                src={imageUrl(entry.imageKey)}
                alt={`${entry.recipe.name}の写真`}
                className="aspect-square w-full rounded-[var(--radius-card)]"
              />
              <div className="grid grid-cols-2 gap-2">
                <PhotoPicker
                  label="写真を変える"
                  onUploaded={(key) => photo.mutateAsync({ id: entry.id, imageKey: key })}
                />
                <GlassButton
                  variant="ghost"
                  loading={photo.isPending}
                  onClick={() => photo.mutate({ id: entry.id, imageKey: null })}
                >
                  写真を外す
                </GlassButton>
              </div>
            </>
          ) : (
            <PhotoPicker
              label="写真を追加"
              className="w-full"
              onUploaded={(key) => photo.mutateAsync({ id: entry.id, imageKey: key })}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/recipes/$id"
              params={{ id: entry.recipe.id }}
              className="glass inline-flex min-h-12 items-center justify-center rounded-full text-[15px] font-bold"
            >
              レシピを見る
            </Link>
            <GlassButton
              variant="danger"
              icon={<TrashIcon size={16} />}
              loading={remove.isPending}
              onClick={() => remove.mutate(entry.id)}
              aria-label={`${entry.recipe.name}の記録を取り消す`}
            >
              取り消す
            </GlassButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
