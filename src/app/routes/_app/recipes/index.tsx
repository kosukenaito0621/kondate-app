import { useQuery } from '@tanstack/react-query';
import { useIsGuest } from '../../../lib/auth';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_LABEL, GENRES, GENRE_LABEL } from '../../../../shared/constants';
import { COOKING_LEVELS, LEVEL_META } from '../../../../shared/levels';
import { FilterChips } from '../../../components/FilterChips';
import { BoxIcon, CameraIcon, LinkIcon, PlusIcon, SearchIcon } from '../../../components/icons';
import { PageHeader } from '../../../components/PageHeader';
import { RecipeCard } from '../../../components/RecipeCard';
import { RecipeListSkeleton } from '../../../components/skeleton/Skeletons';
import { spring, staggerContainer } from '../../../lib/motion';
import { compact, optOneOf, optString } from '../../../lib/search';
import { toJstDate } from '../../../../shared/date';
import { SEASON_LABEL, SEASONS, seasonOf } from '../../../../shared/season';
import { LevelIcon } from '../../../components/LevelIcon';
import { MAX_SHARE_BUNDLE } from '../../../../shared/recipe';
import { BundleShareBar } from '../../../components/recipe/BundleShareBar';
import { useToast } from '../../../components/toast/Toaster';
import { cn } from '../../../lib/cn';
import { recipesQuery } from '../../../lib/recipes';

const validateSearch = (s: Record<string, unknown>) =>
  compact({
    q: optString(s.q, 50),
    category: optOneOf(s.category, CATEGORIES),
    genre: optOneOf(s.genre, GENRES),
    difficulty: optOneOf(s.difficulty, COOKING_LEVELS),
    mine: optOneOf(s.mine, ['1'] as const),
    /** now は「今が旬」（開いた日の季節） */
    season: optOneOf(s.season, ['now', ...SEASONS] as const),
    /** 在庫で探す（在庫の食材を使うレシピを、使う数の多い順に） */
    stock: optOneOf(s.stock, ['1'] as const),
  });

export const Route = createFileRoute('/_app/recipes/')({
  validateSearch,
  component: RecipeList,
});

function RecipeList() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [text, setText] = useState(filters.q ?? '');
  // 「選んで送る」：選んだレシピ（id → 料理名、選んだ順）
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();
  const guest = useIsGuest();
  const togglePick = (id: string, name: string) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id);
      else if (next.size >= MAX_SHARE_BUNDLE)
        toast(`一度に送れるのは${MAX_SHARE_BUNDLE}品までです`, 'warn');
      else next.set(id, name);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Map());
  };
  const nowSeason = seasonOf(toJstDate());
  const { data, isPending, isError, refetch } = useQuery(
    recipesQuery({ ...filters, season: filters.season === 'now' ? nowSeason : filters.season }),
  );

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
          <div className="flex gap-2">
            <Link
              to="/recipes/import"
              className="glass sheen flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold"
            >
              <CameraIcon size={18} />
              写真・URL
            </Link>
            <Link
              to="/recipes/new"
              className="btn-primary sheen flex min-h-11 items-center gap-1 rounded-full px-3.5 text-sm font-bold"
              aria-label="手入力で追加"
            >
              <PlusIcon size={18} />
              追加
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => set('stock', filters.stock ? undefined : '1')}
          aria-pressed={!!filters.stock}
          className={cn(
            'flex min-h-11 items-center gap-1.5 self-start rounded-full px-4 text-sm font-bold',
            filters.stock ? 'bg-sub-soft text-sub-ink ring-2 ring-sub' : 'glass',
          )}
        >
          <BoxIcon size={17} />
          在庫で探す
          {filters.stock && <span className="text-xs font-normal">（期限の近い順）</span>}
        </button>
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
              label: (
                <span className={`inline-flex`}>
                  <LevelIcon level={l} size={22} />
                </span>
              ),
              ariaLabel: LEVEL_META[l].name,
            })),
            { value: 'mine', label: 'うちのレシピ' },
          ]}
        />
        <FilterChips
          label="季節"
          value={filters.season}
          onChange={(v) => set('season', v)}
          options={[
            { value: undefined, label: '季節すべて' },
            { value: 'now' as const, label: `今が旬（${SEASON_LABEL[nowSeason]}）` },
            ...SEASONS.map((x) => ({ value: x, label: SEASON_LABEL[x] })),
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
            {filters.stock
              ? 'うちの在庫を使うレシピがありません。在庫を追加してみましょう'
              : '条件を変えるか、新しいレシピを追加してみましょう'}
          </p>
          {filters.stock && (
            <Link
              to="/pantry"
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-accent-strong"
            >
              <BoxIcon size={16} />
              うちの在庫へ
            </Link>
          )}
        </motion.div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs text-ink-soft">
              {selecting ? '送りたいレシピをタップして選んでください' : ''}
            </p>
            {!selecting && !guest && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-bold text-accent-strong"
              >
                <LinkIcon size={15} />
                選んでまとめて送る
              </button>
            )}
          </div>
          <motion.ul
            key={JSON.stringify(filters)}
            className="flex flex-col gap-2.5"
            variants={staggerContainer(0.035)}
            initial="initial"
            animate="animate"
          >
            <AnimatePresence initial={false}>
              {data.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  overlay={
                    selecting && (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={picked.has(r.id)}
                        aria-label={`${r.name}を選ぶ`}
                        onClick={() => togglePick(r.id, r.name)}
                        className={cn(
                          'absolute inset-0 flex items-center justify-end rounded-[var(--radius-card)] pr-4',
                          picked.has(r.id) && 'ring-2 ring-accent',
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-7 place-items-center rounded-full border-2 text-sm font-bold',
                            picked.has(r.id)
                              ? 'border-accent bg-accent text-accent-ink'
                              : 'border-ink/25 bg-canvas',
                          )}
                        >
                          {picked.has(r.id) ? '✓' : ''}
                        </span>
                      </button>
                    )
                  }
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      )}
      {selecting && (
        <BundleShareBar
          selected={[...picked].map(([id, name]) => ({ id, name }))}
          onCancel={stopSelecting}
          onDone={stopSelecting}
        />
      )}
    </>
  );
}
