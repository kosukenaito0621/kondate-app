import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import {
  CATEGORY_LABEL,
  COST_LEVEL_LABEL,
  GENRE_LABEL,
  SECTION_LABEL,
} from '../../../../shared/constants';
import { formatAmount, groupIngredients, type RecipeDetail } from '../../../../shared/recipe';
import { api } from '../../../api';
import { CookedButton } from '../../../components/CookedButton';
import { Photo, PhotoPicker } from '../../../components/PhotoPicker';
import { GenreBadge } from '../../../components/GenreBadge';
import { ConfirmDialog } from '../../../components/glass/ConfirmDialog';
import { GlassButton } from '../../../components/glass/GlassButton';
import { GlassCard } from '../../../components/glass/GlassCard';
import { ChevronLeftIcon, ClockIcon, YenIcon } from '../../../components/icons';
import { LevelBadge } from '../../../components/LevelBadge';
import { SlowMode } from '../../../components/recipe/SlowMode';
import { StepList } from '../../../components/recipe/StepList';
import { RecipeDetailSkeleton } from '../../../components/skeleton/Skeletons';
import { riseItem, spring, staggerContainer } from '../../../lib/motion';
import { recipeCookQuery } from '../../../lib/cooklog';
import { imageUrl } from '../../../lib/images';
import { recipeQuery } from '../../../lib/recipes';

export const Route = createFileRoute('/_app/recipes/$id')({
  component: RecipeDetailPage,
});

function RecipeDetailPage() {
  const { id } = Route.useParams();
  const { data: recipe, isPending, isError } = useQuery(recipeQuery(id));
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => router.history.back()}
        className="glass mb-3 flex min-h-11 items-center gap-1 rounded-full pl-2 pr-4 text-sm font-bold"
      >
        <ChevronLeftIcon size={20} />
        もどる
      </button>
      {isPending ? (
        <RecipeDetailSkeleton />
      ) : isError ? (
        <GlassCard padding="lg" className="text-center">
          <p className="font-bold">レシピが見つかりませんでした</p>
          <Link to="/recipes" className="mt-3 inline-block min-h-11 font-bold text-accent-strong">
            レシピ一覧へ
          </Link>
        </GlassCard>
      ) : (
        <RecipeBody recipe={recipe} />
      )}
    </>
  );
}

function RecipeBody({ recipe }: { recipe: RecipeDetail }) {
  const [servings, setServings] = useState(recipe.servings);
  const [slow, setSlow] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const scale = servings / recipe.servings;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recipes'] });

  const copy = useMutation({
    mutationFn: async () => {
      const res = await api.recipes[':id'].copy.$post({ param: { id: recipe.id } });
      if (!res.ok) throw new Error('複製できませんでした');
      return (await res.json()) as { id: string };
    },
    onSuccess: async ({ id }) => {
      await invalidate();
      navigate({ to: '/recipes/$id/edit', params: { id } });
    },
  });

  const hide = useMutation({
    mutationFn: async () => {
      const res = await api.recipes[':id'].hide.$post({
        param: { id: recipe.id },
        json: { hidden: true },
      });
      if (!res.ok) throw new Error('非表示にできませんでした');
    },
    onSuccess: async () => {
      await invalidate();
      navigate({ to: '/recipes' });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await api.recipes[':id'].$delete({ param: { id: recipe.id } });
      if (!res.ok) throw new Error('削除できませんでした');
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['recipe', recipe.id] });
      await invalidate();
      navigate({ to: '/recipes' });
    },
  });

  const blocks = groupIngredients(recipe.ingredients);
  const error = copy.error ?? hide.error ?? remove.error;

  return (
    <article>
      <div className="px-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <GenreBadge genre={recipe.genre} />
          {GENRE_LABEL[recipe.genre]}・{CATEGORY_LABEL[recipe.category]}
          <LevelBadge level={recipe.difficulty} size="md" />
          {!recipe.isSystem && (
            <span className="rounded-full bg-sub-soft px-2 py-0.5 font-bold text-sub-ink">
              うちのレシピ
            </span>
          )}
        </div>
        <motion.h1
          layoutId={`recipe-title-${recipe.id}`}
          transition={spring.soft}
          className="mt-2 text-[26px] font-bold leading-tight"
        >
          {recipe.name}
        </motion.h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5">
            <ClockIcon size={16} />
            <span className="num font-bold">{recipe.timeMinutes}</span>分
          </span>
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5">
            <YenIcon size={16} />
            <span className="num font-bold">{Math.round(recipe.costYen * scale)}</span>円
            <span className="text-xs text-ink-soft">（{COST_LEVEL_LABEL[recipe.costLevel]}）</span>
          </span>
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <span key={t} className="text-xs text-ink-soft">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      <motion.div
        className="mt-5 flex flex-col gap-4"
        variants={staggerContainer(0.07, 0.1)}
        initial="initial"
        animate="animate"
      >
        {recipe.difficulty === 'futaba' && (
          <motion.button
            variants={riseItem}
            type="button"
            onClick={() => setSlow(true)}
            whileTap={{ scale: 0.97 }}
            className="btn-primary sheen flex min-h-16 flex-col items-center justify-center rounded-[var(--radius-card)] px-5 text-center"
          >
            <span>
              <span className="block font-bold">ゆっくりモードで作る</span>
              <span className="block text-xs opacity-80">1ステップずつ大きく表示します</span>
            </span>
          </motion.button>
        )}

        <CookCard recipeId={recipe.id} recipeName={recipe.name} />

        <GlassCard variants={riseItem} padding="lg">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">材料</h2>
            <div
              className="groove flex items-center gap-1 rounded-full p-1"
              role="group"
              aria-label="人数"
            >
              <button
                type="button"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                className="grid size-9 place-items-center rounded-full text-lg font-bold"
                aria-label="1人分減らす"
              >
                −
              </button>
              <span className="num min-w-12 text-center text-sm font-bold" aria-live="polite">
                {servings}人分
              </span>
              <button
                type="button"
                onClick={() => setServings((s) => Math.min(12, s + 1))}
                className="grid size-9 place-items-center rounded-full text-lg font-bold"
                aria-label="1人分増やす"
              >
                ＋
              </button>
            </div>
          </div>
          {blocks.map((b) => (
            <section key={b.label ?? b.kind} aria-label={b.label ?? undefined}>
              {b.kind === 'group' ? (
                <h3 className="mt-4 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-strong">
                  {b.label}
                </h3>
              ) : (
                b.kind === 'seasoning' && (
                  <h3 className="mt-4 text-xs font-bold text-ink-soft">
                    {SECTION_LABEL.seasoning}
                  </h3>
                )
              )}
              <IngredientTable items={b.items} scale={scale} />
            </section>
          ))}
        </GlassCard>

        <GlassCard variants={riseItem} padding="lg">
          <h2 className="mb-4 font-bold">作り方</h2>
          <StepList steps={recipe.steps} recipeName={recipe.name} />
          {recipe.difficulty === 'minori' && (
            <button
              type="button"
              onClick={() => setSlow(true)}
              className="mt-5 min-h-11 text-sm font-bold text-accent-strong"
            >
              1ステップずつ表示する
            </button>
          )}
        </GlassCard>

        {recipe.sourceUrl && (
          <motion.a
            variants={riseItem}
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-1 text-xs text-ink-soft underline"
          >
            出典：{new URL(recipe.sourceUrl).hostname}
          </motion.a>
        )}

        <motion.div variants={riseItem} className="flex flex-col gap-2.5">
          {recipe.isSystem ? (
            <>
              <GlassButton loading={copy.isPending} onClick={() => copy.mutate()} block>
                コピーしてアレンジする
              </GlassButton>
              <GlassButton
                variant="ghost"
                loading={hide.isPending}
                onClick={() => hide.mutate()}
                block
              >
                このレシピを提案しない（非表示）
              </GlassButton>
            </>
          ) : (
            <>
              <Link
                to="/recipes/$id/edit"
                params={{ id: recipe.id }}
                className="glass sheen flex min-h-12 items-center justify-center rounded-full font-bold"
              >
                編集する
              </Link>
              <GlassButton variant="danger" onClick={() => setConfirmDelete(true)} block>
                削除する
              </GlassButton>
            </>
          )}
          {error && (
            <p role="alert" className="text-center text-sm text-danger">
              {error.message}
            </p>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {slow && (
          <SlowMode steps={recipe.steps} recipeName={recipe.name} onClose={() => setSlow(false)} />
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={confirmDelete}
        title="このレシピを削除しますか？"
        message="献立に入っている場合は、その日の献立からも外れます。"
        confirmLabel="削除する"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </article>
  );
}

function IngredientTable({ items, scale }: { items: RecipeDetail['ingredients']; scale: number }) {
  return (
    <dl className="mt-3 divide-y divide-ink-faint/15">
      {items.map((i) => (
        <div key={i.id} className="flex justify-between gap-3 py-2 text-[15px]">
          <dt>{i.name}</dt>
          <dd className="num shrink-0 text-ink-soft">
            {formatAmount({
              ...i,
              quantity: i.quantity === null ? null : i.quantity * scale,
              // 「2〜3枚」など幅のある表記は人数を変えたら数値表示にする
              amountText: scale === 1 || i.quantity === null ? i.amountText : null,
            })}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 自炊記録：今日作ったら記録。これまでの回数と最後に作った日 */
function CookCard({ recipeId, recipeName }: { recipeId: string; recipeName: string }) {
  const { data } = useQuery(recipeCookQuery(recipeId));
  const queryClient = useQueryClient();
  const last = data?.lastDate;
  const todayPhoto = data?.photos.find((p) => p.logId === data.todayLogId);

  const attach = async (key: string) => {
    if (!data?.todayLogId) return;
    const res = await api.logs[':id'].$patch({
      param: { id: data.todayLogId },
      json: { imageKey: key },
    });
    if (!res.ok) throw new Error('写真を保存できませんでした');
    await queryClient.invalidateQueries({ queryKey: ['logs'] });
  };

  return (
    <GlassCard variants={riseItem} padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 px-1">
          <p className="text-xs text-ink-soft">自炊記録</p>
          <p className="mt-0.5 font-bold">
            {data && data.count > 0 ? (
              <>
                これまでに<span className="num mx-0.5 text-lg">{data.count}</span>回
                {last && (
                  <span className="ml-1.5 text-xs font-normal text-ink-soft">
                    最後：{Number(last.slice(5, 7))}/{Number(last.slice(8, 10))}
                  </span>
                )}
              </>
            ) : (
              'まだ作っていません'
            )}
          </p>
        </div>
        <CookedButton recipeId={recipeId} recipeName={recipeName} size="lg" />
      </div>
      {data?.todayLogId && !todayPhoto && (
        <PhotoPicker label="今日作った写真を追加" onUploaded={attach} className="w-full" />
      )}
      {data && data.photos.length > 0 && (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="作った料理の写真">
          {data.photos.map((p) => (
            <li key={p.logId} className="shrink-0 text-center">
              <Photo
                src={imageUrl(p.imageKey)}
                alt={`${p.date}の${recipeName}`}
                className="size-24 rounded-2xl"
              />
              <span className="num mt-1 block text-[10px] text-ink-soft">
                {Number(p.date.slice(5, 7))}/{Number(p.date.slice(8, 10))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
