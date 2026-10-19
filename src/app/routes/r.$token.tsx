import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { CATEGORY_LABEL, GENRE_LABEL, SECTION_LABEL } from '../../shared/constants';
import { groupDisplayName } from '../../shared/groups';
import { formatAmount, groupIngredients, type SharedRecipe } from '../../shared/recipe';
import { api } from '../api';
import { GenreBadge } from '../components/GenreBadge';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassCard } from '../components/glass/GlassCard';
import { ClockIcon } from '../components/icons';
import { LevelBadge } from '../components/LevelBadge';
import { SeasonBadge } from '../components/SeasonBadge';
import { Skeleton } from '../components/skeleton/Skeletons';
import { meQuery } from '../lib/auth';
import { riseItem, staggerContainer } from '../lib/motion';

/** 送られてきたレシピを見て、自分のレシピとして保存する画面 */
export const Route = createFileRoute('/r/$token')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    // 未ログインなら、ログイン後にこの画面へ戻ってくる
    if (!me) throw redirect({ to: '/login', search: { next: `/r/${params.token}` } });
  },
  component: SharedRecipePage,
});

const ERRORS: Record<number, string> = {
  404: 'このレシピは開けません。リンクの期限（30日）が切れたか、元のレシピが削除された可能性があります。',
  429: '確認の回数が多すぎます。しばらく時間をおいてお試しください。',
};

function SharedRecipePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const group = me?.groups.find((g) => g.id === me.currentGroupId);

  const shared = useQuery({
    queryKey: ['recipe-share', token],
    retry: false,
    queryFn: async () => {
      const res = await api['recipe-shares'][':token'].$get({ param: { token } });
      if (!res.ok) throw Object.assign(new Error('share'), { status: res.status });
      return (await res.json()) as SharedRecipe;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await api['recipe-shares'][':token'].save.$post({ param: { token } });
      if (!res.ok)
        throw new Error('保存できませんでした。リンクが使えなくなった可能性があります。');
      return (await res.json()) as { id: string };
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      navigate({ to: '/recipes/$id', params: { id }, replace: true });
    },
  });

  const status = (shared.error as { status?: number } | null)?.status;
  const recipe = shared.data?.recipe;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--app-max-width)] flex-col px-4 py-8">
      <motion.div
        className="flex flex-col gap-4"
        variants={staggerContainer(0.06)}
        initial="initial"
        animate="animate"
      >
        <motion.p variants={riseItem} className="px-1 text-sm font-bold text-accent-strong">
          {shared.data?.sharedBy
            ? `${shared.data.sharedBy}さんからレシピが届きました`
            : 'レシピが届きました'}
        </motion.p>

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
        ) : shared.isError || !recipe ? (
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
        ) : (
          <>
            <GlassCard variants={riseItem} strong padding="lg" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <GenreBadge genre={recipe.genre} />
                {GENRE_LABEL[recipe.genre]}・{CATEGORY_LABEL[recipe.category]}
                <LevelBadge level={recipe.difficulty} size="md" />
                <SeasonBadge recipe={recipe} className="px-2 py-0.5 text-xs" />
              </div>
              <h1 className="text-[24px] font-bold leading-tight">{recipe.name}</h1>
              <p className="flex items-center gap-1 text-sm text-ink-soft">
                <ClockIcon size={15} />
                <span className="num">{recipe.timeMinutes}</span>分・
                <span className="num">{recipe.servings}</span>人分
              </p>
            </GlassCard>

            <GlassCard variants={riseItem} padding="lg">
              <h2 className="font-bold">材料</h2>
              {groupIngredients(recipe.ingredients).map((b) => (
                <section key={b.label ?? b.kind} className="mt-2">
                  {b.kind === 'group' && (
                    <h3 className="mt-2 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-strong">
                      {b.label}
                    </h3>
                  )}
                  {b.kind === 'seasoning' && (
                    <h3 className="mt-2 text-xs font-bold text-ink-soft">
                      {SECTION_LABEL.seasoning}
                    </h3>
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
            </GlassCard>

            <GlassCard variants={riseItem} padding="lg">
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
            </GlassCard>

            <motion.div variants={riseItem} className="flex flex-col gap-2">
              <GlassButton
                variant="primary"
                size="lg"
                loading={save.isPending}
                onClick={() => save.mutate()}
                block
              >
                うちのレシピに保存
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
          </>
        )}
      </motion.div>
    </main>
  );
}
