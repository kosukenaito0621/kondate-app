import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { CATEGORY_LABEL } from '../../shared/constants';
import type { RecipeSummary } from '../../shared/recipe';
import { cn } from '../lib/cn';
import { riseItem, spring } from '../lib/motion';
import { recipeEmoji } from '../lib/recipes';
import { GenreBadge } from './GenreBadge';
import { ClockIcon, YenIcon } from './icons';
import { LevelBadge } from './LevelBadge';

const thumbBg = { wa: 'bg-wa-soft', yo: 'bg-yo-soft', chu: 'bg-chu-soft' } as const;

/** サムネイル（一覧→詳細で共有要素遷移する） */
export function RecipeThumb({
  recipe,
  size = 'md',
  className,
}: {
  recipe: Pick<RecipeSummary, 'id' | 'genre' | 'category' | 'mainIngredient'>;
  size?: 'md' | 'hero';
  className?: string;
}) {
  return (
    <motion.div
      layoutId={`recipe-thumb-${recipe.id}`}
      transition={spring.soft}
      className={cn(
        'grid shrink-0 place-items-center',
        thumbBg[recipe.genre],
        size === 'hero'
          ? 'aspect-[16/10] w-full rounded-[var(--radius-card)] text-7xl'
          : 'size-16 rounded-2xl text-3xl',
        className,
      )}
      aria-hidden="true"
    >
      {recipeEmoji(recipe)}
    </motion.div>
  );
}

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <motion.li variants={riseItem} layout="position">
      <Link
        to="/recipes/$id"
        params={{ id: recipe.id }}
        className="block rounded-[var(--radius-card)]"
      >
        <motion.div
          whileTap={{ scale: 0.975 }}
          transition={spring.snappy}
          className="glass sheen flex items-center gap-3 rounded-[var(--radius-card)] p-3"
        >
          <RecipeThumb recipe={recipe} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
              <GenreBadge genre={recipe.genre} className="size-5 text-[10px]" />
              {CATEGORY_LABEL[recipe.category]}
              {!recipe.isSystem && (
                <span className="rounded-full bg-sub-soft px-1.5 text-[10px] font-bold text-sub-ink">
                  うちのレシピ
                </span>
              )}
            </div>
            <motion.p
              layoutId={`recipe-title-${recipe.id}`}
              transition={spring.soft}
              className="mt-0.5 truncate font-bold"
            >
              {recipe.name}
            </motion.p>
            <div className="mt-1 flex items-center gap-3 text-xs text-ink-soft">
              <span className="flex items-center gap-1">
                <ClockIcon size={14} />
                <span className="num">{recipe.timeMinutes}</span>分
              </span>
              <span className="flex items-center gap-1">
                <YenIcon size={14} />
                <span className="num">{recipe.costYen}</span>円
              </span>
              <LevelBadge level={recipe.difficulty} className="ml-auto" />
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.li>
  );
}
