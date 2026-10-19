import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { CATEGORY_LABEL, GENRE_LABEL, SECTION_LABEL } from '../../shared/constants';
import { groupDisplayName } from '../../shared/groups';
import {
  formatAmount,
  groupIngredients,
  type RecipeDetail,
  type ShareView,
} from '../../shared/recipe';
import { api } from '../api';
import { GenreBadge } from '../components/GenreBadge';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassCard } from '../components/glass/GlassCard';
import { ChevronRightIcon, ClockIcon } from '../components/icons';
import { LevelBadge } from '../components/LevelBadge';
import { SeasonBadge } from '../components/SeasonBadge';
import { Skeleton } from '../components/skeleton/Skeletons';
import { meQuery } from '../lib/auth';
import { cn } from '../lib/cn';
import { riseItem, spring, staggerContainer } from '../lib/motion';

/** 送られてきたレシピ（1品・まとめて）を見て、自分のレシピとして保存する画面 */
export const Route = createFileRoute('/r/$token')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    // 未ログインなら、ログイン後にこの画面へ戻ってくる
    if (!me) throw redirect({ to: '/login', search: { next: `/r/${params.token}` } });
  },
  component: SharedRecipePage,
});

const ERRORS: Record<number, string> = {
  404: 'このリンクは開けません。期限（30日）が切れたか、元のレシピが削除された可能性があります。',
  429: '確認の回数が多すぎます。しばらく時間をおいてお試しください。',
};

function SharedRecipePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const group = me?.groups.find((g) => g.id === me.currentGroupId);
  // まとめて送られたときに保存しないレシピ（はじめは全部保存する）
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const shared = useQuery({
    queryKey: ['recipe-share', token],
    retry: false,
    queryFn: async () => {
      const res = await api['recipe-shares'][':token'].$get({ param: { token } });
      if (!res.ok) throw Object.assign(new Error('share'), { status: res.status });
      return (await res.json()) as ShareView;
    },
  });

  const view = shared.data;
  const list = view ? (view.kind === 'single' ? [view.recipe] : view.recipes) : [];
  const chosen = list.filter((r) => !skipped.has(r.id));

  const save = useMutation({
    mutationFn: async () => {
      const res = await api['recipe-shares'][':token'].save.$post({
        param: { token },
        json: view?.kind === 'bundle' ? { recipeIds: chosen.map((r) => r.id) } : {},
      });
      if (!res.ok)
        throw new Error('保存できませんでした。リンクが使えなくなった可能性があります。');
      return (await res.json()) as { id: string; ids: string[] };
    },
    onSuccess: async ({ id, ids }) => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      if (ids.length > 1) navigate({ to: '/recipes', search: { mine: '1' }, replace: true });
      else navigate({ to: '/recipes/$id', params: { id }, replace: true });
    },
  });

  const status = (shared.error as { status?: number } | null)?.status;
  const toggle = (id: string) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--app-max-width)] flex-col px-4 py-8">
      <motion.div
        className="flex flex-col gap-4"
        variants={staggerContainer(0.06)}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={riseItem} className="px-1">
          <p className="text-sm font-bold text-accent-strong">
            {view?.sharedBy ? `${view.sharedBy}さんからレシピが届きました` : 'レシピが届きました'}
          </p>
          {view?.kind === 'bundle' && (
            <h1 className="mt-1 text-[24px] font-bold leading-tight">
              {view.title || 'レシピのセット'}
              <span className="num ml-2 text-base text-ink-soft">{view.recipes.length}品</span>
            </h1>
          )}
        </motion.div>

        {shared.isPending ? (
          <GlassCard
            variants={riseItem}
            padding="lg"
            className="flex flex-col gap-3"
            aria-busy="true"
          >
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-24" />
          </GlassCard>
        ) : shared.isError || !view ? (
          <GlassCard variants={riseItem} padding="lg" className="flex flex-col gap-3">
            <p className="font-bold">レシピを開けませんでした</p>
            <p className="text-sm text-ink-soft">
              {ERRORS[status ?? 0] ?? '時間をおいてお試しください。'}
            </p>
            <Link
              to="/"
              className="glass flex min-h-12 items-center justify-center rounded-full font-bold"
            >
              ホームへ
            </Link>
          </GlassCard>
        ) : view.kind === 'single' ? (
          <>
            <GlassCard variants={riseItem} strong padding="lg">
              <RecipeHead recipe={view.recipe} big />
            </GlassCard>
            <GlassCard variants={riseItem} padding="lg">
              <RecipeBody recipe={view.recipe} />
            </GlassCard>
          </>
        ) : (
          <motion.ul variants={riseItem} className="flex flex-col gap-2.5">
            {view.recipes.map((r) => (
              <BundleItem
                key={r.id}
                recipe={r}
                checked={!skipped.has(r.id)}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </motion.ul>
        )}

        {view && (
          <motion.div variants={riseItem} className="flex flex-col gap-2">
            <GlassButton
              variant="primary"
              size="lg"
              loading={save.isPending}
              disabled={chosen.length === 0}
              onClick={() => save.mutate()}
              block
            >
              {view.kind === 'bundle'
                ? `選んだ${chosen.length}品をうちのレシピに保存`
                : 'うちのレシピに保存'}
            </GlassButton>
            {group && (
              <p className="text-center text-xs text-ink-soft">
                「{groupDisplayName(group.name)}
                」のレシピとして保存します。保存したあとは自由に編集できます。
              </p>
            )}
            {save.error && (
              <p role="alert" className="text-center text-sm text-danger">
                {save.error.message}
              </p>
            )}
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}

function RecipeHead({ recipe, big }: { recipe: RecipeDetail; big?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <GenreBadge genre={recipe.genre} />
        {GENRE_LABEL[recipe.genre]}・{CATEGORY_LABEL[recipe.category]}
        <LevelBadge level={recipe.difficulty} size="inline" />
        <SeasonBadge recipe={recipe} />
      </div>
      <p className={cn('font-bold leading-tight', big ? 'text-[24px]' : 'text-[17px]')}>
        {recipe.name}
      </p>
      <p className="flex items-center gap-1 text-xs text-ink-soft">
        <ClockIcon size={14} />
        <span className="num">{recipe.timeMinutes}</span>分・
        <span className="num">{recipe.servings}</span>人分
      </p>
    </div>
  );
}

function RecipeBody({ recipe }: { recipe: RecipeDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-bold">材料</h2>
        {groupIngredients(recipe.ingredients).map((b) => (
          <section key={b.label ?? b.kind} className="mt-2">
            {b.kind === 'group' && (
              <h3 className="mt-2 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-strong">
                {b.label}
              </h3>
            )}
            {b.kind === 'seasoning' && (
              <h3 className="mt-2 text-xs font-bold text-ink-soft">{SECTION_LABEL.seasoning}</h3>
            )}
            <dl className="divide-y divide-ink-faint/15">
              {b.items.map((i) => (
                <div key={i.id} className="flex justify-between gap-3 py-1.5 text-[15px]">
                  <dt>{i.name}</dt>
                  <dd className="num shrink-0 text-ink-soft">{formatAmount(i)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div>
        <h2 className="mb-3 font-bold">作り方</h2>
        <ol className="flex flex-col gap-3">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="btn-primary num grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="leading-relaxed">{s.text}</p>
                {s.tip && <p className="mt-1 text-sm text-ink-soft">コツ：{s.tip}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** まとめて送られたレシピの1品：チェックで保存するか選び、開くと中身が見られる */
function BundleItem({
  recipe,
  checked,
  onToggle,
}: {
  recipe: RecipeDetail;
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn('glass rounded-[var(--radius-card)] p-3', !checked && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`${recipe.name}を保存する`}
          onClick={onToggle}
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold',
            checked ? 'border-accent bg-accent text-accent-ink' : 'border-ink/25',
          )}
        >
          {checked ? '✓' : ''}
        </button>
        <div className="min-w-0 flex-1">
          <RecipeHead recipe={recipe} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${recipe.name}の中身を${open ? '閉じる' : '見る'}`}
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft"
        >
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring.snappy}>
            <ChevronRightIcon size={18} />
          </motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.soft}
            className="overflow-hidden"
          >
            <div className="pt-4">
              <RecipeBody recipe={recipe} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
