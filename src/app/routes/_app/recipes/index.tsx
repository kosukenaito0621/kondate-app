import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { CATEGORIES, CATEGORY_LABEL, GENRES, GENRE_LABEL } from '../../../../shared/constants';
import { COOKING_LEVELS, LEVEL_META } from '../../../../shared/levels';
import { FilterChips } from '../../../components/FilterChips';
import { PlusIcon, SearchIcon } from '../../../components/icons';
import { PageHeader } from '../../../components/PageHeader';
import { RecipeCard } from '../../../components/RecipeCard';
import { RecipeListSkeleton } from '../../../components/skeleton/Skeletons';
import { spring, staggerContainer } from '../../../lib/motion';
import { recipesQuery } from '../../../lib/recipes';

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  genre: z.enum(GENRES).optional(),
  difficulty: z.enum(COOKING_LEVELS).optional(),
  mine: z.literal('1').optional(),
});

export const Route = createFileRoute('/_app/recipes/')({
  validateSearch: searchSchema,
  component: RecipeList,
});

function RecipeList() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [text, setText] = useState(filters.q ?? '');
  const { data, isPending, isError, refetch } = useQuery(recipesQuery(filters));

  // 入力が止まってから検索（URL に反映して戻るボタンでも条件が残る）
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = text.trim() || undefined;
      if (q !== filters.q) navigate({ search: (s) => ({ ...s, q }), replace: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [text, filters.q, navigate]);

  const set = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) =>
    navigate({ search: (s) => ({ ...s, [key]: value }), replace: true });

  return (
    <>
      <PageHeader
        title="レシピ"
        eyebrow={data ? `${data.length}品` : undefined}
        action={
          <Link
            to="/recipes/new"
            className="btn-primary sheen flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold"
          >
            <PlusIcon size={18} />
            追加
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-2.5">
        <label className="glass flex min-h-12 items-center gap-2 rounded-full px-4">
          <SearchIcon size={18} className="text-ink-soft" />
          <span className="sr-only">料理名・材料で検索</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="料理名・材料で検索（例：なす）"
            className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-ink-faint"
          />
        </label>
        <FilterChips
          label="カテゴリ"
          value={filters.category}
          onChange={(v) => set('category', v)}
          options={[
            { value: undefined, label: 'すべて' },
            ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
          ]}
        />
        <FilterChips
          label="ジャンル"
          value={filters.genre}
          onChange={(v) => set('genre', v)}
          options={[
            { value: undefined, label: '和洋中すべて' },
            ...GENRES.map((g) => ({ value: g, label: GENRE_LABEL[g] })),
          ]}
        />
        <FilterChips
          label="料理レベル"
          value={filters.mine ? 'mine' : filters.difficulty}
          onChange={(v) => {
            navigate({
              search: (s) => ({
                ...s,
                mine: v === 'mine' ? ('1' as const) : undefined,
                difficulty: v === 'mine' ? undefined : (v as (typeof COOKING_LEVELS)[number]),
              }),
              replace: true,
            });
          }}
          options={[
            { value: undefined, label: 'レベルすべて' },
            ...COOKING_LEVELS.map((l) => ({
              value: l as string,
              label: LEVEL_META[l].emoji,
              ariaLabel: LEVEL_META[l].name,
            })),
            { value: 'mine', label: 'うちのレシピ' },
          ]}
        />
      </div>

      {isPending ? (
        <RecipeListSkeleton />
      ) : isError ? (
        <div className="glass rounded-[var(--radius-card)] p-6 text-center text-sm">
          <p>レシピを読み込めませんでした</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 min-h-11 font-bold text-accent-strong"
          >
            もう一度読み込む
          </button>
        </div>
      ) : data.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="glass rounded-[var(--radius-card)] p-8 text-center"
        >
          <p className="mt-2 font-bold">見つかりませんでした</p>
          <p className="mt-1 text-sm text-ink-soft">
            条件を変えるか、新しいレシピを追加してみましょう
          </p>
        </motion.div>
      ) : (
        <motion.ul
          key={JSON.stringify(filters)}
          className="flex flex-col gap-2.5"
          variants={staggerContainer(0.035)}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence initial={false}>
            {data.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </>
  );
}
