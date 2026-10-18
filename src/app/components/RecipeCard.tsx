import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { CATEGORY_LABEL } from '../../shared/constants';
import type { RecipeSummary } from '../../shared/recipe';
import { riseItem, spring } from '../lib/motion';
import { GenreBadge } from './GenreBadge';
import { ClockIcon, YenIcon } from './icons';
import { LevelBadge } from './LevelBadge';

/** ジャンル色の細いライン（サムネイルの代わりに控えめな色の目印） */
const stripe = { wa: 'bg-wa', yo: 'bg-yo', chu: 'bg-chu' } as const;

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
          className="glass sheen flex items-stretch gap-3 rounded-[var(--radius-card)] py-3.5 pl-3 pr-4"
        >
          <span
            className={`w-1 shrink-0 rounded-full ${stripe[recipe.genre]}`}
            aria-hidden="true"
          />
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
              className="mt-0.5 truncate text-[15px] font-bold"
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
