import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';
import { z } from 'zod';
import { SECTIONS, SECTION_LABEL } from '../../../shared/constants';
import { addDays, isIsoDate, toJstDate, weekStartOf } from '../../../shared/date';
import type { ShoppingItemView } from '../../../shared/shopping';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { ShoppingRow } from '../../components/shopping/ShoppingRow';
import { ShoppingSkeleton } from '../../components/skeleton/Skeletons';
import { spring } from '../../lib/motion';
import { shoppingQuery, useShoppingActions } from '../../lib/shopping';

export const Route = createFileRoute('/_app/shopping')({
  validateSearch: z.object({ w: z.string().refine(isIsoDate).optional() }),
  component: ShoppingPage,
});

const label = (ws: string) => {
  const f = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${f(ws)} 〜 ${f(addDays(ws, 6))} の献立分`;
};

function ShoppingPage() {
  const { w } = Route.useSearch();
  const today = toJstDate();
  const weekStart = weekStartOf(w ?? today);
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, isPending } = useQuery(shoppingQuery(weekStart));
  const actions = useShoppingActions(weekStart);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const go = (delta: number) =>
    navigate({ search: { w: addDays(weekStart, delta * 7) }, replace: true });

  const items = data?.items ?? [];
  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const bySection = SECTIONS.map((s) => ({
    section: s,
    items: todo.filter((i) => i.section === s),
  })).filter((g) => g.items.length);

  const row = (item: ShoppingItemView) => (
    <ShoppingRow
      key={item.id}
      item={item}
      editing={editing}
      onToggle={(checked) => actions.toggle.mutate({ id: item.id, checked })}
      onDelete={() => actions.remove.mutate(item.id)}
    />
  );

  return (
    <>
      <PageHeader
        title="買い物リスト"
        eyebrow={label(weekStart)}
        action={
          items.length > 0 ? (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="glass min-h-11 rounded-full px-4 text-sm font-bold"
              aria-pressed={editing}
            >
              {editing ? '完了' : '編集'}
            </button>
          ) : undefined
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          className="glass grid size-11 place-items-center rounded-full"
          aria-label="前の週"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <button
          type="button"
          onClick={() => navigate({ search: {}, replace: true })}
          disabled={weekStart === weekStartOf(today)}
          className="glass min-h-11 flex-1 rounded-full text-sm font-bold disabled:opacity-60"
        >
          {weekStart === weekStartOf(today) ? '今週' : '今週にもどる'}
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          className="glass grid size-11 place-items-center rounded-full"
          aria-label="次の週"
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      {isPending || !data ? (
        <ShoppingSkeleton />
      ) : !data.exists ? (
        <GlassCard padding="lg" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-lg font-bold">この週の献立がまだありません</p>
          <p className="text-sm text-ink-soft">献立を作ると、材料が自動でリストになります。</p>
          <Link
            to="/week"
            search={{ w: weekStart }}
            className="btn-primary flex min-h-12 items-center rounded-full px-6 font-bold"
          >
            週間献立へ
          </Link>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {/* 残りの数 */}
          <div className="glass rounded-[var(--radius-card)] px-4 py-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold">
                {todo.length === 0 ? (
                  'ぜんぶ買えました'
                ) : (
                  <>
                    あと<span className="num mx-1 text-lg">{todo.length}</span>品
                  </>
                )}
              </span>
              <span className="num text-xs text-ink-soft">
                {done.length} / {items.length}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-track">
              <motion.div
                className="h-full rounded-full bg-success"
                initial={{ width: 0 }}
                animate={{ width: `${items.length ? (done.length / items.length) * 100 : 0}%` }}
                transition={spring.soft}
              />
            </div>
          </div>

          <AnimatePresence>
            {data.outdated && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
                role="status"
              >
                <p className="flex-1 text-sm">献立が変わりました。リストを更新しますか？</p>
                <GlassButton
                  size="sm"
                  variant="primary"
                  icon={<RefreshIcon size={16} />}
                  loading={actions.regenerate.isPending}
                  onClick={() => actions.regenerate.mutate()}
                >
                  更新
                </GlassButton>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 手で追加 */}
          <form
            className="glass flex items-center gap-2 rounded-full py-1 pl-4 pr-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = name.trim();
              if (!v) return;
              // 「牛乳 1本」のように分量も書ける
              const m = v.match(/^(.+?)\s+(\S+)$/);
              actions.add.mutate(m ? { name: m[1]!, amount: m[2]! } : { name: v }, {
                onSuccess: () => setName(''),
              });
            }}
          >
            <label htmlFor="add-item" className="sr-only">
              買うものを追加
            </label>
            <input
              id="add-item"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="追加する（例：牛乳 1本）"
              maxLength={60}
              className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-ink-faint"
            />
            <GlassButton
              type="submit"
              size="sm"
              variant="primary"
              icon={<PlusIcon size={16} />}
              loading={actions.add.isPending}
              disabled={!name.trim()}
            >
              追加
            </GlassButton>
          </form>

          {!editing && todo.length > 0 && (
            <p className="px-2 text-[11px] text-ink-faint">
              丸をタップするか右へスワイプで「かごに入れた」。戻すときは左へスワイプ。
            </p>
          )}

          <LayoutGroup>
            {bySection.map((g) => (
              <section key={g.section} aria-labelledby={`sec-${g.section}`}>
                <h2 id={`sec-${g.section}`} className="mb-1.5 px-2 text-xs font-bold text-ink-soft">
                  {SECTION_LABEL[g.section]}
                </h2>
                <ul className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>{g.items.map(row)}</AnimatePresence>
                </ul>
              </section>
            ))}

            {done.length > 0 && (
              <section aria-labelledby="sec-done" className="mt-2">
                <h2 id="sec-done" className="mb-1.5 px-2 text-xs font-bold text-ink-soft">
                  かごに入れたもの
                </h2>
                <ul className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>{done.map(row)}</AnimatePresence>
                </ul>
              </section>
            )}
          </LayoutGroup>

          {data.excludedSeasonings.length > 0 && (
            <GlassCard padding="md" className="mt-2">
              <p className="text-xs font-bold text-ink-soft">家にある前提で除いたもの</p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                切らしているものはタップするとリストに入ります（次回以降も）
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.excludedSeasonings.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={actions.buySeasoning.isPending}
                    onClick={() => actions.buySeasoning.mutate(s)}
                    className="groove min-h-9 rounded-full px-3 text-xs"
                  >
                    ＋ {s}
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </>
  );
}
